import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { PgDialect } from 'drizzle-orm/pg-core'
import { CANVAS_KEYS } from '@/lib/planning/evidence'
import { stagedPitchFixture } from './fixtures/pitch-deck'

const state = vi.hoisted(() => ({ generate: vi.fn(), search: vi.fn(), debit: vi.fn(), save: vi.fn(), parent: vi.fn(), decrement: vi.fn(), records: [] as Record<string, unknown>[] }))
const owner = '11111111-1111-4111-8111-111111111111'
const ideaId = '22222222-2222-4222-8222-222222222222'
const parentId = '33333333-3333-4333-8333-333333333333'
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'auth-owner' } } }) } }) }))
vi.mock('@/lib/tier-gate', () => ({ canUserAccess: async () => true, canUserAccessWithCredits: async () => ({ allowed: true, reason: 'tier' }) }))
vi.mock('@/lib/credits', () => ({ checkCredits: async () => ({ allowed: true }), deductCredits: state.debit }))
vi.mock('@/lib/rate-limit', () => ({ rateLimitCheck: async () => ({ success: true }), checkAndIncrementConcurrency: async () => ({ allowed: true }), decrementConcurrency: state.decrement }))
vi.mock('@/lib/ai/generate', () => ({ generateWithFallback: state.generate }))
vi.mock('@/lib/ai/search',async()=>({...await vi.importActual<typeof import('@/lib/ai/search')>('@/lib/ai/search'),webSearch:state.search}))
vi.mock('@/lib/interview/context', () => ({ loadFounderContext: async () => '' }))
vi.mock('@/lib/plan-catalog', () => ({ getPlan: async () => ({ maxConcurrentRequests: 2, maxTokensPerCall: 10000 }) }))
vi.mock('@/lib/canvas-store', () => ({ saveCanvasVersion: state.save }))
// Admission/immutable context is exercised against PGlite in the registry
// suite. These route-focused fixtures isolate calculations and output policy.
vi.mock('@/lib/planning/requests', async () => ({ ...await vi.importActual<typeof import('@/lib/planning/requests')>('@/lib/planning/requests'),
  beginPlanningRequest: async () => ({ lease: null, replay: null }),
  preparePlanningContext: async () => ({ version: 'planning-context-v1', capturedAt: '2026-11-17', founderContext: '', founderContextHash: 'a'.repeat(64), artifacts: [], parentCanvasId: null, selection: {} }),
}))
vi.mock('@/db', async () => {const {users}=await import('@/db/schema');const fixtureIdea={ id: '22222222-2222-4222-8222-222222222222', name: 'Founder idea', industry: 'Technology', product: 'A product', targetCustomer: 'Founders', location: 'India' };return { db: {
  query: { users: { findFirst: async () => ({ id: '11111111-1111-4111-8111-111111111111', tier: 'max_premium', accountStatus: 'active', isAdmin: false }) },
    ideas: { findFirst: async () => fixtureIdea },
    leanCanvases: { findFirst: state.parent, findMany: async () => [] },
  },
  transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback({
    select: () => ({ from: (table:unknown) => ({ where: () => ({ for: async () => table===users?[{accountStatus:'active'}]:[fixtureIdea] }) }) }),
    insert: () => ({ values: (record: Record<string, unknown>) => ({ returning: async () => { state.records.push(record); return [{ id: '44444444-4444-4444-8444-444444444444', ...record }] } }) }),
  }),
} }})

import { POST as manualCanvas } from '@/app/api/lean-canvas/manual/route'
import { POST as canvasAnalysis } from '@/app/api/lean-canvas/route'
import { POST as campaignAnalysis } from '@/app/api/crowdfunding/route'
import { POST as deckAnalysis } from '@/app/api/pitch-deck/route'
import { POST as pricingAnalysis } from '@/app/api/pricing/route'

const request = (path: string, data: unknown) => new NextRequest('http://localhost' + path, { method: 'POST', headers: { origin: 'http://localhost', 'content-type': 'application/json' }, body: JSON.stringify(data) })
const blocks = Object.fromEntries(CANVAS_KEYS.map(key => [key, 'Original ' + key]))
const campaign = { ideaId, fundingGoal: 50000, projectDescription: 'A specific campaign description about a prototype and delivery plan.',
  category: 'Technology', country: 'India', preLaunchCommunitySize: 0, socialFollowers: 0, emailListSize: 0,
  campaignDurationDays: 30, rewardTiers: 3, lowestReward: 25, averageReward: 100, highestReward: 500, hasVideo: false,
  marketingBudget: 2000, currency: 'INR', expectedVisitors: 20000, rewardCostPerBacker: 30, shippingCostPerBacker: 10, productionFixedCost: 5000 }
beforeEach(() => {
  vi.clearAllMocks(); state.records.length = 0; state.debit.mockResolvedValue(true)
  state.search.mockResolvedValue({ results: [], degraded: true })
  state.save.mockResolvedValue({ kind: 'saved', canvas: { id: parentId, version: 2 } })
})

describe('pricing calculation admission', () => {
  const pricing = { ideaId, sellingPrice: 1000, expectedCustomers: 100, variableCostPerUnit: 300,
    fixedCostMonthly: 50000, discountPercent: 10, conversionRatePercent: 3.5, estimatedCac: 500, retentionMonths: 18 }
  it.each([
    { sellingPrice: 1e-310, variableCostPerUnit: 0, fixedCostMonthly: 1e9 },
    { sellingPrice: 1e9, expectedCustomers: 10_000_000 },
    { conversionRatePercent: 1e-310 },
    { estimatedCac: 1e-310 },
  ])('returns an input error before any research, model, debit or save for %j', async patch => {
    const response = await pricingAnalysis(request('/api/pricing', { ...pricing, ...patch }))
    expect(response.status).toBe(400)
    expect(await response.text()).toContain('supported numeric range')
    expect(state.search).not.toHaveBeenCalled()
    expect(state.generate).not.toHaveBeenCalled()
    expect(state.debit).not.toHaveBeenCalled()
    expect(state.records).toHaveLength(0)
  })
  it('lets ordinary Pricing reach model generation with optional research and no complete-context override', async () => {
    state.generate.mockImplementation(async (options: Record<string, unknown>) => {
      expect(options).not.toHaveProperty('privateContextMaxChars')
      expect(options).toMatchObject({ maxResearchRounds: 2, researchPrompt: expect.any(String), privateContext: expect.any(String) })
      throw new Error('Synthetic provider interruption')
    })
    const response = await pricingAnalysis(request('/api/pricing', { ideaId, sellingPrice: 1000, expectedCustomers: 100, variableCostPerUnit: 300,
      fixedCostMonthly: 50000, discountPercent: 10, conversionRatePercent: 3.5, estimatedCac: 500, retentionMonths: 18 }))
    expect(response.status).toBe(503)
    expect(state.generate).toHaveBeenCalledOnce()
  })
})

describe('ordinary planning private context and research mode', () => {
  it.each([
    ['Lean Canvas', '/api/lean-canvas', (data: Record<string, unknown>) => canvasAnalysis(request('/api/lean-canvas', data)),
      { ideaId, intakeAnswers: {} }],
    ['Crowdfunding', '/api/crowdfunding', (data: Record<string, unknown>) => campaignAnalysis(request('/api/crowdfunding', data)), campaign],
  ])('%s keeps founder context out of research while allowing the ordinary research phase', async (_name, _path, invoke, input) => {
    state.generate.mockImplementation(async (options: Record<string, unknown>) => {
      expect(options).not.toHaveProperty('privateContextMaxChars')
      expect(options).toMatchObject({ maxResearchRounds: 2, researchPrompt: expect.any(String), privateContext: expect.any(String) })
      throw new Error('Synthetic provider interruption')
    })
    expect((await invoke(input)).status).toBe(503)
    expect(state.generate).toHaveBeenCalledOnce()
  })
})

describe('founder canvas revisions', () => {
  it('owner-scopes the exact parent and preserves only unchanged evidence', async () => {
    const parentSources = [{ title: 'Original source', url: 'https://example.test/research', fetchedAt: '2026-11-14' }]
    state.parent.mockResolvedValue({ id: parentId, version: 1, analysisData: { researchSources: parentSources, intakeAnswers: { '0': 'Founder supplied problem context' } }, ...Object.fromEntries(CANVAS_KEYS.map(key => [key, { content: blocks[key], confidenceScore: 45, label: 'SOME_RESEARCH', keyAssumptions: ['Still a hypothesis'] }])) })
    const response = await manualCanvas(request('/api/lean-canvas/manual', { ideaId, parentCanvasId: parentId, changeReason: 'New founder evidence', blocks: { ...blocks, problem: 'Changed problem' } }))
    expect(response.status).toBe(200)
    const where = new PgDialect().sqlToQuery(state.parent.mock.calls[0][0].where)
    expect(where.params).toEqual(expect.arrayContaining([owner, ideaId, parentId]))
    const saved = state.save.mock.calls[0][2]
    expect(saved.problem).toMatchObject({ content: 'Changed problem', confidenceScore: 0, label: 'ASSUMPTION' })
    expect(saved.solution).toMatchObject({ confidenceScore: 45, label: 'SOME_RESEARCH' })
    expect(saved.validationScore).toBe(40)
    expect(saved.changeReason).toBe('New founder evidence')
    expect(saved.analysisData).toMatchObject({ researchSources: parentSources, intakeAnswers: { '0': 'Founder supplied problem context' } })
  })
  it('never edits a missing or foreign parent', async () => {
    state.parent.mockResolvedValue(null)
    expect((await manualCanvas(request('/api/lean-canvas/manual', { ideaId, parentCanvasId: parentId, blocks }))).status).toBe(404)
    expect(state.save).not.toHaveBeenCalled()
  })
})

describe('campaign generation integrity', () => {
  const ai = { problemProductAppealScore: 20, fundingGoalFeasibilityScore: 15, preLaunchAudienceScore: 15, campaignPageQualityScore: 10,
    rewardStrategyScore: 10, pricingEconomicsScore: 10, marketingReadinessScore: 5, founderCredibilityScore: 5, earlyMomentumPlanScore: 5, operationalReadinessScore: 5,
    recommendation: 'READY_TO_LAUNCH', scenarios: { base: { backers: 999999, amountRaised: 999999999 } },
    fundingBands: [{ probability: 99 }], categoryBenchmark: { successRate: 99 } }
  it('allows ordinary Crowdfunding generation with bounded founder context and optional research', async () => {
    state.generate.mockImplementation(async (options: Record<string, unknown>) => {
      expect(options).not.toHaveProperty('privateContextMaxChars')
      return { data: ai, sources: [] }
    })
    const response = await campaignAnalysis(request('/api/crowdfunding', campaign))
    expect(response.status).toBe(200)
    expect(state.generate).toHaveBeenCalledOnce()
  })
  it('uses the actual description and deterministic funding figures, not model statistics', async () => {
    state.generate.mockResolvedValue({ data: ai, sources: [] })
    const response = await campaignAnalysis(request('/api/crowdfunding', campaign))
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(state.generate.mock.calls[0][0].prompt).toContain(campaign.projectDescription)
    expect(body.result.ai.scenarios.base).toMatchObject({ backers: 700, amountRaised: 70000, netProceeds: 25200 })
    expect(body.result.ai.categoryBenchmark).toBeUndefined()
    expect(body.result.ai.fundingBands).toBeUndefined()
    expect(state.records[0].expectedFunding).toBe(70000)
    expect(state.debit).toHaveBeenCalledOnce()
  })
  it('caps launch readiness when delivery costs are unknown', async () => {
    state.generate.mockResolvedValue({ data: ai })
    const response = await campaignAnalysis(request('/api/crowdfunding', { ...campaign, rewardCostPerBacker: 0 }))
    const body = await response.json()
    expect(body.performanceScore).toBe(64)
    expect(body.recommendation).toBe('TEST_FURTHER')
    expect(body.result.scoreReview.scoreCap).toBe(64)
  })
  it('blocks a launch recommendation for zero conversion despite positive margins and high model scores', async () => {
    state.generate.mockResolvedValue({ data: { ...ai, preLaunchReadinessScore: 99 } })
    const response = await campaignAnalysis(request('/api/crowdfunding', { ...campaign, conversionRatePercent: 0 }))
    const body = await response.json()
    expect(body.performanceScore).toBe(49)
    expect(body.recommendation).toBe('MAJOR_REWORK_REQUIRED')
    expect(body.result.ai.preLaunchReadinessScore).toBe(49)
    expect(body.result.scoreReview.reason).toContain('no conversion')
  })
  it('requires a launch artifact and demand review even when all economic inputs are supplied', async () => {
    state.generate.mockResolvedValue({ data: ai })
    const response = await campaignAnalysis(request('/api/crowdfunding', campaign))
    const body = await response.json()
    expect(body.performanceScore).toBe(64)
    expect(body.recommendation).toBe('TEST_FURTHER')
    expect(body.result.scoreReview.reason).toContain('independently reviewed')
  })
  it('does not charge or save on generation failure and releases the run slot', async () => {
    state.generate.mockRejectedValue(new Error('Provider unavailable'))
    const response = await campaignAnalysis(request('/api/crowdfunding', campaign))
    expect(response.status).toBe(503)
    expect(state.debit).not.toHaveBeenCalled()
    expect(state.records).toHaveLength(0)
    expect(state.decrement).toHaveBeenCalledOnce()
  })
  it('rejects invalid rewards before calling the model', async () => {
    expect((await campaignAnalysis(request('/api/crowdfunding', { ...campaign, averageReward: 1000 }))).status).toBe(400)
    expect(state.generate).not.toHaveBeenCalled()
    expect(state.debit).not.toHaveBeenCalled()
  })
})

it('does not charge a failed pitch generation', async () => {
  state.generate.mockRejectedValue(new Error('Provider unavailable'))
  const response = await deckAnalysis(request('/api/pitch-deck', { ideaId, founderName: 'Founder', founderBackground: 'A genuine founder background', teamSize: 1 }))
  expect(response.status).toBe(503)
  expect(state.debit).not.toHaveBeenCalled()
  expect(state.records).toHaveLength(0)
  expect(state.decrement).toHaveBeenCalledOnce()
})

it('retains a structured funding ask without reporting it as missing in the saved pitch', async () => {
  state.generate.mockResolvedValue({ data: stagedPitchFixture, sources: [], provider: 'synthetic', tokensUsed: 100 })
  const response = await deckAnalysis(request('/api/pitch-deck', { ideaId, founderName: 'Founder', founderBackground: 'A genuine founder background',
    teamSize: 1, fundingAsk: { amount: 125000, currency: 'INR' } }))
  expect(response.status).toBe(200)
  const report = state.records[0].reportData as { funding: unknown; evidenceGaps: string[] }
  expect(report.funding).toMatchObject({ amount: 125000, currency: 'INR' })
  expect(report.evidenceGaps.join(' ')).not.toContain('No funding ask')
})
