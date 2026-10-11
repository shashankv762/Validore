import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { syncUserToDatabase } from '@/lib/auth-sync'
import { isDisposableEmail } from '@/lib/email-validator'

export async function POST(req: NextRequest) {
  try {
    let email = ''
    let password = ''

    const contentType = req.headers.get('content-type') || ''
    if (contentType.includes('application/json')) {
      const body = await req.json().catch(() => ({}))
      email = (body.email || '').trim()
      password = body.password || ''
    } else {
      const formData = await req.formData().catch(() => null)
      if (formData) {
        email = ((formData.get('email') as string) || '').trim()
        password = (formData.get('password') as string) || ''
      }
    }

    const acceptHeader = req.headers.get('accept') || ''
    const isHtmlBrowserForm =
      acceptHeader.includes('text/html') && !acceptHeader.includes('application/json')

    if (email && isDisposableEmail(email)) {
      if (isHtmlBrowserForm) {
        const errorUrl = new URL('/auth/signup', req.url)
        errorUrl.searchParams.set('error', 'Please use a permanent email address')
        return NextResponse.redirect(errorUrl, 303)
      }
      return NextResponse.json(
        { error: 'Please use a permanent email address' },
        { status: 400 }
      )
    }

    if (!email || !password) {
      if (isHtmlBrowserForm) {
        const errorUrl = new URL('/auth/signup', req.url)
        errorUrl.searchParams.set('error', 'Email and password are required')
        return NextResponse.redirect(errorUrl, 303)
      }
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      )
    }

    // IP rate limiting — max 3 signups per IP per 7 days
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip') || 'unknown'
    if (clientIp !== 'unknown' && process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
      try {
        const { Ratelimit } = await import('@upstash/ratelimit')
        const { Redis } = await import('@upstash/redis')
        const redis = Redis.fromEnv()
        const signupLimiter = new Ratelimit({
          redis,
          limiter: Ratelimit.slidingWindow(3, '7 d'),
          prefix: 'validore:signup_ip',
        })
        const { success } = await signupLimiter.limit(clientIp)
        if (!success) {
          if (isHtmlBrowserForm) {
            const errorUrl = new URL('/auth/signup', req.url)
            errorUrl.searchParams.set('error', 'Too many account registrations from this network. Please try again later.')
            return NextResponse.redirect(errorUrl, 303)
          }
          return NextResponse.json(
            { error: 'Too many account registrations from this network. Please try again later.' },
            { status: 429 }
          )
        }
      } catch (err) {
        console.warn('[SIGNUP-RATE-LIMIT] Redis check failed, allowing through:', err)
      }
    }

    const supabase = await createClient()
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    })

    if (error) {
      if (isHtmlBrowserForm) {
        const errorUrl = new URL('/auth/signup', req.url)
        errorUrl.searchParams.set('error', error.message)
        return NextResponse.redirect(errorUrl, 303)
      }
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    if (data?.user) {
      // Auto-sync authenticated user into PostgreSQL users table
      await syncUserToDatabase({
        id: data.user.id,
        email: data.user.email,
      })
    }

    if (isHtmlBrowserForm) {
      // If session exists, user is already signed in (auto-confirm enabled)
      if (data?.session) {
        return NextResponse.redirect(new URL('/dashboard', req.url), 303)
      }
      // If confirmation email required, redirect to signin with info message
      const infoUrl = new URL('/auth/signin', req.url)
      infoUrl.searchParams.set(
        'message',
        'Account created! Please check your email to verify your account or sign in.'
      )
      return NextResponse.redirect(infoUrl, 303)
    }

    return NextResponse.json({
      user: data.user,
      session: data.session,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
