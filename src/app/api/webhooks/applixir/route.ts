import { NextRequest, NextResponse } from 'next/server'
import { PRIVATE_HEADERS } from '@/lib/api-security'
import { rewardedAdConfig } from '@/lib/ads/config'
import { verifyApplixirCallback } from '@/lib/ads/applixir'
import { grantAdReward } from '@/lib/ads/rewards'

export const dynamic = 'force-dynamic'
export async function GET(request: NextRequest) {
  const config = rewardedAdConfig()
  if (!config) return NextResponse.json({ error: 'Rewards unavailable' }, { status: 503, headers: PRIVATE_HEADERS })
  if (request.url.length > 8192) return new NextResponse(null, { status: 414, headers: PRIVATE_HEADERS })
  const claim = verifyApplixirCallback(request.nextUrl.searchParams, config)
  if (!claim) return NextResponse.json({ error: 'Invalid signature' }, { status: 403, headers: PRIVATE_HEADERS })
  try {
    const result = await grantAdReward(claim, config)
    return NextResponse.json({ ok: true, result }, { headers: PRIVATE_HEADERS })
  } catch {
    // No query strings: some provider versions include the raw callback secret.
    console.error('[rewards] Verified callback could not be saved')
    return NextResponse.json({ error: 'Please retry' }, { status: 503, headers: PRIVATE_HEADERS })
  }
}
