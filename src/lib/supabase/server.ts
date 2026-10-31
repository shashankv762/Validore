import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'

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
  return {
    client,
    commitCookies() {
      pending.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
      pending.clear()
    },
  }
}
