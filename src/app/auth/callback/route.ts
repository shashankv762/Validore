import { NextRequest, NextResponse } from 'next/server'
import { type EmailOtpType } from '@supabase/supabase-js'
import { createClientWithDeferredCookies } from '@/lib/supabase/server'
import { syncUserToDatabase } from '@/lib/auth-sync'
import { safeNextPath } from '@/lib/auth-redirect'
import { authOrigin } from '@/lib/auth-form'

const EMAIL_TYPES = new Set<EmailOtpType>(['email', 'signup', 'invite', 'magiclink', 'recovery', 'email_change'])

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const origin = authOrigin(request)
  const code = requestUrl.searchParams.get('code')
  const tokenHash = requestUrl.searchParams.get('token_hash')
  const type = requestUrl.searchParams.get('type') as EmailOtpType | null
  const next = safeNextPath(requestUrl.searchParams.get('next') || (type === 'recovery' ? '/auth/reset-password' : null), origin)
  const failure = () => NextResponse.redirect(new URL('/auth/signin?error=auth_callback_failed', origin))

  if (!code && !(tokenHash && type && EMAIL_TYPES.has(type))) return failure()

  try {
    const { client: supabase, commitCookies } = await createClientWithDeferredCookies()
    const { data, error } = code
      ? await supabase.auth.exchangeCodeForSession(code)
      : await supabase.auth.verifyOtp({ token_hash: tokenHash!, type: type! })

    if (error || !data?.user) {
      console.error('[auth/callback] Verification failed', { method: code ? 'pkce' : 'otp', status: error?.status, code: error?.code, name: error?.name })
      return failure()
    }

    try {
      const profile = await syncUserToDatabase({ id: data.user.id, email: data.user.email })
      if (!profile) throw new Error('Account profile is unavailable')
    } catch (error) {
      await supabase.auth.signOut({ scope: 'local' })
      throw error
    }

    commitCookies()
    return NextResponse.redirect(new URL(next, origin))
  } catch (error) {
    console.error('[auth/callback] Failed:', error)
    return failure()
  }
}
