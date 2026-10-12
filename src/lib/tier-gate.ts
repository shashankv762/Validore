import { db } from '@/db'
import { users, tierConfig } from '@/db/schema'
import { eq, and, gt, sql } from 'drizzle-orm'

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
  if (!user) return null

  const config = await db.query.tierConfig.findFirst({
    where: eq(tierConfig.tier, user.tier),
  })
  return { user, config }
}

export async function canUserAccess(supabaseId: string, feature: Feature): Promise<boolean> {
  const result = await getUserWithTierConfig(supabaseId)
  if (!result?.config) return false
  return result.config[feature] === true
}

export async function canUserAccessWithCredits(
  supabaseId: string,
  feature: 'crowdfunding' | 'pitch_deck'
): Promise<{ allowed: boolean; reason: 'tier' | 'credit' | 'denied' }> {
  const result = await getUserWithTierConfig(supabaseId)
  if (!result) return { allowed: false, reason: 'denied' }

  const { user, config } = result

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
  const config = result.config
  return db.transaction(async tx => {
    const [user] = await tx.select().from(users).where(eq(users.id, result.user.id)).for('update')
    if (!user) return { allowed: false, remaining: 0 }
    const now = new Date()
    if (!user.validationResetAt || now > user.validationResetAt) {
      await tx.update(users).set({ validationsThisMonth: 0,
        validationResetAt: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)),
      }).where(eq(users.id, user.id))
      return { allowed: true, remaining: config.monthlyValidationLimit }
    }
    const remaining = Math.max(0, config.monthlyValidationLimit - user.validationsThisMonth)
    return { allowed: remaining > 0, remaining }
  })
}

export async function decrementCredit(
  supabaseId: string,
  creditType: 'crowdfundingCredits' | 'pitchDeckCredits'
): Promise<boolean> {
  const result = await getUserWithTierConfig(supabaseId)
  if (!result) return false

  const [updated] = await db.update(users).set({
    [creditType]: sql`${users[creditType]} - 1`,
  }).where(and(eq(users.supabaseId, supabaseId), gt(users[creditType], 0)))
    .returning({ id: users.id })
  return !!updated
}
