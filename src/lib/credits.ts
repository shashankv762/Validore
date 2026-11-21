import { db } from '@/db'
import { users, creditLedger } from '@/db/schema'
import { eq, and, like, sql } from 'drizzle-orm'
import { CREDIT_COSTS } from './credit-costs'
import { allocateCredits, canFundExtraLite, totalCredits } from './credit-allocation'
import { reconcileStripeCredits } from './subscription-credits'
import { stripeBillingClient } from './billing'
import { isActiveAccount, isOwnerAccount } from './admin-access'
import { creditCycleAllowance, getPlan } from './plan-catalog'

function assertAmount(amount: number, allowZero = false) {
  if (!Number.isSafeInteger(amount) || amount < (allowZero ? 0 : 1)) {
    throw new Error('Credit amount must be a positive safe integer')
  }
}

export async function checkCredits(userId: string, cost: number): Promise<{ allowed: boolean; balance: number }> {
  assertAmount(cost, true)
  let user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { creditBalance: true, purchasedCredits: true, rewardCredits: true, creditResetAt: true, creditCycleStartedAt: true, tier: true, isAdmin: true, accountStatus: true },
  })
  if (!user || !isActiveAccount(user)) return { allowed: false, balance: 0 }
  if (isOwnerAccount(user)) return { allowed: true, balance: totalCredits(user) }
  if (user.tier !== 'free' || !user.creditResetAt || user.creditResetAt <= new Date() || !user.creditCycleStartedAt) {
    await topUpMonthlyCredits(userId)
    user = await db.query.users.findFirst({ where: eq(users.id, userId),
      columns: { creditBalance: true, purchasedCredits: true, rewardCredits: true, creditResetAt: true, creditCycleStartedAt: true, tier: true, isAdmin: true, accountStatus: true } })
    if (!user || !isActiveAccount(user)) return { allowed: false, balance: 0 }
  }
  const balance = totalCredits(user)
  return { allowed: balance >= cost, balance }
}

export async function deductCredits(userId: string, cost: number, action: string, entityId?: string, validationLimit?: number, transaction?: CreditTransaction): Promise<boolean> {
  assertAmount(cost)
  const spend = async (tx: CreditTransaction) => {
    // Lock before reading balances: simultaneous requests must see the latest spend.
    const [lockedUser] = await tx.select().from(users).where(eq(users.id, userId)).for('update')
    if (!lockedUser || !isActiveAccount(lockedUser)) return false
    if (isOwnerAccount(lockedUser)) return true
    const user = await applyDueCycleReset(tx, lockedUser)
    return deductLockedCredits(tx, user, cost, action, entityId, validationLimit)
  }
  return transaction ? spend(transaction) : db.transaction(spend)
}

/** Caller must hold this account's update lock and reconcile its credit cycle.
 * Admission can then choose the current entitlement and debit the same row. */
export async function deductLockedCredits(tx: CreditTransaction, lockedUser: typeof users.$inferSelect, cost: number,
  action: string, entityId?: string, validationLimit?: number, now = new Date()): Promise<boolean> {
    assertAmount(cost)
    if (!isActiveAccount(lockedUser)) return false
    if (isOwnerAccount(lockedUser)) return true
    const user = action === 'VALIDATION' ? await resetValidationWindow(tx, lockedUser, now) : lockedUser
    const beyondIncluded = action === 'VALIDATION' && validationLimit !== undefined && user.validationsThisMonth >= validationLimit
    if (beyondIncluded && (cost !== CREDIT_COSTS.LITE_VALIDATION || !canFundExtraLite(user))) return false
    const sources = allocateCredits(user, cost, beyondIncluded)
    if (!sources) return false
    const { monthly, purchased, reward } = sources
    await tx.update(users).set({
      creditBalance: sql`${users.creditBalance} - ${monthly}`,
      purchasedCredits: sql`${users.purchasedCredits} - ${purchased}`,
      rewardCredits: sql`${users.rewardCredits} - ${reward}`,
      creditsUsedThisCycle: sql`${users.creditsUsedThisCycle} + ${cost}`,
      monthlyCreditsUsedThisCycle: sql`${users.monthlyCreditsUsedThisCycle} + ${monthly}`,
      ...(action === 'VALIDATION' ? { validationsThisMonth: sql`${users.validationsThisMonth} + 1` } : {}),
    }).where(eq(users.id, user.id))
    await tx.insert(creditLedger).values({
      userId: user.id, amount: -cost, transactionType: action,
      description: JSON.stringify({ entityId: entityId ?? null, monthly, purchased, reward,
        cycleStartedAt: user.creditCycleStartedAt?.toISOString() ?? null,
        cycleTier: user.tier, cycleSubscriptionId: user.subscriptionId,
        ...(action === 'VALIDATION' ? { validationWindowEndsAt: user.validationResetAt?.toISOString() ?? null } : {}) }),
    })
    return true
}

/** UTC calendar-month reset, performed under the same lock as count increments. */
export async function resetValidationWindow(tx: CreditTransaction, user: typeof users.$inferSelect, now = new Date()) {
  if (user.validationResetAt && user.validationResetAt > now) return user
  // A legacy missing deadline is not evidence that recorded current usage expired.
  const values = { validationsThisMonth: user.validationResetAt ? 0 : user.validationsThisMonth,
    validationResetAt: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)) }
  await tx.update(users).set(values).where(eq(users.id, user.id))
  return { ...user, ...values }
}

/** Reset a due cycle once, using the current plan under the same user lock. */
export async function applyDueCycleReset(tx: CreditTransaction, user: typeof users.$inferSelect, now = new Date()) {
  if (user.creditResetAt && user.creditResetAt > now && user.creditCycleStartedAt) return settlePendingMonthlyRefunds(tx, user)
  if (user.tier !== 'free' && user.subscriptionStatus !== 'manual') {
    if (!user.stripeCustomerId || !user.subscriptionId?.startsWith('sub_')) {
      // Disabled legacy billing must not receive unconfirmed renewals.
      if (user.creditResetAt && user.creditResetAt > now) return user
      const values = { creditBalance: 0 }
      await tx.update(users).set(values).where(eq(users.id, user.id))
      return { ...user, ...values }
    }
    const subscription = await stripeBillingClient().subscriptions.retrieve(user.subscriptionId)
    return settlePendingMonthlyRefunds(tx, await reconcileStripeCredits(tx, user, subscription, now))
  }
  if (user.creditResetAt && user.creditResetAt > now) {
    const values = { creditCycleStartedAt: new Date(user.creditResetAt.getTime() - 30 * 86_400_000),
      creditCycleAllowance: creditCycleAllowance(user) }
    await tx.update(users).set(values).where(eq(users.id, user.id))
    return { ...user, ...values }
  }
  const allowance = (await getPlan(user.tier, tx)).monthlyCredits
  const values = {
    creditBalance: allowance, creditsUsedThisCycle: 0, monthlyCreditsUsedThisCycle: 0,
    creditCycleAllowance: allowance,
    creditCycleStartedAt: now,
    creditResetAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
  }
  await tx.update(users).set(values).where(eq(users.id, user.id))
  if (user.subscriptionStatus === 'manual') {
    await tx.insert(creditLedger).values({ userId: user.id, amount: allowance - user.creditBalance,
      transactionType: 'MANUAL_PLAN_RENEWAL', description: `Owner-assigned ${user.tier} plan · next 30-day cycle` })
  }
  return { ...user, ...values }
}

export async function topUpMonthlyCredits(userId: string): Promise<boolean> {
  return db.transaction(async tx => {
    const [user] = await tx.select().from(users).where(eq(users.id, userId)).for('update')
    if (!user || !isActiveAccount(user) || isOwnerAccount(user)) return false
    return await applyDueCycleReset(tx, user) !== user
  })
}

export async function addPurchasedCredits(userId: string, amount: number): Promise<void> {
  assertAmount(amount)
  await db.transaction(async (tx) => {
    const [user] = await tx.update(users).set({
      purchasedCredits: sql`${users.purchasedCredits} + ${amount}`,
    }).where(eq(users.id, userId)).returning({ id: users.id })
    if (!user) throw new Error('Credit recipient not found')
    await tx.insert(creditLedger).values({
      userId, amount, transactionType: 'PURCHASED_TOPUP', description: 'Source: purchase',
    })
  })
}

/** Refund an unsuccessful validation once, restoring the original credit sources. */
export type CreditTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0]

/** Legacy paid debits may predate the exact cycle start. Preserve their monthly
 * refund until a normal credit operation hydrates authoritative billing state. */
async function settlePendingMonthlyRefunds(tx: CreditTransaction, user: typeof users.$inferSelect) {
  if (user.tier === 'free' || !user.creditCycleStartedAt || !user.creditResetAt) return user
  const pending = await tx.select().from(creditLedger).where(and(eq(creditLedger.userId, user.id),
    eq(creditLedger.transactionType, 'VALIDATION_MONTHLY_REFUND_PENDING')))
  let current = user
  for (const entry of pending) {
    const request = JSON.parse(entry.description!) as { monthly: number; debit: number; cycleEndsAt: string; spentAt: string; subscriptionId: string | null }
    const sameSubscription = request.subscriptionId === current.subscriptionId
    const cycleResolved = request.cycleEndsAt === current.creditResetAt!.toISOString()
    if (sameSubscription && !cycleResolved && new Date(request.cycleEndsAt) > current.creditCycleStartedAt!) continue
    const sameCycle = sameSubscription && cycleResolved &&
      new Date(request.spentAt) >= current.creditCycleStartedAt! && current.creditResetAt! > new Date()
    const allowance = creditCycleAllowance(current)
    const consumed = Math.max(current.monthlyCreditsUsedThisCycle, allowance - current.creditBalance, 0)
    const remaining = Math.max(0, consumed - (sameCycle ? request.monthly : 0))
    const amount = sameCycle ? Math.max(0, allowance - remaining - current.creditBalance) : 0
    if (sameCycle) {
      const values = { creditBalance: current.creditBalance + amount, monthlyCreditsUsedThisCycle: remaining,
        creditsUsedThisCycle: Math.max(0, current.creditsUsedThisCycle - request.debit) }
      await tx.update(users).set(values).where(eq(users.id, user.id))
      current = { ...current, ...values }
    }
    await tx.update(creditLedger).set({ transactionType: 'VALIDATION_MONTHLY_REFUND_SETTLED', amount }).where(eq(creditLedger.id, entry.id))
  }
  return current
}

export async function refundValidationCredits(userId: string, jobId: string, transaction?: CreditTransaction): Promise<void> {
  if (!/^[a-f0-9-]{36}$/i.test(jobId)) throw new Error('Invalid refund job reference')
  const refund = async (tx: CreditTransaction) => {
    const [lockedUser] = await tx.select().from(users).where(eq(users.id, userId)).for('update')
    if (!lockedUser) throw new Error('Credit recipient not found')
    const reference = 'Job: ' + jobId
    const [refunded] = await tx.select().from(creditLedger).where(and(
      eq(creditLedger.userId, userId), eq(creditLedger.transactionType, 'VALIDATION_REFUND'), eq(creditLedger.description, reference),
    )).limit(1)
    if (refunded) return
    const [spend] = await tx.select().from(creditLedger).where(and(
      eq(creditLedger.userId, userId), eq(creditLedger.transactionType, 'VALIDATION'),
      like(creditLedger.description, '%"entityId":"' + jobId + '"%'),
    )).limit(1)
    if (!spend?.description) return
    const sources = JSON.parse(spend.description) as { monthly: number; purchased: number; reward?: number;
      cycleStartedAt?: string | null; cycleTier?: string; cycleSubscriptionId?: string | null; validationWindowEndsAt?: string | null }
    const reward = sources.reward ?? 0 // Older ledger entries predate rewarded credits.
    assertAmount(sources.monthly, true)
    assertAmount(sources.purchased, true)
    assertAmount(reward, true)
    if (sources.monthly + sources.purchased + reward !== -spend.amount) throw new Error('Refund ledger mismatch')
    const now = new Date()
    // Returning nonexpiring sources never depends on payment-provider access.
    // Paid periods are already authoritative in this row; only missing legacy
    // starts need hydration, and that lookup is deliberately outside refunds.
    const user = lockedUser.tier === 'free' ? await applyDueCycleReset(tx, lockedUser) : lockedUser
    const cycleStart = user.creditCycleStartedAt
    const sameCycle = Boolean(user.creditResetAt && user.creditResetAt > now) && (sources.cycleStartedAt
      ? sources.cycleStartedAt === cycleStart?.toISOString() &&
        (sources.cycleSubscriptionId === undefined || sources.cycleSubscriptionId === user.subscriptionId)
      : Boolean(spend.createdAt && cycleStart && spend.createdAt >= cycleStart))
    const sameValidationMonth = sources.validationWindowEndsAt
      ? sources.validationWindowEndsAt === new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString()
      : !spend.createdAt || spend.createdAt >= new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    const allowance = creditCycleAllowance(user)
    const consumedMonthly = Math.max(user.monthlyCreditsUsedThisCycle ?? 0,
      allowance - user.creditBalance, 0)
    const remainingConsumed = Math.max(0, consumedMonthly - (sameCycle ? sources.monthly : 0))
    const monthlyRefund = sameCycle ? Math.max(0, allowance - remainingConsumed - user.creditBalance) : 0
    const refundedAmount = monthlyRefund + sources.purchased + reward
    // Expired plan credits cannot refill a new cycle or erase its spending.
    // Purchased credits never expire and always return to their original pool.
    await tx.update(users).set({
      creditBalance: sql`least(${allowance}, ${users.creditBalance} + ${monthlyRefund})`,
      purchasedCredits: sql`${users.purchasedCredits} + ${sources.purchased}`,
      rewardCredits: sql`${users.rewardCredits} + ${reward}`,
      monthlyCreditsUsedThisCycle: remainingConsumed,
      creditsUsedThisCycle: sql`greatest(0, ${users.creditsUsedThisCycle} - ${sameCycle ? sources.monthly + sources.purchased + reward : 0})`,
      validationsThisMonth: sql`greatest(0, ${users.validationsThisMonth} - ${sameValidationMonth ? 1 : 0})`,
    }).where(eq(users.id, userId))
    await tx.insert(creditLedger).values({ userId, amount: refundedAmount, transactionType: 'VALIDATION_REFUND', description: reference })
    if (user.tier !== 'free' && !cycleStart && sources.monthly > 0 && user.creditResetAt && spend.createdAt) {
      await tx.insert(creditLedger).values({ userId, amount: 0, transactionType: 'VALIDATION_MONTHLY_REFUND_PENDING',
        description: JSON.stringify({ jobId, monthly: sources.monthly, debit: -spend.amount,
          cycleEndsAt: user.creditResetAt.toISOString(), spentAt: spend.createdAt.toISOString(),
          subscriptionId: sources.cycleSubscriptionId ?? user.subscriptionId }) })
    }
  }
  if (transaction) await refund(transaction)
  else await db.transaction(refund)
}
