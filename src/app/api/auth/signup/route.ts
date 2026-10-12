import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { syncUserToDatabase } from '@/lib/auth-sync'
import { isDisposableEmail } from '@/lib/email-validator'
import { readAuthBody, authFormResponse, validAuthOrigin } from '@/lib/auth-form'

const SignupSchema = z.object({ email: z.string().trim().email().max(320), password: z.string().min(8).max(128) })
export async function POST(req: NextRequest) {
  try {
    if (!validAuthOrigin(req)) return authFormResponse(req, '/auth/signup', 'error', 'Invalid request origin', 403)
    const parsed = SignupSchema.safeParse(await readAuthBody(req))
    if (!parsed.success) return authFormResponse(req, '/auth/signup', 'error', 'Use a valid email and a password of 8 to 128 characters.', 400)
    const { email, password } = parsed.data
    if (isDisposableEmail(email)) return authFormResponse(req, '/auth/signup', 'error', 'Please use a permanent email address', 400)
    // Only trust forwarding headers supplied by the configured ingress proxy.
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || ''
    const redisConfigured = process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    if (process.env.NODE_ENV === 'production' && (!redisConfigured || !clientIp)) {
      return authFormResponse(req, '/auth/signup', 'error', 'Registration is temporarily unavailable. Please try again later.', 503)
    }
    if (clientIp && redisConfigured) {
      try {
        const { Ratelimit } = await import('@upstash/ratelimit')
        const { Redis } = await import('@upstash/redis')
        const limiter = new Ratelimit({ redis: Redis.fromEnv(), limiter: Ratelimit.slidingWindow(3, '7 d'), prefix: 'validore:signup_ip' })
        if (!(await limiter.limit(clientIp)).success) return authFormResponse(req, '/auth/signup', 'error', 'Too many account registrations from this network. Please try again later.', 429)
      } catch {
        return authFormResponse(req, '/auth/signup', 'error', 'Registration is temporarily unavailable. Please try again later.', 503)
      }
    }
    const supabase = await createClient()
    const origin = new URL(process.env.NEXT_PUBLIC_APP_URL || req.url).origin
    const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: origin + '/auth/callback' } })
    if (error) return authFormResponse(req, '/auth/signup', 'error', 'Unable to create an account. Check your details and try again later.', 400)
    if (data?.session && data.user) {
      const profile = await syncUserToDatabase({ id: data.user.id, email: data.user.email })
      if (!profile) return authFormResponse(req, '/auth/signup', 'error', 'This account needs support before it can access the workspace.', 409)
    }
    if (!req.headers.get('content-type')?.includes('application/json')) {
      if (data?.session) return NextResponse.redirect(new URL('/dashboard', req.url), 303)
      return authFormResponse(req, '/auth/signin', 'message', 'Check your email to verify your account, then sign in.')
    }
    return NextResponse.json({ user: data.user, session: data.session })
  } catch (error) {
    console.error('[auth/signup] Failed:', error)
    return authFormResponse(req, '/auth/signup', 'error', 'Registration is temporarily unavailable. Please try again later.', 503)
  }
}
