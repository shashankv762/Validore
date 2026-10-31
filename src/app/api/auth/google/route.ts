import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { authFormResponse, authOrigin, validAuthOrigin } from '@/lib/auth-form'
import { getAuthSettings } from '@/lib/supabase/auth-settings'

export async function POST(req: NextRequest) {
  try {
    if (!validAuthOrigin(req)) return authFormResponse(req, '/auth/signin', 'error', 'Invalid request origin', 403)
    const settings = await getAuthSettings()
    if (!settings?.external?.google) {
      return authFormResponse(req, '/auth/signin', 'error', 'Google sign-in is not available yet. Please sign in with email.', 503)
    }
    const supabase = await createClient()
    const origin = authOrigin(req)

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${origin}/auth/callback`,
      },
    })

    if (error) {
      console.error('[auth/google] Provider rejected sign-in', { status: error.status, code: error.code })
      return authFormResponse(req, '/auth/signin', 'error', 'Google sign-in is temporarily unavailable. Please use email or try again later.', 503)
    }

    if (data?.url) {
      return NextResponse.redirect(data.url, 303)
    }

    return authFormResponse(req, '/auth/signin', 'error', 'Google sign-in is temporarily unavailable. Please use email or try again later.', 503)
  } catch (err: unknown) {
    console.error('[auth/google] Sign-in failed', { name: err instanceof Error ? err.name : 'UnknownError' })
    return authFormResponse(req, '/auth/signin', 'error', 'Google sign-in is temporarily unavailable. Please use email or try again later.', 503)
  }
}
