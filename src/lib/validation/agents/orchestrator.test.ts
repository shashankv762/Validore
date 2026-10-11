import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runMultiAgentValidation } from './orchestrator'
import type { IdeaInput } from '../schemas'

// ─────────────────────────────────────────────────────────────────────────────
// Multi-agent orchestrator tests — zero live AI calls.
// All LLM agents and web search are mocked; only the deterministic glue
// (merging, clamping, math, progress, failure handling) is exercised.
// Agents are matched by their prompt's role sentence, since zod schemas
// are anonymous objects.
// ─────────────────────────────────────────────────────────────────────────────

vi.mock('@/lib/ai/generate', () => ({
  generateWithFallback: vi.fn(),
}))

vi.mock('@/lib/ai/search', () => ({
  webSearch: vi.fn(async () => ({
    results: [
      {
        title: 'Test market report',
        url: 'https://example.com/report',
        content: 'Market size $10B growing 12% CAGR',
        source: 'example.com',
        fetchedAt: '2026-10-08T00:00:00Z',
      },
    ],
    degraded: false,
    evidenceStrength: 'MODERATE' as const,
  })),
}))

import { generateWithFallback } from '@/lib/ai/generate'

const idea: IdeaInput = {
  name: 'TestStartup',
  industry: 'SaaS',
  product: 'AI note-taking for lawyers',
  targetCustomer: 'Law firms',
  location: 'United States',
  businessModel: 'B2B SaaS subscription',
  coreProblem: 'Lawyers lose billable hours to manual note-taking',
  proposedSolution: 'AI transcription with legal templates',
}

// Valid per-agent payloads matching each agent schema
const MARKET = {
  marketScore: 12,
  tamSamSom: {
    tam: { value: '$10B', method: 'top-down from industry reports', source: 'https://example.com/report', label: 'PROJECTION' as const },
    sam: { value: '$2B', method: 'segment share', label: 'PROJECTION' as const },
    som: { value: '$50M', method: 'realistic 3-year share', label: 'PROJECTION' as const },
  },
  pestleAnalysis: { political: ['p1'], economic: ['e1'], social: ['s1'], technological: ['t1'], legal: ['l1'], environmental: ['env1'] },
}

const CUSTOMER = {
  problemScore: 18,
  customerScore: 16,
  wtpScore: 11,
  personas: [
    {
      name: 'Managing Partner Mia',
      ageRange: '35-55',
      occupation: 'Law firm partner',
      incomeRange: '$150k+',
      location: 'US metro',
      goals: ['Bill more hours'],
      problems: ['Manual notes cost billable time'],
      frustrations: ['Existing tools miss legal terms'],
      buyingBehaviour: 'Committee purchase, annual contracts',
      preferredChannels: ['Bar associations', 'Legal conferences'],
      decisionFactors: ['Accuracy', 'Compliance'],
      priceSensitivity: 'low' as const,
      jobToBeDone: 'Capture client meetings without losing billable time',
    },
  ],
  problemValidation5Factor: {
    frequency: { score: 9, reasoning: 'Daily occurrence' },
    severity: { score: 8, reasoning: 'Direct revenue loss' },
    urgency: { score: 7, reasoning: 'Active pain' },
    dissatisfaction: { score: 6, reasoning: 'Current workarounds weak' },
    willingnessToSeekSolution: { score: 8, reasoning: 'Actively evaluating tools' },
  },
  customerJPG: { jobs: ['Document meetings'], pains: ['Time loss'], gains: ['Billable time recovered'], painRelievers: ['Auto-transcription'], gainCreators: ['Legal templates'] },
  interviewQuestions: Array.from({ length: 10 }, (_, i) => ({ question: `Q${i}`, category: 'behaviour', rationale: 'past behaviour' })),
  wtpSurveyQuestions: [{ question: 'What would you pay?', type: 'open' as const }],
}

const COMPETITOR = {
  competitiveScore: 7,
  competitors: [
    { name: 'CompA', targetCustomer: 'Law firms', product: 'Transcription', pricing: '$30/user/mo', pricingModel: 'subscription', strengths: ['s'], weaknesses: ['w'], marketGap: 'No legal templates', dateChecked: '2026-10-08' },
    { name: 'CompB', targetCustomer: 'Law firms', product: 'Notes', pricing: '$20/user/mo', pricingModel: 'subscription', strengths: ['s'], weaknesses: ['w'], marketGap: 'No AI', dateChecked: '2026-10-08' },
    { name: 'CompC', targetCustomer: 'General', product: 'Generic notes', pricing: 'freemium', pricingModel: 'freemium', strengths: ['s'], weaknesses: ['w'], marketGap: 'Not legal-specific', dateChecked: '2026-10-08' },
  ],
  competitorPositioning: [
    { name: 'CompA', x: 70, y: 60, isOurStartup: false },
    { name: 'CompB', x: 40, y: 30, isOurStartup: false },
    { name: 'TestStartup', x: 80, y: 80, isOurStartup: true },
  ],
  portersFiveForces: {
    competitiveRivalry: { level: 'MEDIUM' as const, reasoning: 'r' },
    threatOfNewEntrants: { level: 'MEDIUM' as const, reasoning: 'r' },
    supplierPower: { level: 'LOW' as const, reasoning: 'r' },
    buyerPower: { level: 'MEDIUM' as const, reasoning: 'r' },
    threatOfSubstitutes: { level: 'LOW' as const, reasoning: 'r' },
  },
}

const FINANCE = {
  financialScore: 4,
  businessModelScore: 8,
  unitEconomicsAssumptions: {
    estimatedSellingPrice: 50,
    estimatedVariableCost: 10,
    estimatedFixedCostMonthly: 5000,
    estimatedCACMonthly: 200,
    estimatedMonthlyCustomers: 50,
    estimatedChurnRate: 0.02,
    assumptionLabel: 'ASSUMPTION' as const,
  },
}

const RISK = {
  keyRisks: ['Compliance risk', 'Big-player entry'],
  swot: { strengths: ['s'], weaknesses: ['w'], opportunities: ['o'], threats: ['t'] },
  riskRegister: [
    { risk: 'Data privacy breach', probability: 'low' as const, impact: 'high' as const, riskLevel: 'medium' as const, mitigation: 'SOC2 from day one' },
  ],
}

const SYNTHESIS = {
  executionScore: 4,
  decision: 'GO' as const,
  decisionReasons: ['r1', 'r2', 'r3'],
  keyEvidence: [{ claim: 'Market is large', strength: 'MODERATE' as const, source: 'example.com', link: 'https://example.com/report', label: 'VERIFIED' as const }],
  actionPlan: [{ week: 'Week 1', action: 'Interview 5 lawyers', owner: 'Founder', kpi: '5 interviews' }],
  uvpOptions: ['UVP1', 'UVP2', 'UVP3'],
  selectedUvp: 'UVP1',
  moscowFeatures: { mustHave: ['transcription'], shouldHave: ['templates'], couldHave: ['integrations'], wontHave: ['mobile'] },
  mvpDescription: 'AI transcription MVP with legal templates.',
  integrityNote: 'Market data verified from search; financials are assumptions.',
  nextStepRecommendation: 'BUILD_MVP' as const,
  nextStepRationale: 'Strong signals, build now.',
  oneLineConcept: 'AI meeting notes for law firms.',
  founderAssumptions: [{ id: 1, assumption: 'Lawyers will pay', category: 'CUSTOMER' as const, preResearchBelief: 'Likely', postResearchFinding: 'Confirmed by interviews', validated: true, confidenceChange: 'INCREASED' as const }],
  landingPageCopy: { headline: 'h', subheadline: 'sh', benefits: ['b1', 'b2', 'b3'], howItWorks: 'hiw', cta: 'c', pricingHypothesis: 'ph', faq: [] },
}

type PromptPayload = { prompt: string }

// Route mocks to per-agent payloads based on the role sentence in the prompt.
function mockAgentsByPrompt(overrides: Record<string, Error> = {}) {
  const routing: Array<[string, unknown, string]> = [
    ['market intelligence analyst', MARKET, 'mock/market'],
    ['customer discovery researcher', CUSTOMER, 'mock/customer'],
    ['competitive intelligence analyst', COMPETITOR, 'mock/competitor'],
    ['financial modeling analyst', FINANCE, 'mock/finance'],
    ['risk analyst', RISK, 'mock/risk'],
    ['chief validation judge', SYNTHESIS, 'mock/synthesis'],
  ]
  ;(generateWithFallback as ReturnType<typeof vi.fn>).mockImplementation(async (opts: PromptPayload) => {
    for (const [marker, data, provider] of routing) {
      if (opts.prompt.includes(marker)) {
        if (overrides[marker]) throw overrides[marker]
        return { data, provider, tokensUsed: 100 }
      }
    }
    throw new Error(`Unexpected prompt in test mock: ${opts.prompt.slice(0, 80)}`)
  })
}

describe('runMultiAgentValidation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAgentsByPrompt()
  })

  it('runs all 6 agents and returns a complete report', async () => {
    const progress: Array<{ completed: number; total: number; label?: string }> = []
    const result = await runMultiAgentValidation(idea, {
      onProgress: (completed, total, label) => progress.push({ completed, total, label }),
    })

    expect(result).not.toBeNull()
    expect(result!.report.decision).toBe('GO')
    expect(result!.report.overallScore).toBeGreaterThan(0)
    // 8 sub-scores present and clamped
    expect(result!.report.problemScore).toBeLessThanOrEqual(20)
    expect(result!.report.marketScore).toBeLessThanOrEqual(15)
    expect(result!.report.agentTrail.agents.market).toBe('ok')
    expect(result!.report.agentTrail.agents.synthesis).toBe('ok')
    expect(result!.agentTrail.totalTokens).toBe(600)
    // Progress should fire 6 times (once per agent)
    expect(progress.length).toBe(6)
    expect(progress.at(-1)?.completed).toBe(6)
    expect(progress.at(-1)?.total).toBe(6)
  })

  it('computes deterministic unit economics from finance assumptions', async () => {
    const result = await runMultiAgentValidation(idea)
    const ue = result!.report.computedUnitEconomics
    // contributionMargin = 50 - 10 = 40
    expect(ue.contributionMargin).toBe(40)
    // breakEven customers = 5000 / (50-10) = 125
    expect(ue.breakEvenCustomers).toBe(125)
    // LTV = 40 * (1/0.02) = 2000
    expect(ue.ltv).toBe(2000)
    // LTV:CAC = 2000 / 200 = 10
    expect(ue.ltvCacRatio).toBe(10)
    // payback = 200 / 40 = 5 months
    expect(ue.cacPaybackMonths).toBe(5)
    // gross margin = (50-10)/50 = 80%
    expect(ue.grossMarginPercent).toBe(80)
    expect(ue.label).toBe('ASSUMPTION')
  })

  it('builds a 12-month projection with PROJECTION labels', async () => {
    const result = await runMultiAgentValidation(idea)
    const fp = result!.report.financialProjection
    expect(fp.length).toBe(12)
    expect(fp[0].month).toBe(1)
    expect(fp[0].customers).toBe(50)
    expect(fp[0].label).toBe('PROJECTION')
    // month 2 = 50 * 1.1 = 55 customers
    expect(fp[1].customers).toBe(55)
    // revenue month 1 = 50 * 50 = 2500
    expect(fp[0].revenue).toBe(2500)
  })

  it('degrades gracefully when one agent fails', async () => {
    mockAgentsByPrompt({ 'risk analyst': new Error('risk agent down') })

    const result = await runMultiAgentValidation(idea)
    expect(result).not.toBeNull()
    expect(result!.report.agentTrail.agents.risk).toBe('failed')
    expect(result!.report.agentTrail.agents.market).toBe('ok')
    // Safe defaults keep the shape complete
    expect(result!.report.keyRisks[0]).toContain('Risk agent unavailable')
    expect(result!.report.riskRegister).toEqual([])
    // Overall report still scores and decides
    expect(typeof result!.report.overallScore).toBe('number')
  })

  it('degrades gracefully when the finance agent fails (safe default assumptions)', async () => {
    mockAgentsByPrompt({ 'financial modeling analyst': new Error('finance agent down') })

    const result = await runMultiAgentValidation(idea)
    expect(result).not.toBeNull()
    expect(result!.report.agentTrail.agents.finance).toBe('failed')
    // No assumptions available → math is skipped, only the label remains
    expect(result!.report.computedUnitEconomics.label).toBe('ASSUMPTION')
    expect(result!.report.computedUnitEconomics.ltv).toBeUndefined()
    expect(result!.report.financialProjection).toEqual([])
  })

  it('degrades gracefully when the synthesis agent fails (cautious default decision)', async () => {
    mockAgentsByPrompt({ 'chief validation judge': new Error('synthesis agent down') })

    const result = await runMultiAgentValidation(idea)
    expect(result).not.toBeNull()
    expect(result!.report.agentTrail.agents.synthesis).toBe('failed')
    expect(result!.report.decision).toBe('TEST_FURTHER')
    expect(result!.report.nextStepRecommendation).toBe('MORE_VALIDATION')
  })

  it('records providers and total tokens in the trail', async () => {
    const result = await runMultiAgentValidation(idea)
    expect(result!.agentTrail.providers.length).toBe(6)
    expect(result!.agentTrail.providers).toContain('mock/market')
    expect(result!.agentTrail.totalTokens).toBe(600)
  })
})
