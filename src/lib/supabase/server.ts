import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { AuthError } from '@supabase/supabase-js'
import { syncUserToDatabase } from '@/lib/auth-sync'
import { isActiveAccount, isOwnerAccount, isVerifiedOwnerIdentity } from '@/lib/admin-access'
import { getPlatformSettings } from '@/lib/platform-settings'

export async function createClient() {
  return (await clientWithCookies(false)).client
}

export async function createClientWithDeferredCookies() {
  return clientWithCookies(true)
}

async function clientWithCookies(deferWrites: boolean) {
  const cookieStore = await cookies()
  const pending = new Map<string, { name: string; value: string; options: CookieOptions }>()
  const client = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!,
    {
      cookieOptions: { sameSite: 'lax', secure: process.env.NODE_ENV === 'production' },
      cookies: {
        getAll() {
          const current = new Map(cookieStore.getAll().map(cookie => [cookie.name, cookie]))
          pending.forEach(cookie => current.set(cookie.name, cookie))
          return [...current.values()]
        },
        setAll(cookiesToSet) {
          if (deferWrites) {
            cookiesToSet.forEach(cookie => pending.set(cookie.name, cookie))
            return
          }
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {}
        },
      },
    }
  )
  const verifiedGetUser = client.auth.getUser.bind(client.auth)
  client.auth.getUser = async (jwt?: string) => {
    const result = await verifiedGetUser(jwt)
    if (result.error || !result.data.user) return result
    try {
      // getUser also runs during Server Component rendering; account resolution
      // is read-only. Actual sign-in/registration handlers provision owner grants.
      const account = await syncUserToDatabase(result.data.user, { createNew: false, promoteOwner: false })
      if (account && !isActiveAccount(account)) {
        return { data: { user: null }, error: new AuthError('This account is not active.', 403,
          account.accountStatus === 'blocked' ? 'account_blocked' : 'account_deactivated') }
      }
      const settings = await getPlatformSettings()
      const owner = isVerifiedOwnerIdentity(result.data.user) && (!account || (isOwnerAccount(account) && account.supabaseId === result.data.user.id))
      if (settings.maintenanceEnabled && !owner) {
        return { data: { user: null }, error: new AuthError(settings.maintenanceMessage || 'The workspace is temporarily under maintenance.', 503, 'maintenance_enabled') }
      }
      return result
    } catch {
      return { data: { user: null }, error: new AuthError('Account access is temporarily unavailable.', 503, 'account_unavailable') }
    }
  }
  return {
    client,
    commitCookies() {
      pending.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
      pending.clear()
    },
  }
}
