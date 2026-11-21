import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/db'
import { users } from '@/db/schema'
import { createClient } from '@/lib/supabase/server'
import { isSameOriginMutation, PRIVATE_HEADERS, readJsonBody, RequestBodyError } from '@/lib/api-security'
import { claimDailyCredits, dailyCreditStatus, DailyCreditError } from '@/lib/daily-credits'
import { rateLimitCheck } from '@/lib/rate-limit'

const respond = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: PRIVATE_HEADERS })
async function account() {
  const { data: { user }, error } = await (await createClient()).auth.getUser()
  if (!user || error) throw new DailyCreditError(error?.message || 'Sign in to claim your daily credits.',
    error?.status === 503 ? 503 : error?.status === 403 ? 403 : 401)
  const profile = await db.query.users.findFirst({ where: eq(users.supabaseId, user.id), columns: { id: true } })
  if (!profile) throw new DailyCreditError('Complete your registration before claiming credits.', 403)
  return { id: profile.id, verified: Boolean(user.email_confirmed_at) }
}
function failure(error: unknown) {
  if (error instanceof DailyCreditError || error instanceof RequestBodyError) return respond({ error: error.message }, error.status)
  console.error('[daily-credits] Claim could not be processed')
  return respond({ error: 'Daily credits are temporarily unavailable. Please try again.' }, 503)
}
export async function GET() {
  try {
    const user = await account()
    const status = await dailyCreditStatus(user.id)
    return respond({ ...status, available: status.available && user.verified, emailVerified: user.verified })
  }
  catch (error) { return failure(error) }
}
export async function POST(request: NextRequest) {
  try {
    if (!isSameOriginMutation(request)) return respond({ error: 'Invalid request origin' }, 403)
    const user = await account()
    if (!user.verified) return respond({ error: 'Verify your email before claiming daily credits.' }, 403)
    if (!z.strictObject({}).safeParse(await readJsonBody(request, 1024)).success) return respond({ error: 'Daily claims do not accept a date or credit amount.' }, 400)
    if (!(await rateLimitCheck(user.id, 'daily-credit-claim')).success) return respond({ error: 'Please wait before trying again.' }, 429)
    return respond(await claimDailyCredits(user.id))
  } catch (error) { return failure(error) }
}
