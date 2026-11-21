import { NextRequest, NextResponse } from 'next/server'
import { and, desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/db'
import { users, ideas, leanCanvases, pricingSimulations, crowdfundingAnalyses } from '@/db/schema'
import { createClient } from '@/lib/supabase/server'
import { isActiveAccount } from '@/lib/admin-access'

const Query = z.object({ ideaId: z.uuid(), module: z.enum(['lean-canvas', 'pricing', 'crowdfunding']), id: z.uuid().optional(), page: z.coerce.number().int().min(1).max(10000).default(1) })
export async function GET(request: NextRequest) {
  const respond = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } })
  try {
    const { data: { user } } = await (await createClient()).auth.getUser()
    if (!user) return respond({ error: 'Sign in to select saved planning versions.' }, 401)
    const parsed = Query.safeParse(Object.fromEntries(request.nextUrl.searchParams))
    if (!parsed.success) return respond({ error: 'Choose a valid idea, module and history page.' }, 400)
    const owner = await db.query.users.findFirst({ where: eq(users.supabaseId, user.id) })
    if (!owner || !isActiveAccount(owner)) return respond({ error: 'This account is not active.' }, 403)
    const idea = await db.query.ideas.findFirst({ where: and(eq(ideas.id, parsed.data.ideaId), eq(ideas.userId, owner.id)) })
    if (!idea) return respond({ error: 'Idea not found in your workspace.' }, 404)
    const { module, id, page } = parsed.data
    const table = module === 'lean-canvas' ? leanCanvases : module === 'pricing' ? pricingSimulations : crowdfundingAnalyses
    const records = await db.select({ id: table.id, createdAt: table.createdAt, ...(module === 'lean-canvas' ? { version: leanCanvases.version } : {}) }).from(table)
      .where(and(eq(table.userId, owner.id), eq(table.ideaId, idea.id), id ? eq(table.id, id) : undefined))
      .orderBy(desc(table.createdAt), desc(table.id)).limit(id ? 1 : 21).offset(id ? 0 : (page - 1) * 20)
    if (id && !records.length) return respond({ error: 'This saved planning version is unavailable for this idea.' }, 404)
    return respond({ records: records.slice(0, 20).map(record => ({ ...record, module })), page, hasMore: !id && records.length > 20 })
  } catch { return respond({ error: 'Saved planning versions could not be loaded. Try again.' }, 503) }
}
