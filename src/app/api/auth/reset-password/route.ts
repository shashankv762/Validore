import { NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { readAuthBody, authFormResponse, validAuthOrigin } from '@/lib/auth-form'
const PasswordSchema = z.object({ password: z.string().min(8).max(128) })
export async function POST(request: NextRequest) {
  if (!validAuthOrigin(request)) return authFormResponse(request, '/auth/reset-password', 'error', 'Invalid request origin', 403)
  const parsed = PasswordSchema.safeParse(await readAuthBody(request))
  if (!parsed.success) return authFormResponse(request, '/auth/reset-password', 'error', 'Use a password with 8–128 characters.', 400)
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return authFormResponse(request, '/auth/forgot-password', 'error', 'Your reset link has expired. Request a new one.', 401)
    const { error } = await supabase.auth.updateUser({ password: parsed.data.password })
    if (error) return authFormResponse(request, '/auth/reset-password', 'error', 'This password could not be saved. Choose another password and try again.', 400)
    return authFormResponse(request, '/auth/reset-password', 'message', 'Your password has been updated.')
  } catch {
    return authFormResponse(request, '/auth/reset-password', 'error', 'Your password could not be saved. Please try again.', 503)
  }
}
