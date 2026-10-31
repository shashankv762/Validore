import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClientWithDeferredCookies } from '@/lib/supabase/server'
import { syncUserToDatabase } from '@/lib/auth-sync'
import { isDisposableEmail } from '@/lib/email-validator'
import { readAuthBody, authFormResponse, validAuthOrigin, authOrigin } from '@/lib/auth-form'
import { clientIp as getClientIp } from '@/lib/client-ip'

const SignupSchema = z.object({ email: z.string().trim().email().max(320), password: z.string().min(8).max(128) })
export async function POST(req: NextRequest) {
  try {
    if (!validAuthOrigin(req)) return authFormResponse(req, '/auth/signup', 'error', 'Invalid request origin', 403)
    const parsed = SignupSchema.safeParse(await readAuthBody(req))
    if (!parsed.success) return authFormResponse(req, '/auth/signup', 'error', 'Use a valid email and a password of 8 to 128 characters.', 400)
    const { email, password } = parsed.data
    if (isDisposableEmail(email)) return authFormResponse(req, '/auth/signup', 'error', 'Please use a permanent email address', 400)
    // Only trust forwarding headers supplied by the configured ingress proxy.
    const clientIp = getClientIp(req)
    const redisConfigured = process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    if (process.env.NODE_ENV === 'production' && (!redisConfigured || !clientIp)) {
      console.error('[auth/signup] Abuse controls unavailable', { redisConfigured: Boolean(redisConfigured), clientIpPresent: Boolean(clientIp) })
      return authFormResponse(req, '/auth/signup', 'error', 'Registration is temporarily unavailable. Please try again later.', 503)
    }
    if (clientIp && redisConfigured) {
      try {
        const { Ratelimit } = await import('@upstash/ratelimit')
        const { Redis } = await import('@upstash/redis')
        const limiter = new Ratelimit({ redis: Redis.fromEnv(), limiter: Ratelimit.slidingWindow(3, '7 d'), prefix: 'validore:signup_ip' })
        if (!(await limiter.limit(clientIp)).success) return authFormResponse(req, '/auth/signup', 'error', 'Too many account registrations from this network. Please try again later.', 429)
      } catch {
        console.error('[auth/signup] Registration limiter unavailable')
        return authFormResponse(req, '/auth/signup', 'error', 'Registration is temporarily unavailable. Please try again later.', 503)
      }
    }
    const { client: supabase, commitCookies } = await createClientWithDeferredCookies()
    const origin = authOrigin(req)
    const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: origin + '/auth/callback' } })
    if (error) console.error('[auth/signup] Provider rejected signup', { status: error.status, code: error.code })
    if (error?.code === 'weak_password') {
      return authFormResponse(req, '/auth/signup', 'error', 'Choose a stronger, unique password. Use at least 12 characters with uppercase and lowercase letters, a number, and a symbol; avoid common or previously exposed passwords.', 400)
    }
    if (error?.code === 'email_address_not_authorized' || error?.code === 'email_address_not_allowed') {
      return authFormResponse(req, '/auth/signup', 'error', 'Confirmation email delivery is not configured for this address yet. Please contact support.', 503)
    }
    if (error?.code === 'signup_disabled') return authFormResponse(req, '/auth/signup', 'error', 'New registrations are temporarily closed.', 503)
    if (error && (!error.status || error.status >= 500)) return authFormResponse(req, '/auth/signup', 'error', 'Registration is temporarily unavailable. Please try again later.', 503)
    if (error?.status === 429) return authFormResponse(req, '/auth/signup', 'error', 'Too many signup or confirmation requests. Please wait before trying again.', 429)
    if (error) return authFormResponse(req, '/auth/signup', 'error', 'Unable to create an account. Check your details and try again later.', 400)
    if (data?.session && data.user) {
      let profile
      try {
        profile = await syncUserToDatabase({ id: data.user.id, email: data.user.email })
      } catch (error) {
        await supabase.auth.signOut({ scope: 'local' })
        throw error
      }
      if (!profile) {
        await supabase.auth.signOut({ scope: 'local' })
        return authFormResponse(req, '/auth/signup', 'error', 'This account needs support before it can access the workspace.', 409)
      }
    }
    commitCookies()
    if (!req.headers.get('content-type')?.includes('application/json')) {
      if (data?.session) return NextResponse.redirect(new URL('/dashboard', origin), 303)
      return authFormResponse(req, '/auth/signin', 'message', 'Check your email to verify your account, then sign in.')
    }
    return NextResponse.json({ user: data.user, session: data.session })
  } catch (error) {
    console.error('[auth/signup] Failed:', error)
    return authFormResponse(req, '/auth/signup', 'error', 'Registration is temporarily unavailable. Please try again later.', 503)
  }
}
