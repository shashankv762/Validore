import { NextResponse } from 'next/server'

const MARKETING_ORIGINS = new Set(['https://validore.tech', 'https://www.validore.tech'])

function responseHeaders(request: Request): Headers {
  const headers = new Headers({ 'Cache-Control': 'no-store', Vary: 'Origin' })
  const origin = request.headers.get('origin')
  // Optional exact preview origins apply ONLY to this DB-free liveness route.
  // They never authorize authentication, account data or credit mutations.
  const allowed = new Set(MARKETING_ORIGINS)
  for (const value of (process.env.HEALTH_CHECK_ALLOWED_ORIGINS || '').split(',')) {
    try {
      const url = new URL(value.trim())
      if (url.origin === value.trim() && url.protocol === 'https:' && !url.username && !url.password) allowed.add(url.origin)
    } catch { /* Ignore invalid origins; never reflect arbitrary request input. */ }
  }
  if (process.env.NODE_ENV !== 'production') {
    allowed.add('http://127.0.0.1:4174')
    allowed.add('http://localhost:4174')
  }
  if (origin && allowed.has(origin)) {
    headers.set('Access-Control-Allow-Origin', origin)
    headers.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')
  }
  return headers
}

// Lightweight liveness probe for container orchestrators and uptime checks.
// Deliberately unauthenticated and DB-free: it answers "is the process
// serving?" — deep checks (DB, AI providers) belong in a readiness probe,
// which this app does not gate on.
export async function GET(request: Request) {
  return NextResponse.json(
    {
      status: 'ok',
      service: 'validore',
      commit: process.env.BUILD_COMMIT_SHA || undefined,
      timestamp: new Date().toISOString(),
    },
    {
      headers: responseHeaders(request),
    }
  )
}

export async function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: responseHeaders(request) })
}
