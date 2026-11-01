import { describe, it, expect } from 'vitest'
import { syncUserToDatabase, getOrCreateDbUser } from './auth-sync'
import { db } from '@/db'
import { users } from '@/db/schema'
import { eq } from 'drizzle-orm'

// Only opt into a disposable database; never read application credentials.
const HAS_DB = Boolean(process.env.TEST_DATABASE_URL && process.env.TEST_DATABASE_URL === process.env.DATABASE_URL)
const describeIfDb = (title: string, fn: () => void) => describe.skipIf(!HAS_DB)(title, fn)

describe('auth-sync unit tests', () => {
  it('returns null if supabaseUser has no id', async () => {
    // @ts-expect-error testing invalid input
    const result = await syncUserToDatabase(null)
    expect(result).toBeNull()

    const result2 = await syncUserToDatabase({ id: '' })
    expect(result2).toBeNull()
  })
})

describeIfDb('auth-sync database tests', () => {
  it('provisions new user in database with free tier if not exists', async () => {
    const testId = `test-user-${Date.now()}`
    const testEmail = `${testId}@example.com`

    const synced = await syncUserToDatabase({ id: testId, email: testEmail })
    expect(synced).toBeDefined()
    expect(synced?.email).toBe(testEmail)
    expect(synced?.supabaseId).toBe(testId)
    expect(synced?.tier).toBe('free')

    // Clean up test row
    if (synced?.id) {
      await db.delete(users).where(eq(users.id, synced.id)).catch(() => {})
    }
  }, 20000)

  it('returns existing user if user with same supabaseId already exists', async () => {
    const testId = `test-existing-${Date.now()}`
    const testEmail = `${testId}@example.com`

    const first = await syncUserToDatabase({ id: testId, email: testEmail })
    expect(first).toBeDefined()

    const second = await syncUserToDatabase({ id: testId, email: testEmail })
    expect(second).toBeDefined()
    expect(second?.id).toBe(first?.id)

    // Clean up
    if (first?.id) {
      await db.delete(users).where(eq(users.id, first.id)).catch(() => {})
    }
  }, 20000)

  it('getOrCreateDbUser delegates to syncUserToDatabase', async () => {
    const testId = `test-helper-${Date.now()}`
    const testEmail = `${testId}@example.com`

    const user = await getOrCreateDbUser({ id: testId, email: testEmail })
    expect(user).toBeDefined()
    expect(user?.supabaseId).toBe(testId)

    // Clean up
    if (user?.id) {
      await db.delete(users).where(eq(users.id, user.id)).catch(() => {})
    }
  }, 20000)
})
