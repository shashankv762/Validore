import { randomBytes } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/db'
import { rewardedAdSessions, users } from '@/db/schema'
import { createClient } from '@/lib/supabase/server'
import { PRIVATE_HEADERS } from '@/lib/api-security'
import { rewardedAdConfig } from '@/lib/ads/config'
import { rewardedPlayerDocument, rewardedPlayerPolicy } from '@/lib/ads/player'

export const dynamic = 'force-dynamic'
export async function GET(request: NextRequest) {
  try {
    const config = rewardedAdConfig()
    if (!config) return new NextResponse('Ads are unavailable.', { status: 503, headers: PRIVATE_HEADERS })
    const parsed = z.string().uuid().safeParse(request.nextUrl.searchParams.get('sessionId'))
    if (!parsed.success) return new NextResponse('Invalid ad session.', { status: 400, headers: PRIVATE_HEADERS })
    const { data: { user } } = await (await createClient()).auth.getUser()
    if (!user?.email_confirmed_at) return new NextResponse('Sign in with a verified email.', { status: 401, headers: PRIVATE_HEADERS })
    const owner = await db.query.users.findFirst({ where: eq(users.supabaseId, user.id), columns: { id: true } })
    const session = owner && await db.query.rewardedAdSessions.findFirst({ where: and(eq(rewardedAdSessions.id, parsed.data), eq(rewardedAdSessions.userId, owner.id)) })
    if (!session || session.status !== 'pending' || session.provider !== config.provider || session.expiresAt <= new Date()) return new NextResponse('Ad session is no longer available.', { status: 409, headers: PRIVATE_HEADERS })
    const nonce = randomBytes(16).toString('base64')
    return new NextResponse(rewardedPlayerDocument(config.apiKey, session.id, nonce), { headers: {
      ...PRIVATE_HEADERS, 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': rewardedPlayerPolicy(nonce),
      'X-Frame-Options': 'SAMEORIGIN', 'Referrer-Policy': 'strict-origin-when-cross-origin',
    } })
  } catch {
    return new NextResponse('Your ad could not be loaded. Please close this window and try again.', { status: 503, headers: PRIVATE_HEADERS })
  }
}
