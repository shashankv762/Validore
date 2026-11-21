import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { Inngest, NonRetriableError, RetryAfterError } from 'inngest'
import { serve } from 'inngest/next'
import type { RunValidationStep } from '@/lib/validation/steps'

const mocks = vi.hoisted(() => ({ deadline: vi.fn(), fail: vi.fn() }))
vi.mock('@/lib/validation/jobs', () => ({ generateValidationReport: vi.fn(), completeValidationJob: vi.fn(), failValidationJob: mocks.fail, validationRetryDeadline: mocks.deadline }))
vi.mock('@/lib/credit-maintenance', () => ({ maintainCredits: vi.fn() }))
import { validationStepRunner } from '@/inngest/functions'
import { GenerationUnavailableError } from '@/lib/ai/generation-failure'

const started = Date.UTC(2026, 10, 16)
let now = started
beforeEach(() => {
  vi.clearAllMocks(); now = started
  vi.spyOn(Date, 'now').mockImplementation(() => now)
  mocks.deadline.mockResolvedValue(started + 15 * 60000)
  vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('External network is forbidden in this offline SDK test') }))
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('durable validation retry scheduling', () => {
  it('schedules the temporary step at its deadline and preserves cached predecessors on recovery', async () => {
    const saved = new Map<string, unknown>()
    const inside: unknown[] = []
    const durable: RunValidationStep = async <T>(id: string, work: () => Promise<T>) => {
      if (saved.has(id)) return structuredClone(saved.get(id)) as T
      try {
        const result = JSON.parse(JSON.stringify(await work())) as T
        saved.set(id, result); return result
      } catch (error) { inside.push(error); throw error }
    }
    const predecessor = vi.fn(async () => ({ research: 'Completed public research' }))
    const model = vi.fn().mockRejectedValueOnce(new GenerationUnavailableError('Safe capacity failure', true, now + 180000)).mockResolvedValue({ report: 'Recovered' })
    const step = validationStepRunner('job', durable)
    const run = async () => { await step('research', predecessor); return step('model', model) }
    await expect(run()).rejects.toBeInstanceOf(RetryAfterError)
    expect(inside[0]).toMatchObject({ retryAfter: new Date(started + 180000).toISOString() })
    expect((inside[0] as RetryAfterError).cause).toBeUndefined()
    expect(saved.has('model')).toBe(false)
    now = started + 180000
    expect(await run()).toEqual({ report: 'Recovered' })
    expect(await run()).toEqual({ report: 'Recovered' })
    expect(predecessor).toHaveBeenCalledOnce(); expect(model).toHaveBeenCalledTimes(2)
  })
  it.each([null, started + 100000])('stops rather than scheduling beyond the remaining heartbeat window: %s', async deadline => {
    mocks.deadline.mockResolvedValue(deadline)
    const step = validationStepRunner('job', async (_id, work) => work())
    const error = await step('model', async () => { throw new GenerationUnavailableError('Temporary capacity', true, started + 120000) }).catch(error => error)
    expect(error).toBeInstanceOf(NonRetriableError)
    expect(error.message).toContain('credits will be refunded')
    expect(error).not.toHaveProperty('retryAfter')
  })
  it('does not schedule a terminal 402 or attach the provider message/body as a cause', async () => {
    const step = validationStepRunner('job', async (_id, work) => work())
    const error = await step('model', async () => { throw new GenerationUnavailableError('PRIVATE-PROVIDER-BODY', false) }).catch(error => error)
    expect(error).toBeInstanceOf(NonRetriableError)
    expect(error.message).not.toContain('PRIVATE-PROVIDER-BODY')
    expect(error.cause).toBeUndefined(); expect(error).not.toHaveProperty('retryAfter')
    expect(mocks.deadline).not.toHaveBeenCalled()
  })
  it('reserves the existing provider execution window rather than waking just before the stale cutoff', async () => {
    mocks.deadline.mockResolvedValue(started + 360000)
    const step = validationStepRunner('job', async (_id, work) => work())
    const error = await step('model', async () => { throw new GenerationUnavailableError('Safe capacity failure', true, started + 120000) }).catch(error => error)
    expect(error).toBeInstanceOf(NonRetriableError)
    expect(error).not.toHaveProperty('retryAfter')
  })
})

// Exercise the actual installed Inngest HTTP adapter and error serializer.
// The executor request is synthetic; it never contacts a hosted queue.
async function sdkResponse(error: GenerationUnavailableError, attempt = 0) {
  const client = new Inngest({ id: 'offline-retry-boundary', isDev: true })
  const fn = client.createFunction({ id: 'probe', triggers: { event: 'synthetic/retry' }, checkpointing: false, retries: 2 }, async ({ step }) => {
    const run = validationStepRunner('job', async <T>(id: string, work: () => Promise<T>) => await step.run(id, work) as T)
    return run('model', async () => { throw error })
  })
  const { POST } = serve({ client, functions: [fn] })
  const event = { name: 'synthetic/retry', data: {} }
  const request = (stepId: string) => new NextRequest('http://localhost/api/inngest?fnId=' + fn.id(client.id) + '&stepId=' + stepId, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ version: 1, event, events: [event], steps: {},
      ctx: { run_id: 'synthetic-run', attempt, max_attempts: 3 } }),
  })
  let response = await POST(request('step'), undefined)
  if (!response.headers.has('retry-after') && response.status === 206) {
    const operations = await response.clone().json()
    const planned = Array.isArray(operations) ? operations.find(operation => operation.op === 'StepPlanned') : undefined
    if (planned) response = await POST(request(planned.id), undefined)
  }
  return response
}

describe('installed Inngest retry headers', () => {
  it('serializes an absolute RetryAfterError deadline from inside step.run without the raw cause', async () => {
    const retryAt = started + 180000
    const response = await sdkResponse(new GenerationUnavailableError('PRIVATE-PROVIDER-BODY', true, retryAt))
    expect(response.headers.get('retry-after')).toBe(new Date(retryAt).toISOString())
    expect(response.headers.get('x-inngest-no-retry')).toBe('false')
    expect(await response.text()).not.toContain('PRIVATE-PROVIDER-BODY')
    expect(fetch).not.toHaveBeenCalled()
  })
  it('marks terminal billing and over-budget delays nonretryable in the installed adapter', async () => {
    for (const error of [new GenerationUnavailableError('Private billing response', false), new GenerationUnavailableError('Safe capacity failure', true, started + 3600000)]) {
      const response = await sdkResponse(error)
      expect(response.headers.get('retry-after')).toBeNull()
      expect(response.headers.get('x-inngest-no-retry')).toBe('true')
    }
  })
  it('retains the finite final-attempt limit instead of turning timed retries into unlimited attempts', async () => {
    const response = await sdkResponse(new GenerationUnavailableError('Safe capacity failure', true, started + 120000), 2)
    expect(response.headers.get('retry-after')).toBeNull()
    expect(response.headers.get('x-inngest-no-retry')).toBe('true')
  })
})
