import { NextRequest, NextResponse } from 'next/server'
import { and, desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/db'
import { users, ideas, pricingSimulations, crowdfundingAnalyses, pitchDecks } from '@/db/schema'
import { createClient } from '@/lib/supabase/server'

export type SavedModule = 'pricing' | 'crowdfunding' | 'pitch-deck'
const Query = z.object({ id: z.uuid().optional(), page: z.coerce.number().int().min(1).max(10000).default(1) })

/** Viewing owned work never checks generation credits or the current plan. */
export async function moduleHistory(request: NextRequest, module: SavedModule) {
  const respond = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } })
  try {
    const { data: { user } } = await (await createClient()).auth.getUser()
    if (!user) return respond({ error: 'Sign in to view your saved work.' }, 401)
    const parsed = Query.safeParse(Object.fromEntries(request.nextUrl.searchParams))
    if (!parsed.success) return respond({ error: 'Provide a valid saved result or history page.' }, 400)
    const owner = await db.query.users.findFirst({ where: eq(users.supabaseId, user.id) })
    if (!owner) return respond({ error: 'Account not found.' }, 404)
    const { id, page } = parsed.data
    if (id) {
      const record = module === 'pricing'
        ? await db.query.pricingSimulations.findFirst({ where: and(eq(pricingSimulations.id, id), eq(pricingSimulations.userId, owner.id)) })
        : module === 'crowdfunding'
          ? await db.query.crowdfundingAnalyses.findFirst({ where: and(eq(crowdfundingAnalyses.id, id), eq(crowdfundingAnalyses.userId, owner.id)) })
          : await db.query.pitchDecks.findFirst({ where: and(eq(pitchDecks.id, id), eq(pitchDecks.userId, owner.id)) })
      return record && record.userId === owner.id ? respond({ record }) : respond({ error: 'This saved result was not found in your workspace.' }, 404)
    }
    const table = module === 'pricing' ? pricingSimulations : module === 'crowdfunding' ? crowdfundingAnalyses : pitchDecks
    const score = module === 'pricing' ? pricingSimulations.pricingScore : module === 'crowdfunding' ? crowdfundingAnalyses.performanceScore : pitchDecks.qualityScore
    const records = await db.select({ id: table.id, ideaId: table.ideaId, name: ideas.name, score, createdAt: table.createdAt })
      .from(table).leftJoin(ideas, and(eq(ideas.id, table.ideaId), eq(ideas.userId, owner.id)))
      .where(eq(table.userId, owner.id)).orderBy(desc(table.createdAt), desc(table.id)).limit(21).offset((page - 1) * 20)
    return respond({ records: records.slice(0, 20), page, hasMore: records.length > 20 })
  } catch {
    return respond({ error: 'Your saved work could not be loaded. Please try again.' }, 503)
  }
}
