import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ auth: vi.fn(), find: vi.fn(), claim: vi.fn(), status: vi.fn(), rate: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: mocks.auth } }) }))
vi.mock('@/db', () => ({ db: { query: { users: { findFirst: mocks.find } } } }))
vi.mock('@/lib/rate-limit', () => ({ rateLimitCheck: mocks.rate }))
vi.mock('@/lib/daily-credits', async importOriginal => ({ ...await importOriginal<typeof import('@/lib/daily-credits')>(), claimDailyCredits: mocks.claim, dailyCreditStatus: mocks.status }))
import { GET, POST } from '@/app/api/credits/daily/route'
const request = (body: unknown = {}, origin = 'https://validore.example') => new NextRequest('https://validore.example/api/credits/daily', {
  method: 'POST', headers: { origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
})
beforeEach(() => {
  vi.clearAllMocks()
  mocks.auth.mockResolvedValue({ data: { user: { id: 'auth-owner', email_confirmed_at: '2026-11-14' } }, error: null })
  mocks.find.mockResolvedValue({ id: 'database-owner' })
  mocks.rate.mockResolvedValue({ success: true })
  mocks.claim.mockResolvedValue({ granted: 10, duplicate: false, claimedToday: true })
  mocks.status.mockResolvedValue({ available: true, claimedToday: false, credits: 10 })
})
describe('Explicit same-origin daily credit claims', () => {
  it('returns private status without granting and uses only the server-resolved account for a claim', async () => {
    const status = await GET()
    expect(status.headers.get('cache-control')).toBe('private, no-store')
    expect(mocks.claim).not.toHaveBeenCalled()
    expect(await (await POST(request())).json()).toMatchObject({ granted: 10 })
    expect(mocks.claim).toHaveBeenCalledWith('database-owner')
  })
  it('rejects cross-origin claims, amounts, forged users, and supplied dates before accounting', async () => {
    expect((await POST(request({}, 'https://attacker.example'))).status).toBe(403)
    for (const body of [{ amount: 200 }, { day: '2026-11-15' }, { userId: 'somebody-else' }]) expect((await POST(request(body))).status).toBe(400)
    expect(mocks.claim).not.toHaveBeenCalled()
  })
  it('requires authentication, a registered profile, verified email, and a bounded request rate', async () => {
    mocks.auth.mockResolvedValueOnce({ data: { user: null }, error: null })
    expect((await POST(request())).status).toBe(401)
    mocks.find.mockResolvedValueOnce(null); expect((await POST(request())).status).toBe(403)
    mocks.auth.mockResolvedValueOnce({ data: { user: { id: 'auth-owner' } }, error: null })
    expect((await POST(request())).status).toBe(403)
    mocks.rate.mockResolvedValueOnce({ success: false }); expect((await POST(request())).status).toBe(429)
    expect(mocks.claim).not.toHaveBeenCalled()
  })
  it('makes network retries a successful no-op after the first grant', async () => {
    mocks.claim.mockResolvedValue({ granted: 0, duplicate: true, claimedToday: true })
    const result = await POST(request())
    expect(result.status).toBe(200); expect(await result.json()).toMatchObject({ granted: 0, duplicate: true })
  })
  it('keeps temporary account outages distinct from signed-out sessions and reports unverified status as unavailable', async () => {
    mocks.auth.mockResolvedValueOnce({ data: { user: null }, error: { message: 'Account access is temporarily unavailable.', status: 503 } })
    expect((await GET()).status).toBe(503)
    mocks.auth.mockResolvedValueOnce({ data: { user: null }, error: { message: 'The workspace is under maintenance.', status: 503 } })
    expect((await POST(request())).status).toBe(503)
    mocks.auth.mockResolvedValueOnce({ data: { user: { id: 'auth-owner' } }, error: null })
    expect(await (await GET()).json()).toMatchObject({ available: false, emailVerified: false })
    expect(mocks.claim).not.toHaveBeenCalled()
  })
})
