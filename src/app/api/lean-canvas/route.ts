import { NextRequest, NextResponse } from 'next/server'
import { planningContextPrompt, assertPlanningContextUnchanged, PlanningContextError } from '@/lib/planning/context'
import { decryptApiKey } from '@/lib/byok-crypto'
import { validAuthOrigin } from '@/lib/auth-form'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/db'
import { users, ideas, leanCanvases } from '@/db/schema'
import { eq, and, desc } from 'drizzle-orm'
import { nextCanvasVersion } from '@/lib/canvas-versions'
import { checkCredits } from '@/lib/credits'
import { saveCanvasVersion } from '@/lib/canvas-store'
import { CREDIT_COSTS } from '@/lib/credit-costs'
import { canUserAccess } from '@/lib/tier-gate'
import { generateWithFallback } from '@/lib/ai/generate'
import { publicResearchBrief, publicResearchQuery } from '@/lib/ai/research-brief'
import { webSearch, deduplicateSources } from '@/lib/ai/search'
import { planningMethod } from '@/lib/planning/knowledge'
import { normalizeCanvasConfidence, planningSources, validateCanvasOutput } from '@/lib/planning/evidence'
import { z } from 'zod'
import { PlanningArtifactSelectionSchema } from '@/lib/planning/context-contract'
import { rateLimitCheck, checkAndIncrementConcurrency, decrementConcurrency } from '@/lib/rate-limit'
import { effectiveTier, isActiveAccount, isOwnerAccount } from '@/lib/admin-access'
import { getPlan } from '@/lib/plan-catalog'
import { beginPlanningRequest, bindPlanningIdea, preparePlanningContext, completePlanningRequest, failPlanningRequest, planningIdeaSnapshot, PlanningRequestError, type PlanningRun } from '@/lib/planning/requests'
import { assertPlanningSourceUnchanged, PlanningSourceReportError } from '@/lib/planning/source-report'
import { SourceReportIdSchema, SOURCE_REPORT_CONTEXT_MAX_CHARS } from '@/lib/planning/source-report-contract'

const CanvasBlockSchema = z.object({
  content: z.string().trim().min(10).max(4000),
  confidenceScore: z.number().min(0).max(100),
  label: z.enum(['ASSUMPTION', 'SOME_RESEARCH', 'MODERATE_EVIDENCE', 'STRONGER_EVIDENCE']),
  keyAssumptions: z.array(z.string().trim().min(5).max(1000)).min(1).max(8),
  sourceUrls: z.array(z.string().url()).max(8).optional(),
  evidenceNote: z.string().max(2000).optional(),
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
  riskiestAssumption: z.string().trim().min(10).max(1600),
  validationExperiments: z.array(z.object({
    assumption: z.string().trim().min(10).max(1000),
    experiment: z.string().trim().min(20).max(1600),
    successMetric: z.string().trim().min(10).max(1000),
    timeframe: z.string().trim().min(3).max(300),
    recruitedSegment: z.string().trim().min(5).max(1000),
    sampleSize: z.string().trim().min(3).max(500),
    failureAction: z.string().trim().min(10).max(1000),
  })).min(1).max(8),
  overallConfidenceScore: z.number().min(0).max(100),
  changeReason: z.string().trim().min(10).max(2000),
  evidenceSummary: z.string().trim().min(20).max(4000),
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
  const parsed = z.string().uuid().safeParse(request.nextUrl.searchParams.get('ideaId'))
  if (!parsed.success) return NextResponse.json({ error: 'A valid ideaId is required' }, { status: 400 })
  const page = z.coerce.number().int().min(1).max(100000).safeParse(request.nextUrl.searchParams.get('page') ?? 1)
  if (!page.success) return NextResponse.json({ error: 'A valid page is required' }, { status: 400 })
  const dbUser = await db.query.users.findFirst({ where: eq(users.supabaseId, user.id) })
  if (!dbUser) return NextResponse.json({ error: 'User not found' }, { status: 404 })
  if (!isActiveAccount(dbUser)) return NextResponse.json({ error: 'This account is not active.' }, { status: 403 })
  const canvases = await db.query.leanCanvases.findMany({
    where: and(eq(leanCanvases.ideaId, parsed.data), eq(leanCanvases.userId, dbUser.id)),
    orderBy: [desc(leanCanvases.version), desc(leanCanvases.id)], limit: 101, offset: (page.data - 1) * 100,
  })
  return NextResponse.json({ canvases: canvases.slice(0, 100).reverse(), page: page.data, hasMore: canvases.length > 100 }, { headers: { 'Cache-Control': 'private, no-store' } })
}


export async function POST(request: NextRequest) {
  if (!validAuthOrigin(request)) return NextResponse.json({ error: 'Invalid request origin' }, { status: 403 })
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const dbUser = await db.query.users.findFirst({ where: eq(users.supabaseId, user.id) })
  if (!dbUser) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  if (!isActiveAccount(dbUser)) return NextResponse.json({ error: 'This account is not active.' }, { status: 403 })
  let planningRun: PlanningRun | null = null
  let concurrencyAcquired = false
  try {
  const rl = await rateLimitCheck(dbUser.id, 'ai-module')
  if (!rl.success) {
    return NextResponse.json({ error: 'Too many requests', retryAfter: 60 }, { status: 429 })
  }

    planningRun = await beginPlanningRequest(request, dbUser.id, 'lean-canvas')
    if (planningRun.replay) return NextResponse.json(planningRun.replay, { headers: { 'Cache-Control': 'private, no-store' } })

  if (!await canUserAccess(user.id, 'canAiLeanCanvas')) return NextResponse.json({ error: 'This module requires an eligible plan' }, { status: 403 })
  const creditCheck = await checkCredits(dbUser.id, CREDIT_COSTS.LEAN_CANVAS)
  if (!creditCheck.allowed) {
    return NextResponse.json({ error: 'Insufficient credits' }, { status: 402 })
  }

  // GAP-1: Concurrency check
  const tierConcurrencyLimits: Record<string, number> = { free: 1, premium: 2, max_premium: 3 }
  const plan = await getPlan(dbUser.tier)
  const safetyCap = tierConcurrencyLimits[effectiveTier(dbUser)]
  const maxConcurrent = isOwnerAccount(dbUser) ? safetyCap : Math.min(plan.maxConcurrentRequests, safetyCap)
  const concurrencyCheck = await checkAndIncrementConcurrency(dbUser.id, maxConcurrent)
  if (!concurrencyCheck.allowed) {
    return NextResponse.json(
      { error: 'Too many concurrent requests. Please wait for your current analysis to complete.' },
      { status: 429 }
    )
  }

  concurrencyAcquired = true
  // GAP-2: Decrypt custom OpenRouter key if stored
    let customOpenRouterKey: string | null = null
    if (dbUser.encryptedOpenrouterKey) {
      try { customOpenRouterKey = decryptApiKey(dbUser.encryptedOpenrouterKey) }
      catch { return NextResponse.json({ error: 'Your custom AI key could not be loaded. Save it again in settings.' }, { status: 503 }) }
    }
    const body = await request.json().catch(() => null)
    const parsed = z.object({ ideaId: z.string().uuid(),
      sourceReportId: SourceReportIdSchema, ...PlanningArtifactSelectionSchema.shape,
      intakeAnswers: z.record(z.string().regex(/^(?:[0-9]|1[01])$/), z.string().max(4000)).optional(),
    }).safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: 'Invalid canvas input' }, { status: 400 })
    const { ideaId, intakeAnswers } = parsed.data

    const idea = await db.query.ideas.findFirst({
      where: and(eq(ideas.id, ideaId), eq(ideas.userId, dbUser.id)),
    })
    if (!idea) return NextResponse.json({ error: 'Idea not found' }, { status: 404 })
    if (idea.isActive === false) return NextResponse.json({ error: 'This idea is no longer active in your workspace.' }, { status: 404 })
    if (idea.isReadOnly) return NextResponse.json({ error: 'This idea is read-only. Choose an editable idea before generating a canvas.' }, { status: 403 })
    bindPlanningIdea(planningRun,dbUser.id,idea)
    const contextSnapshot = await preparePlanningContext(planningRun, dbUser.id, idea.id, 'lean-canvas')

    const versionQuery = {
      where: and(eq(leanCanvases.ideaId, ideaId), eq(leanCanvases.userId, dbUser.id)),
      columns: { version: true as const },
      orderBy: [desc(leanCanvases.version)],
      limit: 4,
    }
    // Reject completed histories before spending on another AI request.
    const existing = await db.query.leanCanvases.findMany(versionQuery)
    if (nextCanvasVersion(existing, isOwnerAccount(dbUser)) === null) return NextResponse.json({ error: 'This idea has reached the four-canvas version limit.' }, { status: 409 })

    // Web search for market context
    const publicSearch = await webSearch(publicResearchQuery(idea, 'business model market'), 4)
    const sourceReport = planningRun.sourceReport
    const searchResp = { ...publicSearch, results: deduplicateSources([...publicSearch.results,...(sourceReport?.sources ?? [])]) }
    const searchCtx = !searchResp.results.length
      ? 'No live search results. Mark all market claims as ASSUMPTION.'
      : searchResp.results.map(r => `- ${r.title}: ${r.content.slice(0, 1400)} [URL: ${r.url}; kind: ${r.retrievalKind ?? 'snippet'}; retrieved: ${r.fetchedAt}]`).join('\n')

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

    const parentSnapshot = contextSnapshot.artifacts.find(item => item.module === 'lean-canvas' && item.id === contextSnapshot.parentCanvasId)
    const previousCanvas = parentSnapshot ? { id: parentSnapshot.id, version: parentSnapshot.version, ...parentSnapshot.data } : null
    const previousBrief = parentSnapshot ? JSON.stringify(parentSnapshot) : 'No selected parent canvas; this is an initial canvas or an explicit new branch.'
    const founderContext = planningContextPrompt(contextSnapshot, sourceReport)
    const prompt = `You are an expert lean startup consultant building a Lean Canvas for this startup idea.
${planningMethod('canvas')}

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
PREVIOUS SAVED CANVAS (preserve unchanged hypotheses; explain revisions using new inputs or evidence):
${previousBrief}

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
- Attach sourceUrls and an evidenceNote to each researched block. URLs must exactly match retrieved research. A generic market fact does not validate a startup-specific solution or price. Scores over 50 require specific customer evidence; never treat a founder assertion as an observed customer test.
- overallConfidenceScore = average of all 9 block scores (recomputed by the application).
- changeReason must describe what changed from the previous saved version, or "Initial AI-generated canvas" when none exists. Preserve useful founder hypotheses instead of generating an unrelated model.
- evidenceSummary = clear statement of what is verified vs assumed
- Each experiment needs a recruitedSegment, sampleSize, observable successMetric with a denominator/threshold, timeframe and failureAction. Use proposed results only; assumptionRegister statuses remain untested unless actual customer test results were supplied. Core nine blocks, riskiest assumption and experiment backlog are required. Optional analysis should add depth without invented pricing tables or completed experiments. Consider: assumptionRegister, problemStatement, interviewQuestions, segmentPrioritization, alternativeSolutions, businessModelCanvas, businessModelValidationScore, bmScoreBreakdown, ratMatrix, buildMeasureLearnCycles, pivotAnalysis, ifThenRules, pricingVsVolumeMatrix`

    const result = await generateWithFallback({
      sources: searchResp.results,
      ...(sourceReport ? { privateContextMaxChars: SOURCE_REPORT_CONTEXT_MAX_CHARS, researchMode: 'reuse' as const, maxResearchRounds: 0 }
        : { maxResearchRounds: searchResp.results.length ? 1 : 2 }),
    researchPrompt: publicResearchBrief(idea),
      privateContext: founderContext,
      prompt,
      schema: LeanCanvasOutputSchema,
      validateOutput: validateCanvasOutput,
      temperature: 0,
      preferredAiProvider: dbUser.preferredAiProvider,
      maxTokensPerCall: isOwnerAccount(dbUser) ? undefined : plan.maxTokensPerCall,
      customOpenRouterKey,
    })

    const sources = result.sources ?? searchResp.results
    const canvas = normalizeCanvasConfidence(result.data, sources)
    const saved = await saveCanvasVersion(dbUser.id, ideaId, {
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
        validationScore: Math.round(canvas.overallConfidenceScore),
        changeReason: canvas.changeReason,
        evidenceSummary: canvas.evidenceSummary,
        analysisData: {
          ideaSnapshot: planningIdeaSnapshot(idea),
          sourceReport: sourceReport?.snapshot ?? null,
          planningContext: contextSnapshot,
          researchSources: planningSources(sources),
          evidenceGaps: ['Canvas confidence describes evidence coverage, not the probability that the startup will succeed. Market research alone does not establish customer demand.'],
          sourceCanvasId: previousCanvas?.id,
          parentCanvasVersion: parentSnapshot?.version ?? null,
          parentCanvasHash: parentSnapshot?.contentHash ?? null,
          intakeAnswers: intakeAnswers ?? {},
          assumptionRegister: canvas.assumptionRegister?.map(assumption => ({ ...assumption, status: 'untested' as const })),
          problemStatement: canvas.problemStatement,
          interviewQuestions: canvas.interviewQuestions,
          segmentPrioritization: canvas.segmentPrioritization,
          alternativeSolutions: canvas.alternativeSolutions,
          businessModelCanvas: canvas.businessModelCanvas,
          businessModelValidationScore: canvas.businessModelValidationScore,
          bmScoreBreakdown: canvas.bmScoreBreakdown,
          ratMatrix: canvas.ratMatrix?.map(({ result: _proposedResult, ...test }) => test),
          buildMeasureLearnCycles: canvas.buildMeasureLearnCycles,
          pivotAnalysis: canvas.pivotAnalysis,
          ifThenRules: canvas.ifThenRules,
          // No price, cost, demand or currency inputs were supplied to this
          // module. Use the pricing simulator for numerical what-if tables.
          pricingVsVolumeMatrix: undefined,
        },
    }, CREDIT_COSTS.LEAN_CANVAS, async (tx, savedCanvas) => {
      if (!planningRun?.lease) await assertPlanningContextUnchanged(tx, dbUser.id, idea.id, contextSnapshot)
      if (!planningRun?.lease) await assertPlanningSourceUnchanged(tx,dbUser.id,idea.id,sourceReport)
      await completePlanningRequest(tx,planningRun?.lease ?? null,savedCanvas.id,planningRun?.ideaBinding)
    })
    if (saved.kind === 'limit') return NextResponse.json({ error: 'This idea has reached the four-canvas version limit. No credits were charged.' }, { status: 409 })
    if (saved.kind === 'missing') return NextResponse.json({ error: 'User not found' }, { status: 404 })
    if (saved.kind === 'credits') return NextResponse.json({ error: 'Insufficient credits. Refresh your balance and try again.' }, { status: 402 })

    return NextResponse.json({ canvas: saved.canvas, tokensUsed: result.tokensUsed, provider: result.provider }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    if (error instanceof PlanningSourceReportError || error instanceof PlanningContextError) return NextResponse.json({ error: error.message, code: error.code },{ status: error.status, headers: { 'Cache-Control':'private, no-store' } })
    if (error instanceof PlanningRequestError) return NextResponse.json({ error: error.message, retryAfter: error.retryAfter, code: error.code }, { status: error.status, headers: { 'Cache-Control': 'private, no-store', ...(error.retryAfter ? { 'Retry-After': String(error.retryAfter) } : {}) } })
    console.error('[lean-canvas] Analysis failed')
    return NextResponse.json({ error: 'Analysis could not complete. No credits were charged. Please try again.' }, { status: 503 })
  } finally {
    await failPlanningRequest(planningRun?.lease ?? null)
    if (concurrencyAcquired) await decrementConcurrency(dbUser.id)
  }
}
