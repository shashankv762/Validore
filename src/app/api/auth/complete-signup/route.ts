import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { syncUserToDatabase } from '@/lib/auth-sync'
import { authFormResponse, authOrigin, readAuthBody } from '@/lib/auth-form'
import { isSameOriginMutation, PRIVATE_HEADERS } from '@/lib/api-security'
import { safeNextPath } from '@/lib/auth-redirect'
import { isDisposableEmail } from '@/lib/email-validator'
import { registrationLimit } from '@/lib/registration-limit'
import { LEGAL } from '@/lib/legal'
import { authenticatedDestination, isActiveAccount, isVerifiedOwnerIdentity } from '@/lib/admin-access'
import { getPlatformSettings } from '@/lib/platform-settings'

const Input = z.object({ consent: z.union([z.literal('on'), z.literal(true)]), policyVersion: z.literal(LEGAL.version), next: z.unknown().optional() })
export async function POST(request: NextRequest) {
  try {
    if (!isSameOriginMutation(request)) return authFormResponse(request, '/auth/complete-signup', 'error', 'Invalid request origin', 403)
    const parsed = Input.safeParse(await readAuthBody(request))
    if (!parsed.success) return authFormResponse(request, '/auth/complete-signup', 'error', 'Confirm you are 18 or over and accept the current terms.', 400)
    const { data: { user } } = await (await createClient()).auth.getUser()
    if (!user) return authFormResponse(request, '/auth/signin', 'error', 'Sign in before completing your registration.', 401)
    if (!user.email || !user.email_confirmed_at) return authFormResponse(request, '/auth/complete-signup', 'error', 'Verify your email before opening your workspace.', 403, parsed.data.next)
    let profile = await syncUserToDatabase(user)
    if (!profile) {
      if (!(await getPlatformSettings()).signupEnabled && !isVerifiedOwnerIdentity(user)) return authFormResponse(request, '/auth/complete-signup', 'error', 'New registrations are temporarily closed.', 403, parsed.data.next)
      if (isDisposableEmail(user.email)) return authFormResponse(request, '/auth/complete-signup', 'error', 'Please use a permanent email address', 400, parsed.data.next)
      const limit = await registrationLimit(request)
      if (!limit.allowed) return authFormResponse(request, '/auth/complete-signup', 'error', limit.message, limit.status, parsed.data.next)
      profile = await syncUserToDatabase(user, { createNew: true })
    }
    if (!profile) return authFormResponse(request, '/auth/complete-signup', 'error', 'This account needs support before it can access the workspace.', 409, parsed.data.next)
    if (!isActiveAccount(profile)) return authFormResponse(request, '/auth/signin', 'error', 'This account is not active. Contact support for help.', 403)
    const origin = authOrigin(request)
    const next = authenticatedDestination(user, profile, safeNextPath(parsed.data.next, origin))
    if (request.headers.get('content-type')?.includes('application/json')) return NextResponse.json({ next }, { headers: PRIVATE_HEADERS })
    return NextResponse.redirect(new URL(next, origin), 303)
  } catch {
    return authFormResponse(request, '/auth/complete-signup', 'error', 'Registration is temporarily unavailable. Please try again later.', 503)
  }
}
