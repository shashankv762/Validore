import { NextResponse } from 'next/server'
import { db } from '@/db'
import { users, userDevices } from '@/db/schema'
import { topUpMonthlyCredits } from '@/lib/credits'
import { lt, or, isNull, sql } from 'drizzle-orm'
import { pruneResearchHistory } from '@/lib/ai/research-store'
import { reapStaleValidationJobs } from '@/lib/validation/jobs'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get('authorization')
    const secret = process.env.CRON_SECRET
    if (!secret || authHeader !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const now = new Date()
    await reapStaleValidationJobs()
    const expiredUsers = await db.query.users.findMany({
      where: or(lt(users.creditResetAt, now), isNull(users.creditResetAt)),
      columns: { id: true }, limit: 500
    })

    let count = 0
    for (const user of expiredUsers) {
      if (await topUpMonthlyCredits(user.id)) count++
    }

    await pruneResearchHistory(now)
    const securityCutoff = new Date(now.getTime() - 30 * 86_400_000)
    await db.execute(sql`delete from ${userDevices} where ${userDevices.id} in
      (select ${userDevices.id} from ${userDevices} where ${userDevices.lastActive} < ${securityCutoff} order by ${userDevices.lastActive} limit 1000)`)
    return NextResponse.json({ success: true, resetCount: count, retentionMaintenance: true })
  } catch (error) {
    console.error('[credits/reset] Failed to reset credits:', error)
    return NextResponse.json({ error: 'Unable to reset credits' }, { status: 500 })
  }
}
