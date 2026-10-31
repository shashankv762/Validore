import { NextRequest, NextResponse } from 'next/server'

export async function readAuthBody(request: NextRequest): Promise<unknown> {
  if (request.headers.get('content-type')?.includes('application/json')) return request.json().catch(() => null)
  const form = await request.formData().catch(() => null)
  return form ? Object.fromEntries(form.entries()) : null
}
export function authFormResponse(request: NextRequest, path: string, kind: 'error' | 'message', message: string, status = 200) {
  if (request.headers.get('content-type')?.includes('application/json')) return NextResponse.json({ [kind]: message }, { status })
  const url = new URL(path, authOrigin(request))
  url.searchParams.set(kind, message)
  return NextResponse.redirect(url, 303)
}
export function validAuthOrigin(request: NextRequest) {
  const origin = request.headers.get('origin')
  return !origin || origin === servedOrigin(request) || configuredOrigins().includes(origin)
}

function servedOrigin(request: NextRequest) {
  const url = new URL(request.url)
  // Next dev can normalize request.url to localhost while the browser uses 127.0.0.1.
  // Only local development accepts a loopback Host alias; production uses its configured origin.
  if (process.env.NODE_ENV !== 'production') {
    try {
      const host = new URL(url.protocol + '//' + request.headers.get('host'))
      if (['localhost', '127.0.0.1', '[::1]'].includes(host.hostname) && host.port === url.port) return host.origin
    } catch {}
  } else {
    // Render terminates TLS before Next.js. Resolve the public scheme only for
    // explicitly configured app hosts, never from arbitrary forwarding headers.
    const host = (request.headers.get('host') || url.host).toLowerCase()
    const publicOrigin = configuredOrigins().find(origin => new URL(origin).host === host)
    if (publicOrigin) return publicOrigin
  }
  return url.origin
}

function configuredOrigin() {
  try {
    return process.env.NEXT_PUBLIC_APP_URL ? new URL(process.env.NEXT_PUBLIC_APP_URL).origin : undefined
  } catch {
    return undefined
  }
}

function configuredOrigins() {
  return [configuredOrigin(), ...(process.env.AUTH_ALLOWED_ORIGINS || '').split(',').map(value => {
    try {
      const url = new URL(value.trim())
      return url.protocol === 'https:' && !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash ? url.origin : undefined
    } catch { return undefined }
  })].filter((origin): origin is string => Boolean(origin))
}

export function authOrigin(request: NextRequest) {
  const origin = request.headers.get('origin')
  if (origin && validAuthOrigin(request)) return origin
  const requestOrigin = servedOrigin(request)
  if (process.env.NODE_ENV === 'production') return configuredOrigins().includes(requestOrigin) ? requestOrigin : configuredOrigin() || requestOrigin
  return requestOrigin
}
