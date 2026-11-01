import { randomUUID } from 'node:crypto'
import { and, count, desc, eq, gt, gte, or, sql } from 'drizzle-orm'
import { db } from '@/db'
import { creditLedger, rewardedAdSessions, users } from '@/db/schema'
import type { CreditTransaction } from '@/lib/credits'
import { AD_COOLDOWN_MS, AD_REWARD_CREDITS, AD_SESSION_MS, type RewardedAdConfig, type RewardSession, type RewardStatus } from './config'

export class RewardError extends Error {
  constructor(message: string, readonly status: number, readonly retryAfter?: number) { super(message) }
}

const startOfDay = (now: Date) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
const dailyAwards = (now: Date) => and(eq(rewardedAdSessions.status, 'rewarded'), gte(rewardedAdSessions.rewardedAt, startOfDay(now)))
const pending = (now: Date) => and(eq(rewardedAdSessions.status, 'pending'), gt(rewardedAdSessions.expiresAt, now))
const publicSession = (session: typeof rewardedAdSessions.$inferSelect, now: Date): RewardSession => ({
  id: session.id, status: session.status === 'rewarded' ? 'rewarded' : session.expiresAt <= now ? 'expired' : session.status as 'pending' | 'cancelled',
  expiresAt: session.expiresAt.toISOString(),
})

async function counts(tx: CreditTransaction, userId: string, now: Date, reservePending: boolean) {
  const condition = reservePending ? or(dailyAwards(now), pending(now)) : dailyAwards(now)
  const [all] = await tx.select({ total: count(), owned: sql<number>`count(*) filter (where ${rewardedAdSessions.userId} = ${userId})`.mapWith(Number) })
    .from(rewardedAdSessions).where(condition)
  return all
}

/** Both starts and grants share this transaction lock so global caps cannot race. */
async function lockBudget(tx: CreditTransaction, userId: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(78124, 10)`)
  const [owner] = await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for('update')
  if (!owner) throw new RewardError('Account not found.', 404)
}

export async function rewardStatus(userId: string, config: RewardedAdConfig, sessionId?: string): Promise<RewardStatus> {
  const now = new Date()
  const [[summary], latest, session] = await Promise.all([
    db.select({ total: count() }).from(rewardedAdSessions).where(and(eq(rewardedAdSessions.userId, userId), dailyAwards(now))),
    db.query.rewardedAdSessions.findFirst({
      where: and(eq(rewardedAdSessions.userId, userId), eq(rewardedAdSessions.status, 'rewarded')),
      orderBy: [desc(rewardedAdSessions.rewardedAt)],
    }),
    // Recover an unfinished session even if sessionStorage was cleared or blocked.
    db.query.rewardedAdSessions.findFirst({ where: and(eq(rewardedAdSessions.userId, userId),
      sessionId ? eq(rewardedAdSessions.id, sessionId) : pending(now)), orderBy: [desc(rewardedAdSessions.createdAt)] }),
  ])
  if (sessionId && !session) throw new RewardError('Ad session not found.', 404)
  const readyAt = latest?.rewardedAt ? new Date(latest.rewardedAt.getTime() + AD_COOLDOWN_MS) : null
  return { enabled: true, creditsPerAd: AD_REWARD_CREDITS, dailyLimit: config.dailyLimit,
    remainingToday: Math.max(0, config.dailyLimit - summary.total),
    nextAvailableAt: readyAt && readyAt > now ? readyAt.toISOString() : null,
    session: session ? publicSession(session, now) : null,
  }
}

export async function startRewardSession(userId: string, config: RewardedAdConfig) {
  return db.transaction(async tx => {
    await lockBudget(tx, userId)
    const now = new Date()
    const existing = await tx.query.rewardedAdSessions.findFirst({ where: and(eq(rewardedAdSessions.userId, userId), pending(now)) })
    if (existing) throw new RewardError('An ad session is already open. Finish it or check its reward before trying again.', 409)
    const latest = await tx.query.rewardedAdSessions.findFirst({ where: and(eq(rewardedAdSessions.userId, userId), eq(rewardedAdSessions.status, 'rewarded')), orderBy: [desc(rewardedAdSessions.rewardedAt)] })
    const wait = latest?.rewardedAt ? Math.ceil((latest.rewardedAt.getTime() + AD_COOLDOWN_MS - now.getTime()) / 1000) : 0
    if (wait > 0) throw new RewardError('Please wait a moment before the next ad.', 429, wait)
    const budget = await counts(tx, userId, now, true)
    if (budget.owned >= config.dailyLimit) throw new RewardError('Your daily ad allowance is used or reserved. Try again later.', 429)
    if (budget.total >= config.globalDailyLimit) throw new RewardError('Today’s sponsored credits are all used or reserved. Try again later.', 429)
    const [session] = await tx.insert(rewardedAdSessions).values({
      id: randomUUID(), userId, provider: config.provider, createdAt: now, expiresAt: new Date(now.getTime() + AD_SESSION_MS),
    }).returning()
    return { session: publicSession(session, now), apiKey: config.apiKey, creditsPerAd: AD_REWARD_CREDITS }
  })
}

/** Release a failed/no-fill player reservation. A late, signed completion may
 * still grant within the session deadline and the remaining daily allowance. */
export async function cancelRewardSession(userId: string, sessionId: string) {
  await db.update(rewardedAdSessions).set({ status: 'cancelled' }).where(and(
    eq(rewardedAdSessions.id, sessionId), eq(rewardedAdSessions.userId, userId), eq(rewardedAdSessions.status, 'pending'),
  ))
}

export async function grantAdReward(claim: { provider: string; sessionId: string; transactionId: string }, config: RewardedAdConfig) {
  // Lookup only. Authoritative checks are repeated inside the transaction.
  const found = await db.query.rewardedAdSessions.findFirst({ where: eq(rewardedAdSessions.id, claim.sessionId) })
  if (!found || found.provider !== claim.provider) return 'ignored' as const
  return db.transaction(async tx => {
    await lockBudget(tx, found.userId)
    const session = await tx.query.rewardedAdSessions.findFirst({ where: eq(rewardedAdSessions.id, claim.sessionId) })
    if (!session || session.provider !== config.provider) return 'ignored' as const
    if (session.status === 'rewarded') return 'duplicate' as const
    const repeated = await tx.query.rewardedAdSessions.findFirst({ where: and(
      eq(rewardedAdSessions.provider, config.provider), eq(rewardedAdSessions.providerTransactionId, claim.transactionId),
    ) })
    if (repeated) return 'duplicate' as const
    const now = new Date()
    if (session.expiresAt <= now) return 'expired' as const
    const budget = await counts(tx, session.userId, now, false)
    if (budget.owned >= config.dailyLimit || budget.total >= config.globalDailyLimit) return 'capped' as const
    await tx.update(users).set({ rewardCredits: sql`${users.rewardCredits} + ${AD_REWARD_CREDITS}` }).where(eq(users.id, session.userId))
    await tx.insert(creditLedger).values({ userId: session.userId, amount: AD_REWARD_CREDITS,
      transactionType: 'AD_REWARD', description: 'Completed rewarded ad · AppLixir' })
    await tx.update(rewardedAdSessions).set({ status: 'rewarded', providerTransactionId: claim.transactionId, rewardedAt: now }).where(eq(rewardedAdSessions.id, session.id))
    return 'rewarded' as const
  })
}
