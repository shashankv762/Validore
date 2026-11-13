import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClientWithDeferredCookies } from '@/lib/supabase/server'
import { syncUserToDatabase } from '@/lib/auth-sync'
import { safeNextPath } from '@/lib/auth-redirect'
import { readAuthBody, authFormResponse, validAuthOrigin, authOrigin } from '@/lib/auth-form'
import { authenticatedDestination, isActiveAccount } from '@/lib/admin-access'

const SigninSchema = z.object({ email: z.string().trim().email().max(320), password: z.string().min(1).max(128), next: z.unknown().optional() })
export async function POST(req: NextRequest) {
  try {
    if (!validAuthOrigin(req)) return authFormResponse(req, '/auth/signin', 'error', 'Invalid request origin', 403)
    const parsed = SigninSchema.safeParse(await readAuthBody(req))
    if (!parsed.success) return authFormResponse(req, '/auth/signin', 'error', 'Enter a valid email and password.', 400)
    const { email, password, next } = parsed.data
    const { client: supabase, commitCookies } = await createClientWithDeferredCookies()
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error && (!error.status || error.status >= 500)) return authFormResponse(req, '/auth/signin', 'error', 'Sign-in is temporarily unavailable. Please try again later.', 503, next)
    if (error?.status === 429) return authFormResponse(req, '/auth/signin', 'error', 'Too many sign-in attempts. Please wait before trying again.', 429, next)
    if (error || !data?.user) return authFormResponse(req, '/auth/signin', 'error', 'Unable to sign in. Check your email, password, and email confirmation.', 400, next)
    let profile
    try {
      profile = await syncUserToDatabase(data.user)
    } catch (error) {
      await supabase.auth.signOut({ scope: 'local' })
      throw error
    }
    if (!profile) {
      commitCookies()
      const destination = new URL('/auth/complete-signup', authOrigin(req))
      destination.searchParams.set('next', safeNextPath(next, destination.origin))
      if (req.headers.get('content-type')?.includes('application/json')) {
        return NextResponse.json({ error: 'Complete your registration before opening the workspace.', next: destination.pathname + destination.search }, { status: 403 })
      }
      return NextResponse.redirect(destination, 303)
    }
    if (!isActiveAccount(profile)) {
      await supabase.auth.signOut({ scope: 'local' })
      commitCookies()
      return authFormResponse(req, '/auth/signin', 'error', 'This account is not active. Contact support for help.', 403, next)
    }
    commitCookies()
    const origin = authOrigin(req)
    const destination = authenticatedDestination(data.user, profile, safeNextPath(next, origin))
    if (!req.headers.get('content-type')?.includes('application/json')) {
      return NextResponse.redirect(new URL(destination, origin), 303)
    }
    return NextResponse.json({ user: data.user, session: data.session, next: destination })
  } catch (error) {
    console.error('[auth/signin] Failed:', error)
    return authFormResponse(req, '/auth/signin', 'error', 'Sign-in is temporarily unavailable. Please try again later.', 503)
  }
}
