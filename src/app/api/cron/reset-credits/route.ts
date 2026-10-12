import { NextResponse } from 'next/server'
import { db } from '@/db'
import { users } from '@/db/schema'
import { topUpMonthlyCredits } from '@/lib/credits'
import { lt, or, isNull } from 'drizzle-orm'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get('authorization')
    const secret = process.env.CRON_SECRET
    if (!secret || authHeader !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const now = new Date()
    const expiredUsers = await db.query.users.findMany({
      where: or(lt(users.creditResetAt, now), isNull(users.creditResetAt)),
      columns: { id: true }, limit: 500
    })

    let count = 0
    for (const user of expiredUsers) {
      if (await topUpMonthlyCredits(user.id)) count++
    }

    return NextResponse.json({ success: true, resetCount: count })
  } catch (error) {
    console.error('[credits/reset] Failed to reset credits:', error)
    return NextResponse.json({ error: 'Unable to reset credits' }, { status: 500 })
  }
}
