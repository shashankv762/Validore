import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { authFormResponse, authOrigin, validAuthOrigin, readAuthBody } from '@/lib/auth-form'
import { safeNextPath } from '@/lib/auth-redirect'
import { getAuthSettings } from '@/lib/supabase/auth-settings'
import { LEGAL } from '@/lib/legal'

export async function POST(req: NextRequest) {
  try {
    if (!validAuthOrigin(req)) return authFormResponse(req, '/auth/signin', 'error', 'Invalid request origin', 403)
    const settings = await getAuthSettings()
    if (!settings?.external?.google) {
      return authFormResponse(req, '/auth/signin', 'error', 'Google sign-in is not available yet. Please sign in with email.', 503)
    }
    const supabase = await createClient()
    const origin = authOrigin(req)
    const body = await readAuthBody(req)
    if (body && typeof body === 'object' && 'intent' in body && body.intent === 'signup' &&
      (!('consent' in body) || !['on', true].includes(body.consent as string | boolean) || !('policyVersion' in body) || body.policyVersion !== LEGAL.version)) {
      return authFormResponse(req, '/auth/signup', 'error', 'Confirm you are 18 or over and accept the current terms before continuing.', 400)
    }
    const next = safeNextPath(body && typeof body === 'object' && 'next' in body ? body.next : undefined, origin)
    const callback = new URL('/auth/callback', origin)
    if (next !== '/dashboard') callback.searchParams.set('next', next)

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: callback.toString(),
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
