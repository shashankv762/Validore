import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/db'
import { ideas, users, validationJobs, tierConfig } from '@/db/schema'
import { eq, and, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { IdeaInputSchema } from '@/lib/idea-input'

async function authenticatedUser() {
  const { data: { user } } = await (await createClient()).auth.getUser()
  return user ? db.query.users.findFirst({ where: eq(users.supabaseId, user.id) }) : null
}

export async function GET() {
  const user = await authenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userIdeas = await db.query.ideas.findMany({ where: and(eq(ideas.userId, user.id), eq(ideas.isActive, true)),
    orderBy: (table, { desc }) => [desc(table.createdAt)], limit: 100 })
  return NextResponse.json({ ideas: userIdeas })
}

export async function POST(request: NextRequest) {
  try {
    const user = await authenticatedUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const body = await request.json().catch(() => null)
    if (body?.website) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    const parsed = IdeaInputSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: 'Please check your idea details.', details: parsed.error.flatten() }, { status: 400 })
    return await db.transaction(async (tx) => {
      const [locked] = await tx.select().from(users).where(eq(users.id, user.id)).for('update')
      if (!locked) return NextResponse.json({ error: 'User not found' }, { status: 404 })
      const [config] = await tx.select().from(tierConfig).where(eq(tierConfig.tier, locked.tier)).limit(1)
      if (!config) return NextResponse.json({ error: 'Plan configuration is unavailable' }, { status: 503 })
      const active = await tx.select({ id: ideas.id }).from(ideas).where(and(eq(ideas.userId, user.id), eq(ideas.isActive, true), eq(ideas.isReadOnly, false))).limit(config.maxActiveIdeas)
      if (active.length >= config.maxActiveIdeas) return NextResponse.json({ error: 'Your plan has reached its active idea limit. Upgrade or use an existing idea.' }, { status: 403 })
      const [idea] = await tx.insert(ideas).values({ userId: user.id, ...parsed.data }).returning()
      return NextResponse.json({ idea }, { status: 201 })
    })
  } catch (error) {
    console.error('[ideas] Saving failed:', error)
    return NextResponse.json({ error: 'Unable to save your idea. Please try again.' }, { status: 503 })
  }
}

const EditSchema = IdeaInputSchema.extend({ ideaId: z.string().uuid() })
export async function PATCH(request: NextRequest) {
  const user = await authenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const parsed = EditSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Please check your idea details.', details: parsed.error.flatten() }, { status: 400 })
  const { ideaId, ...draft } = parsed.data
  return db.transaction(async (tx) => {
    const [idea] = await tx.select().from(ideas).where(and(eq(ideas.id, ideaId), eq(ideas.userId, user.id))).for('update')
    if (!idea || idea.isReadOnly || !idea.isActive) return NextResponse.json({ error: 'Idea not found or read-only' }, { status: 404 })
    const [running] = await tx.select({ id: validationJobs.id }).from(validationJobs).where(and(eq(validationJobs.ideaId, ideaId), inArray(validationJobs.status, ['pending', 'running']))).limit(1)
    if (running) return NextResponse.json({ error: 'This idea is being analysed. Wait until the analysis completes before editing.' }, { status: 409 })
    const [updated] = await tx.update(ideas).set({ ...draft, updatedAt: new Date() }).where(eq(ideas.id, ideaId)).returning()
    return NextResponse.json({ idea: updated })
  })
}
