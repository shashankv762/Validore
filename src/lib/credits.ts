import { db } from '@/db'
import { users, creditLedger } from '@/db/schema'
import { eq, and, gt, like, sql } from 'drizzle-orm'
import { TIER_MONTHLY_CREDITS } from './credit-costs'

function assertAmount(amount: number, allowZero = false) {
  if (!Number.isSafeInteger(amount) || amount < (allowZero ? 0 : 1)) {
    throw new Error('Credit amount must be a positive safe integer')
  }
}

export async function checkCredits(userId: string, cost: number): Promise<{ allowed: boolean; balance: number }> {
  assertAmount(cost, true)
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { creditBalance: true, purchasedCredits: true },
  })
  if (!user) return { allowed: false, balance: 0 }
  const balance = user.creditBalance + user.purchasedCredits
  return { allowed: balance >= cost, balance }
}

export async function deductCredits(userId: string, cost: number, action: string, entityId?: string, validationLimit?: number, transaction?: CreditTransaction): Promise<boolean> {
  assertAmount(cost)
  const spend = async (tx: CreditTransaction) => {
    // Lock before reading balances: simultaneous requests must see the latest spend.
    const [user] = await tx.select().from(users).where(eq(users.id, userId)).for('update')
    if (!user || user.creditBalance + user.purchasedCredits < cost) return false
    if (action === 'VALIDATION' && validationLimit !== undefined && user.validationsThisMonth >= validationLimit) return false
    const monthly = Math.min(user.creditBalance, cost)
    const purchased = cost - monthly
    await tx.update(users).set({
      creditBalance: sql`${users.creditBalance} - ${monthly}`,
      purchasedCredits: sql`${users.purchasedCredits} - ${purchased}`,
      creditsUsedThisCycle: sql`${users.creditsUsedThisCycle} + ${cost}`,
      ...(action === 'VALIDATION' ? { validationsThisMonth: sql`${users.validationsThisMonth} + 1` } : {}),
    }).where(eq(users.id, userId))
    await tx.insert(creditLedger).values({
      userId, amount: -cost, transactionType: action,
      description: JSON.stringify({ entityId: entityId ?? null, monthly, purchased }),
    })
    return true
  }
  return transaction ? spend(transaction) : db.transaction(spend)
}

/** Reset a due cycle once, using the current plan under the same user lock. */
export async function topUpMonthlyCredits(userId: string): Promise<boolean> {
  return db.transaction(async tx => {
    const [user] = await tx.select().from(users).where(eq(users.id, userId)).for('update')
    if (!user) return false
    const now = new Date()
    if (user.creditResetAt && user.creditResetAt > now) return false
    await tx.update(users).set({
      creditBalance: TIER_MONTHLY_CREDITS[user.tier], creditsUsedThisCycle: 0,
      creditResetAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
    }).where(eq(users.id, userId))
    return true
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
    const [user] = await tx.select().from(users).where(eq(users.id, userId)).for('update')
    if (!user) throw new Error('Credit recipient not found')
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
    const sources = JSON.parse(spend.description) as { monthly: number; purchased: number }
    assertAmount(sources.monthly, true)
    assertAmount(sources.purchased, true)
    if (sources.monthly + sources.purchased !== -spend.amount) throw new Error('Refund ledger mismatch')
    await tx.update(users).set({
      creditBalance: sql`${users.creditBalance} + ${sources.monthly}`,
      purchasedCredits: sql`${users.purchasedCredits} + ${sources.purchased}`,
      creditsUsedThisCycle: sql`greatest(0, ${users.creditsUsedThisCycle} - ${-spend.amount})`,
      validationsThisMonth: sql`greatest(0, ${users.validationsThisMonth} - 1)`,
    }).where(eq(users.id, userId))
    await tx.insert(creditLedger).values({ userId, amount: -spend.amount, transactionType: 'VALIDATION_REFUND', description: reference })
  }
  if (transaction) await refund(transaction)
  else await db.transaction(refund)
}
