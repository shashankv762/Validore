import { NextRequest } from 'next/server'
import { z } from 'zod'
import { createHash } from 'node:crypto'
import { createClient } from '@/lib/supabase/server'
import { rateLimitCheck } from '@/lib/rate-limit'
import { readAuthBody, authFormResponse, validAuthOrigin } from '@/lib/auth-form'
const EmailSchema = z.object({ email: z.string().trim().email().max(320) })
export async function POST(request: NextRequest) {
  if (!validAuthOrigin(request)) return authFormResponse(request, '/auth/forgot-password', 'error', 'Invalid request origin', 403)
  const parsed = EmailSchema.safeParse(await readAuthBody(request))
  if (!parsed.success) return authFormResponse(request, '/auth/forgot-password', 'error', 'Enter a valid email address.', 400)
  try {
    const identifier = createHash('sha256').update(parsed.data.email.toLowerCase()).digest('hex')
    if (!(await rateLimitCheck('recovery:' + identifier)).success) return authFormResponse(request, '/auth/forgot-password', 'error', 'Wait a minute before requesting another reset link.', 429)
    const origin = new URL(process.env.NEXT_PUBLIC_APP_URL || request.url).origin
    const supabase = await createClient()
    // Generic response protects account existence. Delivery and provider rate limits remain server-side.
    const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, { redirectTo: origin + '/auth/callback?next=/auth/reset-password' })
    if (error?.status === 429) return authFormResponse(request, '/auth/forgot-password', 'error', 'Wait before requesting another reset link.', 429)
    if (error && (!error.status || error.status >= 500)) return authFormResponse(request, '/auth/forgot-password', 'error', 'Reset links are temporarily unavailable. Please try again later.', 503)
    return authFormResponse(request, '/auth/forgot-password', 'message', 'If an account uses this email, a reset link will arrive shortly.')
  } catch {
    return authFormResponse(request, '/auth/forgot-password', 'error', 'Reset links are temporarily unavailable. Please try again later.', 503)
  }
}
