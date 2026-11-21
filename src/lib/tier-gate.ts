import { db } from '@/db'
import { users } from '@/db/schema'
import { eq, and, gt, sql } from 'drizzle-orm'
import { canFundExtraLite } from './credit-allocation'
import { isActiveAccount, isOwnerAccount } from './admin-access'
import { getPlan } from './plan-catalog'
import { resetValidationWindow } from './credits'

export type Feature =
  | 'canExportPdf' | 'canExportCsv' | 'canExportPptx'
  | 'canWhitelabelPdf' | 'canPortfolioExport'
  | 'canLeanCanvas' | 'canAiLeanCanvas'
  | 'canPricingSimulator' | 'canCrowdfunding' | 'canPitchDeck'

export async function getUserWithTierConfig(supabaseId: string) {
  if (!supabaseId) return null
  const user = await db.query.users.findFirst({
    where: eq(users.supabaseId, supabaseId),
  })
  if (!user || !isActiveAccount(user)) return null
  const plan = await getPlan(user.tier)
  const config = isOwnerAccount(user) ? { ...plan, canExportPdf: true, canExportCsv: true, canExportPptx: true,
    canWhitelabelPdf: true, canPortfolioExport: true, canLeanCanvas: true, canAiLeanCanvas: true,
    canPricingSimulator: true, canCrowdfunding: true, canPitchDeck: true } : plan
  return { user, config }
}

export async function canUserAccess(supabaseId: string, feature: Feature): Promise<boolean> {
  const result = await getUserWithTierConfig(supabaseId)
  if (!result?.config) return false
  if (isOwnerAccount(result.user)) return true
  return result.config[feature] === true
}

export async function canUserAccessWithCredits(
  supabaseId: string,
  feature: 'crowdfunding' | 'pitch_deck'
): Promise<{ allowed: boolean; reason: 'tier' | 'credit' | 'denied' }> {
  const result = await getUserWithTierConfig(supabaseId)
  if (!result) return { allowed: false, reason: 'denied' }

  const { user, config } = result
  if (isOwnerAccount(user)) return { allowed: true, reason: 'tier' }

  // Max premium gets both via tier
  if (feature === 'crowdfunding' && config?.canCrowdfunding) return { allowed: true, reason: 'tier' }
  if (feature === 'pitch_deck' && config?.canPitchDeck) return { allowed: true, reason: 'tier' }

  // Premium can use credits
  if (feature === 'crowdfunding' && user.crowdfundingCredits > 0) return { allowed: true, reason: 'credit' }
  if (feature === 'pitch_deck' && user.pitchDeckCredits > 0) return { allowed: true, reason: 'credit' }

  return { allowed: false, reason: 'denied' }
}

export async function checkValidationLimit(supabaseId: string): Promise<{ allowed: boolean; remaining: number }> {
  const result = await getUserWithTierConfig(supabaseId)
  if (!result?.config) return { allowed: false, remaining: 0 }
  return db.transaction(async tx => {
    const [locked] = await tx.select().from(users).where(eq(users.id, result.user.id)).for('update')
    if (!locked || !isActiveAccount(locked)) return { allowed: false, remaining: 0 }
    if (isOwnerAccount(locked)) return { allowed: true, remaining: Number.MAX_SAFE_INTEGER }
    const user = await resetValidationWindow(tx, locked)
    const config = await getPlan(user.tier, tx)
    const remaining = Math.max(0, config.monthlyValidationLimit - user.validationsThisMonth)
    return { allowed: remaining > 0 || canFundExtraLite(user), remaining }
  })
}

export async function decrementCredit(
  supabaseId: string,
  creditType: 'crowdfundingCredits' | 'pitchDeckCredits'
): Promise<boolean> {
  const result = await getUserWithTierConfig(supabaseId)
  if (!result) return false
  if (isOwnerAccount(result.user)) return true

  const [updated] = await db.update(users).set({
    [creditType]: sql`${users[creditType]} - 1`,
  }).where(and(eq(users.supabaseId, supabaseId), eq(users.accountStatus, 'active'), gt(users[creditType], 0)))
    .returning({ id: users.id })
  return !!updated
}
