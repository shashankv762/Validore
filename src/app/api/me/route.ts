import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/db'
import { users } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { syncUserToDatabase } from '@/lib/auth-sync'
import { topUpMonthlyCredits } from '@/lib/credits'
import { billingAvailability } from '@/lib/billing-availability'
import { effectiveAiPreference, freeModelsOnly } from '@/lib/ai/model-policy'
import { PLAN_CATALOG } from '@/lib/plans'

const headers = { 'Cache-Control': 'private, no-store' }

export async function GET() {
  try {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers })

  const foundUser = await db.query.users.findFirst({ where: eq(users.supabaseId, user.id) })
  let dbUser = foundUser ?? (await syncUserToDatabase({ id: user.id, email: user.email }))
  if (!dbUser) return NextResponse.json({ error: 'User not found' }, { status: 404, headers })
  if (!dbUser.creditResetAt || dbUser.creditResetAt <= new Date()) {
    await topUpMonthlyCredits(dbUser.id)
    dbUser = (await db.query.users.findFirst({ where: eq(users.id, dbUser.id) })) ?? dbUser
  }

  return NextResponse.json({
    billing: billingAvailability(),
    ai: { freeOnly: freeModelsOnly(), researchTools: true },
    plan: PLAN_CATALOG[dbUser.tier],
    user: {
      id: dbUser.id,
      email: dbUser.email,
      tier: dbUser.tier,
      isFoundingMember: dbUser.isFoundingMember,
      crowdfundingCredits: dbUser.crowdfundingCredits,
      pitchDeckCredits: dbUser.pitchDeckCredits,
      validationsThisMonth: !dbUser.validationResetAt || dbUser.validationResetAt <= new Date() ? 0 : dbUser.validationsThisMonth,
      currentPeriodEnd: dbUser.currentPeriodEnd,
      subscriptionStatus: dbUser.subscriptionStatus,
      cancelAtPeriodEnd: dbUser.cancelAtPeriodEnd,
      createdAt: dbUser.createdAt,
      emailVerified: Boolean(user.email_confirmed_at),
      creditBalance: dbUser.creditBalance,
      purchasedCredits: dbUser.purchasedCredits,
      rewardCredits: dbUser.rewardCredits,
      creditsUsedThisCycle: dbUser.creditsUsedThisCycle,
      creditResetAt: dbUser.creditResetAt,
      preferredAiProvider: effectiveAiPreference(dbUser.preferredAiProvider),
      hasCustomApiKey: Boolean(dbUser.encryptedOpenrouterKey),
    },
  }, { headers })
  } catch {
    console.error('[me] Account data could not be loaded')
    return NextResponse.json({ error: 'Your account could not be loaded. Please try again.' }, { status: 503, headers })
  }
}
