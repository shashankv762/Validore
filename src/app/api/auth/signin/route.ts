import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { syncUserToDatabase } from '@/lib/auth-sync'

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

    if (!email || !password) {
      if (isHtmlBrowserForm) {
        const errorUrl = new URL('/auth/signin', req.url)
        errorUrl.searchParams.set('error', 'Email and password are required')
        return NextResponse.redirect(errorUrl, 303)
      }
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      )
    }

    const supabase = await createClient()
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error || !data?.user) {
      const message = error?.message || 'Authentication failed'
      if (isHtmlBrowserForm) {
        const errorUrl = new URL('/auth/signin', req.url)
        errorUrl.searchParams.set('error', message)
        return NextResponse.redirect(errorUrl, 303)
      }
      return NextResponse.json({ error: message }, { status: 400 })
    }

    // Auto-sync authenticated user into PostgreSQL users table
    await syncUserToDatabase({
      id: data.user.id,
      email: data.user.email,
    })

    if (isHtmlBrowserForm) {
      const redirectUrl = new URL('/dashboard', req.url)
      return NextResponse.redirect(redirectUrl, 303)
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
