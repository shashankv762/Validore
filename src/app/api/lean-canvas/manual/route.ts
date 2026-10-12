import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { and, eq } from 'drizzle-orm'
import { db } from '@/db'
import { ideas, users } from '@/db/schema'
import { createClient } from '@/lib/supabase/server'
import { validAuthOrigin } from '@/lib/auth-form'
import { canUserAccess } from '@/lib/tier-gate'
import { rateLimitCheck } from '@/lib/rate-limit'
import { saveCanvasVersion } from '@/lib/canvas-store'

const block = z.string().max(4000)
const input = z.object({ ideaId: z.string().uuid(), blocks: z.object({
  problem: block, customerSegments: block, uvp: block, solution: block,
  channels: block, revenueStreams: block, costStructure: block, keyMetrics: block, unfairAdvantage: block,
}).refine(blocks => Object.values(blocks).some(content => content.trim().length > 0), 'Add at least one canvas block') })

export async function POST(request: NextRequest) {
  if (!validAuthOrigin(request)) return NextResponse.json({ error: 'Invalid request origin' }, { status: 403 })
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const parsed = input.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: 'Provide a valid idea and canvas blocks (up to 4,000 characters each).' }, { status: 400 })
    const owner = await db.query.users.findFirst({ where: eq(users.supabaseId, user.id) })
    if (!owner) return NextResponse.json({ error: 'User not found' }, { status: 404 })
    if (!await canUserAccess(user.id, 'canLeanCanvas')) return NextResponse.json({ error: 'Canvas editing is unavailable for this plan.' }, { status: 403 })
    if (!(await rateLimitCheck(owner.id)).success) return NextResponse.json({ error: 'Too many requests. Please try again shortly.' }, { status: 429 })
    const idea = await db.query.ideas.findFirst({ where: and(eq(ideas.id, parsed.data.ideaId), eq(ideas.userId, owner.id)) })
    if (!idea) return NextResponse.json({ error: 'Idea not found' }, { status: 404 })
    const blocks = Object.fromEntries(Object.entries(parsed.data.blocks).map(([key, content]) => [key, {
      content: content.trim(), confidenceScore: 0, label: 'ASSUMPTION', keyAssumptions: [],
    }]))
    const saved = await saveCanvasVersion(owner.id, idea.id, {
      ...blocks, validationScore: 0, confidenceScores: { overallScore: 0, validationExperiments: [] },
      changeReason: 'Founder-authored manual canvas', evidenceSummary: 'Founder assumptions; no AI analysis or evidence verification was performed.',
    })
    if (saved.kind === 'limit') return NextResponse.json({ error: 'This idea has reached the four-canvas version limit.' }, { status: 409 })
    if (saved.kind !== 'saved') return NextResponse.json({ error: 'Canvas could not be saved.' }, { status: 503 })
    return NextResponse.json({ canvas: saved.canvas }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch {
    return NextResponse.json({ error: 'Canvas could not be saved. Please try again.' }, { status: 503 })
  }
}
