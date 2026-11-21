import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { and, eq } from 'drizzle-orm'
import { db } from '@/db'
import { ideas, users, leanCanvases } from '@/db/schema'
import { createClient } from '@/lib/supabase/server'
import { validAuthOrigin } from '@/lib/auth-form'
import { canUserAccess } from '@/lib/tier-gate'
import { rateLimitCheck } from '@/lib/rate-limit'
import { saveCanvasVersion } from '@/lib/canvas-store'
import { manualCanvasRevision } from '@/lib/planning/canvas-revision'
import { beginPlanningRequest, bindPlanningIdea, preparePlanningContext, completePlanningRequest, failPlanningRequest, planningIdeaSnapshot, PlanningRequestError, type PlanningRun } from '@/lib/planning/requests'
import { assertPlanningContextUnchanged, PlanningContextError } from '@/lib/planning/context'
import { SourceReportIdSchema } from '@/lib/planning/source-report-contract'
import { assertPlanningSourceUnchanged, PlanningSourceReportError } from '@/lib/planning/source-report'

const block = z.string().max(4000)
const input = z.object({ ideaId: z.string().uuid(), sourceReportId: SourceReportIdSchema, parentCanvasId: z.string().uuid().optional(), changeReason: z.string().trim().max(2000).optional(), blocks: z.object({
  problem: block, customerSegments: block, uvp: block, solution: block,
  channels: block, revenueStreams: block, costStructure: block, keyMetrics: block, unfairAdvantage: block,
}).refine(blocks => Object.values(blocks).some(content => content.trim().length > 0), 'Add at least one canvas block') })

export async function POST(request: NextRequest) {
  if (!validAuthOrigin(request)) return NextResponse.json({ error: 'Invalid request origin' }, { status: 403 })
  let planningRun: PlanningRun | null = null
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const parsed = input.safeParse(await request.clone().json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: 'Provide a valid idea and canvas blocks (up to 4,000 characters each).' }, { status: 400 })
    const owner = await db.query.users.findFirst({ where: eq(users.supabaseId, user.id) })
    if (!owner) return NextResponse.json({ error: 'User not found' }, { status: 404 })
    planningRun = await beginPlanningRequest(request, owner.id, 'lean-canvas')
    if (planningRun.replay) return NextResponse.json(planningRun.replay, { headers: { 'Cache-Control': 'private, no-store' } })
    if (!await canUserAccess(user.id, 'canLeanCanvas')) return NextResponse.json({ error: 'Canvas editing is unavailable for this plan.' }, { status: 403 })
    if (!(await rateLimitCheck(owner.id, 'canvas-manual')).success) return NextResponse.json({ error: 'Too many requests. Please try again shortly.' }, { status: 429 })
    const idea = await db.query.ideas.findFirst({ where: and(eq(ideas.id, parsed.data.ideaId), eq(ideas.userId, owner.id)) })
    if (!idea) return NextResponse.json({ error: 'Idea not found' }, { status: 404 })
    if (idea.isActive === false) return NextResponse.json({ error: 'This idea is no longer active in your workspace.' }, { status: 404 })
    if (idea.isReadOnly) return NextResponse.json({ error: 'This idea is read-only. Choose an editable idea before saving a canvas.' }, { status: 403 })
    bindPlanningIdea(planningRun,owner.id,idea)
    planningRun.selection = { ...planningRun.selection, parentCanvasId: parsed.data.parentCanvasId ?? null }
    const contextSnapshot = await preparePlanningContext(planningRun, owner.id, idea.id, 'lean-canvas')
    const parent = parsed.data.parentCanvasId ? await db.query.leanCanvases.findFirst({ where: and(
      eq(leanCanvases.id, parsed.data.parentCanvasId), eq(leanCanvases.ideaId, idea.id), eq(leanCanvases.userId, owner.id),
    ) }) : null
    if (parsed.data.parentCanvasId && !parent) return NextResponse.json({ error: 'The canvas being edited could not be found.' }, { status: 404 })
    const revision = manualCanvasRevision(parent ?? null, parsed.data.blocks)
    const saved = await saveCanvasVersion(owner.id, idea.id, {
      ...revision.blocks, validationScore: revision.overallScore, confidenceScores: revision.confidenceScores,
      changeReason: parsed.data.changeReason || (parent ? `Founder revision of version ${parent.version}` : 'Founder-authored manual canvas'),
      evidenceSummary: parent ? 'Unchanged blocks retain their previous evidence status. Edited blocks are founder assumptions; no new verification was performed.' : 'Founder assumptions; no AI analysis or evidence verification was performed.',
      analysisData: { ...revision.analysisData, ideaSnapshot: planningIdeaSnapshot(idea),
        planningContext: contextSnapshot,
        ...(parsed.data.sourceReportId !== undefined ? { sourceReport: planningRun.sourceReport?.snapshot ?? null } : {}) },
    }, 0, async (tx, savedCanvas) => {
      if (!planningRun?.lease) await assertPlanningContextUnchanged(tx, owner.id, idea.id, contextSnapshot)
      if (!planningRun?.lease) await assertPlanningSourceUnchanged(tx,owner.id,idea.id,planningRun?.sourceReport)
      await completePlanningRequest(tx,planningRun?.lease ?? null,savedCanvas.id,planningRun?.ideaBinding)
    })
    if (saved.kind === 'limit') return NextResponse.json({ error: 'This idea has reached the four-canvas version limit.' }, { status: 409 })
    if (saved.kind !== 'saved') return NextResponse.json({ error: 'Canvas could not be saved.' }, { status: 503 })
    return NextResponse.json({ canvas: saved.canvas, ...('unchanged' in saved ? { unchanged: true, creditsCharged: 0 } : {}) }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    if (error instanceof PlanningSourceReportError || error instanceof PlanningContextError) return NextResponse.json({ error:error.message,code:error.code },{ status:error.status,headers:{ 'Cache-Control':'private, no-store' } })
    if (error instanceof PlanningRequestError) return NextResponse.json({ error: error.message, code: error.code, retryAfter: error.retryAfter }, { status: error.status, headers: { 'Cache-Control': 'private, no-store', ...(error.retryAfter ? { 'Retry-After': String(error.retryAfter) } : {}) } })
    return NextResponse.json({ error: 'Canvas could not be saved. Please try again.' }, { status: 503 })
  } finally { await failPlanningRequest(planningRun?.lease ?? null) }
}
