import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { syncUserToDatabase } from '@/lib/auth-sync'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const next = requestUrl.searchParams.get('next') ?? '/dashboard'

  if (code) {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error && data?.user) {
      await syncUserToDatabase({
        id: data.user.id,
        email: data.user.email,
      })
      return NextResponse.redirect(new URL(next, request.url))
    }
  }

  // Fallback if no code provided or exchange failed
  return NextResponse.redirect(
    new URL('/auth/signin?error=auth_callback_failed', request.url)
  )
}