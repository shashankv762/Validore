import { and, eq } from 'drizzle-orm'
import { db } from '@/db'
import { creditLedger, users } from '@/db/schema'
import { isActiveAccount, isOwnerAccount } from './admin-access'
import { DAILY_LOGIN_CREDITS } from './credit-costs'

export class DailyCreditError extends Error {
  constructor(message: string, readonly status: number) { super(message) }
}
export type DailyCreditStatus = {
  credits: number; claimedToday: boolean; available: boolean; nextClaimAt: string; day: string
}
function dayStatus(claimedToday: boolean, eligible: boolean, now: Date): DailyCreditStatus {
  return { credits: DAILY_LOGIN_CREDITS, claimedToday, available: eligible && !claimedToday,
    day: now.toISOString().slice(0, 10),
    nextClaimAt: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString() }
}

export async function dailyCreditStatus(userId: string): Promise<DailyCreditStatus> {
  const now = new Date()
  const user = await db.query.users.findFirst({ where: eq(users.id, userId), columns: { isAdmin: true, accountStatus: true } })
  if (!user) throw new DailyCreditError('Account not found.', 404)
  const [claim] = await db.select({ id: creditLedger.id }).from(creditLedger).where(and(
    eq(creditLedger.userId, userId), eq(creditLedger.transactionType, 'DAILY_LOGIN_CLAIM'),
    eq(creditLedger.description, now.toISOString().slice(0, 10)),
  )).limit(1)
  return dayStatus(Boolean(claim), isActiveAccount(user) && !isOwnerAccount(user), now)
}

/** All grants and spending share a user lock. The unique ledger entry also
 * prevents duplicate grants if another caller or a network retry races us. */
export async function claimDailyCredits(userId: string) {
  return db.transaction(async tx => {
    const [user] = await tx.select().from(users).where(eq(users.id, userId)).for('update')
    if (!user) throw new DailyCreditError('Account not found.', 404)
    if (!isActiveAccount(user)) throw new DailyCreditError('This account cannot claim credits.', 403)
    if (isOwnerAccount(user)) throw new DailyCreditError('Owner research already has an unlimited allowance.', 409)
    const now = new Date()
    const day = now.toISOString().slice(0, 10)
    const [existing] = await tx.select({ id: creditLedger.id }).from(creditLedger).where(and(
      eq(creditLedger.userId, userId), eq(creditLedger.transactionType, 'DAILY_LOGIN_CLAIM'), eq(creditLedger.description, day),
    )).limit(1)
    if (existing) return { ...dayStatus(true, true, now), granted: 0, duplicate: true }
    if (user.rewardCredits > 2_147_483_647 - DAILY_LOGIN_CREDITS) throw new DailyCreditError('Your earned balance has reached its supported limit.', 409)
    const [entry] = await tx.insert(creditLedger).values({ userId, amount: DAILY_LOGIN_CREDITS,
      transactionType: 'DAILY_LOGIN_CLAIM', description: day }).onConflictDoNothing().returning({ id: creditLedger.id })
    if (!entry) return { ...dayStatus(true, true, now), granted: 0, duplicate: true }
    await tx.update(users).set({ rewardCredits: user.rewardCredits + DAILY_LOGIN_CREDITS, updatedAt: now }).where(eq(users.id, userId))
    return { ...dayStatus(true, true, now), granted: DAILY_LOGIN_CREDITS, duplicate: false }
  })
}
