import { webSearch, deduplicateSources, type SearchResponse, type SearchResult } from '@/lib/ai/search'
import type { AgentToolEvent } from '@/lib/ai/agent-tools'
import { runMarketAgent } from './market'
import { runCustomerAgent } from './customer'
import { runCompetitorAgent } from './competitor'
import { runFinanceAgent } from './finance'
import { runRiskAgent } from './risk'
import { runSynthesisAgent } from './synthesis'
import { runProductAgent, runGrowthAgent, runEvidenceAgent } from './planning'
import { auditEvidence, auditMarketSizing, auditFounderAssumptions, auditSourceReview, reconcileDecision, DESK_RESEARCH_NOTE, type DecisionAudit } from './quality-auditor'
import { FullReportSchema, type IdeaInput, type FullReport, type EvidenceReview } from '../schemas'
import { buildAgentHandoff, serializeHandoffs, buildScoreSummary, auditHandoffCoverage, type HandoffAudit, type ScoreSummary } from './handoffs'
import { FULL_AGENT_COUNT, FULL_AGENT_ROLES, type AgentRole } from '@/lib/ai/roles'
import { effectiveAiPreference, freeModelsOnly } from '@/lib/ai/model-policy'
import { runSpecialistPhase, specialistConcurrency } from './specialist-scheduler'
import { derivedStepId, researchContextStepId, type DerivedRole } from './derived-step'
import { compactPrivateContext } from '@/lib/ai/private-context'
import { type AgentOpts } from './shared'
import { STARTUP_WEIGHTS, clampScore } from '@/lib/scoring'
import { buildFinancialReview, type FinancialReview } from './finance-review'
import { runInlineStep, type RunValidationStep } from '../steps'
import { retrieveMarketMemory } from '@/lib/ai/market-memory'
import { compactEvidence, retainReportSources } from '@/lib/ai/evidence-context'
import { publicResearchQuery } from '@/lib/ai/research-brief'
import { randomUUID } from 'node:crypto'
import { isRetryableGenerationFailure } from '@/lib/ai/generation-failure'
import { validationManifest, validationModelPolicy, VALIDATION_METHOD_VERSION } from '../provenance'

// Specialist failures degrade the report rather than crashing the pipeline.
// Compute financial projections in code before synthesis and preserve them in the report.

export type AgentProgress = (completed: number, total: number, label?: string) => void | Promise<void>

export type OrchestratorOpts = {
  privateContext?: string
  customOpenRouterKey?: string | null
  preferredAiProvider?: string | null
  maxTokensPerCall?: number
  onProgress?: AgentProgress
  runStep?: RunValidationStep
  researchBudgetId?: string
  retryTransientFailures?: boolean
  asOfDate?: string
}

type AgentName = AgentRole
const TOTAL_AGENTS = FULL_AGENT_COUNT

export type AgentTrail = {
  agents: Partial<Record<AgentName | 'monolithic', 'ok' | 'failed' | 'partial'>>
  totalTokens: number
  providers: string[]
  tools?: AgentToolEvent[]
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
    computedUnitEconomics: Record<string, number | string | null>
    financialProjection: FinancialProjectionRow[]
    financialReview?: FinancialReview
    handoffAudit?: HandoffAudit
    scoreSummary?: ScoreSummary
    agentTrail: AgentTrail
    researchSources?: SearchResult[]
    evidenceReview?: EvidenceReview
    decisionAudit?: DecisionAudit
    scoreCoverage?: { evaluatedMaximum: number; evaluatedScore: number; missingCategories: string[]; note: string }
    runManifest?: ReturnType<typeof validationManifest>
  }
  provider: string
  tokensUsed: number
  agentTrail: AgentTrail
}

// Successful agent results share this envelope shape.
type AgentEnvelope = { provider: string; tokensUsed: number; toolCalls?: AgentToolEvent[]; sources?: SearchResult[] }

export async function runMultiAgentValidation(
  idea: IdeaInput,
  opts?: OrchestratorOpts
): Promise<MultiAgentResult | null> {
  const stepIds: string[] = []
  const executeStep: RunValidationStep = (id, work) => { stepIds.push(id); return (opts?.runStep ?? runInlineStep)(id, work) }
  const asOfDate = await executeStep(researchContextStepId('full-run-date', idea), async () => opts?.asOfDate ?? new Date().toISOString().slice(0, 10))
  const freeOnly = freeModelsOnly() || effectiveAiPreference(opts?.preferredAiProvider) !== 'paid_models'
  const concurrency = specialistConcurrency(process.env.AI_SPECIALIST_CONCURRENCY, freeOnly)
  let completed = 0
  const agentTrail: AgentTrail = { agents: {}, totalTokens: 0, providers: [], tools: [] }
  const collectedSources: SearchResult[] = []
  const roleSources = new Map<AgentName, SearchResult[]>()
  const researchBudgetId = opts?.researchBudgetId ?? randomUUID()
  const progress = async (label: AgentName) => {
    completed += 1
    await opts?.onProgress?.(completed, TOTAL_AGENTS, label)
  }

  let lastProvider = 'unknown'
  let totalTokens = 0

  const recordResult = (name: AgentName, r: AgentEnvelope | null) => {
    if (r) {
      agentTrail.agents[name] = 'ok'
      agentTrail.totalTokens += r.tokensUsed
      agentTrail.providers.push(r.provider)
      agentTrail.tools!.push(...(r.toolCalls ?? []))
      collectedSources.push(...(r.sources ?? []))
      roleSources.set(name, r.sources ?? [])
      lastProvider = r.provider
      totalTokens += r.tokensUsed
    } else {
      agentTrail.agents[name] = 'failed'
    }
  }

  // ─── Phase 1: searches ─────────────────────────────────────────────────────
  const safeSearch = async (query: string, limit: number): Promise<SearchResponse> => {
    try { return await webSearch(query, limit, { budgetId: researchBudgetId }) }
    catch { return { results: [], degraded: true, evidenceStrength: 'WEAK', providers: [] } }
  }
  const [marketSearch, competitorSearch, problemSearch, rememberedSources = []] = await executeStep(researchContextStepId('research-sources', idea), async () => {
    const searches = await Promise.all([
      safeSearch(publicResearchQuery(idea, 'market size'), 5),
      safeSearch(publicResearchQuery(idea, 'competitors alternatives pricing'), 5),
      safeSearch(publicResearchQuery(idea, 'customer problems reviews complaints'), 5),
    ])
    return [...searches, retrieveMarketMemory(`${idea.industry} ${idea.targetCustomer} ${idea.location}`)] as [SearchResponse, SearchResponse, SearchResponse, SearchResult[]]
  })

  collectedSources.push(...rememberedSources, ...marketSearch.results, ...competitorSearch.results, ...problemSearch.results)

  const initialSourcesSnapshot = structuredClone(collectedSources)
  for (const source of initialSourcesSnapshot) Object.freeze(source)
  Object.freeze(initialSourcesSnapshot)
  const agentOpts = {
    privateContext: opts?.privateContext,
    customOpenRouterKey: opts?.customOpenRouterKey,
    preferredAiProvider: opts?.preferredAiProvider,
    maxTokensPerCall: opts?.maxTokensPerCall,
    sources: initialSourcesSnapshot,
    researchBudgetId,
    asOfDate,
  }

  // Catch model failures inside a step. Queue scheduling and retry signals
  // must propagate to the runner instead of being treated as model failures.
  const runAgent = async <T extends AgentEnvelope>(name: AgentName, generate: () => Promise<T>, stepId = researchContextStepId('agent-' + name, idea, {
    sources: initialSourcesSnapshot, privateContext: opts?.privateContext, maxTokensPerCall: opts?.maxTokensPerCall,
    modelPolicy: validationModelPolicy(opts?.preferredAiProvider), asOfDate,
  })) => {
    const result = await executeStep(stepId, async () => {
      try { return await generate() }
      catch (error) {
        if ((opts?.retryTransientFailures ?? Boolean(opts?.runStep)) && isRetryableGenerationFailure(error)) throw error
        console.warn('[AGENT:' + name + '] unavailable'); return null
      }
    })
    recordResult(name, result)
    await progress(name)
    return result
  }

  // ─── Phase 2: parallel research agents ─────────────────────────────────────
  const [marketDraft, customerRes, competitorRes] = await runSpecialistPhase(concurrency, [
    () => runAgent('market', () => runMarketAgent(idea, marketSearch, agentOpts)),
    () => runAgent('customer', () => runCustomerAgent(idea, agentOpts)),
    () => runAgent('competitor', () => runCompetitorAgent(idea, competitorSearch, agentOpts)),
  ] as const)
  const marketRes = marketDraft ? { ...marketDraft, data: { ...marketDraft.data,
    tamSamSom: auditMarketSizing(marketDraft.data.tamSamSom, collectedSources),
  } } : null

  const canonicalSources = () => deduplicateSources([...rememberedSources, ...marketSearch.results, ...competitorSearch.results, ...problemSearch.results,
    ...FULL_AGENT_ROLES.flatMap(role => roleSources.get(role) ?? [])])
  const prepareDerived = <T extends AgentEnvelope>(role:DerivedRole,digest:string,sources:SearchResult[],reuseResearch:boolean,
    generate:(idea:IdeaInput,digest:string,options:AgentOpts)=>Promise<T>,reviewCompletedPlans=false,
    synthesisContext?: Pick<AgentOpts, 'synthesisHandoffAudit' | 'scoreSummary' | 'financeAssumptions' | 'planningBasis'>)=>{
    // Bind before queueing. Later sibling tool discoveries or caller mutations
    // cannot alter a worker's fingerprint or the inputs that it actually sees.
    const ideaSnapshot=structuredClone(idea)
    Object.freeze(ideaSnapshot)
    const sourcesSnapshot=structuredClone(sources)
    for(const source of sourcesSnapshot)Object.freeze(source)
    Object.freeze(sourcesSnapshot)
    const contextSnapshot = structuredClone(synthesisContext ?? {})
    const freeze = (value: unknown): void => {
      if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value) }
    }
    freeze(contextSnapshot)
    const options:AgentOpts={...agentOpts,...contextSnapshot,sources:sourcesSnapshot,privateContext:compactPrivateContext(agentOpts.privateContext),reuseResearch,reviewCompletedPlans}
    Object.freeze(options)
    const stepId=derivedStepId(role,ideaSnapshot,digest,options,VALIDATION_METHOD_VERSION)
    return () => runAgent(role,()=>generate(ideaSnapshot,digest,options),stepId)
  }

  // ─── Phase 3: modeling agents from research digest ─────────────────────────
  const researchDigest = buildResearchDigest(marketRes, customerRes, competitorRes, problemSearch)
  const researchSourcesSnapshot = canonicalSources()
  const financeRes = await prepareDerived('finance', researchDigest,researchSourcesSnapshot,true,runFinanceAgent)()

  // The judge needs actual arithmetic, including cohort attrition and modeled
  // losses, before assessing viability. It must not infer these from a ratio.
  let financial = buildFinancialReview()
  try { financial = buildFinancialReview(financeRes?.data.unitEconomicsAssumptions) }
  catch {
    financial = { ...buildFinancialReview(), review: { status: 'unavailable', limitation: 'The supplied financial inputs could not be evaluated reliably. Review the original assumptions before relying on financial outcomes.' } }
    console.warn('[ORCHESTRATOR] Financial inputs could not be computed')
  }

  // Planning is a dependency chain, not independent peer invention. Product
  // receives the completed finance scenario; growth receives that product's
  // exact offer/cohort/horizon plus a deterministic price comparison.
  const researchHandoffs = [buildAgentHandoff('market', marketRes), buildAgentHandoff('customer', customerRes), buildAgentHandoff('competitor', competitorRes)]
  const financeHandoff = buildAgentHandoff('finance', financeRes)
  const productDigest = serializeHandoffs([...researchHandoffs, financeHandoff]) +
    '\nDETERMINISTIC FINANCIAL REVIEW (proposed scenario, not observed demand):\n' + JSON.stringify(financial.review)
  const productRes = await prepareDerived('product', productDigest, canonicalSources(), true, runProductAgent, false,
    { financeAssumptions: financeRes?.data.unitEconomicsAssumptions })()
  const planningBasis = productRes?.data.planningBasis
  if (financeRes && planningBasis) {
    try { financial = buildFinancialReview(financeRes.data.unitEconomicsAssumptions, planningBasis) }
    catch { console.warn('[ORCHESTRATOR] Proposed offer comparison could not be computed') }
  }
  const growthDigest = serializeHandoffs([...researchHandoffs, financeHandoff, buildAgentHandoff('product', productRes)]) +
    '\nEXACT SHARED PLANNING BASIS (copy unchanged):\n' + JSON.stringify(planningBasis ?? null) +
    '\nDETERMINISTIC FINANCIAL REVIEW AND OFFER COMPARISON:\n' + JSON.stringify(financial.review)
  const growthRes = await prepareDerived('growth', growthDigest, canonicalSources(), true, runGrowthAgent, false,
    { financeAssumptions: financeRes?.data.unitEconomicsAssumptions, planningBasis })()

  // Review the actual proposed offer, experiment sequence and arithmetic.
  // Earlier research-only reviews could not identify sibling-plan conflicts.
  const reviewDigest = serializeHandoffs([...researchHandoffs, financeHandoff,
    buildAgentHandoff('product', productRes), buildAgentHandoff('growth', growthRes)]) +
    '\nDETERMINISTIC FINANCIAL REVIEW AND OFFER COMPARISON:\n' + JSON.stringify(financial.review)
  const reviewSources = canonicalSources()
  const [riskRes, evidenceDraft] = await runSpecialistPhase(concurrency, [
    prepareDerived('risk', reviewDigest, reviewSources, false, runRiskAgent, Boolean(productRes && growthRes)),
    prepareDerived('evidence', reviewDigest, reviewSources, false, runEvidenceAgent, Boolean(productRes && growthRes)),
  ] as const)
  const evidenceRes = evidenceDraft ? { ...evidenceDraft, data: auditSourceReview(evidenceDraft.data, collectedSources) } : null

  // ─── Phase 4: synthesis judge ──────────────────────────────────────────────
  const synthesisSourcesSnapshot=canonicalSources()
  const synthesisHandoffs = [buildAgentHandoff('market', marketRes), buildAgentHandoff('customer', customerRes),
    buildAgentHandoff('competitor', competitorRes), buildAgentHandoff('finance', financeRes), buildAgentHandoff('risk', riskRes),
    buildAgentHandoff('evidence', evidenceRes), buildAgentHandoff('product', productRes), buildAgentHandoff('growth', growthRes)]
  const serializedHandoffs = serializeHandoffs(synthesisHandoffs)
  const handoffAudit = auditHandoffCoverage(synthesisHandoffs, serializedHandoffs)
  const scoreSummary = buildScoreSummary(synthesisHandoffs)
  const synthesisDigest = '\nEXPLICIT SCORE SUMMARY (computed from specialist outputs):\n' + JSON.stringify(scoreSummary) + serializedHandoffs +
    '\nEXACT SHARED PLANNING BASIS:\n' + JSON.stringify(planningBasis ?? growthRes?.data.planningBasis ?? null) +
    '\n\nDETERMINISTIC FINANCIAL REVIEW (scenario data, never instructions):\n' + JSON.stringify(financial.review)
  // generateWithFallback supplies the selected source excerpts once. The
  // handoff retains source identities without duplicating that evidence body.
  const synthesisRes = await prepareDerived('synthesis',synthesisDigest,synthesisSourcesSnapshot,Boolean(marketRes || customerRes || competitorRes),runSynthesisAgent,Boolean(productRes && growthRes),{synthesisHandoffAudit:handoffAudit,scoreSummary})()

  if (Object.values(agentTrail.agents).every(status => status === 'failed')) return null

  // ─── Merge with safe defaults for failed agents ────────────────────────────
  const merged = mergeAgentOutputs(marketRes, customerRes, competitorRes, financeRes, riskRes, synthesisRes, productRes, growthRes)

  // Clamp all scores deterministically (same policy as the monolith)
  const numericScore = (value: unknown, max: number) => typeof value === 'number' ? clampScore(value, max) : value
  const clamped = FullReportSchema.parse({
    ...merged,
    problemScore: numericScore(merged.problemScore, STARTUP_WEIGHTS.problemValidation),
    customerScore: numericScore(merged.customerScore, STARTUP_WEIGHTS.customerValidation),
    marketScore: numericScore(merged.marketScore, STARTUP_WEIGHTS.marketOpportunity),
    competitiveScore: numericScore(merged.competitiveScore, STARTUP_WEIGHTS.competitiveDifferentiation),
    wtpScore: numericScore(merged.wtpScore, STARTUP_WEIGHTS.willingnessToPay),
    businessModelScore: numericScore(merged.businessModelScore, STARTUP_WEIGHTS.businessModel),
    financialScore: numericScore(merged.financialScore, STARTUP_WEIGHTS.financialFeasibility),
    executionScore: numericScore(merged.executionScore, STARTUP_WEIGHTS.executionFeasibility),
  })

  const overallScore =
    clamped.problemScore + clamped.customerScore + clamped.wtpScore + clamped.marketScore +
    clamped.competitiveScore + clamped.financialScore + clamped.businessModelScore + clamped.executionScore

  const evidenceReview = evidenceRes?.data ?? { summary: 'Source review could not finish.', checks: [], gaps: ['Review the original sources before relying on important claims.'] }
  // Search result ordering is untouched. Persist final sources in canonical
  // phase/role order rather than the nondeterministic provider completion order.
  const finalSources = canonicalSources()
  const citationAudit = auditEvidence(clamped.keyEvidence, finalSources)
  const reviewed = reconcileDecision(clamped, overallScore, { agents: agentTrail.agents, evidence: citationAudit.keyEvidence, review: evidenceReview, sources: finalSources })
  const scoreOwners: [AgentName, string, number][] = [['customer', 'Problem, customer and willingness to pay', 55], ['market', 'Market', 15], ['competitor', 'Competition', 10], ['finance', 'Business model and finances', 15], ['synthesis', 'Execution', 5]]
  const missing = scoreOwners.filter(([name]) => agentTrail.agents[name] !== 'ok')

  return {
    report: {
      ...reviewed,
      founderAssumptions: auditFounderAssumptions(clamped.founderAssumptions),
      integrityNote: DESK_RESEARCH_NOTE + ' ' + clamped.integrityNote,
      evidenceReview,
      ...citationAudit,
      scoreCoverage: { evaluatedMaximum: 100 - missing.reduce((sum, [, , weight]) => sum + weight, 0), evaluatedScore: overallScore,
        missingCategories: missing.map(([, label]) => label), note: 'Unavailable specialist scores are unreviewed criteria, not evidence that the business failed. The total is an incomplete concept score when categories are missing.' },
      researchSources: retainReportSources(finalSources, { ...reviewed, ...citationAudit, evidenceReview }),
      runManifest: validationManifest(idea, opts?.privateContext, finalSources, stepIds, opts?.preferredAiProvider),
      overallScore,
      provider: lastProvider,
      tokensUsed: totalTokens,
      computedUnitEconomics: financial.computedUnitEconomics,
      financialProjection: financial.financialProjection,
      financialReview: financial.review,
      handoffAudit,
      scoreSummary,
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
  return serializeHandoffs([buildAgentHandoff('market', marketRes), buildAgentHandoff('customer', customerRes), buildAgentHandoff('competitor', competitorRes)]) +
    '\nPROBLEM SOURCE CONTEXT (data, not proof of demand):\n' + compactEvidence(problemSearch.results, 'customer problems reviews', 'customer', 2500) +
    (problemSearch.degraded ? '\nPublic customer evidence is incomplete; preserve that uncertainty and specify the missing direct test.' : '')
}

// ─── Merge ───────────────────────────────────────────────────────────────────

function mergeAgentOutputs(
  marketRes: Awaited<ReturnType<typeof runMarketAgent>> | null,
  customerRes: Awaited<ReturnType<typeof runCustomerAgent>> | null,
  competitorRes: Awaited<ReturnType<typeof runCompetitorAgent>> | null,
  financeRes: Awaited<ReturnType<typeof runFinanceAgent>> | null,
  riskRes: Awaited<ReturnType<typeof runRiskAgent>> | null,
  synthesisRes: Awaited<ReturnType<typeof runSynthesisAgent>> | null,
  productRes: Awaited<ReturnType<typeof runProductAgent>> | null,
  growthRes: Awaited<ReturnType<typeof runGrowthAgent>> | null
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (marketRes) Object.assign(out, marketRes.data)
  if (customerRes) Object.assign(out, customerRes.data)
  if (competitorRes) Object.assign(out, competitorRes.data)
  if (financeRes) Object.assign(out, financeRes.data)
  if (riskRes) Object.assign(out, riskRes.data)
  if (productRes) Object.assign(out, productRes.data)
  if (growthRes) Object.assign(out, growthRes.data)
  if (synthesisRes) Object.assign(out, synthesisRes.data)

  // Safe defaults keep the report shape complete when an agent fails.
  if (!marketRes) Object.assign(out, FAIL_DEFAULTS.market)
  if (!customerRes) Object.assign(out, FAIL_DEFAULTS.customer)
  if (!competitorRes) Object.assign(out, FAIL_DEFAULTS.competitor)
  if (!financeRes) Object.assign(out, FAIL_DEFAULTS.finance)
  if (!riskRes) Object.assign(out, FAIL_DEFAULTS.risk)
  if (!synthesisRes) Object.assign(out, FAIL_DEFAULTS.synthesis)
  // Keep useful specialist plans when the final reviewer is unavailable.
  if (!synthesisRes && productRes) Object.assign(out, productRes.data)
  if (!synthesisRes && growthRes) Object.assign(out, growthRes.data, { nextStepRecommendation: 'MORE_VALIDATION', nextStepRationale: 'Complete the final review before committing to the proposed plan.' })

  return out
}

// ─── Safe defaults for failed agents ─────────────────────────────────────────

const FAIL_DEFAULTS: Record<Exclude<AgentName, 'product' | 'growth' | 'evidence'>, Record<string, unknown>> = {
  market: {
    marketScore: 0,
    tamSamSom: {
      tam: { value: 'Not established', method: 'Market specialist unavailable; eligible buyer and annual-spend inputs need review.', source: '', label: 'PROJECTION' },
      sam: { value: 'Not established', method: 'Market specialist unavailable; serviceable segment needs review.', label: 'PROJECTION' },
      som: { value: 'Not established', method: 'Market specialist unavailable; reachable capacity needs review.', label: 'PROJECTION' },
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
