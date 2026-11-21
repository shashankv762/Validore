import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RunValidationStep } from '@/lib/validation/steps'

const mocks = vi.hoisted(() => ({ generate: vi.fn(), search: vi.fn() }))
vi.mock('@/lib/ai/generate', () => ({ generateWithFallback: mocks.generate }))
vi.mock('@/lib/ai/search', async original => ({ ...await original<typeof import('@/lib/ai/search')>(), webSearch: mocks.search }))
vi.mock('@/lib/ai/market-memory', () => ({ retrieveMarketMemory: () => [] }))
vi.mock('@/db', () => ({ db: {} }))
import { GenerationUnavailableError } from '@/lib/ai/generation-failure'
import { runMultiAgentValidation } from '@/lib/validation/agents/orchestrator'
import { runLiteValidation } from '@/lib/validation/engine'
import { PIPELINE_IDEA, PIPELINE_LITE_REPLY, PIPELINE_REPLIES } from './fixtures/agent-payloads'
import { ProductAgentSchema, GrowthAgentSchema } from '@/lib/validation/schemas'

function durable() {
  const saved = new Map<string, unknown>()
  const runStep: RunValidationStep = async <T>(id: string, work: () => Promise<T>) => {
    if (saved.has(id)) return structuredClone(saved.get(id)) as T
    const result = JSON.parse(JSON.stringify(await work())) as T
    saved.set(id, result)
    return structuredClone(result)
  }
  return { saved, runStep }
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('AI_FREE_ONLY', 'true')
  vi.stubEnv('AI_SPECIALIST_CONCURRENCY', '1')
  mocks.search.mockResolvedValue({ results: [], degraded: true, evidenceStrength: 'WEAK', providers: [] })
})
afterEach(() => vi.unstubAllEnvs())

describe('production-faithful durable specialist recovery', () => {
  it('reviews the actual completed plans after finance, product and growth and preserves the run date across midnight replay', async () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('2026-11-17T23:59:00Z'))
      mocks.generate.mockImplementation(async options => ({ data: options.schema.parse(PIPELINE_REPLIES[options.agentRole]),
        provider: 'synthetic/model', tokensUsed: 1, sources: [] }))
      const runner = durable()
      const first = await runMultiAgentValidation(PIPELINE_IDEA, { runStep: runner.runStep, researchBudgetId: 'same-job' })
      const roles = mocks.generate.mock.calls.map(([options]) => options.agentRole)
      expect(roles).toEqual(['market', 'customer', 'competitor', 'finance', 'product', 'growth', 'risk', 'evidence', 'synthesis'])
      for (const role of ['risk', 'evidence']) {
        const prompt = mocks.generate.mock.calls.find(([options]) => options.agentRole === role)![0].prompt
        expect(prompt).toContain(ProductAgentSchema.parse(PIPELINE_REPLIES.product).mvpDescription)
        expect(prompt).toContain(GrowthAgentSchema.parse(PIPELINE_REPLIES.growth).actionPlan[0].action)
        expect(prompt).toContain('DETERMINISTIC FINANCIAL REVIEW AND OFFER COMPARISON')
      }
      vi.setSystemTime(new Date('2026-11-18T00:01:00Z'))
      const replay = await runMultiAgentValidation(PIPELINE_IDEA, { runStep: runner.runStep, researchBudgetId: 'same-job' })
      expect(replay).toEqual(first)
      expect(mocks.generate).toHaveBeenCalledTimes(9)
      expect(first?.report.runManifest?.steps.some(id => id.startsWith('agent-risk-'))).toBe(true)
    } finally { vi.useRealTimers() }
  })
  it.each(['full', 'lite'])('does not reuse %s public research or specialist snapshots after the explicit topic changes', async mode => {
    mocks.generate.mockImplementation(async options => ({ data: options.schema.parse(options.agentRole === 'synthesis' && mode === 'lite' ? PIPELINE_LITE_REPLY : PIPELINE_REPLIES[options.agentRole]),
      provider: 'synthetic/model', tokensUsed: 1, sources: [] }))
    const runner = durable()
    const run = (publicResearchFocus: string) => mode === 'full'
      ? runMultiAgentValidation({ ...PIPELINE_IDEA, publicResearchFocus }, { runStep: runner.runStep, researchBudgetId: 'same-job' })
      : runLiteValidation({ ...PIPELINE_IDEA, publicResearchFocus }, { runStep: runner.runStep, researchBudgetId: 'same-job' })
    await run('Inventory reconciliation using spreadsheets')
    await run('Clinic reminders using phone calls')
    expect(mocks.generate).toHaveBeenCalledTimes(mode === 'full' ? 18 : 6)
    expect(mocks.search).toHaveBeenCalledTimes(mode === 'full' ? 6 : 2)
    for (const [query] of mocks.search.mock.calls.slice(mode === 'full' ? 3 : 1)) {
      expect(query).toContain('Clinic reminders using phone calls')
      expect(query).not.toContain('Inventory reconciliation')
      expect(query).not.toContain(PIPELINE_IDEA.coreProblem)
    }
    await run('Clinic reminders using phone calls')
    expect(mocks.generate).toHaveBeenCalledTimes(mode === 'full' ? 18 : 6)
  })
  it.each(['full', 'lite'])('does not cache a transient %s specialist failure; replays successful predecessors and recovers without extra calls', async mode => {
    let interrupted = false
    mocks.generate.mockImplementation(async options => {
      if (options.agentRole === 'customer' && !interrupted) {
        interrupted = true
        throw new GenerationUnavailableError('Temporary provider capacity', true)
      }
      const payload = options.agentRole === 'synthesis' && mode === 'lite' ? PIPELINE_LITE_REPLY : PIPELINE_REPLIES[options.agentRole]
      return { data: options.schema.parse(payload), provider: 'synthetic/model', tokensUsed: 1, sources: [] }
    })
    const runner = durable()
    const run = () => mode === 'full' ? runMultiAgentValidation(PIPELINE_IDEA, { runStep: runner.runStep }) : runLiteValidation(PIPELINE_IDEA, { runStep: runner.runStep })
    await expect(run()).rejects.toThrow('Temporary provider capacity')
    expect([...runner.saved.keys()].some(key => key.startsWith(mode === 'full' ? 'agent-market-' : 'lite-agent-market-'))).toBe(true)
    expect([...runner.saved.keys()].some(key => key.startsWith(mode === 'full' ? 'agent-customer-' : 'lite-agent-customer-'))).toBe(false)
    const recovered = await run()
    expect(recovered).not.toBeNull()
    expect(recovered!.agentTrail?.agents.customer).toBe('ok')
    const calls = mocks.generate.mock.calls.length
    expect(calls).toBe(mode === 'full' ? 10 : 4)
    expect(await run()).toEqual(recovered)
    expect(mocks.generate).toHaveBeenCalledTimes(calls)
    expect(mocks.generate.mock.calls.filter(([options]) => options.agentRole === 'market')).toHaveLength(1)
  })
})
