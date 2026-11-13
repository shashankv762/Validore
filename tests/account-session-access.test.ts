import { beforeEach, describe, expect, it, vi } from 'vitest'
const mock = vi.hoisted(() => ({ verify: vi.fn(), sync: vi.fn(), settings: vi.fn() }))
vi.mock('@supabase/ssr', () => ({ createServerClient: () => ({ auth: { getUser: mock.verify } }) }))
vi.mock('next/headers', () => ({ cookies: async () => ({ getAll: () => [], set: vi.fn() }) }))
vi.mock('@/lib/auth-sync', () => ({ syncUserToDatabase: mock.sync }))
vi.mock('@/lib/platform-settings', () => ({ getPlatformSettings: mock.settings }))
import { createClient } from '@/lib/supabase/server'
const identity = { id: 'provider-verified-id', email: 'founder@example.com' }
beforeEach(() => {
  vi.resetAllMocks()
  mock.verify.mockResolvedValue({ data: { user: identity }, error: null })
  mock.sync.mockResolvedValue({ accountStatus: 'active' })
  mock.settings.mockResolvedValue({ maintenanceEnabled: false })
})
describe('Existing session account access', () => {
  it.each(['blocked', 'deactivated'])('rejects provider-verified %s sessions before any handler receives the identity', async accountStatus => {
    mock.sync.mockResolvedValue({ accountStatus })
    const result = await (await createClient()).auth.getUser()
    expect(result.data.user).toBeNull()
    expect(result.error).toMatchObject({ status: 403, code: 'account_' + accountStatus })
    expect(mock.sync).toHaveBeenCalledWith(identity, { createNew: false, promoteOwner: false })
  })
  it('does not query or promote a profile when provider verification fails', async () => {
    mock.verify.mockResolvedValue({ data: { user: null }, error: { status: 401 } })
    expect((await (await createClient()).auth.getUser()).data.user).toBeNull()
    expect(mock.sync).not.toHaveBeenCalled()
  })
  it('fails closed when the database status is unavailable', async () => {
    mock.sync.mockRejectedValue(new Error('private database error'))
    expect(await (await createClient()).auth.getUser()).toMatchObject({ data: { user: null }, error: { status: 503, code: 'account_unavailable' } })
  })
  it('preserves an active session and still permits the gated registration flow for missing profiles', async () => {
    expect((await (await createClient()).auth.getUser()).data.user).toEqual(identity)
    mock.sync.mockResolvedValue(null)
    expect((await (await createClient()).auth.getUser()).data.user).toEqual(identity)
  })
  it('enforces maintenance for user sessions while the pinned live owner can administer it', async () => {
    mock.settings.mockResolvedValue({ maintenanceEnabled: true, maintenanceMessage: 'Upgrading the workspace.' })
    expect(await (await createClient()).auth.getUser()).toMatchObject({ data: { user: null }, error: { status: 503, code: 'maintenance_enabled' } })
    const owner = { ...identity, email: 'shashankv7623@gmail.com', email_confirmed_at: '2026-01-01' }
    mock.verify.mockResolvedValue({ data: { user: owner }, error: null })
    mock.sync.mockResolvedValue({ accountStatus: 'active', isAdmin: true, supabaseId: owner.id })
    expect((await (await createClient()).auth.getUser()).data.user).toEqual(owner)
    mock.sync.mockResolvedValue({ accountStatus: 'active', isAdmin: false, supabaseId: owner.id })
    expect((await (await createClient()).auth.getUser()).data.user).toBeNull()
    mock.sync.mockResolvedValue(null)
    expect((await (await createClient()).auth.getUser()).data.user).toEqual(owner)
  })
})
