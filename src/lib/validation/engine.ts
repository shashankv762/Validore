import { z } from 'zod'
import { generateWithFallback } from '../ai/generate'
import { publicResearchBrief, publicResearchQuery } from '@/lib/ai/research-brief'
import { webSearch, deduplicateSources, type SearchResult } from '../ai/search'
import { STARTUP_WEIGHTS, clampScore, getCampaignClassificationBand } from '../scoring'
import * as fin from '../financial'
import { db } from '@/db'
import { validationJobs } from '@/db/schema'
import { eq, and, sql } from 'drizzle-orm'
import { runInlineStep, type RunValidationStep } from './steps'
import { auditEvidence, auditMarketSizing, auditFounderAssumptions, DESK_RESEARCH_NOTE } from './agents/quality-auditor'
import { runMultiAgentValidation, type MultiAgentResult, type AgentTrail } from './agents/orchestrator'
import { runMarketAgent } from './agents/market'
import { runCustomerAgent } from './agents/customer'
import { FULL_AGENT_COUNT } from '@/lib/ai/roles'
import { retrieveMarketMemory } from '@/lib/ai/market-memory'
import { randomUUID } from 'node:crypto'

// ─── Shared schemas (single source of truth: ./schemas) ──────────────────────

export { EvidenceItemSchema, type EvidenceItem, CategoryScoreSchema, type IdeaInput, FullReportSchema, type FullReport } from './schemas'
import { EvidenceItemSchema, FullReportSchema, type IdeaInput, type FullReport } from './schemas'

// ─── Lite validation (Free tier) ──────────────────────────────────────────────

const LiteReportSchema = z.object({
  problemScore: z.number().min(0).max(STARTUP_WEIGHTS.problemValidation),
  customerScore: z.number().min(0).max(STARTUP_WEIGHTS.customerValidation),
  marketScore: z.number().min(0).max(STARTUP_WEIGHTS.marketOpportunity),
  competitiveScore: z.number().min(0).max(STARTUP_WEIGHTS.competitiveDifferentiation),
  wtpScore: z.number().min(0).max(STARTUP_WEIGHTS.willingnessToPay),
  businessModelScore: z.number().min(0).max(STARTUP_WEIGHTS.businessModel),
  financialScore: z.number().min(0).max(STARTUP_WEIGHTS.financialFeasibility),
  executionScore: z.number().min(0).max(STARTUP_WEIGHTS.executionFeasibility),
  decision: z.enum(['GO', 'MODIFY', 'TEST_FURTHER', 'NO_GO']),
  decisionReasons: z.array(z.string()).min(2).max(5),
  keyEvidence: z.array(EvidenceItemSchema).max(5),
  keyRisks: z.array(z.string()).min(2).max(5),
  actionPlan: z.array(
    z.object({ week: z.string(), action: z.string(), kpi: z.string() })
  ).max(4),
  persona: z.object({
    name: z.string(),
    ageRange: z.string(),
    occupation: z.string(),
    incomeRange: z.string(),
    goals: z.array(z.string()),
    problems: z.array(z.string()),
    priceSensitivity: z.enum(['low', 'medium', 'high']),
  }),
  competitors: z.array(
    z.object({
      name: z.string(),
      pricing: z.string(),
      weakness: z.string(),
      dateChecked: z.string(),
    })
  ).max(3),
  tamEstimate: z.string(),
  samEstimate: z.string(),
  somEstimate: z.string(),
  integrityNote: z.string(),
})

export type LiteReport = z.infer<typeof LiteReportSchema>

function buildLitePrompt(
  idea: IdeaInput,
  searchResults: SearchResult[],
  degraded: boolean
): string {
  const today = new Date().toISOString().split('T')[0]
  const searchCtx = searchResults.length === 0
    ? `\nNo sources have been retrieved yet. Use research tools for material evidence gaps. Mark unsupported market data AI_ESTIMATE_UNVERIFIED with strength:WEAK. Never invent URLs.`
    : `\nRetrieved source excerpts (${degraded ? 'limited public indexes' : 'public web search'}; WEAK until the original source is read, include fetchedAt):\n${searchResults
        .map((r) => `- "${r.title}": ${r.content.slice(0, 300)} [source:${r.source}, url:${r.url}, fetchedAt:${r.fetchedAt}]`)
        .join('\n')}`

  return `You are a rigorous startup validation consultant. Today is ${today}.

STARTUP IDEA:
Name: ${idea.name}
Industry: ${idea.industry}
Product: ${idea.product}
Target Customer: ${idea.targetCustomer}
Location/Market: ${idea.location}
Business Model: ${idea.businessModel}
Core Problem: ${idea.coreProblem}
Proposed Solution: ${idea.proposedSolution}
${searchCtx}

TASK: Perform a LITE startup validation. Score each category within its max weight. Compute all 8 sub-scores individually.

WEIGHT TABLE (scores must NOT exceed max):
- problemScore max: ${STARTUP_WEIGHTS.problemValidation}
- customerScore max: ${STARTUP_WEIGHTS.customerValidation}
- marketScore max: ${STARTUP_WEIGHTS.marketOpportunity}
- competitiveScore max: ${STARTUP_WEIGHTS.competitiveDifferentiation}
- wtpScore max: ${STARTUP_WEIGHTS.willingnessToPay}
- businessModelScore max: ${STARTUP_WEIGHTS.businessModel}
- financialScore max: ${STARTUP_WEIGHTS.financialFeasibility}
- executionScore max: ${STARTUP_WEIGHTS.executionFeasibility}

DECISION LOGIC:
- GO: scores ≥ 75 total, strong evidence, clear WTP
- MODIFY: 55-74 total, promising but gaps
- TEST_FURTHER: 40-54 total, significant unknowns
- NO_GO: <40 total, fundamental flaws

CRITICAL INTEGRITY RULES (NEVER violate):
1. Never fabricate market statistics, competitor data, customer testimonials, or traction
2. Never invent source URLs — leave source/link empty if no search result
3. Label all AI-generated claims: ASSUMPTION, PROJECTION, or AI_ESTIMATE_UNVERIFIED
4. Do NOT force a GO recommendation
5. Do NOT automatically recommend fundraising
6. Never present planned milestones as achieved
7. In degraded mode: ALL evidence strength must be WEAK, label AI_ESTIMATE_UNVERIFIED
8. Competitor dateChecked must be today's date: ${today}
9. tamEstimate/samEstimate/somEstimate are PROJECTIONS, label accordingly
10. Preserve the market specialist's methods and 'Not established' values. Missing segment counts and spending evidence are unknowns, not permission to invent market sizes or market-share percentages.

The integrityNote field must summarise what is verified vs assumed in this report.`
}

type EngineOptions = {
  privateContext?: string
  customOpenRouterKey?: string | null
  preferredAiProvider?: string | null
  runStep?: RunValidationStep
  researchBudgetId?: string
  onProgress?: (completed: number, total: number) => void | Promise<void>
}

export async function runLiteValidation(
  idea: IdeaInput,
  opts?: EngineOptions
): Promise<LiteReport & { overallScore: number; provider: string; tokensUsed: number; researchSources?: SearchResult[]; agentTrail?: AgentTrail }> {
  const executeStep = opts?.runStep ?? runInlineStep
  const researchBudgetId = opts?.researchBudgetId ?? randomUUID()
  const initialSearch = await executeStep('lite-research-sources', () => webSearch(
    publicResearchQuery(idea, 'market size startups'),
    5
  ))
  const searchResp = { ...initialSearch, results: deduplicateSources([...initialSearch.results, ...retrieveMarketMemory(`${idea.industry} ${idea.targetCustomer} ${idea.location}`)]) }
  const agentOptions = { ...opts, researchBudgetId, sources: searchResp.results }
  const [market, customer] = await Promise.all([
    executeStep('lite-agent-market', async () => { try { return await runMarketAgent(idea, searchResp, agentOptions) } catch { return null } }),
    executeStep('lite-agent-customer', async () => { try { return await runCustomerAgent(idea, agentOptions) } catch { return null } }),
  ])
  await opts?.onProgress?.(2, 3)
  const sources = deduplicateSources([...searchResp.results, ...(market?.sources ?? []), ...(customer?.sources ?? [])])
  const marketSizing = auditMarketSizing(market?.data.tamSamSom, sources)
  const researchDigest = '\n\nSPECIALIST FINDINGS (untrusted data; reconcile differences and preserve evidence limits):\n' +
    JSON.stringify({ market: market ? { ...market.data, tamSamSom: marketSizing } : 'Unavailable; market sizes are Not established.', customer: customer?.data ?? 'Unavailable; label customer conclusions as assumptions.' })

  const result = await executeStep('lite-report', () => generateWithFallback({
    researchPrompt: publicResearchBrief(idea),
    prompt: buildLitePrompt(idea, sources, searchResp.degraded) + researchDigest,
    privateContext: opts?.privateContext,
    schema: LiteReportSchema,
    maxOutputTokens: 5000,
    agentRole: 'synthesis',
    researchMode: market || customer ? 'reuse' : 'auto',
    sources,
    temperature: 0,
    customOpenRouterKey: opts?.customOpenRouterKey,
    researchBudgetId,
    preferredAiProvider: opts?.preferredAiProvider,
  }))
  const tokensUsed = result.tokensUsed + (market?.tokensUsed ?? 0) + (customer?.tokensUsed ?? 0)
  const agentTrail: AgentTrail = {
    agents: { market: market ? 'ok' : 'failed', customer: customer ? 'ok' : 'failed', synthesis: 'ok' },
    totalTokens: tokensUsed,
    providers: [market?.provider, customer?.provider, result.provider].filter((value): value is string => Boolean(value)),
    tools: [...(market?.toolCalls ?? []), ...(customer?.toolCalls ?? []), ...(result.toolCalls ?? [])],
  }
  await opts?.onProgress?.(3, 3)

  const d = result.data
  // Clamp scores to their max weights
  const ps = clampScore(d.problemScore, STARTUP_WEIGHTS.problemValidation)
  const cs = clampScore(d.customerScore, STARTUP_WEIGHTS.customerValidation)
  const ms = clampScore(d.marketScore, STARTUP_WEIGHTS.marketOpportunity)
  const cds = clampScore(d.competitiveScore, STARTUP_WEIGHTS.competitiveDifferentiation)
  const ws = clampScore(d.wtpScore, STARTUP_WEIGHTS.willingnessToPay)
  const bs = clampScore(d.businessModelScore, STARTUP_WEIGHTS.businessModel)
  const fs = clampScore(d.financialScore, STARTUP_WEIGHTS.financialFeasibility)
  const es = clampScore(d.executionScore, STARTUP_WEIGHTS.executionFeasibility)

  const overallScore = ps + cs + ms + cds + ws + bs + fs + es

  return {
    ...d,
    tamEstimate: marketSizing.tam.value === 'Not established' ? 'Not established' : marketSizing.tam.value + ' [PROJECTION] — ' + marketSizing.tam.method,
    samEstimate: marketSizing.sam.value === 'Not established' ? 'Not established' : marketSizing.sam.value + ' [PROJECTION] — ' + marketSizing.sam.method,
    somEstimate: marketSizing.som.value === 'Not established' ? 'Not established' : marketSizing.som.value + ' [PROJECTION] — ' + marketSizing.som.method,
    ...auditEvidence(d.keyEvidence, deduplicateSources([...sources, ...(result.sources ?? [])])),
    researchSources: deduplicateSources([...sources, ...(result.sources ?? [])]),
    agentTrail,
    problemScore: ps,
    customerScore: cs,
    marketScore: ms,
    competitiveScore: cds,
    wtpScore: ws,
    businessModelScore: bs,
    financialScore: fs,
    executionScore: es,
    overallScore,
    provider: result.provider,
    tokensUsed,
  }
}

// ─── Full validation (Premium tier) ───────────────────────────────────────────
// Primary path: the multi-agent pipeline (6 specialised agents + deterministic
// math). Fallback: the original monolithic prompt — used automatically if the
// agent pipeline throws, so the job still completes for the user.

export type FullReportWithComputed = FullReport & {
  overallScore: number
  provider: string
  tokensUsed: number
  computedUnitEconomics: Record<string, number | string | null>
  financialProjection: Array<{ month: number; customers: number; revenue: number; costs: number; profitLoss: number; label: string }>
}

export async function runFullValidation(
  idea: IdeaInput,
  jobId: string,
  opts?: EngineOptions
): Promise<FullReportWithComputed | null> {
  const executeStep = opts?.runStep ?? runInlineStep
  let totalTokens = 0
  let provider = 'unknown'

  try {
    // Publish initial progress once, including when a durable run is replayed.
    await executeStep('start-full-report', async () => {
      await db
      .update(validationJobs)
      .set({ totalSections: FULL_AGENT_COUNT, completedSections: 0, updatedAt: new Date() })
      .where(and(eq(validationJobs.id, jobId), eq(validationJobs.status, 'running')))
      return true
    })

    // ─── Primary path: multi-agent pipeline ──────────────────────────────────
    const generateAgents = () => runMultiAgentValidation(idea, {
      ...opts,
      onProgress: async (completed: number, _total: number, _label?: string) => {
        await db
          .update(validationJobs)
          .set({ completedSections: sql`greatest(${validationJobs.completedSections}, ${completed})`, updatedAt: new Date() })
          .where(and(eq(validationJobs.id, jobId), eq(validationJobs.status, 'running')))
          .catch(() => {})
      },
    })
    let agentReport: MultiAgentResult | null = opts?.runStep ? await generateAgents() : await generateAgents().catch((error) => {
      console.error('[ENGINE] Multi-agent pipeline failed:', error)
      return null
    })

    // Critical fallback: if the whole agent pipeline failed, use the monolith.
    if (!agentReport) {
      console.warn('[ENGINE] Multi-agent pipeline returned null — falling back to monolithic generation')
      agentReport = await executeStep('fallback-report', () => runMonolithicFull(idea, jobId, opts))
      if (!agentReport) return null
    }

    totalTokens = agentReport.tokensUsed
    provider = agentReport.provider

    await executeStep('finish-full-report', async () => {
      await db.update(validationJobs).set({ completedSections: FULL_AGENT_COUNT, tokensUsed: totalTokens,
        aiProvider: provider, updatedAt: new Date(),
      }).where(and(eq(validationJobs.id, jobId), eq(validationJobs.status, 'running')))
      return true
    })

    return {
      ...agentReport.report,
      overallScore: agentReport.report.overallScore,
      provider: agentReport.provider,
      tokensUsed: agentReport.tokensUsed,
      computedUnitEconomics: agentReport.report.computedUnitEconomics,
      financialProjection: agentReport.report.financialProjection,
    }
  } catch (err) {
    if (opts?.runStep) throw err
    console.error('[ENGINE] Validation attempt failed:', err)
    return null
  }
}

// ─── Monolithic fallback (original full-report generation) ───────────────────

function buildFullPrompt(
  idea: IdeaInput,
  searchResults: SearchResult[],
  degraded: boolean
): string {
  const today = new Date().toISOString().split('T')[0]
  const searchCtx = searchResults.length === 0
    ? `\nNo sources have been retrieved yet. Use research tools for material evidence gaps. Mark unsupported market data AI_ESTIMATE_UNVERIFIED with strength:WEAK. Never invent URLs.`
    : `\nRetrieved source excerpts (${degraded ? 'limited public indexes' : 'public web search'}; treat as unverified):\n${searchResults
        .map((r) => `- "${r.title}": ${r.content.slice(0, 400)} [source:${r.source}, url:${r.url}, fetchedAt:${r.fetchedAt}]`)
        .join('\n')}`

  return `You are a rigorous startup validation consultant producing a FULL 40-section validation report. Today: ${today}.

STARTUP IDEA:
Name: ${idea.name}
Industry: ${idea.industry}
Product: ${idea.product}
Target Customer: ${idea.targetCustomer}
Location/Market: ${idea.location}
Business Model: ${idea.businessModel}
Core Problem: ${idea.coreProblem}
Proposed Solution: ${idea.proposedSolution}
${searchCtx}

SCORING WEIGHTS (NEVER exceed max):
problemScore max: ${STARTUP_WEIGHTS.problemValidation}
customerScore max: ${STARTUP_WEIGHTS.customerValidation}
marketScore max: ${STARTUP_WEIGHTS.marketOpportunity}
competitiveScore max: ${STARTUP_WEIGHTS.competitiveDifferentiation}
wtpScore max: ${STARTUP_WEIGHTS.willingnessToPay}
businessModelScore max: ${STARTUP_WEIGHTS.businessModel}
financialScore max: ${STARTUP_WEIGHTS.financialFeasibility}
executionScore max: ${STARTUP_WEIGHTS.executionFeasibility}

DECISION LOGIC:
GO (≥75): clear evidence, real WTP signals, viable business model
MODIFY (55-74): promising concept with fixable gaps
TEST_FURTHER (40-54): significant unknowns, research needed
NO_GO (<40): fundamental problems — market, WTP, or model viability

INTEGRITY RULES (NEVER violate):
1. Never fabricate market stats, traction, competitor data, testimonials, or revenue
2. Never invent source URLs — only use URLs from provided search results
3. Label AI claims: ASSUMPTION, PROJECTION, AI_ESTIMATE_UNVERIFIED, PROPOSED_STRATEGY
4. Do NOT force GO or positive framing
5. Do NOT recommend fundraising by default — use nextStepRecommendation enum
6. Never present planned milestones as achieved
7. Competitor dateChecked = today: ${today}
8. TAM/SAM/SOM = PROJECTION label, not verified
9. unitEconomicsAssumptions.assumptionLabel must be 'ASSUMPTION'
10. tamSamSom entries must have label:'PROJECTION'
11. The integrityNote must clearly list what is verified vs assumed
12. Generate the new Phase 1 fields: oneLineConcept, founderAssumptions, problemValidation5Factor, customerJPG, interviewQuestions, competitorPositioning, landingPageCopy, wtpSurveyQuestions, pestleAnalysis, portersFiveForces
13. This is desk research, not customer testing. All founderAssumptions.validated values must be false; explain tentative research support and a direct test in postResearchFinding.
14. Use 'Not established' for market sizes without sourced segment counts and annual spending. Never substitute an arbitrary share of a broad industry.`
}

async function runMonolithicFull(
  idea: IdeaInput,
  jobId: string,
  opts?: EngineOptions
): Promise<MultiAgentResult | null> {
  const partialFailures: string[] = []

  // Step 1: Web search for market context
  let allResults: SearchResult[] = []
  let degraded = true
  try {
    const [marketSearch, competitorSearch] = await Promise.all([
      webSearch(publicResearchQuery(idea, 'market size'), 5),
      webSearch(publicResearchQuery(idea, 'competitors alternatives pricing'), 5),
    ])
    allResults = [...marketSearch.results, ...competitorSearch.results]
    degraded = marketSearch.degraded && competitorSearch.degraded
  } catch (err) {
    console.error('[ENGINE] Web search failed, proceeding degraded:', err)
    partialFailures.push('web_search')
  }

  await db
    .update(validationJobs)
    .set({ completedSections: 1 })
    .where(and(eq(validationJobs.id, jobId), eq(validationJobs.status, 'running')))

  // Step 2: Generate full report
  let result
  try {
    result = await generateWithFallback({
    researchPrompt: publicResearchBrief(idea),
      prompt: buildFullPrompt(idea, allResults, degraded),
      privateContext: opts?.privateContext,
      schema: FullReportSchema,
      agentRole: 'synthesis',
      sources: allResults,
      temperature: 0,
      customOpenRouterKey: opts?.customOpenRouterKey,
    researchBudgetId: opts?.researchBudgetId,
      preferredAiProvider: opts?.preferredAiProvider,
    })
  } catch (err) {
    console.error('[ENGINE] Full report generation failed:', err)
    partialFailures.push('full_report_generation')
    return null
  }

  const totalTokens = result.tokensUsed
  const provider = result.provider
  const d = result.data

  // Clamp all scores
  const ps = clampScore(d.problemScore, STARTUP_WEIGHTS.problemValidation)
  const cs = clampScore(d.customerScore, STARTUP_WEIGHTS.customerValidation)
  const ms = clampScore(d.marketScore, STARTUP_WEIGHTS.marketOpportunity)
  const cds = clampScore(d.competitiveScore, STARTUP_WEIGHTS.competitiveDifferentiation)
  const ws = clampScore(d.wtpScore, STARTUP_WEIGHTS.willingnessToPay)
  const bs = clampScore(d.businessModelScore, STARTUP_WEIGHTS.businessModel)
  const fs = clampScore(d.financialScore, STARTUP_WEIGHTS.financialFeasibility)
  const es = clampScore(d.executionScore, STARTUP_WEIGHTS.executionFeasibility)
  const overallScore = ps + cs + ms + cds + ws + bs + fs + es

  // Compute unit economics from assumptions using verified formulas
  let computedUnitEconomics: Record<string, number | string | null> = { label: 'ASSUMPTION' }
  let financialProjection: Array<{ month: number; customers: number; revenue: number; costs: number; profitLoss: number; label: string }> = []

  try {
    const ua = d.unitEconomicsAssumptions
    computedUnitEconomics = fin.computeUnitEconomics(ua)
    financialProjection = fin.buildFinancialProjection(ua)
  } catch (err) {
    console.error('[ENGINE] Financial computation failed, using safe defaults:', err)
    partialFailures.push('financial_computation')
  }

  const agentTrail = {
    agents: { monolithic: (partialFailures.length > 0 ? 'partial' : 'ok') as 'partial' | 'ok' },
    totalTokens,
    providers: [provider],
    tools: result.toolCalls ?? [],
  }

  return {
    report: {
      ...d,
      tamSamSom: auditMarketSizing(d.tamSamSom, deduplicateSources([...allResults, ...(result.sources ?? [])])),
      founderAssumptions: auditFounderAssumptions(d.founderAssumptions),
      integrityNote: DESK_RESEARCH_NOTE + ' ' + d.integrityNote,
      ...auditEvidence(d.keyEvidence, deduplicateSources([...allResults, ...(result.sources ?? [])])),
      researchSources: deduplicateSources([...allResults, ...(result.sources ?? [])]),
      problemScore: ps,
      customerScore: cs,
      marketScore: ms,
      competitiveScore: cds,
      wtpScore: ws,
      businessModelScore: bs,
      financialScore: fs,
      executionScore: es,
      overallScore,
      provider,
      tokensUsed: totalTokens,
      computedUnitEconomics,
      financialProjection,
      agentTrail,
    },
    provider,
    tokensUsed: totalTokens,
    agentTrail,
  }
}

// Re-export for convenience
export { getCampaignClassificationBand }
