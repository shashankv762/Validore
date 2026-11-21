import { eq } from 'drizzle-orm'
import { users } from '@/db/schema'
import type { CreditTransaction } from './credits'
import { creditCycleAllowance, getPlan } from './plan-catalog'

export type RazorpayCreditSubscription = { id: string; status: string; current_start?: number | null; current_end?: number | null }

/** Reconcile a signed activation while holding the spending/account lock.
 * Explicit owner access wins; replays and in-cycle plan changes retain spending. */
export async function reconcileRazorpayCredits(tx: CreditTransaction, user: typeof users.$inferSelect,
  subscription: RazorpayCreditSubscription, tier: 'premium' | 'max_premium', now = new Date()) {
  if (user.subscriptionStatus === 'manual' || subscription.status !== 'active') return user
  // A delayed activation for an obsolete subscription cannot replace the one
  // currently serving the account. A canceled prior subscription may be replaced.
  if (user.subscriptionId && user.subscriptionId !== subscription.id &&
    !['canceled', 'cancelled', 'incomplete_expired', 'completed', 'expired'].includes(user.subscriptionStatus ?? '')) return user
  const periodEnd = subscription.current_end ? new Date(subscription.current_end * 1000) : null
  const sameSubscription = user.subscriptionId === subscription.id
  const periodStart = subscription.current_start ? new Date(subscription.current_start * 1000)
    : sameSubscription && user.creditResetAt?.getTime() === periodEnd?.getTime() ? user.creditCycleStartedAt : null
  // Do not fabricate a 30-day paid cycle or grant an expired/future allocation.
  if (!periodStart || !periodEnd || !Number.isFinite(periodStart.getTime()) || !Number.isFinite(periodEnd.getTime()) || periodStart >= periodEnd) throw new Error('Subscription period unavailable')
  if (periodStart > now || periodEnd <= now) return user
  if (sameSubscription && user.creditCycleStartedAt && periodStart < user.creditCycleStartedAt) return user
  const sameCycle = sameSubscription && (user.creditCycleStartedAt
    ? user.creditCycleStartedAt.getTime() === periodStart.getTime()
    : user.creditResetAt?.getTime() === periodEnd.getTime())
  const previousAllowance = creditCycleAllowance(user)
  const allowance = sameCycle && user.tier === tier ? previousAllowance : (await getPlan(tier, tx)).monthlyCredits
  const consumedMonthly = sameCycle ? Math.max(user.monthlyCreditsUsedThisCycle ?? 0, previousAllowance - user.creditBalance, 0) : 0
  const values = { tier, subscriptionId: subscription.id, subscriptionStatus: subscription.status,
    currentPeriodEnd: periodEnd, cancelAtPeriodEnd: false, creditCycleStartedAt: periodStart, creditResetAt: periodEnd,
    creditCycleAllowance: allowance, creditBalance: Math.max(0, allowance - consumedMonthly), monthlyCreditsUsedThisCycle: consumedMonthly,
    ...(!sameCycle ? { creditsUsedThisCycle: 0 } : {}),
  }
  await tx.update(users).set(values).where(eq(users.id, user.id))
  return { ...user, ...values }
}
