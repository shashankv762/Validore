import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
const mocks = vi.hoisted(() => ({ signin: vi.fn(), signup: vi.fn(), sync: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { signInWithPassword: mocks.signin, signUp: mocks.signup } }) }))
vi.mock('@/lib/auth-sync', () => ({ syncUserToDatabase: mocks.sync }))
import { POST as signin } from '@/app/api/auth/signin/route'
import { POST as signup } from '@/app/api/auth/signup/route'
const request = (route: string, body: unknown, origin = 'http://localhost') => new NextRequest('http://localhost/api/auth/' + route, {
  method: 'POST', headers: { 'content-type': 'application/json', origin }, body: JSON.stringify(body),
})
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('NODE_ENV', 'test')
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://localhost')
  vi.stubEnv('UPSTASH_REDIS_REST_URL', '')
  vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '')
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })
describe('Authentication boundaries', () => {
  it('blocks cross-origin login and signup before calling the provider', async () => {
    for (const [handler, name] of [[signin, 'signin'], [signup, 'signup']] as const) {
      expect((await handler(request(name, { email: 'founder@example.com', password: 'password123' }, 'https://untrusted.example'))).status).toBe(403)
    }
    expect(mocks.signin).not.toHaveBeenCalled()
    expect(mocks.signup).not.toHaveBeenCalled()
  })
  it('rejects non-string and oversized credentials before provider calls', async () => {
    expect((await signin(request('signin', { email: ['bad'], password: 'password123' }))).status).toBe(400)
    expect((await signup(request('signup', { email: 'founder@example.com', password: 'a'.repeat(129) }))).status).toBe(400)
    expect(mocks.signin).not.toHaveBeenCalled()
    expect(mocks.signup).not.toHaveBeenCalled()
  })
  it('does not synchronize an unconfirmed signup identity', async () => {
    mocks.signup.mockResolvedValue({ data: { user: { id: 'new-auth-id' }, session: null }, error: null })
    expect((await signup(request('signup', { email: 'founder@example.com', password: 'password123' }))).status).toBe(200)
    expect(mocks.sync).not.toHaveBeenCalled()
  })
  it('does not expose infrastructure exceptions to the client', async () => {
    mocks.signin.mockRejectedValue(new Error('private connection credentials'))
    const response = await signin(request('signin', { email: 'founder@example.com', password: 'password123' }))
    expect(response.status).toBe(503)
    expect(await response.text()).not.toContain('private connection credentials')
  })
  it('requires configured abuse controls for production signup', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    expect((await signup(request('signup', { email: 'founder@example.com', password: 'password123' }))).status).toBe(503)
    expect(mocks.signup).not.toHaveBeenCalled()
  })
})
