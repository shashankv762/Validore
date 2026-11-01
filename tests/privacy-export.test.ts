import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { PgDialect } from 'drizzle-orm/pg-core'
import { GET } from '@/app/api/me/data/route'
import { exportableProfile } from '@/lib/privacy-export'

const mocks = vi.hoisted(() => ({ user: vi.fn(), owner: vi.fn(), rows: vi.fn(), where: vi.fn(), limit: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: mocks.user } }) }))
vi.mock('@/lib/rate-limit', () => ({ rateLimitCheck: mocks.limit }))
vi.mock('@/db', () => ({ db: {
  query: { users: { findFirst: mocks.owner } },
  select: () => ({ from: () => ({ where: (condition: unknown) => { mocks.where(condition); return { orderBy: () => ({ limit: mocks.rows }) } } }) }),
} }))
const profile = { id: 'owner-id', email: 'founder@example.com', tier: 'free', createdAt: new Date(), creditBalance: 100,
  purchasedCredits: 0, preferredAiProvider: 'free_models', encryptedOpenrouterKey: 'private-ciphertext', supabaseId: 'auth-id', stripeCustomerId: 'private-reference' }
beforeEach(() => {
  vi.resetAllMocks()
  mocks.user.mockResolvedValue({ data: { user: { id: 'auth-id' } } })
  mocks.owner.mockResolvedValue(profile); mocks.limit.mockResolvedValue({ success: true }); mocks.rows.mockResolvedValue([])
})
const request = (query = '') => new NextRequest('https://validore.tech/api/me/data' + query)

describe('account export', () => {
  it('excludes provider keys and authentication/billing identifiers from the portable profile', async () => {
    expect(exportableProfile(profile)).not.toHaveProperty('encryptedOpenrouterKey')
    const response = await GET(request())
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    const text = await response.text()
    expect(text).toContain('founder@example.com')
    expect(text).not.toContain('private-ciphertext')
    expect(text).not.toContain('auth-id')
    expect(text).not.toContain('private-reference')
  })
  it('refuses anonymous requests and unrecognized collections', async () => {
    expect((await GET(request('?section=users'))).status).toBe(400)
    expect((await GET(request('?section=__proto__'))).status).toBe(400)
    mocks.user.mockResolvedValue({ data: { user: null } })
    expect((await GET(request('?section=interviews'))).status).toBe(401)
    expect(mocks.rows).not.toHaveBeenCalled()
  })
  it('applies owner and cursor predicates to every exported page', async () => {
    const cursor = '11111111-1111-4111-8111-111111111111'
    mocks.rows.mockResolvedValue(Array.from({ length: 6 }, (_, index) => ({ id: 'row-' + index, userId: 'owner-id' })))
    const response = await GET(request('?section=interviews&after=' + cursor))
    const payload = await response.json()
    expect(payload.records).toHaveLength(5)
    expect(payload.nextCursor).toBe('row-4')
    expect(new PgDialect().sqlToQuery(mocks.where.mock.calls[0][0]).params).toEqual(['owner-id', cursor])
    expect(mocks.rows).toHaveBeenCalledWith(6)
  })
  it('rate-limits exports before reading potentially large collections', async () => {
    mocks.limit.mockResolvedValue({ success: false })
    expect((await GET(request('?section=reports'))).status).toBe(429)
    expect(mocks.rows).not.toHaveBeenCalled()
  })
})
