import { beforeEach, describe, expect, it, vi } from 'vitest'
const mock = vi.hoisted(() => ({ getUser: vi.fn(), profile: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: mock.getUser } }) }))
vi.mock('@/db', () => ({ db: { query: { users: { findFirst: mock.profile } } } }))
import { authenticatedDestination, isVerifiedOwnerIdentity, OWNER_EMAIL, requireAdmin } from '@/lib/admin-access'
const identity = { id: 'verified-id', email: OWNER_EMAIL, email_confirmed_at: '2026-01-01' }
const profile = { id: 'profile-id', supabaseId: identity.id, isAdmin: true, accountStatus: 'active' }
beforeEach(() => {
  vi.resetAllMocks()
  mock.getUser.mockResolvedValue({ data: { user: identity }, error: null })
  mock.profile.mockResolvedValue(profile)
})
describe('Private owner authorization', () => {
  it('requires live provider confirmation, exact email and the pinned database identity', async () => {
    expect(await requireAdmin()).toEqual({ authUser: identity, user: profile })
    for (const user of [{ ...identity, email_confirmed_at: null }, { ...identity, email: 'shashankv7623+owner@gmail.com' }, { ...identity, id: 'different-id' }]) {
      mock.getUser.mockResolvedValue({ data: { user }, error: null })
      await expect(requireAdmin()).rejects.toMatchObject({ status: 404 })
    }
  })
  it('does not authorize metadata or a database email without the pinned grant', async () => {
    mock.profile.mockResolvedValue({ ...profile, isAdmin: false, email: OWNER_EMAIL })
    await expect(requireAdmin()).rejects.toMatchObject({ status: 404 })
    expect(isVerifiedOwnerIdentity({ id: 'id', email: 'different@example.com', email_confirmed_at: 'confirmed', user_metadata: { email: OWNER_EMAIL, isAdmin: true } } as typeof identity)).toBe(false)
  })
  it.each(['blocked', 'deactivated'])('rejects an owner profile with %s status', async accountStatus => {
    mock.profile.mockResolvedValue({ ...profile, accountStatus })
    await expect(requireAdmin()).rejects.toMatchObject({ status: 404 })
  })
  it('rejects unsigned requests before querying a profile and preserves unavailable status', async () => {
    mock.getUser.mockResolvedValue({ data: { user: null }, error: { status: 503, code: 'account_unavailable' } })
    await expect(requireAdmin()).rejects.toMatchObject({ status: 503, code: 'account_unavailable' })
    expect(mock.profile).not.toHaveBeenCalled()
  })
  it('routes verified owners to the separate admin page and preserves password recovery', () => {
    expect(authenticatedDestination(identity, profile, '/dashboard/reports')).toBe('/admin')
    expect(authenticatedDestination(identity, profile, '/auth/reset-password?from=email')).toBe('/auth/reset-password?from=email')
    expect(authenticatedDestination({ ...identity, email_confirmed_at: null }, profile, '/dashboard')).toBe('/dashboard')
    expect(authenticatedDestination(identity, { ...profile, supabaseId: 'other' }, '/dashboard')).toBe('/dashboard')
  })
})
