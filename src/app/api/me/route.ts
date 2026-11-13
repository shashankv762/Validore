import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/db'
import { users } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { syncUserToDatabase } from '@/lib/auth-sync'
import { topUpMonthlyCredits } from '@/lib/credits'
import { effectiveAiPreference, freeModelsOnly } from '@/lib/ai/model-policy'
import { creditCycleAllowance, getPlanBillingAvailability, getPlanCatalog, getPublicPlanCatalog } from '@/lib/plan-catalog'
import { getPlatformSettings, toAdminSettings } from '@/lib/platform-settings'
import { isOwnerAccount, isVerifiedOwnerIdentity } from '@/lib/admin-access'
import { REGISTRATION_REQUIRED, REGISTRATION_PATH } from '@/lib/registration-recovery'

const headers = { 'Cache-Control': 'private, no-store' }

export async function GET() {
  try {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError?.code === 'account_blocked' || authError?.code === 'account_deactivated') {
    return NextResponse.json({ error: authError.message, code: authError.code }, { status: 403, headers })
  }
  if (authError?.code === 'maintenance_enabled') {
    return NextResponse.json({ error: authError.message, code: authError.code }, { status: 503, headers })
  }
  if (authError?.code === 'account_unavailable' || authError?.status === 503) {
    return NextResponse.json({ error: 'Your account could not be loaded. Please try again.', code: 'account_unavailable' }, { status: 503, headers })
  }
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers })

  const foundUser = await db.query.users.findFirst({ where: eq(users.supabaseId, user.id) })
  let dbUser = foundUser ?? (await syncUserToDatabase(user))
  if (!dbUser) return NextResponse.json({ code: REGISTRATION_REQUIRED, error: 'Complete your registration to open the workspace.', next: REGISTRATION_PATH }, { status: 403, headers })
  const isAdmin = isOwnerAccount(dbUser) && isVerifiedOwnerIdentity(user)
  if (!isAdmin && (!dbUser.creditResetAt || dbUser.creditResetAt <= new Date() || !dbUser.creditCycleStartedAt)) {
    await topUpMonthlyCredits(dbUser.id)
    dbUser = (await db.query.users.findFirst({ where: eq(users.id, dbUser.id) })) ?? dbUser
  }

  const [catalog, settings] = await Promise.all([getPlanCatalog(), getPlatformSettings()])
  const plans = getPublicPlanCatalog(catalog)
  return NextResponse.json({
    billing: await getPlanBillingAvailability(catalog),
    ai: { freeOnly: freeModelsOnly(), researchTools: true },
    plan: isAdmin ? { ...plans.max_premium, name: 'Owner', monthlyPriceUsd: 0, unlimited: true } : plans[dbUser.tier],
    plans,
    platform: toAdminSettings(settings),
    user: {
      id: dbUser.id,
      email: dbUser.email,
      tier: dbUser.tier,
      isAdmin,
      unlimited: isAdmin,
      accountStatus: dbUser.accountStatus,
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
      creditCycleAllowance: creditCycleAllowance(dbUser),
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
