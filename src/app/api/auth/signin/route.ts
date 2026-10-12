import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { syncUserToDatabase } from '@/lib/auth-sync'
import { safeNextPath } from '@/lib/auth-redirect'
import { readAuthBody, authFormResponse, validAuthOrigin } from '@/lib/auth-form'

const SigninSchema = z.object({ email: z.string().trim().email().max(320), password: z.string().min(1).max(128), next: z.unknown().optional() })
export async function POST(req: NextRequest) {
  try {
    if (!validAuthOrigin(req)) return authFormResponse(req, '/auth/signin', 'error', 'Invalid request origin', 403)
    const parsed = SigninSchema.safeParse(await readAuthBody(req))
    if (!parsed.success) return authFormResponse(req, '/auth/signin', 'error', 'Enter a valid email and password.', 400)
    const { email, password, next } = parsed.data
    const supabase = await createClient()
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error || !data?.user) return authFormResponse(req, '/auth/signin', 'error', 'Unable to sign in. Check your email, password, and email confirmation.', 400)
    const profile = await syncUserToDatabase({ id: data.user.id, email: data.user.email })
    if (!profile) return authFormResponse(req, '/auth/signin', 'error', 'This account needs support before it can access the workspace.', 409)
    if (!req.headers.get('content-type')?.includes('application/json')) {
      return NextResponse.redirect(new URL(safeNextPath(next, new URL(req.url).origin), req.url), 303)
    }
    return NextResponse.json({ user: data.user, session: data.session })
  } catch (error) {
    console.error('[auth/signin] Failed:', error)
    return authFormResponse(req, '/auth/signin', 'error', 'Sign-in is temporarily unavailable. Please try again later.', 503)
  }
}
