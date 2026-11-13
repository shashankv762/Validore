import { NextResponse } from 'next/server'
import { db } from '@/db'
import { users } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { PRIVATE_HEADERS } from './api-security'

export const OWNER_EMAIL = 'shashankv7623@gmail.com'
type AccountAccess = { isAdmin?: boolean | null; accountStatus?: string | null }
type AuthIdentity = { id: string; email?: string | null; email_confirmed_at?: string | null }

/** Input must come from Supabase's verified server response, never request metadata. */
export function isVerifiedOwnerIdentity(identity: AuthIdentity | null | undefined): boolean {
  return Boolean(identity?.id && identity.email_confirmed_at && identity.email?.trim().toLowerCase() === OWNER_EMAIL)
}

export function isActiveAccount(account: AccountAccess): boolean {
  // Persisted rows have a NOT NULL default; undefined supports older selected DTOs.
  return (account.accountStatus ?? 'active') === 'active'
}

/** A stored grant remains bound to its Supabase ID; it is never inferred from email. */
export function isOwnerAccount(account: AccountAccess): boolean {
  return account.isAdmin === true && isActiveAccount(account)
}

export function effectiveTier<T extends AccountAccess & { tier: 'free' | 'premium' | 'max_premium' }>(account: T) {
  return isOwnerAccount(account) ? 'max_premium' as const : account.tier
}

export function authenticatedDestination(identity: AuthIdentity, account: AccountAccess & { supabaseId?: string | null }, destination: string) {
  if (destination.split(/[?#]/, 1)[0] === '/auth/reset-password') return destination
  return isOwnerAccount(account) && account.supabaseId === identity.id && isVerifiedOwnerIdentity(identity) ? '/admin' : destination
}

export class AdminAccessError extends Error {
  constructor(message: string, readonly status: number, readonly code: string) { super(message) }
}

/** Every admin page and handler must call this; hiding UI is not authorization. */
export async function requireAdmin() {
  const { createClient } = await import('./supabase/server')
  const { data: { user: authUser }, error } = await (await createClient()).auth.getUser()
  if (!authUser) throw new AdminAccessError('Sign in to continue.', error?.status === 503 ? 503 : error?.status === 403 ? 403 : 401, error?.code ?? 'unauthorized')
  const user = await db.query.users.findFirst({ where: eq(users.supabaseId, authUser.id) })
  if (!user || !isOwnerAccount(user) || !isVerifiedOwnerIdentity(authUser) || user.supabaseId !== authUser.id) {
    throw new AdminAccessError('This page is unavailable.', 404, 'not_found')
  }
  return { authUser, user }
}

export function adminAccessResponse(error: unknown) {
  if (error instanceof AdminAccessError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status, headers: PRIVATE_HEADERS })
  return NextResponse.json({ error: 'Administration is temporarily unavailable.' }, { status: 503, headers: PRIVATE_HEADERS })
}
