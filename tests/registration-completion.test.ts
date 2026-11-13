import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { LEGAL } from '@/lib/legal'
const mocks = vi.hoisted(() => ({ user: vi.fn(), sync: vi.fn(), limit: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: mocks.user } }) }))
vi.mock('@/lib/auth-sync', () => ({ syncUserToDatabase: mocks.sync }))
vi.mock('@/lib/registration-limit', () => ({ registrationLimit: mocks.limit }))
import { POST } from '@/app/api/auth/complete-signup/route'
const identity = { id: 'new-auth-id', email: 'founder@example.com', email_confirmed_at: '2026-11-12T00:00:00Z' }
const request = (body: object = {}, origin = 'https://validore.example') => new NextRequest('https://validore.example/api/auth/complete-signup', {
  method: 'POST', headers: { origin, 'content-type': 'application/json' },
  body: JSON.stringify({ consent: true, policyVersion: LEGAL.version, next: '/dashboard/reports', ...body }),
})
beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('NODE_ENV', 'production')
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://validore.example')
  vi.stubEnv('AUTH_ALLOWED_ORIGINS', '')
  mocks.user.mockResolvedValue({ data: { user: identity } })
  mocks.sync.mockImplementation(async (_user, options) => options?.createNew ? { id: 'profile-id' } : null)
  mocks.limit.mockResolvedValue({ allowed: true })
})
afterEach(() => vi.unstubAllEnvs())
describe('new profile admission', () => {
  it.each([{ consent: false }, { policyVersion: 'old' }])('requires current consent before provisioning %j', async body => {
    expect((await POST(request(body))).status).toBe(400)
    expect(mocks.sync).not.toHaveBeenCalled()
  })
  it('rejects cross-origin requests and unverified identities', async () => {
    expect((await POST(request({}, 'https://attacker.example'))).status).toBe(403)
    mocks.user.mockResolvedValue({ data: { user: { ...identity, email_confirmed_at: null } } })
    expect((await POST(request())).status).toBe(403)
    expect(mocks.sync).not.toHaveBeenCalled()
  })
  it('creates a profile only after admission succeeds, without trusting client or auth metadata', async () => {
    const response = await POST(request({ userId: 'attacker', terms_version: LEGAL.version }))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ next: '/dashboard/reports' })
    expect(mocks.sync.mock.calls).toEqual([[identity], [identity, { createNew: true }]])
    expect(mocks.limit).toHaveBeenCalledOnce()
    expect(mocks.limit.mock.invocationCallOrder[0]).toBeLessThan(mocks.sync.mock.invocationCallOrder[1])
  })
  it.each([429, 503])('does not grant credits when registration admission returns %s', async status => {
    mocks.limit.mockResolvedValue({ allowed: false, status, message: 'Registration unavailable' })
    expect((await POST(request())).status).toBe(status)
    expect(mocks.sync).toHaveBeenCalledExactlyOnceWith(identity)
  })
  it('keeps an existing identity out of the new-registration limit', async () => {
    mocks.sync.mockResolvedValue({ id: 'existing-profile' })
    expect((await POST(request({ next: '//attacker.example' }))).status).toBe(200)
    expect(mocks.limit).not.toHaveBeenCalled()
    expect(mocks.sync).toHaveBeenCalledExactlyOnceWith(identity)
  })

  it('supports native registration forms and preserves their local return path', async () => {
    const response = await POST(new NextRequest('https://validore.example/api/auth/complete-signup', {
      method: 'POST', headers: { origin: 'https://validore.example', 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ consent: 'on', policyVersion: LEGAL.version, next: '/dashboard/settings' }),
    }))
    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe('https://validore.example/dashboard/settings')
    expect(mocks.limit).toHaveBeenCalledOnce()
  })
})
