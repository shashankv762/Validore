import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { users } from '@/db/schema'
import { createClient } from '@/lib/supabase/server'
import { isSameOriginMutation, PRIVATE_HEADERS, readJsonBody, RequestBodyError } from '@/lib/api-security'
import { rateLimitCheck } from '@/lib/rate-limit'
import { AD_REWARD_CREDITS, rewardedAdConfig } from '@/lib/ads/config'
import { cancelRewardSession, RewardError, rewardStatus, startRewardSession } from '@/lib/ads/rewards'

export const dynamic = 'force-dynamic'
const respond = (data: unknown, status = 200, retryAfter?: number) => NextResponse.json(data, {
  status, headers: { ...PRIVATE_HEADERS, ...(retryAfter ? { 'Retry-After': String(retryAfter) } : {}) },
})
async function account() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new RewardError('Sign in to earn credits.', 401)
  const owner = await db.query.users.findFirst({ where: eq(users.supabaseId, user.id), columns: { id: true } })
  if (!owner) throw new RewardError('Account not found.', 404)
  return { id: owner.id, verified: Boolean(user.email_confirmed_at) }
}
function failure(error: unknown) {
  if (error instanceof RewardError) return respond({ error: error.message }, error.status, error.retryAfter)
  if (error instanceof RequestBodyError) return respond({ error: error.message }, error.status)
  console.error('[rewards] Unable to process reward request')
  return respond({ error: 'Rewards are temporarily unavailable. Please try again.' }, 503)
}

export async function GET(request: NextRequest) {
  try {
    const owner = await account()
    const config = rewardedAdConfig()
    if (!config) return respond({ enabled: false, creditsPerAd: AD_REWARD_CREDITS, dailyLimit: 0, remainingToday: 0, nextAvailableAt: null })
    const sessionId = request.nextUrl.searchParams.get('sessionId') ?? undefined
    if (sessionId && !z.string().uuid().safeParse(sessionId).success) return respond({ error: 'Invalid ad session.' }, 400)
    if (!(await rateLimitCheck(owner.id, 'ad-status')).success) return respond({ error: 'Please wait before checking again.' }, 429, 60)
    return respond(await rewardStatus(owner.id, config, sessionId))
  } catch (error) { return failure(error) }
}

export async function POST(request: NextRequest) {
  try {
    if (!isSameOriginMutation(request)) return respond({ error: 'Invalid request origin' }, 403)
    const owner = await account()
    if (!owner.verified) return respond({ error: 'Verify your email before earning ad credits.' }, 403)
    const config = rewardedAdConfig()
    if (!config) return respond({ error: 'Rewarded ads are not available yet.' }, 503)
    if (!z.object({ consent: z.literal(true) }).strict().safeParse(await readJsonBody(request, 1024)).success) return respond({ error: 'Choose to watch an ad before continuing.' }, 400)
    if (!(await rateLimitCheck(owner.id, 'ad-start')).success) return respond({ error: 'Please wait before starting another ad.' }, 429, 60)
    return respond(await startRewardSession(owner.id, config), 201)
  } catch (error) { return failure(error) }
}

export async function DELETE(request: NextRequest) {
  try {
    if (!isSameOriginMutation(request)) return respond({ error: 'Invalid request origin' }, 403)
    const owner = await account()
    const parsed = z.object({ sessionId: z.string().uuid() }).strict().safeParse(await readJsonBody(request, 1024))
    if (!parsed.success) return respond({ error: 'Invalid ad session.' }, 400)
    if (!(await rateLimitCheck(owner.id, 'ad-start')).success) return respond({ error: 'Please wait before trying again.' }, 429, 60)
    await cancelRewardSession(owner.id, parsed.data.sessionId)
    return respond({ ok: true })
  } catch (error) { return failure(error) }
}
