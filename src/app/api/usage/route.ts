import { NextResponse } from 'next/server'
import { and, desc, eq, gte, lt, sql } from 'drizzle-orm'
import { db } from '@/db'
import { creditLedger, ideas, users, validationJobs } from '@/db/schema'
import { createClient } from '@/lib/supabase/server'
import { topUpMonthlyCredits } from '@/lib/credits'
import { creditCycleStart } from '@/lib/account-usage'

const headers = { 'Cache-Control': 'private, no-store' }

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers })
    let account = await db.query.users.findFirst({ where: eq(users.supabaseId, user.id) })
    if (!account) return NextResponse.json({ error: 'Account not found' }, { status: 404, headers })
    if (!account.creditResetAt || account.creditResetAt <= new Date()) {
      await topUpMonthlyCredits(account.id)
      account = await db.query.users.findFirst({ where: eq(users.id, account.id) }) ?? account
    }
    const now = new Date()
    const start = creditCycleStart(account.creditResetAt, now)
    const jobScope = and(eq(validationJobs.userId, account.id), gte(validationJobs.createdAt, start), lt(validationJobs.createdAt, now))
    const [totals, activity, recentJobs] = await Promise.all([
      db.select({
        total: sql<number>`count(*)`.mapWith(Number),
        complete: sql<number>`count(*) filter (where ${validationJobs.status} = 'complete')`.mapWith(Number),
        partial: sql<number>`count(*) filter (where ${validationJobs.status} = 'partial')`.mapWith(Number),
        failed: sql<number>`count(*) filter (where ${validationJobs.status} = 'failed')`.mapWith(Number),
        active: sql<number>`count(*) filter (where ${validationJobs.status} in ('pending', 'running'))`.mapWith(Number),
        tokens: sql<number>`coalesce(sum(${validationJobs.tokensUsed}), 0)`.mapWith(Number),
      }).from(validationJobs).where(jobScope),
      db.select({ action: creditLedger.transactionType,
        credits: sql<number>`coalesce(sum(-${creditLedger.amount}), 0)`.mapWith(Number),
        transactions: sql<number>`count(*)`.mapWith(Number),
      }).from(creditLedger).where(and(eq(creditLedger.userId, account.id), gte(creditLedger.createdAt, start),
        lt(creditLedger.createdAt, now), lt(creditLedger.amount, 0), sql`right(${creditLedger.transactionType}, 5) <> '_PACK'`))
        .groupBy(creditLedger.transactionType).orderBy(creditLedger.transactionType),
      db.select({ id: validationJobs.id, ideaName: ideas.name, status: validationJobs.status,
        isLite: validationJobs.isLite, tokensUsed: validationJobs.tokensUsed, createdAt: validationJobs.createdAt,
      }).from(validationJobs).innerJoin(ideas, and(eq(ideas.id, validationJobs.ideaId), eq(ideas.userId, account.id)))
        .where(jobScope).orderBy(desc(validationJobs.createdAt), desc(validationJobs.id)).limit(20),
    ])
    return NextResponse.json({ period: { start: start.toISOString(), end: account.creditResetAt?.toISOString() ?? null },
      updatedAt: now.toISOString(), validations: totals[0], activity, recentJobs }, { headers })
  } catch {
    return NextResponse.json({ error: 'Usage could not be loaded. Please try again.' }, { status: 503, headers })
  }
}
