import { z } from 'zod'
import { generateWithFallback } from '../ai/generate'
import { webSearch, type SearchResult } from '../ai/search'
import { STARTUP_WEIGHTS, clampScore, getCampaignClassificationBand } from '../scoring'
import * as fin from '../financial'
import { db } from '@/db'
import { validationJobs } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { runMultiAgentValidation, type MultiAgentResult } from './agents/orchestrator'

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
  const searchCtx = degraded
    ? `\nNo live search results. Mark ALL market data as AI_ESTIMATE_UNVERIFIED with strength:WEAK. Leave link/source empty. Never invent URLs.`
    : `\nLive search results (treat as MODERATE evidence, include fetchedAt):\n${searchResults
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

The integrityNote field must summarise what is verified vs assumed in this report.`
}

type EngineOptions = {
  customOpenRouterKey?: string | null
  preferredAiProvider?: string | null
}

export async function runLiteValidation(
  idea: IdeaInput,
  opts?: EngineOptions
): Promise<LiteReport & { overallScore: number; provider: string; tokensUsed: number }> {
  const searchResp = await webSearch(
    `${idea.industry} market size ${idea.location} startups 2024 2025`,
    5
  )

  const result = await generateWithFallback({
    prompt: buildLitePrompt(idea, searchResp.results, searchResp.degraded),
    schema: LiteReportSchema,
    temperature: 0,
    customOpenRouterKey: opts?.customOpenRouterKey,
    preferredAiProvider: opts?.preferredAiProvider,
  })

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
    tokensUsed: result.tokensUsed,
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
  computedUnitEconomics: Record<string, number | string>
  financialProjection: Array<{ month: number; customers: number; revenue: number; costs: number; profitLoss: number; label: string }>
}

export async function runFullValidation(
  idea: IdeaInput,
  jobId: string,
  opts?: EngineOptions
): Promise<FullReportWithComputed | null> {
  let totalTokens = 0
  let provider = 'unknown'

  try {
    // Update job: started
    await db
      .update(validationJobs)
      .set({ status: 'running', totalSections: 6, completedSections: 0 })
      .where(eq(validationJobs.id, jobId))

    // ─── Primary path: multi-agent pipeline ──────────────────────────────────
    let agentReport: MultiAgentResult | null = await runMultiAgentValidation(idea, {
      ...opts,
      onProgress: async (completed: number, _total: number, _label?: string) => {
        await db
          .update(validationJobs)
          .set({ completedSections: completed })
          .where(eq(validationJobs.id, jobId))
          .catch(() => {})
      },
    })

    // Critical fallback: if the whole agent pipeline failed, use the monolith.
    if (!agentReport) {
      console.warn('[ENGINE] Multi-agent pipeline returned null — falling back to monolithic generation')
      agentReport = await runMonolithicFull(idea, jobId, opts)
      if (!agentReport) {
        await db
          .update(validationJobs)
          .set({
            status: 'failed',
            errorMessage: 'All validation paths failed',
            aiProvider: provider,
          })
          .where(eq(validationJobs.id, jobId))
        return null
      }
    }

    totalTokens = agentReport.tokensUsed
    provider = agentReport.provider

    const anyFailed = Object.values(agentReport.agentTrail.agents).some((s) => s === 'failed')
    const finalStatus = anyFailed ? 'partial' : 'complete'

    await db
      .update(validationJobs)
      .set({
        status: finalStatus,
        completedSections: 6,
        tokensUsed: totalTokens,
        aiProvider: provider,
      })
      .where(eq(validationJobs.id, jobId))

    return {
      ...agentReport.report,
      overallScore: agentReport.report.overallScore,
      provider: agentReport.provider,
      tokensUsed: agentReport.tokensUsed,
      computedUnitEconomics: agentReport.report.computedUnitEconomics,
      financialProjection: agentReport.report.financialProjection,
    }
  } catch (err) {
    await db
      .update(validationJobs)
      .set({
        status: 'failed',
        errorMessage: err instanceof Error ? err.message : 'Unknown error',
        aiProvider: provider,
      })
      .where(eq(validationJobs.id, jobId))
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
  const searchCtx = degraded
    ? `\nNo live search results. Mark ALL market data as AI_ESTIMATE_UNVERIFIED with strength:WEAK. Leave link/source empty. Never invent URLs.`
    : `\nLive search results:\n${searchResults
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
12. Generate the new Phase 1 fields: oneLineConcept, founderAssumptions, problemValidation5Factor, customerJPG, interviewQuestions, competitorPositioning, landingPageCopy, wtpSurveyQuestions, pestleAnalysis, portersFiveForces`
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
      webSearch(`${idea.industry} market size ${idea.location} 2024 2025`, 5),
      webSearch(`${idea.name} competitors alternatives ${idea.industry} pricing`, 5),
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
    .where(eq(validationJobs.id, jobId))

  // Step 2: Generate full report
  let result
  try {
    result = await generateWithFallback({
      prompt: buildFullPrompt(idea, allResults, degraded),
      schema: FullReportSchema,
      temperature: 0,
      customOpenRouterKey: opts?.customOpenRouterKey,
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
  let computedUnitEconomics: Record<string, number | string> = { label: 'ASSUMPTION' }
  let financialProjection: Array<{ month: number; customers: number; revenue: number; costs: number; profitLoss: number; label: string }> = []

  try {
    const ua = d.unitEconomicsAssumptions
    const contributionMargin = fin.calculateContributionMargin(
      ua.estimatedSellingPrice,
      ua.estimatedVariableCost
    )
    const breakEvenCustomers = fin.calculateBreakEvenUnits(
      ua.estimatedFixedCostMonthly,
      ua.estimatedSellingPrice,
      ua.estimatedVariableCost
    )
    const breakEvenRevenue = fin.calculateBreakEvenRevenue(
      breakEvenCustomers,
      ua.estimatedSellingPrice
    )
    const cac = ua.estimatedCACMonthly
    const avgLifetimeMonths = ua.estimatedChurnRate > 0 ? 1 / ua.estimatedChurnRate : 24
    const ltv = fin.calculateLTV(contributionMargin, avgLifetimeMonths)
    const ltvCacRatio = fin.calculateLTVCACRatio(ltv, cac)
    const cacPaybackMonths = fin.calculateCACPaybackPeriod(cac, contributionMargin)
    const grossMarginPercent = fin.calculateGrossMarginPercent(
      ua.estimatedSellingPrice,
      ua.estimatedVariableCost
    )
    const contributionMarginPercent = fin.calculateContributionMarginPercent(
      contributionMargin,
      ua.estimatedSellingPrice
    )

    computedUnitEconomics = {
      contributionMargin,
      contributionMarginPercent,
      breakEvenCustomers: Math.ceil(breakEvenCustomers),
      breakEvenRevenue: Math.round(breakEvenRevenue),
      cac,
      ltv,
      ltvCacRatio,
      cacPaybackMonths,
      grossMarginPercent,
      label: 'ASSUMPTION',
    }

    // Build 12-month projection (PROJECTION label, not real)
    financialProjection = Array.from({ length: 12 }, (_, i) => {
      const month = i + 1
      const customers = Math.round(
        ua.estimatedMonthlyCustomers * Math.pow(1.1, i) // 10% MoM growth assumption
      )
      const revenue = customers * ua.estimatedSellingPrice
      const variableCosts = customers * ua.estimatedVariableCost
      const totalCosts = ua.estimatedFixedCostMonthly + variableCosts + cac * customers * 0.1
      return {
        month,
        customers,
        revenue: Math.round(revenue),
        costs: Math.round(totalCosts),
        profitLoss: Math.round(revenue - totalCosts),
        label: 'PROJECTION' as const,
      }
    })
  } catch (err) {
    console.error('[ENGINE] Financial computation failed, using safe defaults:', err)
    partialFailures.push('financial_computation')
  }

  const agentTrail = {
    agents: { monolithic: (partialFailures.length > 0 ? 'partial' : 'ok') as 'partial' | 'ok' },
    totalTokens,
    providers: [provider],
  }

  return {
    report: {
      ...d,
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
