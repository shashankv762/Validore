import { afterEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({ browser: vi.fn(), server: vi.fn() }))
vi.mock('@supabase/ssr', () => ({ createBrowserClient: mocks.browser, createServerClient: mocks.server }))
vi.mock('next/headers', () => ({ cookies: async () => ({ getAll: () => [], set: vi.fn() }) }))
import { createClient as browserClient } from '@/lib/supabase/client'
import { createClient as serverClient } from '@/lib/supabase/server'
import { proxy } from '@/proxy'

afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks() })

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
})
