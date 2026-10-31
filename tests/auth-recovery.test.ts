import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({ reset: vi.fn(), limit: vi.fn(), commit: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClientWithDeferredCookies: async () => ({ client: { auth: { resetPasswordForEmail: mocks.reset } }, commitCookies: mocks.commit }) }))
vi.mock('@/lib/rate-limit', () => ({ rateLimitCheck: mocks.limit }))
import { POST } from '@/app/api/auth/forgot-password/route'

const request = (origin = 'http://localhost:3000', email = 'founder@example.com') => new NextRequest('http://localhost:3000/api/auth/forgot-password', {
  method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ email }),
})

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://localhost:3000')
  mocks.reset.mockResolvedValue({ error: null })
  mocks.limit.mockResolvedValue({ success: true })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })

describe('Password recovery', () => {
  it('uses the recovery callback on the served origin', async () => {
    expect((await POST(request())).status).toBe(200)
    expect(mocks.reset).toHaveBeenCalledWith('founder@example.com', { redirectTo: 'http://localhost:3000/auth/callback?next=/auth/reset-password' })
    expect(mocks.commit).toHaveBeenCalledOnce()
  })

  it('rejects invalid requests before contacting the provider', async () => {
    expect((await POST(request('https://untrusted.example'))).status).toBe(403)
    expect((await POST(request('http://localhost:3000', 'invalid'))).status).toBe(400)
    expect(mocks.reset).not.toHaveBeenCalled()
  })

  it('stops locally rate-limited requests before sending email', async () => {
    mocks.limit.mockResolvedValue({ success: false })
    expect((await POST(request())).status).toBe(429)
    expect(mocks.commit).not.toHaveBeenCalled()
    expect(mocks.reset).not.toHaveBeenCalled()
  })

  it('preserves provider email rate limits', async () => {
    mocks.reset.mockResolvedValue({ error: { status: 429, code: 'over_email_send_rate_limit' } })
    expect((await POST(request())).status).toBe(429)
    expect(mocks.commit).not.toHaveBeenCalled()
  })

  it.each([0, 500])('reports provider outages without leaking error details (%s)', async status => {
    mocks.reset.mockResolvedValue({ error: { status, code: 'unexpected_failure', message: 'private connection details' } })
    const response = await POST(request())
    expect(response.status).toBe(503)
    expect(mocks.commit).not.toHaveBeenCalled()
    expect(await response.text()).not.toContain('private connection details')
    expect(console.error).toHaveBeenCalledWith('[auth/recovery] Provider rejected reset', { status, code: 'unexpected_failure' })
  })

  it('keeps account existence private for provider rejections', async () => {
    mocks.reset.mockResolvedValue({ error: { status: 400, code: 'user_not_found' } })
    const response = await POST(request())
    expect(response.status).toBe(200)
    expect(await response.text()).toContain('If an account uses this email')
  })

  it('contains unexpected failures without exposing credentials', async () => {
    mocks.reset.mockRejectedValue(new Error('private connection details'))
    const response = await POST(request())
    expect(response.status).toBe(503)
    expect(await response.text()).not.toContain('private connection details')
  })
})
