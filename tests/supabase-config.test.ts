import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({ browser: vi.fn(), server: vi.fn(), sync: vi.fn(), settings: vi.fn() }))
vi.mock('@supabase/ssr', () => ({ createBrowserClient: mocks.browser, createServerClient: mocks.server }))
vi.mock('next/headers', () => ({ cookies: async () => ({ getAll: () => [], set: vi.fn() }) }))
vi.mock('@/lib/auth-sync', () => ({ syncUserToDatabase: mocks.sync }))
vi.mock('@/lib/platform-settings', () => ({ getPlatformSettings: mocks.settings }))
import { createClient as browserClient } from '@/lib/supabase/client'
import { createClient as serverClient } from '@/lib/supabase/server'
import { proxy } from '@/proxy'

afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks() })
beforeEach(() => {
  mocks.sync.mockResolvedValue({ id: 'existing-profile', supabaseId: 'new-auth-identity', isAdmin: false, accountStatus: 'active' })
  mocks.settings.mockResolvedValue({ signupEnabled: true, maintenanceEnabled: false })
})

describe('Supabase public key configuration', () => {
  it.each([
    ['sb_publishable_current', 'legacy-key', 'sb_publishable_current'],
    ['', 'legacy-key', 'legacy-key'],
  ])('uses the configured public key consistently in browser, server and proxy', async (publishable, legacy, expected) => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.example.com')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', publishable)
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', legacy)
    mocks.server.mockReturnValue({ auth: { getUser: async () => ({ data: { user: null } }) } })

    browserClient()
    await serverClient()
    await proxy(new NextRequest('http://localhost/auth/signin'))

    expect(mocks.browser.mock.calls[0].slice(0, 2)).toEqual(['https://project.example.com', expected])
    expect(mocks.server.mock.calls).toHaveLength(2)
    for (const call of mocks.server.mock.calls) expect(call.slice(0, 2)).toEqual(['https://project.example.com', expected])
  })

  it('keeps the proxy unavailable when neither public key is configured', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.example.com')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', '')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '')
    expect((await proxy(new NextRequest('http://localhost/dashboard'))).status).toBe(503)
    expect(mocks.server).not.toHaveBeenCalled()
  })

  it('marks owner-only report link responses private and no-store', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.example.com')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'public-key')
    mocks.server.mockReturnValue({ auth: { getUser: async () => ({ data: { user: null } }) } })
    const response = await proxy(new NextRequest('http://localhost/share/11111111-1111-4111-8111-111111111111'))
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(response.headers.get('content-security-policy')).toContain('nonce-')
  })

  it.each(['existing', 'missing'])('preserves the signed-in workspace destination for a %s profile so registration recovery can complete', async profile => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.example.com')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'public-key')
    mocks.server.mockReturnValue({ auth: { getUser: async () => ({ data: { user: { id: 'new-auth-identity' } } }) } })
    if (profile === 'missing') mocks.sync.mockResolvedValue(null)
    const response = await proxy(new NextRequest('https://validore.onrender.com/auth/signin?next=%2Fdashboard%2Freports%3Fsaved%3D123'))
    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('https://validore.onrender.com/dashboard/reports?saved=123')
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(mocks.sync).toHaveBeenCalledWith({ id: 'new-auth-identity' }, { createNew: false, promoteOwner: false })
  })
})
