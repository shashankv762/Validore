import { createHash } from 'node:crypto'
import { NextRequest } from 'next/server'
import { PgDialect } from 'drizzle-orm/pg-core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ auth: vi.fn(), account: vi.fn(), session: vi.fn(), rate: vi.fn(),
  start: vi.fn(), status: vi.fn(), cancel: vi.fn(), grant: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: mocks.auth } }) }))
vi.mock('@/db', () => ({ db: { query: { users: { findFirst: mocks.account }, rewardedAdSessions: { findFirst: mocks.session } } } }))
vi.mock('@/lib/rate-limit', () => ({ rateLimitCheck: mocks.rate }))
vi.mock('@/lib/ads/rewards', async importActual => ({ ...await importActual<object>(),
  startRewardSession: mocks.start, rewardStatus: mocks.status, cancelRewardSession: mocks.cancel, grantAdReward: mocks.grant,
}))
import { GET, POST, DELETE } from '@/app/api/credits/rewards/route'
import { GET as player } from '@/app/api/credits/rewards/player/route'
import { GET as callback } from '@/app/api/webhooks/applixir/route'
import { signupWeeklyIpLimit } from '@/lib/signup-policy'

const origin = 'https://validore.example'
const owner = '11111111-1111-4111-8111-111111111111'
const sessionId = '22222222-2222-4222-8222-222222222222'
const secret = 'test-secret-for-the-provider-only-123456789'
const url = origin + '/api/credits/rewards'
const request = (method = 'GET', body?: unknown, source = origin) => new NextRequest(url, {
  method, headers: { origin: source, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
})
const signed = () => {
  const params = new URLSearchParams({ gameApiKey: 'public-test-key', gameId: '123', userId: sessionId, tid: 'test-transaction' })
  params.set('signature', createHash('md5').update('public-test-key' + '123' + sessionId + 'test-transaction' + secret).digest('hex'))
  return origin + '/api/webhooks/applixir?' + params
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('NEXT_PUBLIC_APP_URL', origin)
  vi.stubEnv('REWARDED_ADS_ENABLED', 'true')
  vi.stubEnv('APPLIXIR_API_KEY', 'public-test-key')
  vi.stubEnv('APPLIXIR_GAME_ID', '123')
  vi.stubEnv('APPLIXIR_S2S_SECRET', secret)
  mocks.auth.mockResolvedValue({ data: { user: { id: 'supabase-owner', email_confirmed_at: new Date().toISOString() } } })
  mocks.account.mockResolvedValue({ id: owner })
  mocks.session.mockResolvedValue({ id: sessionId, provider: 'applixir', status: 'pending', expiresAt: new Date(Date.now() + 60_000) })
  mocks.rate.mockResolvedValue({ success: true })
  mocks.status.mockResolvedValue({ enabled: true, creditsPerAd: 10 })
  mocks.start.mockResolvedValue({ session: { id: sessionId } })
  mocks.grant.mockResolvedValue('rewarded')
})
afterEach(() => vi.unstubAllEnvs())

describe('reward endpoints', () => {
  it('rejects anonymous users before looking up reward records', async () => {
    mocks.auth.mockResolvedValue({ data: { user: null } })
    expect((await GET(request())).status).toBe(401)
    expect((await POST(request('POST', { consent: true }))).status).toBe(401)
    expect(mocks.account).not.toHaveBeenCalled()
    expect(mocks.start).not.toHaveBeenCalled()
  })

  it('requires same-origin opt-in and verified email to start', async () => {
    expect((await POST(request('POST', { consent: true }, 'https://attacker.example'))).status).toBe(403)
    expect((await POST(request('POST', { consent: false }))).status).toBe(400)
    expect((await POST(request('POST', { consent: true, credits: 1000 }))).status).toBe(400)
    mocks.auth.mockResolvedValue({ data: { user: { id: 'supabase-owner' } } })
    expect((await POST(request('POST', { consent: true }))).status).toBe(403)
    expect(mocks.start).not.toHaveBeenCalled()
  })

  it('uses only the authenticated owner and never grants on a browser request', async () => {
    const response = await POST(request('POST', { consent: true }))
    expect(response.status).toBe(201)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(mocks.start).toHaveBeenCalledWith(owner, expect.objectContaining({ provider: 'applixir' }))
    expect(mocks.grant).not.toHaveBeenCalled()
    await DELETE(request('DELETE', { sessionId }))
    expect(mocks.cancel).toHaveBeenCalledWith(owner, sessionId)
    expect((await DELETE(request('DELETE', { sessionId }, 'https://attacker.example'))).status).toBe(403)
  })

  it('fails closed when disabled or rate limited and validates status references', async () => {
    vi.stubEnv('REWARDED_ADS_ENABLED', 'false')
    expect(await (await GET(request())).json()).toMatchObject({ enabled: false })
    expect((await POST(request('POST', { consent: true }))).status).toBe(503)
    vi.stubEnv('REWARDED_ADS_ENABLED', 'true')
    expect((await GET(new NextRequest(url + '?sessionId=invalid'))).status).toBe(400)
    mocks.rate.mockResolvedValue({ success: false })
    const response = await POST(request('POST', { consent: true }))
    expect(response.status).toBe(429)
    expect(response.headers.get('retry-after')).toBe('60')
    expect(mocks.start).not.toHaveBeenCalled()
  })

  it('verifies signatures before using a callback and ignores caller reward amounts', async () => {
    expect((await callback(new NextRequest(origin + '/api/webhooks/applixir?userId=' + sessionId))).status).toBe(403)
    expect(mocks.grant).not.toHaveBeenCalled()
    expect((await callback(new NextRequest(signed() + '&credits=999999&customData=another-user'))).status).toBe(200)
    expect(mocks.grant).toHaveBeenCalledExactlyOnceWith({ provider: 'applixir', sessionId, transactionId: 'test-transaction' }, expect.objectContaining({ secret }))
  })

  it('requests a provider retry when a verified reward cannot be persisted', async () => {
    mocks.grant.mockRejectedValue(new Error('database offline'))
    const response = await callback(new NextRequest(signed()))
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'Please retry' })
    expect(response.headers.get('cache-control')).toBe('private, no-store')
  })

  it('scopes the player to an owned active session and isolates its content policy', async () => {
    const response = await player(new NextRequest(url + '/player?sessionId=' + sessionId))
    expect(response.status).toBe(200)
    const query = new PgDialect().sqlToQuery(mocks.session.mock.calls[0][0].where)
    expect(query.params).toContain(owner)
    expect(query.params).toContain(sessionId)
    expect(response.headers.get('x-frame-options')).toBe('SAMEORIGIN')
    expect(response.headers.get('content-security-policy')).toContain("frame-ancestors 'self'")
    expect(response.headers.get('content-security-policy')).toMatch(/script-src 'nonce-[^']+' 'strict-dynamic'/)
    const html = await response.text()
    expect(html).toContain('applixir.app.v6.1.0.js')
    expect(html).not.toContain(secret)
    expect(html).not.toContain(owner)
    mocks.session.mockResolvedValue(null)
    expect((await player(new NextRequest(url + '/player?sessionId=' + sessionId))).status).toBe(409)
    mocks.session.mockResolvedValue({ status: 'rewarded' })
    expect((await player(new NextRequest(url + '/player?sessionId=' + sessionId))).status).toBe(409)
  })

  it('cannot render an ad for an unverified account', async () => {
    mocks.auth.mockResolvedValue({ data: { user: { id: 'supabase-owner' } } })
    expect((await player(new NextRequest(url + '/player?sessionId=' + sessionId))).status).toBe(401)
    expect(mocks.session).not.toHaveBeenCalled()
  })
})

describe('shared-network signup policy', () => {
  it('allows a bounded pilot setting and never accepts an unlimited or invalid limit', () => {
    expect(signupWeeklyIpLimit('10')).toBe(10)
    for (const value of ['', '0', '-1', '21', 'NaN', '1.5', 'Infinity']) expect(signupWeeklyIpLimit(value)).toBe(3)
  })
})
