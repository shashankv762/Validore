import { NextRequest, NextResponse } from 'next/server'
import { planningContextPrompt, assertPlanningContextUnchanged, PlanningContextError } from '@/lib/planning/context'
import { decryptApiKey } from '@/lib/byok-crypto'
import { validAuthOrigin } from '@/lib/auth-form'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/db'
import { users, ideas, pitchDecks } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import { checkCredits, deductCredits } from '@/lib/credits'
import { CREDIT_COSTS } from '@/lib/credit-costs'
import { canUserAccessWithCredits } from '@/lib/tier-gate'
import { consumeModulePack } from '@/lib/module-credits'
import { generatePitchDeck, pitchWriterConcurrency, pitchCheckpointSources, PitchContinuation, PitchCheckpointConflict } from '@/lib/planning/pitch-generation'
import { publicResearchQuery } from '@/lib/ai/research-brief'
import { webSearch, deduplicateSources } from '@/lib/ai/search'
import { planningSources, preserveFounderMilestones } from '@/lib/planning/evidence'
import { PitchDeckInputSchema } from '@/lib/planning/pitch-schema'
import { canonicalPitchFunding } from '@/lib/planning/pitch-funding'
import { readPlanningOriginals } from '@/lib/planning/research'
import { PITCH_WEIGHTS, clampScore } from '@/lib/scoring'
import { rateLimitCheck, checkAndIncrementConcurrency, decrementConcurrency } from '@/lib/rate-limit'
import { moduleHistory } from '@/lib/module-history'
import { AdminAccessError, effectiveTier, isActiveAccount, isOwnerAccount } from '@/lib/admin-access'
import { getPlan } from '@/lib/plan-catalog'
import { beginPlanningRequest, bindPlanningIdea, preparePlanningContext, checkpointPlanningRequest, completePlanningRequest, failPlanningRequest, lockPlanningIdea, planningIdeaSnapshot, PlanningRequestError, type PlanningRun } from '@/lib/planning/requests'
import { assertPlanningSourceUnchanged, PlanningSourceReportError } from '@/lib/planning/source-report'
import { SOURCE_REPORT_CONTEXT_MAX_CHARS } from '@/lib/planning/source-report-contract'

export async function GET(request: NextRequest) { return moduleHistory(request, 'pitch-deck') }
export const maxDuration = 300

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

    planningRun = await beginPlanningRequest(request, dbUser.id, 'pitch-deck')
    if (planningRun.replay) return NextResponse.json(planningRun.replay, { headers: { 'Cache-Control': 'private, no-store' } })

  const access = await canUserAccessWithCredits(user.id, 'pitch_deck')
  if (!access.allowed) return NextResponse.json({ error: 'This module requires an eligible plan or a module run pack' }, { status: 403 })
  const creditCheck = access.reason === 'credit' ? { allowed: true } : await checkCredits(dbUser.id, CREDIT_COSTS.PITCH_DECK)
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
    const parsed = PitchDeckInputSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: 'Please check the form fields and try again.', details: parsed.error.flatten() }, { status: 400 })

    const i = parsed.data
    const idea = await db.query.ideas.findFirst({
      where: and(eq(ideas.id, i.ideaId), eq(ideas.userId, dbUser.id)),
    })
    if (!idea) return NextResponse.json({ error: 'Idea not found' }, { status: 404 })
    if (idea.isActive === false) return NextResponse.json({ error: 'This idea is no longer active in your workspace.' }, { status: 404 })
    if (idea.isReadOnly) return NextResponse.json({ error: 'This idea is read-only. Choose an editable idea before running this tool.' }, { status: 403 })
    bindPlanningIdea(planningRun,dbUser.id,idea)
    const contextSnapshot = await preparePlanningContext(planningRun, dbUser.id, idea.id, 'pitch-deck')

    const savedSources = pitchCheckpointSources(planningRun.stageData)
    const sourceReport = planningRun.sourceReport
    const researchBudgetId = planningRun.lease?.id ?? crypto.randomUUID()
    const publicSearch = savedSources ? { results: savedSources } : await webSearch(publicResearchQuery(idea, 'market competitors official evidence'), 5, { budgetId: researchBudgetId })
    const originalResearch = savedSources ? { sources: savedSources, events: [] } : await readPlanningOriginals(publicSearch.results, researchBudgetId)
    const search = { results: deduplicateSources([...originalResearch.sources,...(sourceReport?.sources ?? [])]) }
    const aiResult = await generatePitchDeck({
      idea, input: i, sources: search.results, privateContext: planningContextPrompt(contextSnapshot, sourceReport),
      privateContextMaxChars: SOURCE_REPORT_CONTEXT_MAX_CHARS,
      preferredAiProvider: dbUser.preferredAiProvider, customOpenRouterKey,
      maxTokensPerCall: isOwnerAccount(dbUser) ? undefined : plan.maxTokensPerCall,
      writerConcurrency: pitchWriterConcurrency(process.env.AI_SPECIALIST_CONCURRENCY, plan.maxConcurrentRequests),
      checkpoint: planningRun.stageData,
      saveCheckpoint: planningRun.lease ? checkpoint => checkpointPlanningRequest(planningRun!.lease!, checkpoint) : undefined,
    })
    const ai = preserveFounderMilestones(aiResult.data, i.milestones ?? [])
    // Keep one canonical Q&A set across the UI, saved record and exports.
    ai.investorQA = ai.investorQa.map(item => ({ question: item.question, answer: item.answer, category: item.label }))

    const qualityScore =
      clampScore(ai.problemClarityScore, PITCH_WEIGHTS.problemClarity) +
      clampScore(ai.solutionStrengthScore, PITCH_WEIGHTS.solutionStrength) +
      clampScore(ai.customerEvidenceScore, PITCH_WEIGHTS.customerEvidence) +
      clampScore(ai.marketOpportunityScore, PITCH_WEIGHTS.marketOpportunity) +
      clampScore(ai.businessModelScore, PITCH_WEIGHTS.businessModel) +
      clampScore(ai.competitivePositioningScore, PITCH_WEIGHTS.competitivePositioning) +
      clampScore(ai.gtmStrategyScore, PITCH_WEIGHTS.gtmStrategy) +
      clampScore(ai.financialLogicScore, PITCH_WEIGHTS.financialLogic) +
      clampScore(ai.teamExecutionScore, PITCH_WEIGHTS.teamExecutionReadiness) +
      clampScore(ai.presentationQualityScore, PITCH_WEIGHTS.presentationQuality)

    const saved = await db.transaction(async tx => {
      const [account] = await tx.select({ accountStatus: users.accountStatus }).from(users).where(eq(users.id, dbUser.id)).for('update')
      if (!account || !isActiveAccount(account)) throw new AdminAccessError('This account is not active.', 403, 'account_inactive')
      await lockPlanningIdea(tx, dbUser.id, i.ideaId)
      if (!planningRun?.lease) await assertPlanningContextUnchanged(tx, dbUser.id, idea.id, contextSnapshot)
      if (!planningRun?.lease) await assertPlanningSourceUnchanged(tx,dbUser.id,idea.id,sourceReport)
      const charged = access.reason === 'credit' ? await consumeModulePack(tx, dbUser.id, 'pitchDeckCredits', i.ideaId) : await deductCredits(dbUser.id, CREDIT_COSTS.PITCH_DECK, 'PITCH_DECK', i.ideaId, undefined, tx)
      if (!charged) return null
      const [created] = await tx.insert(pitchDecks).values({
        ideaId: i.ideaId,
        userId: dbUser.id,
        qualityScore,
        founderReadinessScore: clampScore(ai.founderReadinessScore, 100),
        slides: ai.slides,
        pitchScript3min: ai.pitchScript3min,
        pitchScript60sec: ai.pitchScript60sec,
        investorQa: ai.investorQa,
        portfolioSections: ai.portfolioSections,
        roadmap: ai.roadmap,
        milestones: i.milestones ?? [],
        reportData: { inputs: i, ai, qualityScore, funding: canonicalPitchFunding(i), generationTrace: aiResult.generationTrace, ideaSnapshot: planningIdeaSnapshot(idea), sourceReport: sourceReport?.snapshot ?? null,
          planningContext: contextSnapshot,
          researchSources: planningSources(aiResult.sources ?? search.results),
          evidenceGaps: [
            ...(!i.currentTraction?.trim() ? ['No founder-reported traction was supplied. Validation activities and milestones are proposed.'] : []),
            ...(!i.fundingAsk && !i.fundingAskAmount?.trim() ? ['No funding ask was supplied. Confirm the amount, runway and evidence required before fundraising.'] : []),
            'Founder input is self-reported. External citations do not verify startup traction or forecasts.',
          ],
        },
      }).returning()
      await completePlanningRequest(tx, planningRun?.lease ?? null, created.id,planningRun?.ideaBinding)
      return created
    })
    if (!saved) return NextResponse.json({ error: 'Insufficient credits. Refresh your balance and try again.' }, { status: 402 })

    return NextResponse.json({
      deckId: saved.id,
      qualityScore,
      founderReadinessScore: saved.founderReadinessScore,
      result: saved,
    })
  } catch (error) {
    if (error instanceof PlanningSourceReportError || error instanceof PlanningContextError) return NextResponse.json({ error: error.message, code: error.code },{ status: error.status, headers: { 'Cache-Control':'private, no-store' } })
    if (error instanceof PitchContinuation) return NextResponse.json({ status: 'continuing', completedStages: error.completedStages,
      creditsCharged: 0, message: 'Completed sections are saved. Continuing the same pitch run will finish the remaining sections.' },
      { status: 202, headers: { 'Cache-Control': 'private, no-store' } })
    if (error instanceof PitchCheckpointConflict) return NextResponse.json({ error: error.message, code: 'planning_inputs_changed' },
      { status: 409, headers: { 'Cache-Control': 'private, no-store' } })
    if (error instanceof PlanningRequestError) return NextResponse.json({ error: error.message, retryAfter: error.retryAfter, code: error.code }, { status: error.status, headers: { 'Cache-Control': 'private, no-store', ...(error.retryAfter ? { 'Retry-After': String(error.retryAfter) } : {}) } })
    if (error instanceof AdminAccessError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    console.error('[pitch-deck] Analysis failed', { type: error instanceof Error ? error.name : 'UnknownError' })
    return NextResponse.json({ error: 'Analysis could not complete. No credits were charged. Please try again.' }, { status: 503 })
  } finally {
    await failPlanningRequest(planningRun?.lease ?? null)
    if (concurrencyAcquired) await decrementConcurrency(dbUser.id)
  }
}
