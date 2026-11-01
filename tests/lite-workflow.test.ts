import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RunValidationStep } from '@/lib/validation/steps'

const mocks = vi.hoisted(() => ({ market: vi.fn(), customer: vi.fn(), generate: vi.fn(), search: vi.fn() }))
vi.mock('@/lib/validation/agents/market', () => ({ runMarketAgent: mocks.market }))
vi.mock('@/lib/validation/agents/customer', () => ({ runCustomerAgent: mocks.customer }))
vi.mock('@/lib/ai/generate', () => ({ generateWithFallback: mocks.generate }))
vi.mock('@/lib/ai/search', async importOriginal => ({ ...await importOriginal<typeof import('@/lib/ai/search')>(), webSearch: mocks.search }))
vi.mock('@/db', () => ({ db: {} }))
import { runLiteValidation } from '@/lib/validation/engine'

const idea = { name: 'Test idea', industry: 'Software', product: 'Research tools', targetCustomer: 'Founders', location: 'India', businessModel: 'Subscription', coreProblem: 'Untested startup assumptions', proposedSolution: 'Structured research and experiments' }
const source = { title: 'Evidence', url: 'https://example.org/evidence', content: 'Research findings', source: 'example.org', fetchedAt: '2026-10-31T00:00:00Z' }
beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('MARKET_MEMORY_ENABLED', 'false')
  mocks.search.mockResolvedValue({ results: [], degraded: true, evidenceStrength: 'WEAK' })
  mocks.market.mockResolvedValue({ data: { marketScore: 7 }, provider: 'test-market', tokensUsed: 100, sources: [source] })
  mocks.customer.mockResolvedValue({ data: { problemScore: 10 }, provider: 'test-customer', tokensUsed: 120, sources: [] })
  mocks.generate.mockResolvedValue({ data: { problemScore: 10, customerScore: 10, marketScore: 7, competitiveScore: 4, wtpScore: 8, businessModelScore: 5, financialScore: 2, executionScore: 3,
    keyEvidence: [{ text: 'A retrieved research finding', link: source.url, source: source.source, strength: 'MODERATE' }],
  }, provider: 'test-reviewer', tokensUsed: 180 })
})
afterEach(() => vi.unstubAllEnvs())

describe('Lite multi-agent workflow', () => {
  it('passes specialist findings and discovered evidence into the final review', async () => {
    const report = await runLiteValidation(idea, { researchBudgetId: 'shared-report-budget' })
    expect(report.agentTrail?.agents).toEqual({ market: 'ok', customer: 'ok', synthesis: 'ok' })
    expect(report.tokensUsed).toBe(400)
    expect(report.researchSources).toEqual([source])
    expect(report.keyEvidence[0].link).toBe(source.url)
    expect(mocks.market.mock.calls[0][2]).toMatchObject({ researchBudgetId: 'shared-report-budget' })
    expect(mocks.customer.mock.calls[0][1]).toMatchObject({ researchBudgetId: 'shared-report-budget' })
    expect(mocks.generate.mock.calls[0][0]).toMatchObject({ agentRole: 'synthesis', sources: [source], researchBudgetId: 'shared-report-budget' })
    expect(mocks.generate.mock.calls[0][0].prompt).toContain('SPECIALIST FINDINGS')
  })
  it('reuses every persisted step when the durable runner replays a job', async () => {
    const saved = new Map<string, unknown>()
    const runStep: RunValidationStep = async <T>(id: string, work: () => Promise<T>) => {
      if (!saved.has(id)) saved.set(id, JSON.parse(JSON.stringify(await work())))
      return saved.get(id) as T
    }
    await runLiteValidation(idea, { runStep, researchBudgetId: 'job-a' })
    await runLiteValidation(idea, { runStep, researchBudgetId: 'job-a' })
    expect(mocks.search).toHaveBeenCalledTimes(1)
    expect(mocks.market).toHaveBeenCalledTimes(1)
    expect(mocks.customer).toHaveBeenCalledTimes(1)
    expect(mocks.generate).toHaveBeenCalledTimes(1)
    expect(saved.size).toBe(4)
  })
  it('records an unavailable specialist instead of presenting it as completed', async () => {
    mocks.customer.mockRejectedValue(new Error('Unavailable'))
    const report = await runLiteValidation(idea)
    expect(report.agentTrail?.agents.customer).toBe('failed')
    expect(report.agentTrail?.agents.synthesis).toBe('ok')
    expect(mocks.generate.mock.calls[0][0].prompt).toContain('Unavailable; label customer conclusions as assumptions.')
    expect(mocks.generate.mock.calls[0][0].researchMode).toBe('reuse')
  })
  it('does not let synthesis reintroduce unsupported market sizes', async () => {
    mocks.generate.mockResolvedValue({ data: { problemScore: 10, customerScore: 10, marketScore: 7, competitiveScore: 4, wtpScore: 8, businessModelScore: 5, financialScore: 2, executionScore: 3,
      tamEstimate: '$999B', samEstimate: '$99B', somEstimate: '$9B', keyEvidence: [],
    }, provider: 'test-reviewer', tokensUsed: 180 })
    const report = await runLiteValidation(idea)
    expect([report.tamEstimate, report.samEstimate, report.somEstimate]).toEqual(['Not established', 'Not established', 'Not established'])
    expect(mocks.generate.mock.calls[0][0].prompt).toContain('Not established')
  })
})
