import { NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { readAuthBody, authFormResponse, validAuthOrigin } from '@/lib/auth-form'
const PasswordSchema = z.object({ password: z.string().min(8).max(128), currentPassword: z.string().max(128).optional() })
export async function POST(request: NextRequest) {
  if (!validAuthOrigin(request)) return authFormResponse(request, '/auth/reset-password', 'error', 'Invalid request origin', 403)
  const parsed = PasswordSchema.safeParse(await readAuthBody(request))
  if (!parsed.success) return authFormResponse(request, '/auth/reset-password', 'error', 'Use a password with 8–128 characters.', 400)
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return authFormResponse(request, '/auth/forgot-password', 'error', 'Your reset link has expired. Request a new one.', 401)
    const { error } = await supabase.auth.updateUser({ password: parsed.data.password,
      ...(parsed.data.currentPassword ? { current_password: parsed.data.currentPassword } : {}) })
    if (error?.code === 'current_password_required') return authFormResponse(request, '/auth/reset-password', 'error', 'Enter your current password, or request a fresh password-reset email.', 400)
    if (error?.code === 'weak_password') return authFormResponse(request, '/auth/reset-password', 'error', 'Choose a stronger, unique password with at least 12 characters, mixed case, a number and a symbol.', 400)
    if (error?.status === 429) return authFormResponse(request, '/auth/reset-password', 'error', 'Please wait before changing your password again.', 429)
    if (error) return authFormResponse(request, '/auth/reset-password', 'error', 'This password could not be saved. Choose another password and try again.', 400)
    return authFormResponse(request, '/auth/reset-password', 'message', 'Your password has been updated.')
  } catch {
    return authFormResponse(request, '/auth/reset-password', 'error', 'Your password could not be saved. Please try again.', 503)
  }
}
