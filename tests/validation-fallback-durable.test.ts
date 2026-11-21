import { AsyncLocalStorage } from 'node:async_hooks'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GenerateOptions } from '@/lib/ai/generate'
import type { RunValidationStep } from '@/lib/validation/steps'

const mocks = vi.hoisted(() => ({ generate: vi.fn(), search: vi.fn(), update: vi.fn() }))
vi.mock('@/lib/ai/generate', () => ({ generateWithFallback: mocks.generate }))
vi.mock('@/lib/ai/search', async original => ({ ...await original<typeof import('@/lib/ai/search')>(), webSearch: mocks.search }))
vi.mock('@/lib/ai/market-memory', () => ({ retrieveMarketMemory: () => [] }))
vi.mock('@/db', () => ({ db: { update: () => ({ set: (value: unknown) => {
  mocks.update(value)
  return { where: async () => undefined }
} }) } }))

import { runFullValidation, runLiteValidation } from '@/lib/validation/engine'
import { hasUsefulValidationCoverage } from '@/lib/validation/delivery-quality'
import { FullReportSchema } from '@/lib/validation/schemas'
import { GenerationUnavailableError } from '@/lib/ai/generation-failure'
import { PIPELINE_IDEA, PIPELINE_LITE_REPLY, PIPELINE_REPLIES } from './fixtures/agent-payloads'
import * as orchestrator from '@/lib/validation/agents/orchestrator'

const source = { title: 'Synthetic context', url: 'https://example.org/fallback-context', source: 'example.org',
  content: 'A synthetic source excerpt.', fetchedAt: '2026-11-15T00:00:00Z', retrievalKind: 'snippet' as const }
const fullReply = () => FullReportSchema.parse(Object.assign({}, ...Object.values(PIPELINE_REPLIES)))
const fullCalls = () => mocks.generate.mock.calls.filter(([options]) => options.schema === FullReportSchema)

// Unlike an inline runner, reject child step registration and return JSON
// snapshots on replay. Async context permits independent sibling steps.
function durable(options: { beforeWork?: (id: string) => void } = {}) {
  const scope = new AsyncLocalStorage<string>()
  const saved = new Map<string, unknown>()
  const registered: string[] = []
  const nested: string[] = []
  const runStep: RunValidationStep = async <T>(id: string, work: () => Promise<T>) => {
    const parent = scope.getStore()
    if (parent) {
      nested.push(parent + ' -> ' + id)
      throw new Error('Nested durable step: ' + parent + ' -> ' + id)
    }
    registered.push(id)
    if (saved.has(id)) return structuredClone(saved.get(id)) as T
    return scope.run(id, async () => {
      options.beforeWork?.(id)
      const result = JSON.parse(JSON.stringify(await work())) as T
      saved.set(id, result)
      return structuredClone(result)
    })
  }
  return { runStep, saved, registered, nested }
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('AI_FREE_ONLY', 'true')
  vi.stubEnv('AI_SPECIALIST_CONCURRENCY', '1')
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Network is forbidden in this offline test') }))
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  mocks.search.mockResolvedValue({ results: [source], degraded: true, evidenceStrength: 'WEAK', providers: [] })
  mocks.generate.mockImplementation(async (options: GenerateOptions<unknown>) => {
    if (options.schema !== FullReportSchema) throw new Error('Synthetic specialist unavailable')
    return { data: fullReply(), provider: 'synthetic/monolithic', tokensUsed: 240, sources: [] }
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('durable validation fallbacks after specialist failures', () => {
  it('uses the monolithic fallback after a terminal coordinator error while preserving durable step boundaries', async () => {
    vi.spyOn(orchestrator, 'runMultiAgentValidation').mockRejectedValueOnce(new Error('Terminal coordinator assembly failure'))
    const runner = durable()

    const report = await runFullValidation(PIPELINE_IDEA, 'job-terminal-coordinator', { runStep: runner.runStep })

    expect(report?.provider).toBe('synthetic/monolithic')
    expect(fullCalls()).toHaveLength(1)
    expect(runner.registered.some(id => id.startsWith('monolithic-report-'))).toBe(true)
    expect(runner.nested).toEqual([])
  })

  it('does not cache a transient monolithic fallback failure and recovers without repeating terminal specialist failures', async () => {
    let interrupted = false
    mocks.generate.mockImplementation(async options => {
      if (options.schema !== FullReportSchema) throw new Error('Synthetic terminal specialist failure')
      if (!interrupted) { interrupted = true; throw new GenerationUnavailableError('Temporary capacity', true) }
      return { data: fullReply(), provider: 'synthetic/recovered', tokensUsed: 1, sources: [] }
    })
    const runner = durable()
    const options = { runStep: runner.runStep, researchBudgetId: 'recoverable-fallback' }
    await expect(runFullValidation(PIPELINE_IDEA, 'job-recoverable', options)).rejects.toThrow('Temporary capacity')
    expect([...runner.saved.keys()].some(key => key.startsWith('monolithic-report-'))).toBe(false)
    const recovered = await runFullValidation(PIPELINE_IDEA, 'job-recoverable', options)
    expect(recovered?.provider).toBe('synthetic/recovered')
    expect(mocks.generate).toHaveBeenCalledTimes(11)
    expect(await runFullValidation(PIPELINE_IDEA, 'job-recoverable', options)).toEqual(recovered)
    expect(mocks.generate).toHaveBeenCalledTimes(11)
    expect(runner.nested).toEqual([])
  })
  it('runs the monolithic fallback as sibling steps and replays without repeating any provider or research work', async () => {
    const runner = durable()
    const options = { runStep: runner.runStep, researchBudgetId: 'failed-specialists', maxTokensPerCall: 4000 }
    const report = await runFullValidation(PIPELINE_IDEA, 'job-full', options)

    expect(runner.nested).toEqual([])
    expect(mocks.generate.mock.calls.filter(([call]) => call.schema !== FullReportSchema).map(([call]) => call.agentRole)).toEqual(['market', 'customer', 'competitor', 'finance', 'product', 'growth', 'risk', 'evidence', 'synthesis'])
    expect(fullCalls()).toHaveLength(1)
    expect(fullCalls()[0][0]).toMatchObject({ maxTokensPerCall: 4000, researchBudgetId: 'failed-specialists' })
    expect(report).toMatchObject({ provider: 'synthetic/monolithic', tokensUsed: 240, agentTrail: { agents: { monolithic: 'ok' } } })
    expect(FullReportSchema.safeParse(report).success).toBe(true)
    expect(hasUsefulValidationCoverage(report, false)).toBe(true)
    expect(runner.registered).toEqual(expect.arrayContaining([expect.stringMatching(/^monolithic-research-sources-/), expect.stringMatching(/^monolithic-report-/), 'finish-full-report']))
    expect(runner.registered).not.toContain('fallback-report')

    expect(await runFullValidation(PIPELINE_IDEA, 'job-full', options)).toEqual(report)
    expect(mocks.search).toHaveBeenCalledTimes(5)
    expect(mocks.generate).toHaveBeenCalledTimes(10)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('persists failed fallback research as a partial snapshot and keeps that status on replay', async () => {
    mocks.search.mockReset().mockResolvedValueOnce({ results: [], degraded: true })
      .mockResolvedValueOnce({ results: [], degraded: true }).mockResolvedValueOnce({ results: [], degraded: true })
      .mockRejectedValue(new Error('Synthetic search unavailable'))
    const runner = durable()
    const options = { runStep: runner.runStep, researchBudgetId: 'partial-fallback' }
    const report = await runFullValidation(PIPELINE_IDEA, 'job-partial', options)

    expect(runner.nested).toEqual([])
    expect(report).toMatchObject({ agentTrail: { agents: { monolithic: 'partial' } } })
    expect(hasUsefulValidationCoverage(report, false)).toBe(true)
    expect(fullCalls()[0][0].sources).toEqual([])
    expect(await runFullValidation(PIPELINE_IDEA, 'job-partial', options)).toEqual(report)
    expect(mocks.search).toHaveBeenCalledTimes(5)
    expect(mocks.generate).toHaveBeenCalledTimes(10)
  })

  it('returns no deliverable when all specialists and the fallback model fail, without publishing completion', async () => {
    mocks.generate.mockRejectedValue(new Error('Synthetic provider unavailable'))
    const runner = durable()
    const options = { runStep: runner.runStep, researchBudgetId: 'no-deliverable' }
    expect(await runFullValidation(PIPELINE_IDEA, 'job-failed', options)).toBeNull()
    expect(await runFullValidation(PIPELINE_IDEA, 'job-failed', options)).toBeNull()
    expect(runner.nested).toEqual([])
    expect(runner.registered).not.toContain('finish-full-report')
    expect(mocks.update.mock.calls.some(([value]) => value.aiProvider)).toBe(false)
    expect(hasUsefulValidationCoverage(null, false)).toBe(false)
    expect(mocks.generate).toHaveBeenCalledTimes(10)
  })

  it.each(['monolithic-research-sources', 'monolithic-report'])('propagates durable scheduling signals from %s instead of classifying them as provider failures', async step => {
    const signal = new Error('Synthetic durable scheduling signal')
    const runner = durable({ beforeWork: id => { if (id.startsWith(step + '-')) throw signal } })
    await expect(runFullValidation(PIPELINE_IDEA, 'job-scheduled', { runStep: runner.runStep })).rejects.toBe(signal)
    expect(runner.nested).toEqual([])
    expect(runner.registered).not.toContain('finish-full-report')
    expect(fullCalls()).toHaveLength(0)
  })

  it('binds frozen fallback model inputs before registration can expose caller mutations', async () => {
    const idea = { ...PIPELINE_IDEA }
    const researchSource = { ...source }
    mocks.search.mockResolvedValue({ results: [researchSource], degraded: true, evidenceStrength: 'WEAK', providers: [] })
    const options = { privateContext: 'Original synthetic private context', maxTokensPerCall: 4000, runStep: undefined as RunValidationStep | undefined }
    const runner = durable({ beforeWork: id => {
      if (!id.startsWith('monolithic-report-')) return
      idea.product = 'Unexpected later product'
      researchSource.content = 'Unexpected later evidence'
      options.privateContext = 'Unexpected later private context'
      options.maxTokensPerCall = 9999
    } })
    options.runStep = runner.runStep
    const report = await runFullValidation(idea, 'job-immutable', options)
    expect(report).not.toBeNull()
    const generated = fullCalls()[0][0]
    expect(Object.isFrozen(generated)).toBe(true)
    expect(Object.isFrozen(generated.sources)).toBe(true)
    expect(generated.sources.every((item: unknown) => Object.isFrozen(item))).toBe(true)
    expect(generated.prompt).toContain(PIPELINE_IDEA.product)
    expect(generated.prompt).not.toContain('Unexpected later')
    expect(generated.sources[0].content).toBe(source.content)
    expect(generated.privateContext).toBe('Original synthetic private context')
    expect(generated.maxTokensPerCall).toBe(4000)
    expect(runner.nested).toEqual([])
  })

  it('keeps all failed Lite specialists explicit when its final fallback succeeds, so it is not charged as useful coverage', async () => {
    mocks.generate.mockImplementation(async (options: GenerateOptions<unknown>) => {
      if (options.agentRole !== 'synthesis') throw new Error('Synthetic specialist unavailable')
      return { data: structuredClone(PIPELINE_LITE_REPLY), provider: 'synthetic/lite-fallback', tokensUsed: 90 }
    })
    const runner = durable()
    const options = { runStep: runner.runStep, researchBudgetId: 'lite-all-failed', maxTokensPerCall: 4000 }
    const report = await runLiteValidation(PIPELINE_IDEA, options)
    expect(report.agentTrail?.agents).toEqual({ market: 'failed', customer: 'failed', synthesis: 'ok' })
    expect(hasUsefulValidationCoverage(report, true)).toBe(false)
    expect(await runLiteValidation(PIPELINE_IDEA, options)).toEqual(report)
    expect(mocks.generate).toHaveBeenCalledTimes(3)
    expect(runner.nested).toEqual([])
  })
})
