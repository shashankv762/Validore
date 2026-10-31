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
  return !origin || origin === servedOrigin(request) || origin === configuredOrigin()
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

export function authOrigin(request: NextRequest) {
  const origin = request.headers.get('origin')
  if (origin && validAuthOrigin(request)) return origin
  const requestOrigin = servedOrigin(request)
  return process.env.NODE_ENV === 'production' ? configuredOrigin() || requestOrigin : requestOrigin
}
