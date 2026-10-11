import { NextResponse } from 'next/server'

// Lightweight liveness probe for container orchestrators and uptime checks.
// Deliberately unauthenticated and DB-free: it answers "is the process
// serving?" — deep checks (DB, AI providers) belong in a readiness probe,
// which this app does not gate on.
export async function GET() {
  return NextResponse.json(
    {
      status: 'ok',
      service: 'validore',
      timestamp: new Date().toISOString(),
    },
    {
      headers: {
        'Cache-Control': 'no-store',
      },
    }
  )
}
