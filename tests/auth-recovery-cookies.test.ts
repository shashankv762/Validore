import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { LEGAL } from '@/lib/legal'

const cookies = vi.hoisted(() => ({ values: new Map<string, string>(), set: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: async () => ({
  getAll: () => [...cookies.values].map(([name, value]) => ({ name, value })),
  set: cookies.set,
}) }))
vi.mock('@/lib/rate-limit', () => ({ rateLimitCheck: async () => ({ success: true }) }))
vi.mock('@/lib/auth-sync', () => ({ syncUserToDatabase: vi.fn() }))
import { POST } from '@/app/api/auth/forgot-password/route'
import { POST as signup } from '@/app/api/auth/signup/route'
import { GET as callback } from '@/app/auth/callback/route'

const verifierName = 'sb-project-auth-token-code-verifier'
const previousVerifier = 'base64-' + Buffer.from(JSON.stringify('previous-verifier/recovery')).toString('base64url')

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.supabase.co')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'public-test-key')
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://localhost:3000')
  vi.stubEnv('UPSTASH_REDIS_REST_URL', '')
  vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '')
  cookies.values.clear()
  cookies.values.set(verifierName, previousVerifier)
  cookies.set.mockImplementation((name: string, value: string) => cookies.values.set(name, value))
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

const request = (path = 'forgot-password') => new NextRequest('http://localhost:3000/api/auth/' + path, {
  method: 'POST', headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'founder@example.com', password: 'test-password123', consent: true, policyVersion: LEGAL.version }),
})

describe('Recovery cookies with the installed Supabase SDK', () => {
  it.each([['forgot-password', POST], ['signup', signup]] as const)('preserves the previous verifier when the provider rate limits a repeat %s request', async (path, handler) => {
    const provider = vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 'over_email_send_rate_limit', msg: 'Email rate limit exceeded' }), {
      status: 429, headers: { 'content-type': 'application/json' },
    }))
    vi.stubGlobal('fetch', provider)
    expect((await handler(request(path))).status).toBe(429)
    expect(provider).toHaveBeenCalled()
    expect(cookies.set).not.toHaveBeenCalled()
    expect(cookies.values.get(verifierName)).toBe(previousVerifier)
  })

  it('persists the new verifier after the provider accepts the reset email', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })))
    expect((await POST(request())).status).toBe(200)
    expect(cookies.set).toHaveBeenCalled()
    expect(cookies.values.get(verifierName)).not.toBe(previousVerifier)
    expect(cookies.values.get(verifierName)).toBeTruthy()
  })

  it('does not destroy the current verifier when an older callback link fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 'bad_code_verifier', msg: 'Invalid verifier' }), {
      status: 400, headers: { 'content-type': 'application/json' },
    })))
    const response = await callback(new NextRequest('http://localhost:3000/auth/callback?code=stale-code'))
    expect(response.headers.get('location')).toContain('auth_callback_failed')
    expect(cookies.set).not.toHaveBeenCalled()
    expect(cookies.values.get(verifierName)).toBe(previousVerifier)
  })
})
