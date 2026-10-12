import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return NextResponse.json({ error: 'Authentication is temporarily unavailable' }, { status: 503 })
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() { return request.cookies.getAll() },
      setAll(cookies) {
        cookies.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request })
        cookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
      },
    },
  })
  const { data: { user } } = await supabase.auth.getUser()
  const redirect = (url: URL) => {
    const result = NextResponse.redirect(url)
    response.cookies.getAll().forEach(cookie => result.cookies.set(cookie))
    result.headers.set('Cache-Control', 'private, no-store')
    return result
  }
  if (!user && request.nextUrl.pathname.startsWith('/dashboard')) {
    const url = request.nextUrl.clone()
    url.pathname = '/auth/signin'
    url.search = ''
    url.searchParams.set('next', request.nextUrl.pathname + request.nextUrl.search)
    return redirect(url)
  }
  if (user && (request.nextUrl.pathname === '/auth/signin' || request.nextUrl.pathname === '/auth/signup')) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    url.search = ''
    return redirect(url)
  }
  response.headers.set('Cache-Control', 'private, no-store')
  return response
}

// Public pages, health probes, signed webhooks, and assets need no auth round trip.
export const config = { matcher: ['/dashboard/:path*', '/auth/signin', '/auth/signup'] }
