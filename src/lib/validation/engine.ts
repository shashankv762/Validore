import { z } from 'zod'
import { generateWithFallback, type GenerateOptions } from '../ai/generate'
import { publicResearchBrief, publicResearchQuery } from '@/lib/ai/research-brief'
import { webSearch, deduplicateSources, type SearchResult } from '../ai/search'
import { STARTUP_WEIGHTS, clampScore, getCampaignClassificationBand } from '../scoring'
import * as fin from '../financial'
import { db } from '@/db'
import { validationJobs } from '@/db/schema'
import { eq, and, sql } from 'drizzle-orm'
import { runInlineStep, type RunValidationStep } from './steps'
import { auditEvidence, auditMarketSizing, auditFounderAssumptions, reconcileDecision, validateCustomerSignals, validateSynthesisHandoffClaims, DESK_RESEARCH_NOTE, type DecisionAudit } from './agents/quality-auditor'
import { buildAgentHandoff, serializeHandoffs, buildScoreSummary, auditHandoffCoverage, type HandoffAudit, type ScoreSummary } from './agents/handoffs'
import { CustomerAgentSchema, GrowthAgentSchema, SynthesisAgentSchema, PriceSensitivitySchema } from './schemas'
import { runMultiAgentValidation, type MultiAgentResult, type AgentTrail } from './agents/orchestrator'
import { runMarketAgent } from './agents/market'
import { runCustomerAgent } from './agents/customer'
import { FULL_AGENT_COUNT } from '@/lib/ai/roles'
import { retrieveMarketMemory } from '@/lib/ai/market-memory'
import { randomUUID } from 'node:crypto'
import { effectiveAiPreference,freeModelsOnly } from '@/lib/ai/model-policy'
import { runSpecialistPhase,specialistConcurrency } from './agents/specialist-scheduler'
import { compactPrivateContext } from '@/lib/ai/private-context'
import { liteReportStepId } from './lite-step'
import { researchContextStepId } from './agents/derived-step'
import { isRetryableGenerationFailure } from '@/lib/ai/generation-failure'
import { validationContentIssues, validateFullValidationOutput } from './delivery-quality'
import { validationManifest, validationModelPolicy, VALIDATION_METHOD_VERSION } from './provenance'

// ─── Shared schemas (single source of truth: ./schemas) ──────────────────────

export { EvidenceItemSchema, type EvidenceItem, CategoryScoreSchema, type IdeaInput, FullReportSchema, type FullReport } from './schemas'
import { EvidenceItemSchema, FullReportSchema, type IdeaInput, type FullReport } from './schemas'

// ─── Lite validation (Free tier) ──────────────────────────────────────────────

export const LiteReportSchema = z.object({
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
  actionPlan: z.array(SynthesisAgentSchema.shape.actionPlan.element.partial({ owner: true })).min(3).max(4),
  persona: z.object({
    name: z.string(),
    ageRange: z.string(),
    occupation: z.string(),
    incomeRange: z.string(),
    goals: z.array(z.string()),
    problems: z.array(z.string()),
    priceSensitivity: PriceSensitivitySchema,
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
  nextStepRecommendation: SynthesisAgentSchema.shape.nextStepRecommendation.optional(),
  nextStepRationale: z.string().optional(),
  customerSignals: CustomerAgentSchema.shape.customerSignals,
})

export type LiteReport = z.infer<typeof LiteReportSchema>

// Older saved Lite reports remain readable. New generation must provide the
// same explicit learning/decision criteria as the full growth specialist.
const LiteGenerationSchema = LiteReportSchema.extend({
  actionPlan: z.array(GrowthAgentSchema.shape.actionPlan.element).min(3).max(4),
  nextStepRecommendation: SynthesisAgentSchema.shape.nextStepRecommendation,
  nextStepRationale: z.string().trim().min(1),
})
// Successful specialists already own these fields. The final model spends its
// bounded output on judgment and next experiments, not retyping their results.
const LiteSynthesisSchema = LiteGenerationSchema.omit({
  problemScore: true, customerScore: true, wtpScore: true, marketScore: true,
  persona: true, tamEstimate: true, samEstimate: true, somEstimate: true, customerSignals: true,
})
type LiteSynthesisOutput = z.infer<typeof LiteSynthesisSchema>

function buildLitePrompt(
  idea: IdeaInput,
  searchResults: SearchResult[],
  degraded: boolean,
  reuseSpecialists = false,
  asOfDate?: string,
): string {
  const today = asOfDate ?? new Date().toISOString().split('T')[0]
  const searchCtx = reuseSpecialists
    ? '\nCompleted market/customer findings and the retrieved source register are supplied separately. Reuse them.'
    : searchResults.length === 0
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

TASK: Perform a LITE startup validation. Preserve the provided specialist scores from the explicit score summary and estimate only the remaining categories within their max weights. Return nextStepRecommendation and a concrete nextStepRationale tied to the first decision-changing experiment.
Give three or four proposed sequential experiments. Every actionPlan item needs owner, hypothesis, participantUnit, denominator, passCriterion and decisionOnFailure as well as week/action/kpi. Keep each field concise. Interviews and email signups measure learning or interest, not payment. State the actual paid commitment needed to pass a willingness-to-pay test and what changes if that threshold is missed. Do not confuse individual customers, organizations and cohorts or schedule scaling as an unconditional next step.
Use persona.priceSensitivity: unknown when direct buyer pricing evidence is missing. Price sensitivity describes response to price changes, not willingness to pay. Do not infer low, medium or high sensitivity from nationality, income, occupation or an invented persona.

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
Score bands (≥75, 55-74, 40-54 and <40) describe the concept/evidence rubric, not a commercial verdict.
- TEST_FURTHER is appropriate at any score when demand, payment or other critical inputs are untested. Missing validation does not establish fundamental failure.
- MODIFY identifies a supported, fixable concept gap.
- A low score, an ordinary competitor page and losses under assumed inputs do not establish NO_GO. A blocking conclusion needs original-source review of an actual binding constraint or observed outcome; Lite should request that review when it is missing.
- GO requires direct product-specific commercial validation, which desk research alone cannot establish.

CRITICAL INTEGRITY RULES (NEVER violate):
1. Never fabricate market statistics, competitor data, customer testimonials, or traction
2. Never invent source URLs; use supplied sources or successful research results only. Add an exact evidenceExcerpt of at least 20 characters from the cited retrieved content for MODERATE; snippets and dated memory remain WEAK. Do not output STRONGER or VERIFIED.
3. Label all AI-generated claims: ASSUMPTION, PROJECTION, or AI_ESTIMATE_UNVERIFIED
4. Do NOT force a GO recommendation
5. Do NOT automatically recommend fundraising
6. Never present planned milestones as achieved
7. Judge each source by its actual retrieval: snippets, bibliographic records, dated memory and unsupported claims remain WEAK, including after a degraded search. MODERATE requires an evidenceExcerpt of at least 20 characters copied exactly from the successfully read cited page or official dataset. The excerpt proves provenance, not that an inference exceeds its scope. Do not output strength STRONGER or label VERIFIED; a later successful original-source read can support MODERATE even when the initial search was degraded.
8. Competitor dateChecked must be today's date: ${today}
9. tamEstimate/samEstimate/somEstimate are PROJECTIONS, label accordingly
10. Preserve the market specialist's methods and 'Not established' values. Missing segment counts and spending evidence are unknowns, not permission to invent market sizes or market-share percentages.

The integrityNote must distinguish retrieved observations, assumptions, projections and missing evidence. Source retrieval and AI interpretation are not independent verification.`
}

type EngineOptions = {
  privateContext?: string
  customOpenRouterKey?: string | null
  preferredAiProvider?: string | null
  maxTokensPerCall?: number
  runStep?: RunValidationStep
  researchBudgetId?: string
  retryTransientFailures?: boolean
  asOfDate?: string
  onProgress?: (completed: number, total: number) => void | Promise<void>
}

export async function runLiteValidation(
  idea: IdeaInput,
  opts?: EngineOptions
): Promise<LiteReport & { overallScore: number; provider: string; tokensUsed: number; researchSources?: SearchResult[]; agentTrail?: AgentTrail; decisionAudit?: DecisionAudit; handoffAudit?: HandoffAudit; scoreSummary?: ScoreSummary; runManifest?: ReturnType<typeof validationManifest> }> {
  const stepIds: string[] = []
  const executeStep: RunValidationStep = (id, work) => { stepIds.push(id); return (opts?.runStep ?? runInlineStep)(id, work) }
  const asOfDate = await executeStep(researchContextStepId('lite-run-date', idea), async () => opts?.asOfDate ?? new Date().toISOString().slice(0, 10))
  const freeOnly=freeModelsOnly()||effectiveAiPreference(opts?.preferredAiProvider)!=='paid_models'
  const concurrency=specialistConcurrency(process.env.AI_SPECIALIST_CONCURRENCY,freeOnly)
  const researchBudgetId = opts?.researchBudgetId ?? randomUUID()
  const initialSearch = await executeStep(researchContextStepId('lite-research-sources', idea), async () => {
    const search = await webSearch(publicResearchQuery(idea, 'market size startups'), 5, { budgetId: researchBudgetId })
      .catch(() => ({ results: [] as SearchResult[], degraded: true, evidenceStrength: 'WEAK' as const }))
    return { ...search, results: deduplicateSources([...search.results, ...retrieveMarketMemory(`${idea.industry} ${idea.targetCustomer} ${idea.location}`)]) }
  })
  // Memory and search are one durable evidence snapshot. Replaying a completed
  // Lite run must not silently add a newer memory to cached specialist work.
  const searchResp = initialSearch
  const agentOptions = { ...opts, researchBudgetId, sources: searchResp.results, asOfDate }
  const researchDependencies = { sources: searchResp.results, privateContext: opts?.privateContext, maxTokensPerCall: opts?.maxTokensPerCall,
    modelPolicy: validationModelPolicy(opts?.preferredAiProvider), asOfDate }
  const runSpecialist = async <T>(generate: () => Promise<T>): Promise<T | null> => {
    try { return await generate() }
    catch (error) {
      if ((opts?.retryTransientFailures ?? Boolean(opts?.runStep)) && isRetryableGenerationFailure(error)) throw error
      return null
    }
  }
  const [market, customer] = await runSpecialistPhase(concurrency, [
    () => executeStep(researchContextStepId('lite-agent-market', idea, researchDependencies), () => runSpecialist(() => runMarketAgent(idea, searchResp, agentOptions))),
    () => executeStep(researchContextStepId('lite-agent-customer', idea, researchDependencies), () => runSpecialist(() => runCustomerAgent(idea, agentOptions))),
  ] as const)
  await opts?.onProgress?.(2, 3)
  const sources = deduplicateSources([...searchResp.results, ...(market?.sources ?? []), ...(customer?.sources ?? [])])
  const marketSizing = auditMarketSizing(market?.data.tamSamSom, sources)
  const handoffs = [buildAgentHandoff('market', market ? { ...market, data: { ...market.data, tamSamSom: marketSizing } } : null),
    buildAgentHandoff('customer', customer)]
  const reuseSpecialists = Boolean(market && customer?.data.personas?.[0])
  const serializedHandoffs = serializeHandoffs(handoffs, { essentialsOnly: true, maxCharacters: 12_000 })
  const handoffAudit = auditHandoffCoverage(handoffs, serializedHandoffs)
  if (handoffAudit.missingCriticalFields.length) throw new Error('Critical specialist scores were not retained in the Lite handoff')
  const scoreSummary = buildScoreSummary(handoffs)
  const researchDigest = '\nEXPLICIT SCORE SUMMARY (computed from specialist outputs):\n' + JSON.stringify(scoreSummary) + serializedHandoffs

  const ideaSnapshot=structuredClone(idea)
  Object.freeze(ideaSnapshot)
  const sourcesSnapshot=structuredClone(sources)
  for(const source of sourcesSnapshot)Object.freeze(source)
  Object.freeze(sourcesSnapshot)
  const ownedFields = reuseSpecialists ? {
    problemScore: clampScore(customer!.data.problemScore, STARTUP_WEIGHTS.problemValidation),
    customerScore: clampScore(customer!.data.customerScore, STARTUP_WEIGHTS.customerValidation),
    wtpScore: clampScore(customer!.data.wtpScore, STARTUP_WEIGHTS.willingnessToPay),
    marketScore: clampScore(market!.data.marketScore, STARTUP_WEIGHTS.marketOpportunity),
    persona: LiteReportSchema.shape.persona.parse(customer!.data.personas[0]),
    tamEstimate: marketSizing.tam.value,
    samEstimate: marketSizing.sam.value,
    somEstimate: marketSizing.som.value,
    customerSignals: customer!.data.customerSignals,
  } : {}
  const reportOptions: GenerateOptions<LiteSynthesisOutput> = {
    researchPrompt: publicResearchBrief(ideaSnapshot),
    prompt: buildLitePrompt(ideaSnapshot, sourcesSnapshot, searchResp.degraded, reuseSpecialists, asOfDate) +
      (reuseSpecialists ? '\nThe coordinator attaches problemScore, customerScore, wtpScore, marketScore, the primary persona, market estimates and customer signals from completed specialists. Do not regenerate those fields. Return only the synthesis schema, with concise reasons and experiment fields.' : '') + researchDigest,
    privateContext: compactPrivateContext(opts?.privateContext),
    schema: reuseSpecialists ? LiteSynthesisSchema : LiteGenerationSchema,
    validateOutput: (data, suppliedSources) => {
      const assembled = LiteReportSchema.parse({ ...data, ...ownedFields })
      return [...validationContentIssues(assembled, true), ...validateCustomerSignals(assembled, suppliedSources), ...validateSynthesisHandoffClaims(data, handoffAudit)]
    },
    maxOutputTokens: 5000,
    maxTokensPerCall: opts?.maxTokensPerCall,
    agentRole: 'synthesis' as const,
    researchMode: market || customer ? 'reuse' as const : 'auto' as const,
    sources:sourcesSnapshot,
    temperature: 0,
    customOpenRouterKey: opts?.customOpenRouterKey,
    researchBudgetId,
    preferredAiProvider: opts?.preferredAiProvider,
  }
  Object.freeze(reportOptions)
  const reportStep=liteReportStepId(ideaSnapshot,reportOptions,VALIDATION_METHOD_VERSION,opts?.privateContext)
  const result = await executeStep(reportStep, () => generateWithFallback(reportOptions))
  const tokensUsed = result.tokensUsed + (market?.tokensUsed ?? 0) + (customer?.tokensUsed ?? 0)
  const agentTrail: AgentTrail = {
    agents: { market: market ? 'ok' : 'failed', customer: customer ? 'ok' : 'failed', synthesis: 'ok' },
    totalTokens: tokensUsed,
    providers: [market?.provider, customer?.provider, result.provider].filter((value): value is string => Boolean(value)),
    tools: [...(market?.toolCalls ?? []), ...(customer?.toolCalls ?? []), ...(result.toolCalls ?? [])],
  }
  await opts?.onProgress?.(3, 3)

  const d = LiteReportSchema.parse({ ...result.data, ...ownedFields })
  // Clamp scores to their max weights
  const ps = clampScore(customer?.data.problemScore ?? d.problemScore, STARTUP_WEIGHTS.problemValidation)
  const cs = clampScore(customer?.data.customerScore ?? d.customerScore, STARTUP_WEIGHTS.customerValidation)
  const ms = clampScore(market?.data.marketScore ?? d.marketScore, STARTUP_WEIGHTS.marketOpportunity)
  const cds = clampScore(d.competitiveScore, STARTUP_WEIGHTS.competitiveDifferentiation)
  const ws = clampScore(customer?.data.wtpScore ?? d.wtpScore, STARTUP_WEIGHTS.willingnessToPay)
  const bs = clampScore(d.businessModelScore, STARTUP_WEIGHTS.businessModel)
  const fs = clampScore(d.financialScore, STARTUP_WEIGHTS.financialFeasibility)
  const es = clampScore(d.executionScore, STARTUP_WEIGHTS.executionFeasibility)

  const overallScore = ps + cs + ms + cds + ws + bs + fs + es
  const finalSources = deduplicateSources([...sources, ...(result.sources ?? [])])
  const citations = auditEvidence(d.keyEvidence, finalSources)
  const firstTest = d.actionPlan[0]
  const decision = reconcileDecision({ ...d, nextStepRecommendation: d.nextStepRecommendation ?? 'MORE_VALIDATION' as const,
    nextStepRationale: d.nextStepRationale || 'Start with this proposed test: ' + firstTest.action + ' Pass criterion: ' + (firstTest.passCriterion || firstTest.kpi) },
    overallScore, { agents: agentTrail.agents, evidence: citations.keyEvidence, sources: finalSources })

  const finalReport = {
    ...decision,
    customerSignals: customer?.data.customerSignals ?? d.customerSignals,
    tamEstimate: marketSizing.tam.value === 'Not established' ? 'Not established' : marketSizing.tam.value + ' [PROJECTION] — ' + marketSizing.tam.method,
    samEstimate: marketSizing.sam.value === 'Not established' ? 'Not established' : marketSizing.sam.value + ' [PROJECTION] — ' + marketSizing.sam.method,
    somEstimate: marketSizing.som.value === 'Not established' ? 'Not established' : marketSizing.som.value + ' [PROJECTION] — ' + marketSizing.som.method,
    ...citations,
    researchSources: finalSources,
    runManifest: validationManifest(ideaSnapshot, opts?.privateContext, finalSources, stepIds, opts?.preferredAiProvider),
    handoffAudit,
    scoreSummary,
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
  // Validate after calibration as well: a policy note must never turn a valid
  // five-reason model response into an invalid saved Lite report.
  LiteReportSchema.parse(finalReport)
  return finalReport
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
  const durableStepFailures = new WeakSet<object>()
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
    const agentOptions = opts?.runStep ? { ...opts, runStep: async <T>(name: string, work: () => Promise<T>) => {
      try { return await opts.runStep!(name, work) }
      catch (error) {
        if (error !== null && (typeof error === 'object' || typeof error === 'function')) durableStepFailures.add(error as object)
        throw error
      }
    } } : opts
    const generateAgents = () => runMultiAgentValidation(idea, {
      ...agentOptions,
      onProgress: async (completed: number, _total: number, _label?: string) => {
        await db
          .update(validationJobs)
          .set({ completedSections: sql`greatest(${validationJobs.completedSections}, ${completed})` })
          .where(and(eq(validationJobs.id, jobId), eq(validationJobs.status, 'running')))
          .catch(() => {})
      },
    })
    let agentReport: MultiAgentResult | null = null
    try { agentReport = await generateAgents() }
    catch (error) {
      const cameFromDurableStep = error !== null && (typeof error === 'object' || typeof error === 'function') && durableStepFailures.has(error as object)
      if (cameFromDurableStep || opts?.runStep && isRetryableGenerationFailure(error)) throw error
      console.warn('[ENGINE] Multi-agent coordinator failed; trying monolithic fallback', { type: error instanceof Error ? error.name : 'UnknownError' })
    }

    // Critical fallback: if the whole agent pipeline failed, use the monolith.
    if (!agentReport) {
      console.warn('[ENGINE] Multi-agent pipeline returned null — falling back to monolithic generation')
      // The fallback registers its own durable research/model steps. Wrapping
      // the coordinator itself in a step would nest those registrations.
      agentReport = await runMonolithicFull(idea, jobId, opts)
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
  degraded: boolean,
  asOfDate?: string,
): string {
  const today = asOfDate ?? new Date().toISOString().split('T')[0]
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
The score bands ≥75, 55-74, 40-54 and <40 describe concept/evidence support, not an automatic commercial verdict.
Use TEST_FURTHER at any score when important assumptions are untested. A low score, ordinary competitor pages or hypothetical financial losses do not prove customer rejection.
MODIFY identifies a supported, fixable gap. A blocking NO_GO conclusion requires original-source specialist review of an actual binding constraint or observed outcome; request that review when it is missing. Desk research alone cannot establish the direct commercial validation needed for GO.

INTEGRITY RULES (NEVER violate):
Set personas.priceSensitivity to unknown without direct buyer pricing evidence. Price sensitivity is not willingness to pay; nationality, income and an assumed customer profile do not measure it.
1. Never fabricate market stats, traction, competitor data, testimonials, or revenue
2. Never invent source URLs — only use supplied sources or successful research tool results. Snippets and dated memory remain WEAK; MODERATE requires exact supporting text from a successfully read page or official dataset. Do not output strength STRONGER or label VERIFIED.
3. Label AI claims: ASSUMPTION, PROJECTION, AI_ESTIMATE_UNVERIFIED, PROPOSED_STRATEGY
4. Do NOT force GO or positive framing
5. Do NOT recommend fundraising by default — use nextStepRecommendation enum
6. Never present planned milestones as achieved
7. Competitor dateChecked = today: ${today}
8. TAM/SAM/SOM = PROJECTION label, not verified
9. unitEconomicsAssumptions.assumptionLabel must be 'ASSUMPTION'
10. tamSamSom entries must have label:'PROJECTION'
11. The integrityNote must distinguish retrieved observations, assumptions, projections and missing evidence; a retrieved URL or AI interpretation is not independent verification.
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
  const optionsSnapshot = Object.freeze({ ...opts })
  const ideaSnapshot = Object.freeze(structuredClone(idea))
  const executeStep = optionsSnapshot.runStep ?? runInlineStep
  const asOfDate = await executeStep(researchContextStepId('monolithic-run-date', ideaSnapshot), async () => optionsSnapshot.asOfDate ?? new Date().toISOString().slice(0, 10))

  // Step 1: Web search for market context
  // Catch external failures inside the step, so its degraded result is durable
  // and scheduling/retry signals from the runner still propagate unchanged.
  const searches = await executeStep(researchContextStepId('monolithic-research-sources', ideaSnapshot), async () => {
    try {
      return await Promise.all([
        webSearch(publicResearchQuery(ideaSnapshot, 'market size'), 5, { budgetId: optionsSnapshot.researchBudgetId }),
        webSearch(publicResearchQuery(ideaSnapshot, 'competitors alternatives pricing'), 5, { budgetId: optionsSnapshot.researchBudgetId }),
      ])
    } catch (err) {
      console.error('[ENGINE] Web search failed, proceeding degraded:', err)
      return null
    }
  })
  if (!searches) partialFailures.push('web_search')
  const allResults: SearchResult[] = structuredClone(searches ? [...searches[0].results, ...searches[1].results] : [])
  for (const source of allResults) Object.freeze(source)
  Object.freeze(allResults)
  const degraded = searches ? searches[0].degraded && searches[1].degraded : true

  await executeStep('monolithic-research-progress', async () => {
    await db.update(validationJobs)
      .set({ completedSections: sql`greatest(${validationJobs.completedSections}, 1)` })
      .where(and(eq(validationJobs.id, jobId), eq(validationJobs.status, 'running')))
    return true
  })

  // Step 2: Generate full report
  const reportOptions: GenerateOptions<FullReport> = {
    researchPrompt: publicResearchBrief(ideaSnapshot),
    prompt: buildFullPrompt(ideaSnapshot, allResults, degraded, asOfDate),
    privateContext: optionsSnapshot.privateContext,
    schema: FullReportSchema,
    validateOutput: validateFullValidationOutput,
    agentRole: 'synthesis',
    sources: allResults,
    temperature: 0,
    customOpenRouterKey: optionsSnapshot.customOpenRouterKey,
    researchBudgetId: optionsSnapshot.researchBudgetId,
    preferredAiProvider: optionsSnapshot.preferredAiProvider,
    maxTokensPerCall: optionsSnapshot.maxTokensPerCall,
  }
  Object.freeze(reportOptions)
  const monolithicStep = liteReportStepId(ideaSnapshot, reportOptions, VALIDATION_METHOD_VERSION + ':monolithic', optionsSnapshot.privateContext).replace(/^lite-report-/, 'monolithic-report-')
  const result = await executeStep(monolithicStep, async () => {
    try { return await generateWithFallback(reportOptions) }
    catch (err) {
      if ((optionsSnapshot.retryTransientFailures ?? Boolean(optionsSnapshot.runStep)) && isRetryableGenerationFailure(err)) throw err
      console.error('[ENGINE] Full report generation failed')
      return null
    }
  })
  if (!result) return null

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

  const citations = auditEvidence(d.keyEvidence, deduplicateSources([...allResults, ...(result.sources ?? [])]))
  const decision = reconcileDecision(d, overallScore, { agents: agentTrail.agents, evidence: citations.keyEvidence,
    sources: deduplicateSources([...allResults, ...(result.sources ?? [])]) })

  return {
    report: {
      ...decision,
      tamSamSom: auditMarketSizing(d.tamSamSom, deduplicateSources([...allResults, ...(result.sources ?? [])])),
      founderAssumptions: auditFounderAssumptions(d.founderAssumptions),
      integrityNote: DESK_RESEARCH_NOTE + ' ' + d.integrityNote,
      ...citations,
      researchSources: deduplicateSources([...allResults, ...(result.sources ?? [])]),
      runManifest: validationManifest(ideaSnapshot, optionsSnapshot.privateContext, deduplicateSources([...allResults, ...(result.sources ?? [])]), [monolithicStep], optionsSnapshot.preferredAiProvider),
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
