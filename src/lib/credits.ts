import { db } from '@/db'
import { users, creditLedger } from '@/db/schema'
import { eq, and, gt, like, sql } from 'drizzle-orm'
import { CREDIT_COSTS, TIER_MONTHLY_CREDITS } from './credit-costs'
import { allocateCredits, canFundExtraLite, totalCredits } from './credit-allocation'

function assertAmount(amount: number, allowZero = false) {
  if (!Number.isSafeInteger(amount) || amount < (allowZero ? 0 : 1)) {
    throw new Error('Credit amount must be a positive safe integer')
  }
}

export async function checkCredits(userId: string, cost: number): Promise<{ allowed: boolean; balance: number }> {
  assertAmount(cost, true)
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { creditBalance: true, purchasedCredits: true, rewardCredits: true, creditResetAt: true, tier: true },
  })
  if (!user) return { allowed: false, balance: 0 }
  const monthlyBalance = !user.creditResetAt || user.creditResetAt <= new Date()
    ? TIER_MONTHLY_CREDITS[user.tier] : user.creditBalance
  const balance = totalCredits({ ...user, creditBalance: monthlyBalance })
  return { allowed: balance >= cost, balance }
}

export async function deductCredits(userId: string, cost: number, action: string, entityId?: string, validationLimit?: number, transaction?: CreditTransaction): Promise<boolean> {
  assertAmount(cost)
  const spend = async (tx: CreditTransaction) => {
    // Lock before reading balances: simultaneous requests must see the latest spend.
    const [lockedUser] = await tx.select().from(users).where(eq(users.id, userId)).for('update')
    if (!lockedUser) return false
    const user = await applyDueCycleReset(tx, lockedUser)
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
      ...(action === 'VALIDATION' ? { validationsThisMonth: sql`${users.validationsThisMonth} + 1` } : {}),
    }).where(eq(users.id, userId))
    await tx.insert(creditLedger).values({
      userId, amount: -cost, transactionType: action,
      description: JSON.stringify({ entityId: entityId ?? null, monthly, purchased, reward }),
    })
    return true
  }
  return transaction ? spend(transaction) : db.transaction(spend)
}

/** Reset a due cycle once, using the current plan under the same user lock. */
async function applyDueCycleReset(tx: CreditTransaction, user: typeof users.$inferSelect) {
  const now = new Date()
  if (user.creditResetAt && user.creditResetAt > now) return user
  const values = {
    creditBalance: TIER_MONTHLY_CREDITS[user.tier], creditsUsedThisCycle: 0,
    creditResetAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
  }
  await tx.update(users).set(values).where(eq(users.id, user.id))
  return { ...user, ...values }
}

export async function topUpMonthlyCredits(userId: string): Promise<boolean> {
  return db.transaction(async tx => {
    const [user] = await tx.select().from(users).where(eq(users.id, userId)).for('update')
    if (!user) return false
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
    const sources = JSON.parse(spend.description) as { monthly: number; purchased: number; reward?: number }
    const reward = sources.reward ?? 0 // Older ledger entries predate rewarded credits.
    assertAmount(sources.monthly, true)
    assertAmount(sources.purchased, true)
    assertAmount(reward, true)
    if (sources.monthly + sources.purchased + reward !== -spend.amount) throw new Error('Refund ledger mismatch')
    const user = await applyDueCycleReset(tx, lockedUser)
    const now = new Date()
    const cycleStart = user.creditResetAt ? new Date(user.creditResetAt.getTime() - 30 * 86_400_000) : null
    const sameCycle = !spend.createdAt || !cycleStart || spend.createdAt >= cycleStart
    const sameValidationMonth = !spend.createdAt || spend.createdAt >= new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    const monthlyRefund = sameCycle ? Math.min(sources.monthly, Math.max(0, TIER_MONTHLY_CREDITS[user.tier] - user.creditBalance)) : 0
    const refundedAmount = monthlyRefund + sources.purchased + reward
    // Expired plan credits cannot refill a new cycle or erase its spending.
    // Purchased credits never expire and always return to their original pool.
    await tx.update(users).set({
      creditBalance: sql`least(${TIER_MONTHLY_CREDITS[user.tier]}, ${users.creditBalance} + ${monthlyRefund})`,
      purchasedCredits: sql`${users.purchasedCredits} + ${sources.purchased}`,
      rewardCredits: sql`${users.rewardCredits} + ${reward}`,
      creditsUsedThisCycle: sql`greatest(0, ${users.creditsUsedThisCycle} - ${sameCycle ? refundedAmount : 0})`,
      validationsThisMonth: sql`greatest(0, ${users.validationsThisMonth} - ${sameValidationMonth ? 1 : 0})`,
    }).where(eq(users.id, userId))
    await tx.insert(creditLedger).values({ userId, amount: refundedAmount, transactionType: 'VALIDATION_REFUND', description: reference })
  }
  if (transaction) await refund(transaction)
  else await db.transaction(refund)
}
