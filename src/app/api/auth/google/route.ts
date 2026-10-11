import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const origin = new URL(req.url).origin

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${origin}/auth/callback`,
      },
    })

    if (error) {
      const errorUrl = new URL('/auth/signin', req.url)
      errorUrl.searchParams.set('error', error.message)
      return NextResponse.redirect(errorUrl, 303)
    }

    if (data?.url) {
      return NextResponse.redirect(data.url, 303)
    }

    return NextResponse.redirect(new URL('/auth/signin?error=oauth_failed', req.url), 303)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'OAuth initiation failed'
    const errorUrl = new URL('/auth/signin', req.url)
    errorUrl.searchParams.set('error', message)
    return NextResponse.redirect(errorUrl, 303)
  }
}
