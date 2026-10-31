import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  signin: vi.fn(), signup: vi.fn(), exchange: vi.fn(), verify: vi.fn(), signout: vi.fn(), sync: vi.fn(), commit: vi.fn(),
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: {
    signInWithPassword: mocks.signin, signUp: mocks.signup,
    exchangeCodeForSession: mocks.exchange, verifyOtp: mocks.verify, signOut: mocks.signout,
  } }),
  createClientWithDeferredCookies: async () => ({ client: { auth: { signInWithPassword: mocks.signin, signUp: mocks.signup, signOut: mocks.signout, exchangeCodeForSession: mocks.exchange, verifyOtp: mocks.verify } }, commitCookies: mocks.commit }),
}))
vi.mock('@/lib/auth-sync', () => ({ syncUserToDatabase: mocks.sync }))

import { POST as signin } from '@/app/api/auth/signin/route'
import { POST as signup } from '@/app/api/auth/signup/route'
import { GET as callback } from '@/app/auth/callback/route'
import { authOrigin, validAuthOrigin } from '@/lib/auth-form'

const identity = { user: { id: 'auth-id', email: 'founder@example.com' }, session: { access_token: 'test-token' } }
const formRequest = (path: string, next = '/dashboard/reports') => new NextRequest('http://localhost:3001/api/auth/' + path, {
  method: 'POST', headers: { origin: 'http://localhost:3001', 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ email: 'founder@example.com', password: 'password123', next }),
})

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('NODE_ENV', 'test')
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://localhost:3000')
  vi.stubEnv('UPSTASH_REDIS_REST_URL', '')
  vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '')
  mocks.signin.mockResolvedValue({ data: identity, error: null })
  mocks.signup.mockResolvedValue({ data: identity, error: null })
  mocks.exchange.mockResolvedValue({ data: identity, error: null })
  mocks.verify.mockResolvedValue({ data: identity, error: null })
  mocks.signout.mockResolvedValue({ error: null })
  mocks.sync.mockResolvedValue({ id: 'profile-id' })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })

describe('Auth origins and native form redirects', () => {
  it('supports the loopback browser host when Next dev normalizes request.url', () => {
    const request = new NextRequest('http://localhost:3001/auth/callback', { headers: { host: '127.0.0.1:3001' } })
    expect(authOrigin(request)).toBe('http://127.0.0.1:3001')
    const form = new NextRequest('http://localhost:3001/api/auth/signin', { headers: { host: '127.0.0.1:3001', origin: 'http://127.0.0.1:3001' } })
    expect(validAuthOrigin(form)).toBe(true)
    vi.stubEnv('NODE_ENV', 'production')
    expect(validAuthOrigin(form)).toBe(false)
  })
  it('accepts the served app origin when the configured development port differs', async () => {
    const response = await signin(formRequest('signin'))
    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe('http://localhost:3001/dashboard/reports')
    expect(mocks.signin).toHaveBeenCalledOnce()
  })

  it('keeps signup confirmation and completion on the served app origin', async () => {
    const response = await signup(formRequest('signup'))
    expect(mocks.signup).toHaveBeenCalledWith(expect.objectContaining({
      options: { emailRedirectTo: 'http://localhost:3001/auth/callback' },
    }))
    expect(response.headers.get('location')).toBe('http://localhost:3001/dashboard')
  })

  it('accepts a configured public origin behind a proxy and rejects other origins', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://app.example.com')
    const trusted = new NextRequest('http://localhost:3000/api/auth/signin', { headers: { origin: 'https://app.example.com' } })
    const untrusted = new NextRequest(trusted.url, { headers: { origin: 'https://attacker.example' } })
    expect(validAuthOrigin(trusted)).toBe(true)
    expect(authOrigin(trusted)).toBe('https://app.example.com')
    expect(validAuthOrigin(untrusted)).toBe(false)
  })

  it('does not redirect a signed-in form to another site', async () => {
    const response = await signin(formRequest('signin', '//attacker.example'))
    expect(response.headers.get('location')).toBe('http://localhost:3001/dashboard')
  })
})

describe('Profile provisioning failures', () => {
  it.each([['signin', signin], ['signup', signup]] as const)('clears the new %s session if the profile database fails', async (path, handler) => {
    mocks.sync.mockRejectedValue(new Error('private database details'))
    const response = await handler(formRequest(path))
    expect(mocks.signout).toHaveBeenCalledWith({ scope: 'local' })
    expect(response.headers.get('location')).toContain('/auth/' + path + '?error=')
    expect(response.headers.get('location')).not.toContain('private database details')
  })

  it('clears the new session when an identity cannot be provisioned', async () => {
    mocks.sync.mockResolvedValue(null)
    const response = await signin(formRequest('signin'))
    expect(mocks.signout).toHaveBeenCalledWith({ scope: 'local' })
    expect(response.headers.get('location')).toContain('needs+support')
  })
})

describe('Provider failures', () => {
  it('explains a provider password-policy rejection without creating a profile or session', async () => {
    mocks.signup.mockResolvedValue({ data: { user: null, session: null }, error: { status: 422, code: 'weak_password' } })
    const response = await signup(formRequest('signup'))
    const location = new URL(response.headers.get('location')!)
    expect(location.searchParams.get('error')).toContain('stronger, unique password')
    expect(mocks.sync).not.toHaveBeenCalled()
    expect(mocks.commit).not.toHaveBeenCalled()
  })

  it.each([['signin', signin, mocks.signin], ['signup', signup, mocks.signup]] as const)('reports a %s provider outage separately from invalid credentials', async (path, handler, provider) => {
    provider.mockResolvedValue({ data: { user: null, session: null }, error: { status: 0 } })
    const response = await handler(new NextRequest('http://localhost:3001/api/auth/' + path, {
      method: 'POST', headers: { origin: 'http://localhost:3001', 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'founder@example.com', password: 'password123' }),
    }))
    expect(response.status).toBe(503)
    expect(mocks.sync).not.toHaveBeenCalled()
  })

  it('preserves the provider rate limit response', async () => {
    mocks.signin.mockResolvedValue({ data: { user: null, session: null }, error: { status: 429 } })
    const response = await signin(new NextRequest('http://localhost:3001/api/auth/signin', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'founder@example.com', password: 'password123' }),
    }))
    expect(response.status).toBe(429)
  })
})

describe('Supabase confirmation callbacks', () => {
  it('verifies a token-hash email link as well as PKCE links', async () => {
    const response = await callback(new NextRequest('http://localhost:3001/auth/callback?token_hash=test-hash&type=email'))
    expect(mocks.verify).toHaveBeenCalledWith({ token_hash: 'test-hash', type: 'email' })
    expect(mocks.exchange).not.toHaveBeenCalled()
    expect(response.headers.get('location')).toBe('http://localhost:3001/dashboard')
  })

  it('sends a recovery token to the password reset page', async () => {
    const response = await callback(new NextRequest('http://localhost:3001/auth/callback?token_hash=test-hash&type=recovery'))
    expect(response.headers.get('location')).toBe('http://localhost:3001/auth/reset-password')
  })

  it('preserves the destination for PKCE password reset links', async () => {
    const response = await callback(new NextRequest('http://localhost:3001/auth/callback?code=test-code&next=/auth/reset-password'))
    expect(mocks.exchange).toHaveBeenCalledWith('test-code')
    expect(response.headers.get('location')).toBe('http://localhost:3001/auth/reset-password')
  })

  it('rejects unsupported token types before verification', async () => {
    const response = await callback(new NextRequest('http://localhost:3001/auth/callback?token_hash=test-hash&type=sms'))
    expect(mocks.verify).not.toHaveBeenCalled()
    expect(response.headers.get('location')).toContain('auth_callback_failed')
  })

  it('returns to sign in when the auth provider is unavailable', async () => {
    mocks.exchange.mockRejectedValue(new Error('private provider details'))
    const response = await callback(new NextRequest('http://localhost:3001/auth/callback?code=test-code'))
    expect(response.headers.get('location')).toBe('http://localhost:3001/auth/signin?error=auth_callback_failed')
    expect(mocks.commit).not.toHaveBeenCalled()
  })

  it('clears the callback session when profile synchronization fails', async () => {
    mocks.sync.mockResolvedValue(null)
    const response = await callback(new NextRequest('http://localhost:3001/auth/callback?code=test-code'))
    expect(mocks.signout).toHaveBeenCalledWith({ scope: 'local' })
    expect(response.headers.get('location')).toContain('auth_callback_failed')
  })
})
