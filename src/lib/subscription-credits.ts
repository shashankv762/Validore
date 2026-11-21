import type Stripe from 'stripe'
import { users } from '@/db/schema'
import { eq } from 'drizzle-orm'
import type { CreditTransaction } from './credits'
import { creditCycleAllowance, getPlanCatalog, tierForStripePrice } from './plan-catalog'
import { stripeBillingClient } from './billing'

/** Apply authoritative provider periods while holding the same lock as spending.
 * A replay for the same cycle preserves its spending, including lazy renewals. */
export async function reconcileStripeCredits(tx: CreditTransaction, user: typeof users.$inferSelect, subscription: Stripe.Subscription, now = new Date()) {
  const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id
  if (customerId !== user.stripeCustomerId) throw new Error('Subscription owner mismatch')
  // A late/replayed provider event cannot replace an explicit owner entitlement.
  if (user.subscriptionStatus === 'manual') return user
  const active = subscription.status === 'active' || subscription.status === 'trialing'
  if (user.subscriptionId && user.subscriptionId !== subscription.id) {
    if (!active) return user
    const previous = await stripeBillingClient().subscriptions.retrieve(user.subscriptionId)
    if (previous.status === 'active' || previous.status === 'trialing') return user
  }
  const item = subscription.items.data[0]
  const periodStart = item?.current_period_start ? new Date(item.current_period_start * 1000) : null
  const periodEnd = item?.current_period_end ? new Date(item.current_period_end * 1000) : null
  const catalog = await getPlanCatalog(tx)
  const mappedTier = active && item ? tierForStripePrice(catalog, item.price.id) : null
  // An unknown active price needs investigation rather than silently downgrading a subscriber.
  if (active && !mappedTier) throw new Error('Subscription price is not assigned to a plan')
  const tier = mappedTier ?? 'free'
  if (tier !== 'free' && (!periodStart || !periodEnd || periodStart >= periodEnd)) throw new Error('Subscription period unavailable')
  if (tier !== 'free' && periodStart! > now) throw new Error('Subscription period has not started')
  const matchesProviderPeriod = user.subscriptionId === subscription.id && Boolean(periodEnd && periodEnd > now &&
      user.currentPeriodEnd?.getTime() === periodEnd.getTime())
  if (tier !== 'free' && user.subscriptionId === subscription.id && user.creditCycleStartedAt &&
      periodStart! < user.creditCycleStartedAt &&
      !(['past_due', 'unpaid'].includes(user.subscriptionStatus ?? '') && matchesProviderPeriod)) return user

  const sameSubscription = user.subscriptionId === subscription.id
  // Existing deployments recorded the exact provider end but omitted its start.
  // Hydrate that start without granting a second allocation for the same end.
  const sameCycle = sameSubscription && (user.creditCycleStartedAt
    ? user.creditCycleStartedAt.getTime() === periodStart?.getTime()
    : user.creditResetAt?.getTime() === periodEnd?.getTime())
  const newCycle = tier !== 'free' && periodStart! <= now && periodEnd! > now && !sameCycle
  const previousAllowance = creditCycleAllowance(user)
  const paymentRecoveryPending = tier === 'free' && user.tier !== 'free' &&
    ['past_due', 'unpaid'].includes(subscription.status) && matchesProviderPeriod
  const allowance = newCycle || user.tier !== tier ? catalog[tier].monthlyCredits : previousAllowance
  const recoveringPayment = active && sameSubscription && ['past_due', 'unpaid'].includes(user.subscriptionStatus ?? '') && matchesProviderPeriod
  const consumedMonthly = newCycle ? 0 : recoveringPayment
    ? Math.max(0, user.monthlyCreditsUsedThisCycle ?? 0)
    : Math.max(user.monthlyCreditsUsedThisCycle ?? 0, previousAllowance - user.creditBalance, 0)
  const downgraded = tier === 'free' && user.tier !== 'free'
  const values = {
    tier, subscriptionId: subscription.id, subscriptionStatus: subscription.status,
    cancelAtPeriodEnd: subscription.cancel_at_period_end, currentPeriodEnd: periodEnd,
    ...(tier !== 'free' ? { creditCycleStartedAt: periodStart, creditResetAt: periodEnd } : {}),
    ...(tier !== 'free' ? { creditCycleAllowance: allowance, monthlyCreditsUsedThisCycle: consumedMonthly,
      creditBalance: Math.max(0, allowance - consumedMonthly) } : {}),
    ...(newCycle ? { creditsUsedThisCycle: 0 } : {}),
    // Expired provider state cannot fund monthly spending ahead of payment.
    ...(tier !== 'free' && periodEnd! <= now ? { creditBalance: 0 } : {}),
    ...(downgraded && paymentRecoveryPending ? { creditBalance: 0 } : {}),
    ...(downgraded && !paymentRecoveryPending ? { creditBalance: Math.min(user.creditBalance, catalog.free.monthlyCredits), creditCycleAllowance: catalog.free.monthlyCredits,
      creditsUsedThisCycle: 0, monthlyCreditsUsedThisCycle: Math.max(0, catalog.free.monthlyCredits - Math.min(user.creditBalance, catalog.free.monthlyCredits)),
      creditCycleStartedAt: now, creditResetAt: new Date(now.getTime() + 30 * 86_400_000) } : {}),
  }
  await tx.update(users).set(values).where(eq(users.id, user.id))
  return { ...user, ...values }
}
