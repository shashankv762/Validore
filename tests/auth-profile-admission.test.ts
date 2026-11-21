import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
const mocks = vi.hoisted(() => ({ find: vi.fn(), insert: vi.fn(), values: vi.fn(), update: vi.fn(), returning: vi.fn() }))
vi.mock('@/db', () => {
  const executor = { query: { users: { findFirst: mocks.find } }, insert: mocks.insert, update: mocks.update }
  return { db: { ...executor, transaction: (run: (tx: typeof executor) => unknown) => run(executor) } }
})
import { getOrCreateDbUser, syncUserToDatabase } from '@/lib/auth-sync'
const identity = { id: 'public-auth-identity', email: 'founder@example.com' }
beforeEach(() => {
  vi.resetAllMocks()
  mocks.find.mockResolvedValue(undefined)
  mocks.insert.mockReturnValue({ values: mocks.values })
  mocks.values.mockReturnValue({ onConflictDoNothing: () => ({ returning: async () => [{ id: 'new-profile', creditBalance: 0, purchasedCredits: 200 }] }) })
  mocks.update.mockReturnValue({ set: () => ({ where: () => ({ returning: mocks.returning }) }) })
})
describe('app profile creation boundary', () => {
  it('resolves a confirmed owner identity read-only without updating or promoting its profile', async () => {
    const verified = { id: identity.id, email: 'shashankv7623@gmail.com', email_confirmed_at: '2026-01-01' }
    const profile = { id: 'profile', supabaseId: identity.id, isAdmin: false, accountStatus: 'active' }
    mocks.find.mockResolvedValue(profile)
    expect(await syncUserToDatabase(verified, { createNew: false, promoteOwner: false })).toEqual(profile)
    expect(mocks.find).toHaveBeenCalledOnce()
    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.insert).not.toHaveBeenCalled()
  })
  it('suppresses a new owner grant when a registration caller explicitly disables promotion', async () => {
    const verified = { id: identity.id, email: 'shashankv7623@gmail.com', email_confirmed_at: '2026-01-01' }
    await syncUserToDatabase(verified, { createNew: true, promoteOwner: false })
    expect(mocks.values).toHaveBeenCalledWith(expect.objectContaining({ supabaseId: verified.id, isAdmin: false }))
  })
  it.each(['miss', 'unique-conflict'])('rereads the same identity after an owner promotion %s', async outcome => {
    const verified = { id: identity.id, email: 'shashankv7623@gmail.com', email_confirmed_at: '2026-01-01' }
    const original = { id: 'profile', supabaseId: identity.id, isAdmin: false, accountStatus: 'active' }
    const promoted = { ...original, isAdmin: true }
    mocks.find.mockResolvedValueOnce(original).mockResolvedValueOnce(promoted)
    if (outcome === 'miss') mocks.returning.mockResolvedValue([])
    else mocks.returning.mockRejectedValue(Object.assign(new Error('Concurrent owner promotion'), { code: '23505' }))
    expect(await syncUserToDatabase(verified)).toEqual(promoted)
    expect(mocks.find).toHaveBeenCalledTimes(2)
    expect(new PgDialect().sqlToQuery(mocks.find.mock.calls[1][0].where).params).toEqual([identity.id])
    expect(mocks.insert).not.toHaveBeenCalled()
  })
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
    expect(await syncUserToDatabase(identity, { createNew: true })).toEqual({ id: 'new-profile', creditBalance: 0, purchasedCredits: 200 })
    expect(mocks.values).toHaveBeenCalledWith(expect.objectContaining({ supabaseId: identity.id, creditBalance: 0, purchasedCredits: 200 }))
    expect(mocks.values).toHaveBeenCalledWith(expect.objectContaining({ userId: 'new-profile', amount: 200, transactionType: 'SIGNUP_GRANT' }))
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
