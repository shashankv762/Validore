import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from '@/app/api/validate/route'
const mocks = vi.hoisted(() => ({ after: vi.fn(), getUser: vi.fn(), findUser: vi.fn(), findIdea: vi.fn(),
  run: vi.fn(), fail: vi.fn(), deduct: vi.fn(), release: vi.fn(), acquire: vi.fn(), send: vi.fn() }))
vi.mock('next/server', async importOriginal => ({ ...await importOriginal<typeof import('next/server')>(), after: mocks.after }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: mocks.getUser } }) }))
vi.mock('@/db', () => ({ db: {
  query: { users: { findFirst: mocks.findUser }, ideas: { findFirst: mocks.findIdea }, tierConfig: { findFirst: async () => ({ monthlyValidationLimit: 2 }) } },
  transaction: async (fn: (tx: unknown) => unknown) => fn({
    select: () => ({ from: () => ({ where: () => ({ for: async () => [await mocks.findIdea()] }) }) }),
    insert: () => ({ values: () => ({ returning: async () => [{ id: '22222222-2222-4222-8222-222222222222' }] }) }),
  }),
  insert: () => ({ values: () => ({ returning: async () => [{ id: '22222222-2222-4222-8222-222222222222' }] }) }),
  update: () => ({ set: () => ({ where: async () => undefined }) }),
} }))
vi.mock('@/lib/tier-gate', () => ({ checkValidationLimit: async () => ({ allowed: true, remaining: 2 }) }))
vi.mock('@/lib/credits', () => ({ checkCredits: async () => ({ allowed: true, balance: 100 }), deductCredits: mocks.deduct }))
vi.mock('@/lib/rate-limit', () => ({ rateLimitCheck: async () => ({ success: true }), checkAndIncrementConcurrency: mocks.acquire, decrementConcurrency: mocks.release }))
vi.mock('@/lib/validation/jobs', () => ({ runValidationJob: mocks.run, failValidationJob: mocks.fail }))
vi.mock('@/inngest/client', () => ({ inngest: { send: mocks.send } }))
const ideaId = '11111111-1111-4111-8111-111111111111'
const request = (body: string = JSON.stringify({ ideaId })) => new NextRequest('http://localhost/api/validate', { method: 'POST', body })

describe('Validation job lifecycle', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.stubEnv('VALIDATION_RUNNER', 'local')
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'auth-user', email_confirmed_at: '2026-01-01' } } })
    mocks.findUser.mockResolvedValue({ id: 'db-user', tier: 'free', validationsThisMonth: 0 })
    mocks.findIdea.mockResolvedValue({ id: ideaId, userId: 'db-user', isActive: true })
    mocks.deduct.mockResolvedValue(true)
    mocks.acquire.mockResolvedValue({ allowed: true })
    mocks.run.mockResolvedValue(undefined)
    mocks.release.mockResolvedValue(undefined)
    mocks.fail.mockResolvedValue(undefined)
  })
  afterEach(() => vi.unstubAllEnvs())
  it('reserves credits before accepting work and holds concurrency through completion', async () => {
    const res = await POST(request())
    expect(res.status).toBe(202)
    expect(mocks.deduct).toHaveBeenCalledWith('db-user', expect.any(Number), 'VALIDATION', expect.any(String), 2)
    expect(mocks.run).not.toHaveBeenCalled()
    expect(mocks.release).not.toHaveBeenCalled()
    await mocks.after.mock.calls[0][0]()
    expect(mocks.run).toHaveBeenCalledOnce()
    expect(mocks.release).toHaveBeenCalledWith('db-user')
  })
  it('does not start AI work when another request spends the allowance', async () => {
    mocks.deduct.mockResolvedValue(false)
    expect((await POST(request())).status).toBe(409)
    expect(mocks.after).not.toHaveBeenCalled()
    expect(mocks.run).not.toHaveBeenCalled()
    expect(mocks.release).toHaveBeenCalledOnce()
  })
  it('rejects malformed requests before acquiring concurrency', async () => {
    expect((await POST(request('{'))).status).toBe(400)
    expect((await POST(request(JSON.stringify({ ideaId: 'invalid' })))).status).toBe(400)
    expect(mocks.acquire).not.toHaveBeenCalled()
  })
  it('recovers reserved credits if durable enqueue fails', async () => {
    vi.stubEnv('VALIDATION_RUNNER', 'inngest')
    vi.stubEnv('INNGEST_EVENT_KEY', 'test-event-key')
    vi.stubEnv('INNGEST_SIGNING_KEY', 'test-signing-key')
    mocks.send.mockRejectedValue(new Error('queue unavailable'))
    expect((await POST(request())).status).toBe(503)
    expect(mocks.fail).toHaveBeenCalledOnce()
    expect(mocks.acquire).not.toHaveBeenCalled()
  })
})
