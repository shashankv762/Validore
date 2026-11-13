import { createClient } from '@supabase/supabase-js'
import { AdminOperationError } from '@/lib/admin-requests'

/** Privileged identity operations stay on the server and never enter an account DTO. */
export function createAuthAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new AdminOperationError('Account deletion is unavailable until the authentication administrator key is configured.', 503, 'identity_admin_unavailable')
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => fetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(10_000) }) },
  })
}
