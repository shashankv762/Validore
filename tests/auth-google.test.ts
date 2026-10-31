import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const oauth = vi.hoisted(() => vi.fn())
const settings = vi.hoisted(() => vi.fn())
vi.mock('@/lib/supabase/auth-settings', () => ({ getAuthSettings: settings }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { signInWithOAuth: oauth } }) }))
import { POST } from '@/app/api/auth/google/route'

const request = (origin = 'https://validore.tech') => new NextRequest('http://localhost:3000/api/auth/google', { method: 'POST', headers: { origin } })
beforeEach(() => {
  vi.resetAllMocks()
  settings.mockResolvedValue({ external: { google: true } })
  vi.stubEnv('NODE_ENV', 'production')
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://validore.tech')
  oauth.mockResolvedValue({ data: { url: 'https://project.supabase.co/auth/v1/authorize?provider=google' }, error: null })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })

describe('Google sign-in', () => {
  it('keeps a disabled provider on the app instead of redirecting to a Supabase error', async () => {
    settings.mockResolvedValue({ external: { google: false } })
    const response = await POST(request())
    expect(response.headers.get('location')).toContain('Google+sign-in+is+not+available')
    expect(oauth).not.toHaveBeenCalled()
  })
  it('uses the public callback behind the hosting proxy', async () => {
    const response = await POST(request())
    expect(oauth).toHaveBeenCalledWith({ provider: 'google', options: { redirectTo: 'https://validore.tech/auth/callback' } })
    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe('https://project.supabase.co/auth/v1/authorize?provider=google')
  })

  it('rejects an untrusted form before starting OAuth', async () => {
    const response = await POST(request('https://untrusted.example'))
    expect(response.headers.get('location')).toContain('https://validore.tech/auth/signin')
    expect(oauth).not.toHaveBeenCalled()
  })

  it.each(['provider', 'exception', 'missing-url'])('keeps %s failures on the public site without exposing internal details', async failure => {
    if (failure === 'provider') oauth.mockResolvedValue({ data: null, error: { status: 500, code: 'unexpected_failure', message: 'private connection details' } })
    if (failure === 'exception') oauth.mockRejectedValue(new Error('private connection details'))
    if (failure === 'missing-url') oauth.mockResolvedValue({ data: {}, error: null })
    const response = await POST(request())
    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toContain('https://validore.tech/auth/signin?error=')
    expect(response.headers.get('location')).not.toContain('private')
  })
})
