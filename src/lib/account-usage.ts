import { CREDIT_COSTS, TIER_MONTHLY_CREDITS } from './credit-costs'
import { PLAN_CATALOG, type PlanTier } from './plans'
import { affordableValidations, totalCredits } from './credit-allocation'

type Balance = {
  tier: PlanTier
  creditBalance: number
  purchasedCredits: number
  rewardCredits?: number
  crowdfundingCredits: number
  pitchDeckCredits: number
  validationsThisMonth: number
}

export function creditOverview(user: Pick<Balance, 'tier' | 'creditBalance' | 'purchasedCredits' | 'rewardCredits'>) {
  const allocation = TIER_MONTHLY_CREDITS[user.tier]
  const monthlyRemaining = Math.max(0, user.creditBalance)
  return { allocation, monthlyRemaining, purchasedRemaining: Math.max(0, user.purchasedCredits),
    rewardRemaining: Math.max(0, user.rewardCredits ?? 0), total: totalCredits(user),
    monthlySpent: Math.max(0, allocation - monthlyRemaining),
    percentage: Math.min(100, Math.max(0, (allocation - monthlyRemaining) / allocation * 100)),
  }
}

export function actionAllowance(user: Balance, action: keyof typeof CREDIT_COSTS, validationLimit: number = PLAN_CATALOG[user.tier].validationLimit) {
  if (action === 'CROWDFUNDING' && user.tier !== 'max_premium') return { runs: Math.max(0, user.crowdfundingCredits), unit: 'module credit', permitted: user.crowdfundingCredits > 0 }
  if (action === 'PITCH_DECK' && user.tier !== 'max_premium') return { runs: Math.max(0, user.pitchDeckCredits), unit: 'module credit', permitted: user.pitchDeckCredits > 0 }
  const permitted = action === 'LITE_VALIDATION' ? user.tier === 'free' : user.tier !== 'free'
  let runs = permitted ? Math.floor(creditOverview(user).total / CREDIT_COSTS[action]) : 0
  if (permitted && (action === 'LITE_VALIDATION' || action === 'DEEP_VALIDATION')) runs = affordableValidations(user, CREDIT_COSTS[action], validationLimit)
  return { runs, unit: 'credits', permitted }
}

export function creditCycleStart(resetAt: Date | null, now = new Date()): Date {
  const candidate = resetAt ? new Date(resetAt.getTime() - 30 * 86_400_000) : null
  return candidate && Number.isFinite(candidate.getTime()) && candidate <= now
    ? candidate : new Date(now.getTime() - 30 * 86_400_000)
}

export function creditEntryDescription(description: string | null): string {
  if (!description) return '—'
  try {
    const value = JSON.parse(description)
    if (typeof value?.monthly === 'number' && typeof value?.purchased === 'number') {
      return `${value.monthly.toLocaleString()} plan credits · ${value.purchased.toLocaleString()} purchased credits` +
        (typeof value.reward === 'number' && value.reward > 0 ? ` · ${value.reward.toLocaleString()} earned credits` : '')
    }
    return 'Account credit adjustment'
  } catch { return description }
}
