import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClientWithDeferredCookies } from '@/lib/supabase/server'
import { syncUserToDatabase } from '@/lib/auth-sync'
import { isDisposableEmail } from '@/lib/email-validator'
import { readAuthBody, authFormResponse, validAuthOrigin, authOrigin } from '@/lib/auth-form'
import { clientIp as getClientIp } from '@/lib/client-ip'
import { safeNextPath } from '@/lib/auth-redirect'
import { LEGAL } from '@/lib/legal'
import { signupWeeklyIpLimit } from '@/lib/signup-policy'
import { registrationLimit } from '@/lib/registration-limit'
import { authenticatedDestination, isActiveAccount, isVerifiedOwnerIdentity } from '@/lib/admin-access'
import { getPlatformSettings } from '@/lib/platform-settings'

const SignupSchema = z.object({ email: z.string().trim().email().max(320), password: z.string().min(8).max(128), next: z.unknown().optional(),
  consent: z.union([z.literal('on'), z.literal(true)]), policyVersion: z.literal(LEGAL.version) })
export async function POST(req: NextRequest) {
  try {
    if (!validAuthOrigin(req)) return authFormResponse(req, '/auth/signup', 'error', 'Invalid request origin', 403)
    const parsed = SignupSchema.safeParse(await readAuthBody(req))
    if (!parsed.success) return authFormResponse(req, '/auth/signup', 'error', 'Use a valid email and password, confirm you are 18 or over, and accept the current terms.', 400)
    const { email, password } = parsed.data
    const settings = await getPlatformSettings()
    if (!settings.signupEnabled) {
      const { data: { user } } = await (await createClientWithDeferredCookies()).client.auth.getUser()
      if (!isVerifiedOwnerIdentity(user) || user?.email?.trim().toLowerCase() !== email.trim().toLowerCase()) return authFormResponse(req, '/auth/signup', 'error', 'New registrations are temporarily closed.', 403)
    }
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
        const limiter = new Ratelimit({ redis: Redis.fromEnv(), limiter: Ratelimit.slidingWindow(signupWeeklyIpLimit(), '7 d'), prefix: 'validore:signup_ip' })
        if (!(await limiter.limit(clientIp)).success) return authFormResponse(req, '/auth/signup', 'error', 'Too many account registrations from this network. Please try again later.', 429)
      } catch {
        console.error('[auth/signup] Registration limiter unavailable')
        return authFormResponse(req, '/auth/signup', 'error', 'Registration is temporarily unavailable. Please try again later.', 503)
      }
    }
    const { client: supabase, commitCookies } = await createClientWithDeferredCookies()
    const origin = authOrigin(req)
    let next = safeNextPath(parsed.data.next, origin)
    const callback = new URL('/auth/callback', origin)
    if (next !== '/dashboard') callback.searchParams.set('next', next)
    const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: callback.toString(),
      data: { terms_version: LEGAL.version, terms_accepted_at: new Date().toISOString() } } })
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
        profile = await syncUserToDatabase(data.user)
        if (!profile) {
          if (!(await getPlatformSettings()).signupEnabled && !isVerifiedOwnerIdentity(data.user)) {
            await supabase.auth.signOut({ scope: 'local' })
            commitCookies()
            return authFormResponse(req, '/auth/signup', 'error', 'New registrations are temporarily closed.', 403)
          }
          const limit = await registrationLimit(req)
          if (!limit.allowed) {
            await supabase.auth.signOut({ scope: 'local' })
            return authFormResponse(req, '/auth/signup', 'error', limit.message, limit.status)
          }
          profile = await syncUserToDatabase(data.user, { createNew: true })
        }
      } catch (error) {
        await supabase.auth.signOut({ scope: 'local' })
        throw error
      }
      if (!profile) {
        await supabase.auth.signOut({ scope: 'local' })
        return authFormResponse(req, '/auth/signup', 'error', 'This account needs support before it can access the workspace.', 409)
      }
      if (!isActiveAccount(profile)) {
        await supabase.auth.signOut({ scope: 'local' })
        commitCookies()
        return authFormResponse(req, '/auth/signin', 'error', 'This account is not active. Contact support for help.', 403)
      }
      next = authenticatedDestination(data.user, profile, next)
    }
    commitCookies()
    if (!req.headers.get('content-type')?.includes('application/json')) {
      if (data?.session) return NextResponse.redirect(new URL(next, origin), 303)
      return authFormResponse(req, '/auth/signin', 'message', 'Check your email to verify your account, then sign in.', 200, next)
    }
    return NextResponse.json({ user: data.user, session: data.session, next })
  } catch (error) {
    console.error('[auth/signup] Failed:', error)
    return authFormResponse(req, '/auth/signup', 'error', 'Registration is temporarily unavailable. Please try again later.', 503)
  }
}
