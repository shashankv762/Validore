import { db } from '@/db'
import { users } from '@/db/schema'
import { and, eq, sql } from 'drizzle-orm'
import { isActiveAccount, isVerifiedOwnerIdentity } from './admin-access'
import { getPlan } from './plan-catalog'
import { getPlatformSettings } from './platform-settings'

export interface SupabaseAuthUser {
  id: string
  email?: string | null
  email_confirmed_at?: string | null
}

/**
 * Synchronizes an authenticated Supabase user into the application's PostgreSQL users table.
 * Only registration handlers that already checked consent and abuse limits may create a profile.
 * Existing identities are matched by supabaseId. Email cannot transfer account ownership.
 */
export async function syncUserToDatabase(supabaseUser: SupabaseAuthUser, options?: { createNew: boolean; promoteOwner?: boolean }) {
  if (!supabaseUser?.id) return null

  // 1. Check if user already exists by supabaseId
  const existingBySupabaseId = await db.query.users.findFirst({
    where: eq(users.supabaseId, supabaseUser.id),
  })

  if (existingBySupabaseId) {
    if (options?.promoteOwner !== false && !existingBySupabaseId.isAdmin && isActiveAccount(existingBySupabaseId) && isVerifiedOwnerIdentity(supabaseUser)) {
      // A partial unique index pins this grant to one Supabase identity. Never
      // resolve or transfer an owner by matching an application email address.
      try {
        const [owner] = await db.update(users).set({ isAdmin: true, updatedAt: new Date() })
          .where(and(eq(users.id, existingBySupabaseId.id), eq(users.supabaseId, supabaseUser.id), eq(users.isAdmin, false),
            eq(users.accountStatus, 'active'), sql`not exists (select 1 from ${users} where ${users.isAdmin} = true)`))
          .returning()
        // Another verified request may have won this same identity's promotion.
        // Return its current grant/status rather than the stale pre-CAS snapshot.
        return owner ?? await db.query.users.findFirst({ where: eq(users.supabaseId, supabaseUser.id) })
      } catch (error) {
        // The unique index resolves simultaneous grants to different identities.
        const cause = error as { code?: string; cause?: { code?: string } }
        if (cause.code === '23505' || cause.cause?.code === '23505') {
          return await db.query.users.findFirst({ where: eq(users.supabaseId, supabaseUser.id) })
        }
        throw error
      }
    }
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
    if (!(await getPlatformSettings()).signupEnabled && !isVerifiedOwnerIdentity(supabaseUser)) return null
    const allowance = (await getPlan('free')).monthlyCredits
    const now = new Date()
    const [inserted] = await db
      .insert(users)
      .values({
        email,
        supabaseId: supabaseUser.id,
        isAdmin: options?.promoteOwner !== false && isVerifiedOwnerIdentity(supabaseUser),
        tier: 'free',
        creditBalance: allowance,
        creditCycleAllowance: allowance,
        creditCycleStartedAt: now,
        creditResetAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
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
