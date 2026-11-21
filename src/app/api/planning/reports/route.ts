import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { and, desc, eq, or } from 'drizzle-orm'
import { db } from '@/db'
import { ideas, users, validationReports } from '@/db/schema'
import { createClient } from '@/lib/supabase/server'
import { isActiveAccount } from '@/lib/admin-access'
import { isEligiblePlanningReport, planningReportStatus } from '@/lib/planning/source-report'

const Query = z.object({ ideaId: z.string().uuid(), id: z.string().uuid().optional(), page: z.coerce.number().int().min(1).max(10000).default(1) })
export async function GET(request: NextRequest) {
  const respond = (body: unknown, status = 200) => NextResponse.json(body,{ status,headers:{ 'Cache-Control':'private, no-store' } })
  try {
    const { data:{ user } } = await (await createClient()).auth.getUser()
    if (!user) return respond({ error:'Sign in to choose a saved validation.' },401)
    const query = Query.safeParse(Object.fromEntries(request.nextUrl.searchParams))
    if (!query.success) return respond({ error:'Choose a valid idea and history page.' },400)
    const owner = await db.query.users.findFirst({ where:eq(users.supabaseId,user.id) })
    if (!owner) return respond({ error:'Account not found.' },404)
    if (!isActiveAccount(owner)) return respond({ error:'This account is not active.' },403)
    const idea = await db.query.ideas.findFirst({ where:and(eq(ideas.id,query.data.ideaId),eq(ideas.userId,owner.id)) })
    if (!idea) return respond({ error:'Idea not found in your workspace.' },404)
    const rows = await db.select().from(validationReports).where(and(eq(validationReports.userId,owner.id),eq(validationReports.ideaId,idea.id),
      or(eq(validationReports.status,'complete'),eq(validationReports.status,'partial')),
      query.data.id ? eq(validationReports.id,query.data.id) : undefined))
      .orderBy(desc(validationReports.createdAt),desc(validationReports.id)).limit(query.data.id ? 1 : 21).offset(query.data.id ? 0 : (query.data.page-1)*20)
    const records = rows.slice(0,20).filter(isEligiblePlanningReport).map(row => ({ id:row.id,
      score:typeof row.overallScore === 'number' && row.overallScore >= 0 && row.overallScore <= 100 ? row.overallScore : null,
      status:planningReportStatus(row),mode:row.isLite ? 'lite' : 'full',createdAt:row.createdAt?.toISOString() ?? null }))
    if (query.data.id && !records.length) return respond({ error:'This validation is unavailable for planning. Choose another saved report or continue without one.' },404)
    return respond({ records,page:query.data.page,hasMore:!query.data.id && rows.length>20 })
  } catch { return respond({ error:'Saved validations could not be loaded. Try again or continue without one.' },503) }
}
