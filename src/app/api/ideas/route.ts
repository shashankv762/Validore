import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/db'
import { ideas, users } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import { z } from 'zod'

const CreateIdeaSchema = z.object({
  name: z.string().min(2).max(100),
  industry: z.string().min(2),
  product: z.string().min(10),
  targetCustomer: z.string().min(5),
  location: z.string().min(2),
  businessModel: z.string().min(5),
  coreProblem: z.string().min(10),
  proposedSolution: z.string().min(10),
})

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const dbUser = await db.query.users.findFirst({ where: eq(users.supabaseId, user.id) })
  if (!dbUser) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const userIdeas = await db.query.ideas.findMany({
    where: and(eq(ideas.userId, dbUser.id), eq(ideas.isActive, true)),
    orderBy: (ideas, { desc }: any) => [desc(ideas.createdAt)],
  })
  return NextResponse.json({ ideas: userIdeas })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const dbUser = await db.query.users.findFirst({ where: eq(users.supabaseId, user.id) })
  if (!dbUser) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const tierCfg = await db.query.tierConfig.findFirst({ where: (tc: any, { eq }: any) => eq(tc.tier, dbUser.tier) })
  const activeIdeas = await db.query.ideas.findMany({
    where: and(eq(ideas.userId, dbUser.id), eq(ideas.isActive, true), eq(ideas.isReadOnly, false)),
  })
  if (tierCfg && activeIdeas.length >= tierCfg.maxActiveIdeas) {
    return NextResponse.json({ error: `Your plan allows max ${tierCfg.maxActiveIdeas} active idea(s). Upgrade to add more.` }, { status: 403 })
  }

  const body = await request.json()
  const parsed = CreateIdeaSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const [idea] = await db.insert(ideas).values({ userId: dbUser.id, ...parsed.data }).returning()
  return NextResponse.json({ idea }, { status: 201 })
}