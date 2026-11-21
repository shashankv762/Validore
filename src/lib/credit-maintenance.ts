import { db } from '@/db'
import { users, userDevices, rewardedAdSessions } from '@/db/schema'
import { lt, or, isNull, sql, eq, and, gt, asc } from 'drizzle-orm'
import { topUpMonthlyCredits } from './credits'
import { pruneResearchHistory } from './ai/research-store'
import { reapStaleValidationJobs } from './validation/jobs'

const MAINTENANCE_BATCH_SIZE = 500
const MAX_RESET_BATCHES_PER_RUN = 5

/** Shared by the authenticated cron endpoint and the signed Inngest schedule. */
export async function maintainCredits() {
  const now = new Date()
  await reapStaleValidationJobs()
  let resetCount = 0, failedResetCount = 0
  let cursor: string | null = null
  // Keyset-paginate active, non-owner accounts. Excluding ineligible rows in
  // SQL prevents the same first batch of blocked accounts from starving the
  // eligible users behind them on every scheduled run.
  let deferredDueUsers = false
  for (let batch = 0; batch < MAX_RESET_BATCHES_PER_RUN; batch++) {
    const due: { id: string }[] = await db.query.users.findMany({
      where: and(eq(users.accountStatus, 'active'), eq(users.isAdmin, false),
        or(lt(users.creditResetAt, now), isNull(users.creditResetAt), isNull(users.creditCycleStartedAt)),
        cursor ? gt(users.id, cursor) : undefined),
      columns: { id: true }, orderBy: [asc(users.id)], limit: MAINTENANCE_BATCH_SIZE,
    })
    for (const user of due) {
      try { if (await topUpMonthlyCredits(user.id)) resetCount++ }
      catch {
        // One provider/database error must not keep later eligible accounts
        // behind this row from being scanned. It remains due for the next run.
        failedResetCount++
        console.warn('[credits] Monthly allowance reset failed; account remains eligible for a later maintenance run')
      }
    }
    if (due.length < MAINTENANCE_BATCH_SIZE) break
    const nextCursor: string | undefined = due[due.length - 1]?.id
    if (!nextCursor || nextCursor === cursor) throw new Error('Credit maintenance pagination did not advance')
    cursor = nextCursor
    if (batch === MAX_RESET_BATCHES_PER_RUN - 1) deferredDueUsers = true
  }
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
  return { success: true, resetCount, failedResetCount, deferredDueUsers, retentionMaintenance: true }
}
