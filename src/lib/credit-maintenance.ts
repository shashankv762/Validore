import { db } from '@/db'
import { users, userDevices, rewardedAdSessions } from '@/db/schema'
import { lt, or, isNull, sql } from 'drizzle-orm'
import { topUpMonthlyCredits } from './credits'
import { pruneResearchHistory } from './ai/research-store'
import { reapStaleValidationJobs } from './validation/jobs'

/** Shared by the authenticated cron endpoint and the signed Inngest schedule. */
export async function maintainCredits() {
  const now = new Date()
  await reapStaleValidationJobs()
  const expired = await db.query.users.findMany({ where: or(lt(users.creditResetAt, now), isNull(users.creditResetAt)), columns: { id: true }, limit: 500 })
  let resetCount = 0
  for (const user of expired) if (await topUpMonthlyCredits(user.id)) resetCount++
  await pruneResearchHistory(now)
  const securityCutoff = new Date(now.getTime() - 30 * 86_400_000)
  await db.execute(sql`delete from ${userDevices} where ${userDevices.id} in
    (select ${userDevices.id} from ${userDevices} where ${userDevices.lastActive} < ${securityCutoff} order by ${userDevices.lastActive} limit 1000)`)
  // Successful reward references remain for accounting; abandoned sessions
  // cannot be redeemed after 30 minutes and need not accumulate indefinitely.
  const abandonedCutoff = new Date(now.getTime() - 7 * 86_400_000)
  await db.execute(sql`delete from ${rewardedAdSessions} where ${rewardedAdSessions.id} in
    (select ${rewardedAdSessions.id} from ${rewardedAdSessions} where ${rewardedAdSessions.status} <> 'rewarded'
      and ${rewardedAdSessions.expiresAt} < ${abandonedCutoff} order by ${rewardedAdSessions.expiresAt} limit 1000)`)
  return { success: true, resetCount, retentionMaintenance: true }
}
