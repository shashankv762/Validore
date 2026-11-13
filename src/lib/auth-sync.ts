import { db } from '@/db'
import { users } from '@/db/schema'
import { eq } from 'drizzle-orm'

export interface SupabaseAuthUser {
  id: string
  email?: string | null
}

/**
 * Synchronizes an authenticated Supabase user into the application's PostgreSQL users table.
 * Only registration handlers that already checked consent and abuse limits may create a profile.
 * Existing identities are matched by supabaseId. Email cannot transfer account ownership.
 */
export async function syncUserToDatabase(supabaseUser: SupabaseAuthUser, options?: { createNew: boolean }) {
  if (!supabaseUser?.id) return null

  // 1. Check if user already exists by supabaseId
  const existingBySupabaseId = await db.query.users.findFirst({
    where: eq(users.supabaseId, supabaseUser.id),
  })

  if (existingBySupabaseId) {
    return existingBySupabaseId
  }

  // A public Supabase session alone cannot claim a new workspace allowance.
  // Read/export/billing callers and generic OAuth callbacks only resolve existing profiles.
  if (!options?.createNew) return null

  const email = supabaseUser.email || `user-${supabaseUser.id}@validore.app`

  // A distinct auth identity must never inherit an account merely by matching email.
  const existingByEmail = await db.query.users.findFirst({ where: eq(users.email, email) })
  // Another request for this same verified identity may have inserted the row
  // after the first lookup. Resolve it without granting another allowance.
  if (existingByEmail) return existingByEmail.supabaseId === supabaseUser.id ? existingByEmail : null

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
 * Resolve an existing database user for an authenticated Supabase user.
 * Kept under its historical name for callers; creation requires the registration gate.
 */
export async function getOrCreateDbUser(supabaseUser: SupabaseAuthUser) {
  return syncUserToDatabase(supabaseUser)
}
