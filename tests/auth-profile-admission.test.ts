import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ find: vi.fn(), insert: vi.fn(), values: vi.fn() }))
vi.mock('@/db', () => ({ db: { query: { users: { findFirst: mocks.find } }, insert: mocks.insert } }))
import { getOrCreateDbUser, syncUserToDatabase } from '@/lib/auth-sync'
const identity = { id: 'public-auth-identity', email: 'founder@example.com' }
beforeEach(() => {
  vi.resetAllMocks()
  mocks.find.mockResolvedValue(undefined)
  mocks.insert.mockReturnValue({ values: mocks.values })
  mocks.values.mockReturnValue({ onConflictDoNothing: () => ({ returning: async () => [{ id: 'new-profile', creditBalance: 100 }] }) })
})
describe('app profile creation boundary', () => {
  it('cannot turn a public Auth identity or read/export helper into free credits', async () => {
    expect(await syncUserToDatabase(identity)).toBeNull()
    expect(await getOrCreateDbUser(identity)).toBeNull()
    expect(mocks.insert).not.toHaveBeenCalled()
  })
  it('returns an existing profile for normal sign-in without registration authorization', async () => {
    mocks.find.mockResolvedValue({ id: 'existing-profile' })
    expect(await getOrCreateDbUser(identity)).toEqual({ id: 'existing-profile' })
    expect(mocks.insert).not.toHaveBeenCalled()
  })
  it('provisions the initial allowance only for a server-authorized registration caller', async () => {
    expect(await syncUserToDatabase(identity, { createNew: true })).toEqual({ id: 'new-profile', creditBalance: 100 })
    expect(mocks.values).toHaveBeenCalledWith(expect.objectContaining({ supabaseId: identity.id, creditBalance: 100 }))
  })
  it('cannot transfer a different app identity by matching email', async () => {
    mocks.find.mockResolvedValueOnce(undefined).mockResolvedValueOnce({ id: 'another-owner', supabaseId: 'different-auth-identity' })
    expect(await syncUserToDatabase(identity, { createNew: true })).toBeNull()
    expect(mocks.insert).not.toHaveBeenCalled()
  })
  it('resolves a concurrent registration inserted between the identity and email lookups', async () => {
    const profile = { id: 'same-profile', supabaseId: identity.id, creditBalance: 35 }
    mocks.find.mockResolvedValueOnce(undefined).mockResolvedValueOnce(profile)
    expect(await syncUserToDatabase(identity, { createNew: true })).toEqual(profile)
    expect(mocks.insert).not.toHaveBeenCalled()
  })
})
