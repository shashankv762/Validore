import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createAgentToolkit } from '@/lib/ai/agent-tools'

const mocks = vi.hoisted(() => ({ search: vi.fn(), read: vi.fn() }))
vi.mock('@/lib/ai/search', async importOriginal => ({ ...await importOriginal<typeof import('@/lib/ai/search')>(), webSearch: mocks.search }))
vi.mock('@/lib/ai/public-web', async importOriginal => ({ ...await importOriginal<typeof import('@/lib/ai/public-web')>(), readPublicWeb: mocks.read }))

const source = { title: 'A source', url: 'https://example.org/research', content: 'Research excerpt', source: 'example.org', fetchedAt: '2026-10-31T00:00:00Z' }
const context = { toolCallId: 'test-tool-call', messages: [], context: {} }
async function call(kit: ReturnType<typeof createAgentToolkit>, name: string, input: Record<string, unknown>) {
  return await kit.tools[name].execute!(input, context)
}
beforeEach(() => vi.clearAllMocks())

describe('research tool execution', () => {
  it('performs deterministic arithmetic and records real activity', async () => {
    const kit = createAgentToolkit('finance')
    const result = await call(kit, 'calculate', { operation: 'multiply', values: [37, 19] })
    expect(result).toMatchObject({ value: 703, label: 'CALCULATED_FROM_INPUTS' })
    expect(kit.events).toEqual([expect.objectContaining({ agent: 'finance', tool: 'calculate', status: 'complete' })])
  })
  it('handles division by zero without inventing a result', async () => {
    const kit = createAgentToolkit('finance')
    expect(await call(kit, 'calculate', { operation: 'divide', values: [37, 0] })).toHaveProperty('error')
    expect(kit.events[0].status).toBe('unavailable')
  })
  it('shares a fixed tool budget across repeated model attempts', async () => {
    const kit = createAgentToolkit('market')
    for (let index = 0; index < 6; index++) await call(kit, 'calculate', { operation: 'add', values: [1, 2] })
    expect(await call(kit, 'calculate', { operation: 'add', values: [1, 2] })).toHaveProperty('error')
    expect(kit.events.at(-1)?.status).toBe('limited')
  })
  it('reuses identical searches and shares their URLs with the team', async () => {
    mocks.search.mockResolvedValue({ results: [source], degraded: false, evidenceStrength: 'WEAK' })
    const kit = createAgentToolkit('market', [], 'report-budget')
    await call(kit, 'search_web', { query: 'market evidence' })
    await call(kit, 'search_web', { query: 'Market evidence' })
    expect(mocks.search).toHaveBeenCalledTimes(1)
    expect(mocks.search).toHaveBeenCalledWith('market evidence', 5, expect.objectContaining({ budgetId: 'report-budget', allowKeyed: true }))
    expect(kit.sources()).toEqual([source])
  })
  it('refuses arbitrary pages outside the discovered evidence set', async () => {
    const kit = createAgentToolkit('market', [source])
    expect(await call(kit, 'read_page', { url: 'https://unrelated.example.org/private-document' })).toHaveProperty('error')
    expect(mocks.read).not.toHaveBeenCalled()
  })
  it('extracts article text without running scripts and caches repeated reads', async () => {
    mocks.read.mockResolvedValue({ url: source.url, text: '<html><head><title>Market evidence</title></head><body><article><h1>Market evidence</h1><p>' + 'Observed public research findings. '.repeat(80) + '</p><script>throw new Error("must never execute")</script></article></body></html>' })
    const kit = createAgentToolkit('market', [source])
    const result = await call(kit, 'read_page', { url: source.url })
    expect(result).toMatchObject({ url: source.url, content: expect.stringContaining('Observed public research findings') })
    await call(kit, 'read_page', { url: source.url })
    expect(mocks.read).toHaveBeenCalledTimes(1)
  })
  it('includes free research tools and limits specialists to useful planning tools', () => {
    const reviewer = createAgentToolkit('synthesis').tools
    expect(Object.keys(reviewer)).toHaveLength(14)
    expect(reviewer).toHaveProperty('recall_market_memory')
    expect(reviewer).toHaveProperty('read_market_indicator')
    expect(createAgentToolkit('product').tools).toHaveProperty('rank_priorities')
    expect(createAgentToolkit('evidence').tools).toHaveProperty('inspect_evidence')
    expect(createAgentToolkit('evidence').tools).not.toHaveProperty('compare_financial_scenarios')
  })
  it('ranks explicit priorities and carries the calculation into the report context', async () => {
    const kit = createAgentToolkit('product')
    const result = await call(kit, 'rank_priorities', { items: [
      { name: 'Dashboard', reach: 100, impact: 1, confidence: 0.5, effort: 5 },
      { name: 'Customer interview', reach: 30, impact: 3, confidence: 0.8, effort: 1 },
    ] })
    expect(result).toMatchObject({ ranking: [{ name: 'Customer interview', score: 72 }, { name: 'Dashboard', score: 10 }] })
    expect(kit.observations()[0].tool).toBe('rank_priorities')
  })
  it('calculates finite runway and handles a cash-generating scenario without infinity', async () => {
    const kit = createAgentToolkit('finance')
    expect(await call(kit, 'calculate_runway', { cash: 100000, oneTimeCosts: 10000, monthlyRevenue: 5000, monthlyCosts: 20000 })).toMatchObject({ cashAfterSetup: 90000, monthlyBurn: 15000, runwayMonths: 6 })
    expect(await call(kit, 'calculate_runway', { cash: 100000, oneTimeCosts: 0, monthlyRevenue: 30000, monthlyCosts: 20000 })).toMatchObject({ runwayMonths: null })
  })
  it('uses nested customer segments and rejects impossible market scenarios', async () => {
    const kit = createAgentToolkit('market')
    expect(await call(kit, 'estimate_market', { totalCustomers: 10000, serviceableCustomers: 1000, reachableCustomers: 100, annualSpend: 200 })).toMatchObject({ tam: 2000000, sam: 200000, som: 20000 })
    expect(await call(kit, 'estimate_market', { totalCustomers: 10, serviceableCustomers: 100, reachableCustomers: 5, annualSpend: 200 })).toHaveProperty('error')
  })
  it('computes survey and conversion uncertainty from explicit inputs', async () => {
    const kit = createAgentToolkit('growth')
    expect(await call(kit, 'estimate_sample_size', { expectedProportion: 0.5, marginOfError: 0.05 })).toMatchObject({ sampleSize: 385, confidenceLevel: 0.95 })
    const result = await call(kit, 'analyze_conversion', { trials: 100, successes: 20 }) as { rate: number; lower95: number; upper95: number }
    expect(result.rate).toBe(0.2)
    expect(result.lower95).toBeCloseTo(0.1334, 3)
    expect(result.upper95).toBeCloseTo(0.2888, 3)
    expect(await call(kit, 'analyze_conversion', { trials: 10, successes: 20 })).toHaveProperty('error')
  })
})
