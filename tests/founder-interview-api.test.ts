import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { PgDialect } from 'drizzle-orm/pg-core'
import { GET, POST, PATCH, DELETE } from '@/app/api/ideas/[ideaId]/interview/route'
import { ideas, founderInterviews } from '@/db/schema'
import { ideaFingerprint, initialInterview } from '@/lib/interview/engine'
import { LEGAL } from '@/lib/legal'
import type { InterviewState } from '@/lib/interview/schema'

const mocks = vi.hoisted(() => ({ user: vi.fn(), owner: vi.fn(), idea: vi.fn(), interview: vi.fn(), lock: vi.fn(), update: vi.fn(),
  insert: vi.fn(), remove: vi.fn(), limit: vi.fn(), tailor: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: mocks.user } }) }))
vi.mock('@/lib/rate-limit', () => ({ rateLimitCheck: mocks.limit }))
vi.mock('@/lib/interview/engine', async original => ({ ...await original<typeof import('@/lib/interview/engine')>(), tailorInterview: mocks.tailor }))
vi.mock('@/db', () => {
  const connection = {
    select: () => ({ from: (table: unknown) => ({ where: (condition: unknown) => ({ for: () => mocks.lock(table, condition) }) }) }),
    update: () => ({ set: (value: unknown) => ({ where: (condition: unknown) => ({ returning: () => mocks.update(value, condition) }) }) }),
    insert: () => ({ values: (value: unknown) => ({ onConflictDoNothing: () => mocks.insert(value) }) }),
    delete: () => ({ where: (condition: unknown) => ({ returning: () => mocks.remove(condition) }) }),
  }
  return { db: { ...connection,
    query: { users: { findFirst: mocks.owner }, ideas: { findFirst: mocks.idea }, founderInterviews: { findFirst: mocks.interview } },
    transaction: async (work: (tx: unknown) => unknown) => work(connection),
  } }
})

const ideaId = '11111111-1111-4111-8111-111111111111'
const draft = { id: ideaId, userId: 'owner-id', isActive: true, isReadOnly: false, name: 'Test venture', industry: 'Retail',
  product: 'A stock forecasting application', targetCustomer: 'Independent shop owners', location: 'India', businessModel: 'Monthly subscription',
  coreProblem: 'Owners cannot forecast inventory costs', proposedSolution: 'A simple stock and cash-flow forecast' }
type Row = typeof founderInterviews.$inferSelect
let stored: Row | null
let currentIdea = { ...draft }
const initialRow = (): Row => ({ id: '22222222-2222-4222-8222-222222222222', ideaId, userId: 'owner-id', ideaFingerprint: ideaFingerprint(draft),
  noticeVersion: LEGAL.version, consentedAt: new Date(), state: initialInterview(draft), version: 1, createdAt: new Date(), updatedAt: new Date() })
const context = () => ({ params: Promise.resolve({ ideaId }) })
const request = (method: string, body: unknown = {}, origin = 'https://validore.tech') => new NextRequest('https://validore.tech/api/ideas/' + ideaId + '/interview', {
  method, headers: { origin, 'content-type': 'application/json' }, ...(method === 'GET' ? {} : { body: JSON.stringify(body) }),
})
const input = () => ({ action: 'answer', questionId: stored!.state.nextQuestion!.id, version: stored!.version,
  answer: 'Independent shop owners in Pune who purchase stock monthly.', evidence: 'first_hand', skipped: false })

beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://validore.tech')
  stored = initialRow(); currentIdea = { ...draft }
  mocks.user.mockResolvedValue({ data: { user: { id: 'auth-id', email_confirmed_at: '2026-11-01' } } })
  mocks.owner.mockResolvedValue({ id: 'owner-id', preferredAiProvider: 'free_models' })
  mocks.idea.mockImplementation(async () => currentIdea)
  mocks.interview.mockImplementation(async () => stored)
  mocks.limit.mockResolvedValue({ success: true })
  mocks.tailor.mockImplementation(async (_idea: unknown, state: InterviewState) => state)
  mocks.lock.mockImplementation(async table => table === ideas ? [currentIdea] : stored ? [stored] : [])
  mocks.update.mockImplementation(async (value, condition) => {
    const params = new PgDialect().sqlToQuery(condition).params
    if (!stored || params.length === 3 && params[2] !== stored.version) return []
    stored = { ...stored, ...value }
    return [stored]
  })
  mocks.remove.mockImplementation(async condition => {
    const params = new PgDialect().sqlToQuery(condition).params
    if (!stored || params[2] !== stored.version) return []
    const id = stored.id; stored = null; return [{ id }]
  })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })

describe('founder interview authorization and consent', () => {
  it('rejects anonymous access before database reads', async () => {
    mocks.user.mockResolvedValue({ data: { user: null } })
    expect((await GET(request('GET'), context())).status).toBe(401)
    expect(mocks.owner).not.toHaveBeenCalled()
  })
  it('does not load an interview unless the idea belongs to the authenticated account', async () => {
    mocks.idea.mockResolvedValue(null)
    expect((await GET(request('GET'), context())).status).toBe(404)
    expect(mocks.interview).not.toHaveBeenCalled()
    expect(new PgDialect().sqlToQuery(mocks.idea.mock.calls[0][0].where).params).toEqual([ideaId, 'owner-id'])
  })
  it('requires a verified email and current notice acknowledgment to start', async () => {
    expect((await POST(request('POST', { consent: true, noticeVersion: 'old' }), context())).status).toBe(400)
    mocks.user.mockResolvedValue({ data: { user: { id: 'auth-id' } } })
    expect((await POST(request('POST', { consent: true, noticeVersion: LEGAL.version }), context())).status).toBe(403)
    expect(mocks.insert).not.toHaveBeenCalled()
  })
  it('starts or reuses the interview without calling an AI provider', async () => {
    const response = await POST(request('POST', { consent: true, noticeVersion: LEGAL.version }), context())
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ ideaId, userId: 'owner-id', noticeVersion: LEGAL.version }))
    expect(mocks.tailor).not.toHaveBeenCalled()
  })
  it.each(['POST', 'PATCH', 'DELETE'])('rejects cross-origin %s before authentication or mutation', async method => {
    const handler = { POST, PATCH, DELETE }[method as 'POST' | 'PATCH' | 'DELETE']
    expect((await handler(request(method, {}, 'https://attacker.example'), context())).status).toBe(403)
    expect(mocks.user).not.toHaveBeenCalled()
  })
})

describe('durable interview answer updates', () => {
  it('stores the answer before model work and makes identical retries idempotent', async () => {
    const submitted = input()
    mocks.tailor.mockImplementation(async (_idea, state) => {
      expect(stored?.state.answers[0].text).toBe(submitted.answer)
      return state
    })
    const first = await PATCH(request('PATCH', submitted), context())
    expect(first.status).toBe(200)
    const updates = mocks.update.mock.calls.length
    const retried = await PATCH(request('PATCH', submitted), context())
    expect(retried.status).toBe(200)
    expect(stored?.state.answers).toHaveLength(1)
    expect(mocks.tailor).toHaveBeenCalledOnce()
    expect(mocks.update).toHaveBeenCalledTimes(updates)
  })
  it('saves an unknown answer without spending a model call', async () => {
    const response = await PATCH(request('PATCH', { ...input(), skipped: true, answer: '' }), context())
    expect(response.status).toBe(200)
    expect(stored?.state.answers[0]).toMatchObject({ text: '', evidence: 'unknown', skipped: true })
    expect(mocks.tailor).not.toHaveBeenCalled()
  })
  it('preserves the saved answer when the daily tailoring limit is reached', async () => {
    mocks.limit.mockImplementation(async (_id, kind) => ({ success: kind !== 'interview-daily' }))
    expect((await PATCH(request('PATCH', input()), context())).status).toBe(200)
    expect(stored?.state.answers).toHaveLength(1)
    expect(stored?.state.method).toBe('guided')
    expect(mocks.tailor).not.toHaveBeenCalled()
  })
  it('does not let stale tabs or a changed brief overwrite answers', async () => {
    expect((await PATCH(request('PATCH', { ...input(), version: 9 }), context())).status).toBe(409)
    currentIdea.location = 'Brazil'
    expect((await PATCH(request('PATCH', input()), context())).status).toBe(409)
    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.tailor).not.toHaveBeenCalled()
  })
  it('does not resurrect a deleted interview when a model response arrives late', async () => {
    mocks.tailor.mockImplementation(async (_idea, state) => { stored = null; return state })
    const response = await PATCH(request('PATCH', input()), context())
    expect(await response.json()).toEqual({ interview: null })
    expect(stored).toBeNull()
    const lastCondition = mocks.update.mock.calls[1][1]
    expect(new PgDialect().sqlToQuery(lastCondition).params).toEqual(['22222222-2222-4222-8222-222222222222', 'owner-id', 2])
  })
  it('returns the newer version rather than overwriting it with a late model response', async () => {
    mocks.tailor.mockImplementation(async (_idea, state) => {
      stored = { ...stored!, version: stored!.version + 1, state: { ...stored!.state, complete: true, nextQuestion: null } }
      return state
    })
    const response = await PATCH(request('PATCH', input()), context())
    expect((await response.json()).interview.state.complete).toBe(true)
    expect(stored?.version).toBe(3)
  })
  it('requires an owner-scoped, matching version before clearing an interview', async () => {
    expect((await DELETE(request('DELETE', { version: 5 }), context())).status).toBe(409)
    expect(stored).not.toBeNull()
    expect((await DELETE(request('DELETE', { version: 1 }), context())).status).toBe(200)
    expect(stored).toBeNull()
    expect(new PgDialect().sqlToQuery(mocks.remove.mock.calls[1][0]).params).toEqual([ideaId, 'owner-id', 1])
  })
})
