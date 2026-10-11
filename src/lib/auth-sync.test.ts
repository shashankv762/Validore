import { config } from 'dotenv'
// Load .env.local when present (local dev); CI has no database — the
// DB-backed tests below skip themselves via describeIfDb().
if (process.env.CI !== 'true') {
  config({ path: '.env.local' })
}

import { describe, it, expect } from 'vitest'
import { syncUserToDatabase, getOrCreateDbUser } from './auth-sync'
import { db } from '@/db'
import { users } from '@/db/schema'
import { eq } from 'drizzle-orm'

// DB-backed tests only run where a DATABASE_URL is actually reachable.
// (CI runs unit tests only — the integration DB is provisioned per-deploy.)
const HAS_DB = process.env.CI !== 'true' && !!process.env.DATABASE_URL
const describeIfDb = HAS_DB ? describe : describe.skip

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
  })

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
  })

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
  })
})
