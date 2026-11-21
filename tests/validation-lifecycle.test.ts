import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from '@/app/api/validate/route'
import { ValidationAdmissionError } from '@/lib/validation-admission'
const mocks = vi.hoisted(() => ({ after: vi.fn(), getUser: vi.fn(), findUser: vi.fn(), findIdea: vi.fn(),
  run: vi.fn(), fail: vi.fn(), admit: vi.fn(), release: vi.fn(), acquire: vi.fn(), send: vi.fn(), dispatch: vi.fn(), findJob: vi.fn() }))
vi.mock('next/server', async importOriginal => ({ ...await importOriginal<typeof import('next/server')>(), after: mocks.after }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: mocks.getUser } }) }))
vi.mock('@/db', () => ({ db: { query: { users: { findFirst: mocks.findUser }, ideas: { findFirst: mocks.findIdea },
  validationJobs: { findFirst: mocks.findJob } } } }))
vi.mock('@/lib/validation-admission', () => ({ admitValidation: mocks.admit,
  ValidationAdmissionError: class extends Error { constructor(message: string, readonly status: number) { super(message) } } }))
vi.mock('@/lib/rate-limit', () => ({ rateLimitCheck: async () => ({ success: true }), checkAndIncrementConcurrency: mocks.acquire, decrementConcurrency: mocks.release }))
vi.mock('@/lib/validation/jobs', () => ({ runValidationJob: mocks.run, failValidationJob: mocks.fail }))
vi.mock('@/inngest/client', () => ({ inngest: { send: mocks.send } }))
vi.mock('@/lib/validation/dispatch', () => ({ dispatchValidationJob: mocks.dispatch }))
const ideaId = '11111111-1111-4111-8111-111111111111'
const jobId = '22222222-2222-4222-8222-222222222222'
const request = (body: string = JSON.stringify({ ideaId })) => new NextRequest('http://localhost/api/validate', { method: 'POST', body })
type AdmissionInput = { reserveConcurrency?: (limit: number) => Promise<boolean> }

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('VALIDATION_RUNNER', 'local')
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'auth-user', email_confirmed_at: '2026-01-01' } } })
  mocks.findUser.mockResolvedValue({ id: 'db-user', tier: 'free', validationsThisMonth: 0 })
  mocks.findIdea.mockResolvedValue({ id: ideaId, userId: 'db-user', isActive: true })
  mocks.findJob.mockResolvedValue(null)
  mocks.admit.mockImplementation(async (input: AdmissionInput) => {
    if (input.reserveConcurrency && !await input.reserveConcurrency(1)) throw new ValidationAdmissionError('Too many concurrent requests.', 429)
    return { job: { id: jobId, status: 'pending' }, reused: false }
  })
  mocks.acquire.mockResolvedValue({ allowed: true })
  mocks.run.mockResolvedValue(undefined); mocks.release.mockResolvedValue(undefined); mocks.fail.mockResolvedValue(undefined)
})
afterEach(() => vi.unstubAllEnvs())

describe('Validation job lifecycle', () => {
  it('requires the durable queue in production before reserving any credits', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    expect((await POST(request())).status).toBe(503)
    expect(mocks.admit).not.toHaveBeenCalled(); expect(mocks.acquire).not.toHaveBeenCalled(); expect(mocks.after).not.toHaveBeenCalled()
  })
  it('reserves atomically before accepting work and holds concurrency through completion', async () => {
    expect((await POST(request())).status).toBe(202)
    expect(mocks.admit).toHaveBeenCalledWith({ userId: 'db-user', supabaseId: 'auth-user', ideaId, emailVerified: true,
      reserveConcurrency: expect.any(Function) })
    expect(mocks.run).not.toHaveBeenCalled(); expect(mocks.release).not.toHaveBeenCalled()
    await mocks.after.mock.calls[0][0]()
    expect(mocks.run).toHaveBeenCalledWith(jobId); expect(mocks.release).toHaveBeenCalledWith('db-user')
  })
  it('uses the concurrency allowance from the locked current-entitlement service', async () => {
    mocks.admit.mockImplementation(async (input: AdmissionInput) => {
      await input.reserveConcurrency!(3)
      return { job: { id: jobId, status: 'pending' }, reused: false }
    })
    expect((await POST(request())).status).toBe(202)
    expect(mocks.acquire).toHaveBeenCalledWith('db-user', 3)
  })
  it.each(['blocked', 'deactivated'])('rejects an account that is %s before reservation', async accountStatus => {
    mocks.findUser.mockResolvedValue({ id: 'db-user', tier: 'free', accountStatus, validationsThisMonth: 0 })
    expect((await POST(request())).status).toBe(403)
    expect(mocks.acquire).not.toHaveBeenCalled(); expect(mocks.admit).not.toHaveBeenCalled()
  })
  it('does not start work and releases concurrency when atomic admission rolls back', async () => {
    mocks.admit.mockImplementation(async (input: AdmissionInput) => {
      await input.reserveConcurrency!(1)
      throw new ValidationAdmissionError('Credits or monthly allowance changed.', 409)
    })
    expect((await POST(request())).status).toBe(409)
    expect(mocks.after).not.toHaveBeenCalled(); expect(mocks.run).not.toHaveBeenCalled(); expect(mocks.release).toHaveBeenCalledOnce()
  })
  it('reuses an accepted job without reserving or scheduling a second analysis', async () => {
    mocks.findJob.mockResolvedValue({ id: 'existing-job', status: 'running' })
    const response = await POST(request())
    expect(response.status).toBe(202); expect(await response.json()).toMatchObject({ jobId: 'existing-job', reused: true })
    expect(mocks.admit).not.toHaveBeenCalled(); expect(mocks.acquire).not.toHaveBeenCalled()
    expect(mocks.after).not.toHaveBeenCalled(); expect(mocks.send).not.toHaveBeenCalled()
  })
  it('reuses the lock winner without acquiring concurrency or scheduling another analysis', async () => {
    mocks.admit.mockResolvedValue({ job: { id: 'race-winner', status: 'pending' }, reused: true })
    const response = await POST(request())
    expect(response.status).toBe(202); expect(await response.json()).toMatchObject({ jobId: 'race-winner', reused: true })
    expect(mocks.acquire).not.toHaveBeenCalled(); expect(mocks.after).not.toHaveBeenCalled(); expect(mocks.release).not.toHaveBeenCalled()
  })
  it('rejects malformed requests before acquiring concurrency', async () => {
    expect((await POST(request('{'))).status).toBe(400)
    expect((await POST(request(JSON.stringify({ ideaId: 'invalid' })))).status).toBe(400)
    expect(mocks.acquire).not.toHaveBeenCalled(); expect(mocks.admit).not.toHaveBeenCalled()
  })
  it('retains an admitted pending job after an ambiguous durable enqueue acknowledgement', async () => {
    vi.stubEnv('VALIDATION_RUNNER', 'inngest'); vi.stubEnv('INNGEST_EVENT_KEY', 'test-event-key'); vi.stubEnv('INNGEST_SIGNING_KEY', 'test-signing-key')
    mocks.dispatch.mockResolvedValue(false)
    expect((await POST(request())).status).toBe(202)
    expect(mocks.dispatch).toHaveBeenCalledWith(jobId)
    expect(mocks.fail).not.toHaveBeenCalled(); expect(mocks.acquire).not.toHaveBeenCalled()
    expect(mocks.admit.mock.calls[0][0]).not.toHaveProperty('reserveConcurrency')
  })
})
