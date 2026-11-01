export function contentSecurityPolicy(nonce?: string, production = process.env.NODE_ENV === 'production') {
  let authOrigin = ''
  try {
    const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || '')
    if (url.protocol === 'https:' || (!production && ['localhost', '127.0.0.1'].includes(url.hostname))) authOrigin = url.origin
  } catch { /* Unconfigured auth does not widen the policy. */ }
  const scripts = nonce ? "'self' 'nonce-" + nonce + "' 'strict-dynamic'" : "'self' 'unsafe-inline'"
  return [
    "default-src 'self'",
    'script-src ' + scripts + (production ? '' : " 'unsafe-eval'"),
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self' " + authOrigin + (production ? '' : ' ws: wss:'),
    "object-src 'none'",
    "base-uri 'self'",
    // Native auth POSTs redirect to the configured Supabase/Google OAuth flow.
    "form-action 'self' " + authOrigin + ' https://accounts.google.com',
    "frame-ancestors 'none'",
    // Rewarded ads use an authenticated player document on our own origin.
    // External ad origins are allowed only inside that document's policy.
    "frame-src 'self'",
    ...(production ? ['upgrade-insecure-requests'] : []),
  ].join('; ')
}
