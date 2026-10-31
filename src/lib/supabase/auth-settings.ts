type AuthSettings = { external?: { google?: boolean; email?: boolean }; disable_signup?: boolean }

/** Supabase publishes these capabilities; OAuth URL construction alone does not validate them. */
export async function getAuthSettings(): Promise<AuthSettings | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null
  try {
    const response = await fetch(new URL('/auth/v1/settings', url), {
      headers: { apikey: key }, next: { revalidate: 60 },
      redirect: 'error', signal: AbortSignal.timeout(5000),
    })
    if (!response.ok) return null
    return await response.json() as AuthSettings
  } catch { return null }
}
