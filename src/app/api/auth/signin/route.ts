import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClientWithDeferredCookies } from '@/lib/supabase/server'
import { syncUserToDatabase } from '@/lib/auth-sync'
import { safeNextPath } from '@/lib/auth-redirect'
import { readAuthBody, authFormResponse, validAuthOrigin, authOrigin } from '@/lib/auth-form'

const SigninSchema = z.object({ email: z.string().trim().email().max(320), password: z.string().min(1).max(128), next: z.unknown().optional() })
export async function POST(req: NextRequest) {
  try {
    if (!validAuthOrigin(req)) return authFormResponse(req, '/auth/signin', 'error', 'Invalid request origin', 403)
    const parsed = SigninSchema.safeParse(await readAuthBody(req))
    if (!parsed.success) return authFormResponse(req, '/auth/signin', 'error', 'Enter a valid email and password.', 400)
    const { email, password, next } = parsed.data
    const { client: supabase, commitCookies } = await createClientWithDeferredCookies()
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error && (!error.status || error.status >= 500)) return authFormResponse(req, '/auth/signin', 'error', 'Sign-in is temporarily unavailable. Please try again later.', 503)
    if (error?.status === 429) return authFormResponse(req, '/auth/signin', 'error', 'Too many sign-in attempts. Please wait before trying again.', 429)
    if (error || !data?.user) return authFormResponse(req, '/auth/signin', 'error', 'Unable to sign in. Check your email, password, and email confirmation.', 400)
    let profile
    try {
      profile = await syncUserToDatabase({ id: data.user.id, email: data.user.email })
    } catch (error) {
      await supabase.auth.signOut({ scope: 'local' })
      throw error
    }
    if (!profile) {
      await supabase.auth.signOut({ scope: 'local' })
      return authFormResponse(req, '/auth/signin', 'error', 'This account needs support before it can access the workspace.', 409)
    }
    commitCookies()
    if (!req.headers.get('content-type')?.includes('application/json')) {
      const origin = authOrigin(req)
      return NextResponse.redirect(new URL(safeNextPath(next, origin), origin), 303)
    }
    return NextResponse.json({ user: data.user, session: data.session })
  } catch (error) {
    console.error('[auth/signin] Failed:', error)
    return authFormResponse(req, '/auth/signin', 'error', 'Sign-in is temporarily unavailable. Please try again later.', 503)
  }
}
