import { webSearch, type SearchResponse } from '@/lib/ai/search'
import { runMarketAgent } from './market'
import { runCustomerAgent } from './customer'
import { runCompetitorAgent } from './competitor'
import { runFinanceAgent } from './finance'
import { runRiskAgent } from './risk'
import { runSynthesisAgent } from './synthesis'
import type { IdeaInput, FullReport } from '../schemas'
import { STARTUP_WEIGHTS, clampScore } from '@/lib/scoring'
import * as fin from '@/lib/financial'

// ─────────────────────────────────────────────────────────────────────────────
// Multi-agent orchestrator for full validation reports.
//
// Phases:
//   1. Search:     3 parallel web searches (market, competitors, problem)
//   2. Research:   3 parallel LLM agents (market, customer, competitor)
//   3. Modeling:   2 parallel LLM agents (finance, risk) from a research digest
//   4. Synthesis:  1 judge agent sees everything, issues the verdict
//   5. Math:       unit economics + 12-month projection computed in code
//
// Failure policy: each agent is independent; a failed agent degrades the report
// rather than failing the whole job (mirrors the monolith's partial-failure
// design). Failed sections fall back to safe defaults so the report shape stays
// complete — the UI and exports must never crash on a missing section.
// ─────────────────────────────────────────────────────────────────────────────

export type AgentProgress = (completed: number, total: number, label?: string) => void

export type OrchestratorOpts = {
  customOpenRouterKey?: string | null
  preferredAiProvider?: string | null
  onProgress?: AgentProgress
}

type AgentName = 'market' | 'customer' | 'competitor' | 'finance' | 'risk' | 'synthesis'
const TOTAL_AGENTS = 6

export type AgentTrail = {
  agents: Partial<Record<AgentName | 'monolithic', 'ok' | 'failed' | 'partial'>>
  totalTokens: number
  providers: string[]
}

export type FinancialProjectionRow = {
  month: number
  customers: number
  revenue: number
  costs: number
  profitLoss: number
  label: string
}

export type MultiAgentResult = {
  report: FullReport & {
    overallScore: number
    provider: string
    tokensUsed: number
    computedUnitEconomics: Record<string, number | string>
    financialProjection: FinancialProjectionRow[]
    agentTrail: AgentTrail
  }
  provider: string
  tokensUsed: number
  agentTrail: AgentTrail
}

// Successful agent results share this envelope shape.
type AgentEnvelope = { provider: string; tokensUsed: number }

export async function runMultiAgentValidation(
  idea: IdeaInput,
  opts?: OrchestratorOpts
): Promise<MultiAgentResult | null> {
  let completed = 0
  const agentTrail: AgentTrail = { agents: {}, totalTokens: 0, providers: [] }
  const progress = (label: AgentName) => {
    completed += 1
    opts?.onProgress?.(completed, TOTAL_AGENTS, label)
  }

  let lastProvider = 'unknown'
  let totalTokens = 0

  const recordResult = (name: AgentName, r: AgentEnvelope | null) => {
    if (r) {
      agentTrail.agents[name] = 'ok'
      agentTrail.totalTokens += r.tokensUsed
      agentTrail.providers.push(r.provider)
      lastProvider = r.provider
      totalTokens += r.tokensUsed
    } else {
      agentTrail.agents[name] = 'failed'
    }
  }

  // ─── Phase 1: searches ─────────────────────────────────────────────────────
  const [marketSearch, competitorSearch, problemSearch] = await Promise.all([
    webSearch(`${idea.industry} market size ${idea.location} 2024 2025`, 5),
    webSearch(`${idea.name} competitors alternatives ${idea.industry} pricing`, 5),
    webSearch(`${idea.coreProblem.slice(0, 120)} statistics ${idea.location}`, 3),
  ])

  const agentOpts = {
    customOpenRouterKey: opts?.customOpenRouterKey,
    preferredAiProvider: opts?.preferredAiProvider,
  }

  // ─── Phase 2: parallel research agents ─────────────────────────────────────
  const [marketRes, customerRes, competitorRes] = await Promise.all([
    runMarketAgent(idea, marketSearch, agentOpts).then(
      (r) => { recordResult('market', r); progress('market'); return r },
      (err) => { console.error('[AGENT:market] failed:', err); recordResult('market', null); progress('market'); return null }
    ),
    runCustomerAgent(idea, agentOpts).then(
      (r) => { recordResult('customer', r); progress('customer'); return r },
      (err) => { console.error('[AGENT:customer] failed:', err); recordResult('customer', null); progress('customer'); return null }
    ),
    runCompetitorAgent(idea, competitorSearch, agentOpts).then(
      (r) => { recordResult('competitor', r); progress('competitor'); return r },
      (err) => { console.error('[AGENT:competitor] failed:', err); recordResult('competitor', null); progress('competitor'); return null }
    ),
  ])

  // ─── Phase 3: modeling agents from research digest ─────────────────────────
  const researchDigest = buildResearchDigest(marketRes, customerRes, competitorRes, problemSearch)
  const [financeRes, riskRes] = await Promise.all([
    runFinanceAgent(idea, researchDigest, agentOpts).then(
      (r) => { recordResult('finance', r); progress('finance'); return r },
      (err) => { console.error('[AGENT:finance] failed:', err); recordResult('finance', null); progress('finance'); return null }
    ),
    runRiskAgent(idea, researchDigest, agentOpts).then(
      (r) => { recordResult('risk', r); progress('risk'); return r },
      (err) => { console.error('[AGENT:risk] failed:', err); recordResult('risk', null); progress('risk'); return null }
    ),
  ])

  // ─── Phase 4: synthesis judge ──────────────────────────────────────────────
  const synthesisDigest = buildSynthesisDigest(marketRes, customerRes, competitorRes, financeRes, riskRes)
  const synthesisRes = await runSynthesisAgent(idea, synthesisDigest, agentOpts).catch((err) => {
    console.error('[AGENT:synthesis] failed:', err)
    return null
  })
  recordResult('synthesis', synthesisRes)
  progress('synthesis')

  // ─── Merge with safe defaults for failed agents ────────────────────────────
  const merged = mergeAgentOutputs(marketRes, customerRes, competitorRes, financeRes, riskRes, synthesisRes)

  // Clamp all scores deterministically (same policy as the monolith)
  const clamped: FullReport = {
    ...merged,
    problemScore: clampScore(merged.problemScore, STARTUP_WEIGHTS.problemValidation),
    customerScore: clampScore(merged.customerScore, STARTUP_WEIGHTS.customerValidation),
    marketScore: clampScore(merged.marketScore, STARTUP_WEIGHTS.marketOpportunity),
    competitiveScore: clampScore(merged.competitiveScore, STARTUP_WEIGHTS.competitiveDifferentiation),
    wtpScore: clampScore(merged.wtpScore, STARTUP_WEIGHTS.willingnessToPay),
    businessModelScore: clampScore(merged.businessModelScore, STARTUP_WEIGHTS.businessModel),
    financialScore: clampScore(merged.financialScore, STARTUP_WEIGHTS.financialFeasibility),
    executionScore: clampScore(merged.executionScore, STARTUP_WEIGHTS.executionFeasibility),
  }

  const overallScore =
    clamped.problemScore + clamped.customerScore + clamped.wtpScore + clamped.marketScore +
    clamped.competitiveScore + clamped.financialScore + clamped.businessModelScore + clamped.executionScore

  // ─── Phase 5: deterministic math from finance agent assumptions ────────────
  const computedUnitEconomics: Record<string, number | string> = { label: 'ASSUMPTION' }
  let financialProjection: FinancialProjectionRow[] = []

  const ua = financeRes?.data.unitEconomicsAssumptions
  if (ua) {
    try {
      const contributionMargin = fin.calculateContributionMargin(ua.estimatedSellingPrice, ua.estimatedVariableCost)
      const breakEvenCustomers = fin.calculateBreakEvenUnits(ua.estimatedFixedCostMonthly, ua.estimatedSellingPrice, ua.estimatedVariableCost)
      const breakEvenRevenue = fin.calculateBreakEvenRevenue(breakEvenCustomers, ua.estimatedSellingPrice)
      const cac = ua.estimatedCACMonthly
      const avgLifetimeMonths = ua.estimatedChurnRate > 0 ? 1 / ua.estimatedChurnRate : 24
      const ltv = fin.calculateLTV(contributionMargin, avgLifetimeMonths)
      const ltvCacRatio = fin.calculateLTVCACRatio(ltv, cac)
      const cacPaybackMonths = fin.calculateCACPaybackPeriod(cac, contributionMargin)
      const grossMarginPercent = fin.calculateGrossMarginPercent(ua.estimatedSellingPrice, ua.estimatedVariableCost)
      const contributionMarginPercent = fin.calculateContributionMarginPercent(contributionMargin, ua.estimatedSellingPrice)

      computedUnitEconomics.contributionMargin = contributionMargin
      computedUnitEconomics.contributionMarginPercent = contributionMarginPercent
      computedUnitEconomics.breakEvenCustomers = Math.ceil(breakEvenCustomers)
      computedUnitEconomics.breakEvenRevenue = Math.round(breakEvenRevenue)
      computedUnitEconomics.cac = cac
      computedUnitEconomics.ltv = ltv
      computedUnitEconomics.ltvCacRatio = ltvCacRatio
      computedUnitEconomics.cacPaybackMonths = cacPaybackMonths
      computedUnitEconomics.grossMarginPercent = grossMarginPercent

      // 12-month projection (PROJECTION label — same model as the monolith)
      financialProjection = Array.from({ length: 12 }, (_, i) => {
        const month = i + 1
        const customers = Math.round(ua.estimatedMonthlyCustomers * Math.pow(1.1, i)) // 10% MoM growth assumption
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
      console.error('[ORCHESTRATOR] Financial computation failed:', err)
    }
  }

  return {
    report: {
      ...clamped,
      overallScore,
      provider: lastProvider,
      tokensUsed: totalTokens,
      computedUnitEconomics,
      financialProjection,
      agentTrail,
    },
    provider: lastProvider,
    tokensUsed: totalTokens,
    agentTrail,
  }
}

// ─── Digest builders ─────────────────────────────────────────────────────────
// Condensed, section-accurate summaries handed to later agents.

function buildResearchDigest(
  marketRes: Awaited<ReturnType<typeof runMarketAgent>> | null,
  customerRes: Awaited<ReturnType<typeof runCustomerAgent>> | null,
  competitorRes: Awaited<ReturnType<typeof runCompetitorAgent>> | null,
  problemSearch: SearchResponse
): string {
  const parts: string[] = []
  if (marketRes) {
    const m = marketRes.data
    parts.push(
      `MARKET AGENT FINDINGS:\n- Market score: ${m.marketScore}/${STARTUP_WEIGHTS.marketOpportunity}\n- TAM: ${m.tamSamSom.tam.value} (${m.tamSamSom.tam.method})\n- SAM: ${m.tamSamSom.sam.value}\n- SOM: ${m.tamSamSom.som.value}\n- PESTLE: ${pestleSummarize(m.pestleAnalysis)}`
    )
  }
  if (customerRes) {
    const c = customerRes.data
    parts.push(
      `CUSTOMER AGENT FINDINGS:\n- Problem ${c.problemScore}/20, Customer ${c.customerScore}/20, WTP ${c.wtpScore}/15\n- Primary persona: ${c.personas[0]?.name ?? 'unknown'} — ${c.personas[0]?.occupation ?? 'unknown'}\n- Problem frequency x severity: ${c.problemValidation5Factor.frequency.score} x ${c.problemValidation5Factor.severity.score}\n- Price sensitivity: ${c.personas[0]?.priceSensitivity ?? 'unknown'}`
    )
  }
  if (competitorRes) {
    const comp = competitorRes.data
    parts.push(
      `COMPETITOR AGENT FINDINGS:\n- Competitive score: ${comp.competitiveScore}/10\n- Competitors: ${comp.competitors.map((c) => c.name).join(', ')}\n- Porter rivalry: ${comp.portersFiveForces.competitiveRivalry.level}\n- Gaps: ${comp.competitors.slice(0, 3).map((c) => c.marketGap).join(' | ')}\n- Pricing evidence: ${comp.competitors.slice(0, 3).map((c) => `${c.name}: ${c.pricing}`).join(' | ')}`
    )
  }
  if (problemSearch.results.length > 0) {
    parts.push(
      `PROBLEM SEARCH EVIDENCE:\n${problemSearch.results.map((r) => `- ${r.title}: ${r.content.slice(0, 200)} [url: ${r.url}]`).join('\n')}`
    )
  }
  return parts.join('\n\n') || 'No research findings available.'
}

function buildSynthesisDigest(
  marketRes: Awaited<ReturnType<typeof runMarketAgent>> | null,
  customerRes: Awaited<ReturnType<typeof runCustomerAgent>> | null,
  competitorRes: Awaited<ReturnType<typeof runCompetitorAgent>> | null,
  financeRes: Awaited<ReturnType<typeof runFinanceAgent>> | null,
  riskRes: Awaited<ReturnType<typeof runRiskAgent>> | null
): string {
  const parts: string[] = []
  if (marketRes) {
    const m = marketRes.data
    parts.push(`MARKET: score ${m.marketScore}/${STARTUP_WEIGHTS.marketOpportunity}, TAM ${m.tamSamSom.tam.value}, SAM ${m.tamSamSom.sam.value}, SOM ${m.tamSamSom.som.value}`)
  }
  if (customerRes) {
    const c = customerRes.data
    parts.push(`CUSTOMER: problem ${c.problemScore}/20, customer ${c.customerScore}/20, WTP ${c.wtpScore}/15, price sensitivity ${c.personas[0]?.priceSensitivity ?? 'unknown'}`)
  }
  if (competitorRes) {
    const comp = competitorRes.data
    parts.push(`COMPETITOR: score ${comp.competitiveScore}/10, ${comp.competitors.length} competitors, rivalry ${comp.portersFiveForces.competitiveRivalry.level}`)
  }
  if (financeRes) {
    const f = financeRes.data
    parts.push(`FINANCE: score ${f.financialScore}/5, business model ${f.businessModelScore}/10, price $${f.unitEconomicsAssumptions.estimatedSellingPrice}, CAC $${f.unitEconomicsAssumptions.estimatedCACMonthly}, churn ${(f.unitEconomicsAssumptions.estimatedChurnRate * 100).toFixed(1)}%`)
  }
  if (riskRes) {
    parts.push(`RISK: ${riskRes.data.keyRisks.slice(0, 3).join('; ')}`)
  }
  return parts.join('\n') || 'No findings available.'
}

// ─── Merge ───────────────────────────────────────────────────────────────────

function mergeAgentOutputs(
  marketRes: Awaited<ReturnType<typeof runMarketAgent>> | null,
  customerRes: Awaited<ReturnType<typeof runCustomerAgent>> | null,
  competitorRes: Awaited<ReturnType<typeof runCompetitorAgent>> | null,
  financeRes: Awaited<ReturnType<typeof runFinanceAgent>> | null,
  riskRes: Awaited<ReturnType<typeof runRiskAgent>> | null,
  synthesisRes: Awaited<ReturnType<typeof runSynthesisAgent>> | null
): FullReport {
  const out: Record<string, unknown> = {}
  if (marketRes) Object.assign(out, marketRes.data)
  if (customerRes) Object.assign(out, customerRes.data)
  if (competitorRes) Object.assign(out, competitorRes.data)
  if (financeRes) Object.assign(out, financeRes.data)
  if (riskRes) Object.assign(out, riskRes.data)
  if (synthesisRes) Object.assign(out, synthesisRes.data)

  // Safe defaults keep the report shape complete when an agent fails.
  if (!marketRes) Object.assign(out, FAIL_DEFAULTS.market)
  if (!customerRes) Object.assign(out, FAIL_DEFAULTS.customer)
  if (!competitorRes) Object.assign(out, FAIL_DEFAULTS.competitor)
  if (!financeRes) Object.assign(out, FAIL_DEFAULTS.finance)
  if (!riskRes) Object.assign(out, FAIL_DEFAULTS.risk)
  if (!synthesisRes) Object.assign(out, FAIL_DEFAULTS.synthesis)

  return out as FullReport
}

function pestleSummarize(p: FullReport['pestleAnalysis']): string {
  return Object.entries(p)
    .map(([k, v]) => `${k}: ${(v as string[]).length} factors`)
    .join(', ')
}

// ─── Safe defaults for failed agents ─────────────────────────────────────────

const FAIL_DEFAULTS: Record<AgentName, Record<string, unknown>> = {
  market: {
    marketScore: 0,
    tamSamSom: {
      tam: { value: 'Unverified', method: 'Market agent failed', source: '', label: 'PROJECTION' },
      sam: { value: 'Unverified', method: 'Market agent failed', label: 'PROJECTION' },
      som: { value: 'Unverified', method: 'Market agent failed', label: 'PROJECTION' },
    },
    pestleAnalysis: { political: [], economic: [], social: [], technological: [], legal: [], environmental: [] },
  },
  customer: {
    problemScore: 0,
    customerScore: 0,
    wtpScore: 0,
    personas: [],
    problemValidation5Factor: {
      frequency: { score: 1, reasoning: 'Customer agent failed' },
      severity: { score: 1, reasoning: 'Customer agent failed' },
      urgency: { score: 1, reasoning: 'Customer agent failed' },
      dissatisfaction: { score: 1, reasoning: 'Customer agent failed' },
      willingnessToSeekSolution: { score: 1, reasoning: 'Customer agent failed' },
    },
    customerJPG: { jobs: [], pains: [], gains: [], painRelievers: [], gainCreators: [] },
    interviewQuestions: [],
    wtpSurveyQuestions: [],
  },
  competitor: {
    competitiveScore: 0,
    competitors: [],
    competitorPositioning: [],
    portersFiveForces: {
      competitiveRivalry: { level: 'MEDIUM', reasoning: 'Competitor agent failed' },
      threatOfNewEntrants: { level: 'MEDIUM', reasoning: 'Competitor agent failed' },
      supplierPower: { level: 'MEDIUM', reasoning: 'Competitor agent failed' },
      buyerPower: { level: 'MEDIUM', reasoning: 'Competitor agent failed' },
      threatOfSubstitutes: { level: 'MEDIUM', reasoning: 'Competitor agent failed' },
    },
  },
  finance: {
    financialScore: 0,
    businessModelScore: 0,
    unitEconomicsAssumptions: {
      estimatedSellingPrice: 0,
      estimatedVariableCost: 0,
      estimatedFixedCostMonthly: 0,
      estimatedCACMonthly: 0,
      estimatedMonthlyCustomers: 0,
      estimatedChurnRate: 0,
      assumptionLabel: 'ASSUMPTION',
    },
  },
  risk: {
    keyRisks: ['Risk agent unavailable — risk analysis incomplete'],
    swot: { strengths: [], weaknesses: ['Risk analysis unavailable'], opportunities: [], threats: ['Risk analysis unavailable'] },
    riskRegister: [],
  },
  synthesis: {
    executionScore: 0,
    decision: 'TEST_FURTHER',
    decisionReasons: ['Synthesis agent unavailable — decision defaults to cautious'],
    keyEvidence: [],
    actionPlan: [],
    uvpOptions: ['', '', ''],
    selectedUvp: '',
    moscowFeatures: { mustHave: [], shouldHave: [], couldHave: [], wontHave: [] },
    mvpDescription: 'Synthesis agent unavailable — MVP description unavailable.',
    integrityNote: 'Synthesis agent unavailable; report assembled from research agents only.',
    nextStepRecommendation: 'MORE_VALIDATION',
    nextStepRationale: 'Synthesis agent unavailable — recommend further validation by default.',
    oneLineConcept: '',
    founderAssumptions: [],
    landingPageCopy: {
      headline: '',
      subheadline: '',
      benefits: ['', '', ''],
      howItWorks: '',
      cta: '',
      pricingHypothesis: '',
      faq: [],
    },
  },
}
