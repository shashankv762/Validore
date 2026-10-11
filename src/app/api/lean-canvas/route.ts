import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/db'
import { users, ideas, leanCanvases } from '@/db/schema'
import { eq, and, max } from 'drizzle-orm'
import { checkCredits, deductCredits } from '@/lib/credits'
import { CREDIT_COSTS } from '@/lib/credit-costs'
import { generateWithFallback } from '@/lib/ai/generate'
import { webSearch } from '@/lib/ai/search'
import { z } from 'zod'
import { rateLimitCheck, checkAndIncrementConcurrency, decrementConcurrency } from '@/lib/rate-limit'

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
  assumptionRegister: z.array(z.object({ assumption: z.string(), riskLevel: z.enum(['high','medium','low']), testMethod: z.string(), status: z.enum(['validated','invalidated','untested']) })).optional(),
  problemStatement: z.string().optional(),
  interviewQuestions: z.array(z.string()).optional(),
  segmentPrioritization: z.array(z.object({ segment: z.string(), priority: z.number(), rationale: z.string(), estimatedSize: z.string() })).optional(),
  alternativeSolutions: z.array(z.object({ name: z.string(), weakness: z.string(), ourAdvantage: z.string() })).optional(),
  businessModelCanvas: z.object({ keyPartners: z.array(z.string()), keyActivities: z.array(z.string()), keyResources: z.array(z.string()), valuePropositions: z.array(z.string()), customerRelationships: z.array(z.string()), channels: z.array(z.string()), customerSegments: z.array(z.string()), costStructure: z.array(z.string()), revenueStreams: z.array(z.string()) }).optional(),
  businessModelValidationScore: z.number().optional(),
  bmScoreBreakdown: z.object({ desirability: z.number(), feasibility: z.number(), viability: z.number(), adaptability: z.number() }).optional(),
  ratMatrix: z.array(z.object({ assumption: z.string(), experiment: z.string(), metric: z.string(), criteria: z.string(), result: z.string().optional() })).optional(),
  buildMeasureLearnCycles: z.array(z.object({ hypothesis: z.string(), buildAction: z.string(), measureMetric: z.string(), learnInsight: z.string(), pivot: z.string().optional() })).optional(),
  pivotAnalysis: z.object({ currentModel: z.string(), triggerConditions: z.array(z.string()), pivotOptions: z.array(z.object({ type: z.string(), description: z.string(), likelihood: z.string() })), recommendation: z.string() }).optional(),
  ifThenRules: z.array(z.object({ ifCondition: z.string(), thenAction: z.string(), confidence: z.enum(['high','medium','low']), rationale: z.string() })).optional(),
  pricingVsVolumeMatrix: z.array(z.object({ pricePoint: z.number(), estimatedVolume: z.number(), revenue: z.number(), contributionMargin: z.number() })).optional(),
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

  const rl = await rateLimitCheck(dbUser.id)
  if (!rl.success) {
    return NextResponse.json({ error: 'Too many requests', retryAfter: 60 }, { status: 429 })
  }

  const creditCheck = await checkCredits(dbUser.id, CREDIT_COSTS.LEAN_CANVAS)
  if (!creditCheck.allowed) {
    return NextResponse.json({ error: 'Insufficient credits' }, { status: 402 })
  }

  // GAP-1: Concurrency check
  const tierConcurrencyLimits: Record<string, number> = { free: 1, premium: 2, max_premium: 3 }
  const maxConcurrent = tierConcurrencyLimits[dbUser.tier || 'free'] ?? 1
  const concurrencyCheck = await checkAndIncrementConcurrency(dbUser.id, maxConcurrent)
  if (!concurrencyCheck.allowed) {
    return NextResponse.json(
      { error: 'Too many concurrent requests. Please wait for your current analysis to complete.' },
      { status: 429 }
    )
  }

  // GAP-2: Decrypt custom OpenRouter key if stored
  let customOpenRouterKey: string | null = null
  const encryptedKey = (dbUser as any).encryptedOpenrouterKey as string | null
  if (encryptedKey) {
    if (encryptedKey.includes(':') && process.env.ENCRYPTION_KEY) {
      try {
        const crypto = await import('crypto')
        const [ivHex, encryptedHex] = encryptedKey.split(':')
        const iv = Buffer.from(ivHex, 'hex')
        const decipher = crypto.createDecipheriv(
          'aes-256-cbc',
          Buffer.from(process.env.ENCRYPTION_KEY, 'hex'),
          iv
        )
        let decrypted = decipher.update(encryptedHex, 'hex', 'utf8')
        decrypted += decipher.final('utf8')
        customOpenRouterKey = decrypted
      } catch {
        console.warn('[BYOK] Failed to decrypt custom key, using platform default')
      }
    } else {
      customOpenRouterKey = encryptedKey // Unencrypted fallback (dev)
    }
  }

  try {
    const body = await request.json()
    const { ideaId, intakeAnswers } = body as { ideaId?: string; intakeAnswers?: Record<number, string> }
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

    // FIX-13: Build supplemental context from the deep intake form answers
    const INTAKE_QUESTIONS = [
      'Specific problem being solved',
      'Early adopters',
      'Proposed solution',
      'Existing alternatives',
      'Unique Value Proposition',
      'High-level concept (X for Y)',
      'Unfair advantage',
      'Customer channels',
      'Revenue streams',
      'Cost structure',
      'Key metrics',
      'Biggest risk',
    ]
    const filledAnswers = intakeAnswers
      ? Object.entries(intakeAnswers)
          .filter(([, v]) => v && v.trim().length > 0)
          .map(([k, v]) => `- ${INTAKE_QUESTIONS[Number(k)] ?? `Q${Number(k)+1}`}: ${v.trim()}`)
      : []
    const intakeContext = filledAnswers.length > 0
      ? `\nFOUNDER-SUPPLIED DEEP INTAKE CONTEXT (use these exact answers — they override any guesses):\n${filledAnswers.join('\n')}\n`
      : ''

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
${intakeContext}
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
- evidenceSummary = clear statement of what is verified vs assumed
- Generate all fields including: assumptionRegister, problemStatement, interviewQuestions, segmentPrioritization, alternativeSolutions, businessModelCanvas, businessModelValidationScore, bmScoreBreakdown, ratMatrix, buildMeasureLearnCycles, pivotAnalysis, ifThenRules, pricingVsVolumeMatrix`

    const result = await generateWithFallback({
      prompt,
      schema: LeanCanvasOutputSchema,
      temperature: 0,
      preferredAiProvider: dbUser.preferredAiProvider,
      customOpenRouterKey,
    })

    const canvas = result.data
    await deductCredits(dbUser.id, CREDIT_COSTS.LEAN_CANVAS, 'LEAN_CANVAS', idea.id)
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
      analysisData: {
        assumptionRegister: canvas.assumptionRegister,
        problemStatement: canvas.problemStatement,
        interviewQuestions: canvas.interviewQuestions,
        segmentPrioritization: canvas.segmentPrioritization,
        alternativeSolutions: canvas.alternativeSolutions,
        businessModelCanvas: canvas.businessModelCanvas,
        businessModelValidationScore: canvas.businessModelValidationScore,
        bmScoreBreakdown: canvas.bmScoreBreakdown,
        ratMatrix: canvas.ratMatrix,
        buildMeasureLearnCycles: canvas.buildMeasureLearnCycles,
        pivotAnalysis: canvas.pivotAnalysis,
        ifThenRules: canvas.ifThenRules,
        pricingVsVolumeMatrix: canvas.pricingVsVolumeMatrix
      },
    }).returning()

    return NextResponse.json({ canvas: saved, tokensUsed: result.tokensUsed, provider: result.provider })
  } finally {
    await decrementConcurrency(dbUser.id)
  }
}