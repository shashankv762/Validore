import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/db'
import { users, ideas, leanCanvases } from '@/db/schema'
import { eq, and, max } from 'drizzle-orm'
import { canUserAccess } from '@/lib/tier-gate'
import { generateWithFallback } from '@/lib/ai/generate'
import { webSearch } from '@/lib/ai/search'
import { z } from 'zod'

const CanvasBlockSchema = z.object({
  content: z.string(),
  confidenceScore: z.number().min(0).max(100),
  label: z.enum(['ASSUMPTION', 'SOME_RESEARCH', 'MODERATE_EVIDENCE', 'STRONGER_EVIDENCE']),
  keyAssumptions: z.array(z.string()),
})

const LeanCanvasOutputSchema = z.object({
  problem: CanvasBlockSchema,
  customerSegments: CanvasBlockSchema,
  uvp: CanvasBlockSchema,
  solution: CanvasBlockSchema,
  channels: CanvasBlockSchema,
  revenueStreams: CanvasBlockSchema,
  costStructure: CanvasBlockSchema,
  keyMetrics: CanvasBlockSchema,
  unfairAdvantage: CanvasBlockSchema,
  riskiestAssumption: z.string(),
  validationExperiments: z.array(z.object({
    assumption: z.string(),
    experiment: z.string(),
    successMetric: z.string(),
    timeframe: z.string(),
  })),
  overallConfidenceScore: z.number().min(0).max(100),
  changeReason: z.string(),
  evidenceSummary: z.string(),
})

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const ideaId = request.nextUrl.searchParams.get('ideaId')
  if (!ideaId) return NextResponse.json({ error: 'ideaId required' }, { status: 400 })

  const canvases = await db.query.leanCanvases.findMany({
    where: eq(leanCanvases.ideaId, ideaId),
    orderBy: (lc, { asc }) => [asc(lc.version)],
  })
  return NextResponse.json({ canvases })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const dbUser = await db.query.users.findFirst({ where: eq(users.supabaseId, user.id) })
  if (!dbUser) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const allowed = await canUserAccess(user.id, 'canAiLeanCanvas')
  if (!allowed) return NextResponse.json({ error: 'Upgrade to Premium to use AI Lean Canvas automation.' }, { status: 403 })

  const { ideaId } = await request.json()
  if (!ideaId) return NextResponse.json({ error: 'ideaId required' }, { status: 400 })

  const idea = await db.query.ideas.findFirst({
    where: and(eq(ideas.id, ideaId), eq(ideas.userId, dbUser.id)),
  })
  if (!idea) return NextResponse.json({ error: 'Idea not found' }, { status: 404 })

  // Get next version number
  const existing = await db.query.leanCanvases.findMany({ where: eq(leanCanvases.ideaId, ideaId) })
  const nextVersion = Math.min((existing.length > 0 ? Math.max(...existing.map(c => c.version ?? 1)) : 0) + 1, 4)

  // Web search for market context
  const searchResp = await webSearch(`${idea.industry} business model ${idea.location} market 2024`, 4)
  const searchCtx = searchResp.degraded
    ? 'No live search results. Mark all market claims as ASSUMPTION.'
    : searchResp.results.map(r => `- ${r.title}: ${r.content.slice(0, 250)} [${r.source}, ${r.fetchedAt}]`).join('\n')

  const prompt = `You are an expert lean startup consultant building a Lean Canvas for this startup idea.

STARTUP:
Name: ${idea.name}
Industry: ${idea.industry}
Product: ${idea.product}
Target Customer: ${idea.targetCustomer}
Location: ${idea.location}
Business Model: ${idea.businessModel}
Core Problem: ${idea.coreProblem}
Proposed Solution: ${idea.proposedSolution}

MARKET RESEARCH CONTEXT:
${searchCtx}

TASK: Complete a rigorous 9-step Lean Canvas analysis:
Step 1: Clarify the core value hypothesis
Step 2: Identify all founder assumptions (label each ASSUMPTION)
Step 3: Define customer segments with precision
Step 4: Articulate the Unique Value Proposition
Step 5: Map solution to problem
Step 6: Identify channels and revenue streams
Step 7: Calculate cost structure and key metrics
Step 8: Assign confidence scores (0-100) to each block based on evidence quality
Step 9: Identify riskiest assumption and propose validation experiments

CONFIDENCE SCORING:
0-25: Pure assumption, no research (label: ASSUMPTION)
26-50: Some secondary research (label: SOME_RESEARCH)  
51-75: Moderate evidence from research (label: MODERATE_EVIDENCE)
76-100: Stronger evidence from customer interactions (label: STRONGER_EVIDENCE)

INTEGRITY RULES:
- Never fabricate market statistics or customer quotes
- Clearly mark everything as ASSUMPTION unless there is real evidence
- Do not force optimistic scores — be honest about uncertainty
- overallConfidenceScore = average of all 9 block scores
- changeReason = why this version differs from a blank canvas (for V1: "Initial AI-generated canvas")
- evidenceSummary = clear statement of what is verified vs assumed`

  const result = await generateWithFallback({
    prompt,
    schema: LeanCanvasOutputSchema,
    temperature: 0,
  })

  const canvas = result.data
  const [saved] = await db.insert(leanCanvases).values({
    ideaId,
    userId: dbUser.id,
    version: nextVersion,
    problem: canvas.problem,
    customerSegments: canvas.customerSegments,
    uvp: canvas.uvp,
    solution: canvas.solution,
    channels: canvas.channels,
    revenueStreams: canvas.revenueStreams,
    costStructure: canvas.costStructure,
    keyMetrics: canvas.keyMetrics,
    unfairAdvantage: canvas.unfairAdvantage,
    confidenceScores: {
      riskiestAssumption: canvas.riskiestAssumption,
      validationExperiments: canvas.validationExperiments,
      overallScore: canvas.overallConfidenceScore,
    },
    validationScore: canvas.overallConfidenceScore,
    changeReason: canvas.changeReason,
    evidenceSummary: canvas.evidenceSummary,
  }).returning()

  return NextResponse.json({ canvas: saved, tokensUsed: result.tokensUsed, provider: result.provider })
}