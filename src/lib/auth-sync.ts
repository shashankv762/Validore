import { db } from '@/db'
import { users } from '@/db/schema'
import { eq, sql } from 'drizzle-orm'

export interface SupabaseAuthUser {
  id: string
  email?: string | null
}

/**
 * Synchronizes an authenticated Supabase user into the application's PostgreSQL users table.
 * If the user does not exist, a new record is created with tier 'free'.
 * If the user already exists (by supabaseId or email), returns the existing record.
 */
export async function syncUserToDatabase(supabaseUser: SupabaseAuthUser) {
  if (!supabaseUser?.id) return null

  // 1. Check if user already exists by supabaseId
  const existingBySupabaseId = await db.query.users.findFirst({
    where: eq(users.supabaseId, supabaseUser.id),
  })

  if (existingBySupabaseId) {
    return existingBySupabaseId
  }

  const email = supabaseUser.email || `user-${supabaseUser.id}@validore.app`

  // 2. Check if user already exists by email (e.g. from seed or prior migration)
  const existingByEmail = await db.query.users.findFirst({
    where: eq(users.email, email),
  })

  if (existingByEmail) {
    const [updated] = await db
      .update(users)
      .set({
        supabaseId: supabaseUser.id,
        updatedAt: new Date(),
        creditBalance: sql`CASE WHEN ${users.creditBalance} = 0 AND ${users.creditResetAt} IS NULL THEN 100 ELSE ${users.creditBalance} END`,
        creditResetAt: sql`CASE WHEN ${users.creditResetAt} IS NULL THEN now() + interval '30 days' ELSE ${users.creditResetAt} END`,
      })
      .where(eq(users.id, existingByEmail.id))
      .returning()

    return updated || existingByEmail
  }

  // 3. Insert new row
  try {
    const [inserted] = await db
      .insert(users)
      .values({
        email,
        supabaseId: supabaseUser.id,
        tier: 'free',
        creditBalance: 100,
        creditResetAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      })
      .returning()

    return inserted
  } catch {
    // In case of concurrent insert or race condition, query by supabaseId
    const fallback = await db.query.users.findFirst({
      where: eq(users.supabaseId, supabaseUser.id),
    })
    return fallback
  }
}

/**
 * Convenience helper to get or auto-provision the database user for an authenticated Supabase user.
 */
export async function getOrCreateDbUser(supabaseUser: SupabaseAuthUser) {
  return syncUserToDatabase(supabaseUser)
}
