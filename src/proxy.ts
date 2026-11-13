import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { safeNextPath } from '@/lib/auth-redirect'
import { guardApiRequest, PRIVATE_HEADERS } from '@/lib/api-security'
import { contentSecurityPolicy } from '@/lib/security-headers'
import { syncUserToDatabase } from '@/lib/auth-sync'
import { authenticatedDestination, isActiveAccount, isOwnerAccount, isVerifiedOwnerIdentity } from '@/lib/admin-access'
import { getPlatformSettings } from '@/lib/platform-settings'

export async function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith('/api/')) {
    const denied = await guardApiRequest(request)
    if (denied) return denied
    return NextResponse.next({ headers: PRIVATE_HEADERS })
  }
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64')
  const policy = contentSecurityPolicy(nonce)
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set('Content-Security-Policy', policy)
  const nextResponse = () => {
    const result = NextResponse.next({ request: { headers: requestHeaders } })
    result.headers.set('Content-Security-Policy', policy)
    return result
  }
  let response = nextResponse()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return NextResponse.json({ error: 'Authentication is temporarily unavailable' }, { status: 503 })
  const supabase = createServerClient(url, key, {
    cookieOptions: { sameSite: 'lax', secure: process.env.NODE_ENV === 'production' },
    cookies: {
      getAll() { return request.cookies.getAll() },
      setAll(cookies) {
        cookies.forEach(({ name, value }) => request.cookies.set(name, value))
        requestHeaders.set('cookie', request.cookies.toString())
        response = nextResponse()
        cookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
      },
    },
  })
  const { data: { user } } = await supabase.auth.getUser()
  let profile
  if (user) {
    try {
      profile = await syncUserToDatabase(user, { createNew: false, promoteOwner: false })
      if (profile && !isActiveAccount(profile)) return NextResponse.json({ error: 'This account is not active.' }, { status: 403, headers: PRIVATE_HEADERS })
      if (request.nextUrl.pathname.startsWith('/dashboard') || request.nextUrl.pathname.startsWith('/admin')) {
        const settings = await getPlatformSettings()
        const owner = isVerifiedOwnerIdentity(user) && (!profile || (isOwnerAccount(profile) && profile.supabaseId === user.id))
        if (settings.maintenanceEnabled && !owner) return NextResponse.json({ error: settings.maintenanceMessage || 'The workspace is temporarily under maintenance.' }, { status: 503, headers: PRIVATE_HEADERS })
      }
    } catch {
      return NextResponse.json({ error: 'Account access is temporarily unavailable.' }, { status: 503, headers: PRIVATE_HEADERS })
    }
  }
  const redirect = (url: URL) => {
    const result = NextResponse.redirect(url)
    response.cookies.getAll().forEach(cookie => result.cookies.set(cookie))
    result.headers.set('Cache-Control', 'private, no-store')
    return result
  }
  if (!user && (request.nextUrl.pathname.startsWith('/dashboard') || request.nextUrl.pathname.startsWith('/admin'))) {
    const url = request.nextUrl.clone()
    url.pathname = '/auth/signin'
    url.search = ''
    url.searchParams.set('next', request.nextUrl.pathname + request.nextUrl.search)
    return redirect(url)
  }
  if (user && (request.nextUrl.pathname === '/auth/signin' || request.nextUrl.pathname === '/auth/signup')) {
    const destination = safeNextPath(request.nextUrl.searchParams.get('next'), request.nextUrl.origin)
    const url = new URL(profile ? authenticatedDestination(user, profile, destination) : destination, request.nextUrl.origin)
    return redirect(url)
  }
  response.headers.set('Cache-Control', 'private, no-store')
  return response
}

// Public pages, health probes, signed webhooks, and assets need no auth round trip.
export const config = { matcher: ['/admin/:path*', '/dashboard/:path*', '/share/:path*', '/auth/signin', '/auth/signup', '/auth/complete-signup', '/api/:path*'] }
