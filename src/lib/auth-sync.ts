import { db } from '@/db'
import { users } from '@/db/schema'
import { eq } from 'drizzle-orm'

export interface SupabaseAuthUser {
  id: string
  email?: string | null
}

/**
 * Synchronizes an authenticated Supabase user into the application's PostgreSQL users table.
 * If the user does not exist, a new record is created with tier 'free'.
 * Existing identities are matched by supabaseId. Email cannot transfer account ownership.
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

  // A distinct auth identity must never inherit an account merely by matching email.
  const existingByEmail = await db.query.users.findFirst({ where: eq(users.email, email) })
  if (existingByEmail) return null

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
      .onConflictDoNothing()
      .returning()

    return inserted ?? await db.query.users.findFirst({ where: eq(users.supabaseId, supabaseUser.id) })
  } catch (error) {
    // Preserve a successful concurrent signup; surface genuine database failures.
    const fallback = await db.query.users.findFirst({
      where: eq(users.supabaseId, supabaseUser.id),
    })
    if (fallback) return fallback
    throw error
  }
}

/**
 * Convenience helper to get or auto-provision the database user for an authenticated Supabase user.
 */
export async function getOrCreateDbUser(supabaseUser: SupabaseAuthUser) {
  return syncUserToDatabase(supabaseUser)
}
