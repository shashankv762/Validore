import { NextRequest, NextResponse } from 'next/server'
import { planningContextPrompt, assertPlanningContextUnchanged, PlanningContextError } from '@/lib/planning/context'
import { decryptApiKey } from '@/lib/byok-crypto'
import { validAuthOrigin } from '@/lib/auth-form'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/db'
import { users, ideas, crowdfundingAnalyses } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import { checkCredits, deductCredits } from '@/lib/credits'
import { CREDIT_COSTS } from '@/lib/credit-costs'
import { canUserAccessWithCredits } from '@/lib/tier-gate'
import { consumeModulePack } from '@/lib/module-credits'
import { generateWithFallback } from '@/lib/ai/generate'
import { publicResearchBrief, publicResearchQuery } from '@/lib/ai/research-brief'
import { webSearch, deduplicateSources } from '@/lib/ai/search'
import { z } from 'zod'
import { toDatabaseInteger } from '@/lib/numbers'
import { CrowdfundingInputSchema, calculateCampaign } from '@/lib/planning/economics'
import { planningMethod } from '@/lib/planning/knowledge'
import { planningSources } from '@/lib/planning/evidence'
import { CAMPAIGN_WEIGHTS, clampScore, getCampaignClassificationBand } from '@/lib/scoring'
import { rateLimitCheck, checkAndIncrementConcurrency, decrementConcurrency } from '@/lib/rate-limit'
import { moduleHistory } from '@/lib/module-history'
import { AdminAccessError, effectiveTier, isActiveAccount, isOwnerAccount } from '@/lib/admin-access'
import { getPlan } from '@/lib/plan-catalog'
import { beginPlanningRequest, bindPlanningIdea, preparePlanningContext, completePlanningRequest, failPlanningRequest, lockPlanningIdea, planningIdeaSnapshot, PlanningRequestError, type PlanningRun } from '@/lib/planning/requests'
import { assertPlanningSourceUnchanged, PlanningSourceReportError } from '@/lib/planning/source-report'
import { SOURCE_REPORT_CONTEXT_MAX_CHARS } from '@/lib/planning/source-report-contract'

export async function GET(request: NextRequest) { return moduleHistory(request, 'crowdfunding') }

const CrowdfundingAiSchema = z.object({
  // 10-category scoring
  problemProductAppealScore: z.number().min(0).max(CAMPAIGN_WEIGHTS.problemAndProductAppeal),
  fundingGoalFeasibilityScore: z.number().min(0).max(CAMPAIGN_WEIGHTS.fundingGoalFeasibility),
  preLaunchAudienceScore: z.number().min(0).max(CAMPAIGN_WEIGHTS.preLaunchAudience),
  campaignPageQualityScore: z.number().min(0).max(CAMPAIGN_WEIGHTS.campaignPageQuality),
  rewardStrategyScore: z.number().min(0).max(CAMPAIGN_WEIGHTS.rewardStrategy),
  pricingEconomicsScore: z.number().min(0).max(CAMPAIGN_WEIGHTS.pricingEconomics),
  marketingReadinessScore: z.number().min(0).max(CAMPAIGN_WEIGHTS.marketingReadiness),
  founderCredibilityScore: z.number().min(0).max(CAMPAIGN_WEIGHTS.founderCredibility),
  earlyMomentumPlanScore: z.number().min(0).max(CAMPAIGN_WEIGHTS.earlyMomentumPlan),
  operationalReadinessScore: z.number().min(0).max(CAMPAIGN_WEIGHTS.operationalReadiness),
  // Analysis
  recommendation: z.enum(['READY_TO_LAUNCH', 'LAUNCH_AFTER_IMPROVEMENTS', 'TEST_FURTHER', 'MAJOR_REWORK_REQUIRED']),
  recommendationReasons: z.array(z.string().trim().min(10).max(1000)).min(1).max(8),
  founderAssumptions: z.array(z.string()).optional(),
  fundingBands: z.array(z.object({ range: z.string(), probability: z.number(), tips: z.array(z.string()) })).optional(),
  goalBands: z.array(z.object({ goalMultiple: z.string(), successRate: z.number(), insight: z.string() })).optional(),
  backerSegments: z.array(z.object({ segment: z.string(), percentage: z.number(), avgPledge: z.number(), motivation: z.string() })).optional(),
  rewardEconomics: z.array(z.object({ tier: z.string(), cost: z.number(), revenue: z.number(), roi: z.number(), recommendation: z.string() })).optional(),
  campaignDurationAnalysis: z.array(z.object({ duration: z.string(), successRate: z.number(), avgFunded: z.number(), insight: z.string() })).optional(),
  categoryBenchmark: z.object({ medianGoal: z.number(), medianFunded: z.number(), medianBackers: z.number(), successRate: z.number(), top25PercentFunded: z.number() }).optional(),
  campaignPageScorecard: z.object({ titleClarity: z.number(), videoQuality: z.number(), imageQuality: z.number(), descriptionDepth: z.number(), rewardStructure: z.number(), socialProof: z.number(), totalScore: z.number() }).optional(),
  campaignStoryScorecard: z.object({ problemClarity: z.number(), solutionCompelling: z.number(), teamCredibility: z.number(), useOfFunds: z.number(), callToAction: z.number(), totalScore: z.number() }).optional(),
  earlyMomentumAnalysis: z.object({ targetFirstDay: z.number(), targetFirstWeek: z.number(), momentumStrategy: z.array(z.string()), earlyBirdRecommendation: z.string() }).optional(),
  marketingFunnel: z.object({ awareness: z.object({ channels: z.array(z.string()), estimatedReach: z.number() }), consideration: z.object({ tactics: z.array(z.string()) }), conversion: z.object({ cta: z.string(), urgencyTactics: z.array(z.string()) }) }).optional(),
  socialProofAnalysis: z.object({ currentStrengths: z.array(z.string()), gaps: z.array(z.string()), recommendations: z.array(z.string()) }).optional(),
  preLaunchChecklist: z.array(z.object({ item: z.string(), status: z.enum(['done', 'in_progress', 'pending']), impact: z.enum(['high', 'medium', 'low']), daysToComplete: z.number() })).optional(),
  preLaunchReadinessScore: z.number().optional(),
  firstDayTarget: z.number().optional(),
  firstWeekTarget: z.number().optional(),
  keyStrengths: z.array(z.string()),
  keyWeaknesses: z.array(z.string().trim().min(10).max(1000)).min(1).max(8),
  rewardTierAnalysis: z.array(z.object({
    tier: z.string(),
    price: z.string(),
    value: z.string(),
    backerEstimate: z.string(),
    label: z.literal('ASSUMPTION'),
  })),
  marketingChannels: z.array(z.object({
    channel: z.string(),
    estimatedReach: z.string(),
    costEstimate: z.string(),
    priority: z.enum(['high', 'medium', 'low']),
    label: z.literal('ASSUMPTION'),
  })),
  thirtyDayPrelaunchPlan: z.array(z.object({
    week: z.string().trim().min(3).max(100),
    activity: z.string().trim().min(20).max(1600),
    owner: z.string().trim().min(3).max(120),
    kpi: z.string().trim().min(10).max(1000),
    expectedOutput: z.string().trim().min(10).max(1000),
  })).length(4),
  riskRegister: z.array(z.object({
    risk: z.string().trim().min(10).max(1000),
    probability: z.enum(['low', 'medium', 'high']),
    impact: z.enum(['low', 'medium', 'high']),
    riskLevel: z.enum(['low', 'medium', 'high', 'critical']),
    mitigation: z.string().trim().min(10).max(1000),
  })).min(1).max(8),
  scenarios: z.object({
    conservative: z.object({ fundingPercent: z.number(), backers: z.number(), amountRaised: z.number(), label: z.literal('ASSUMPTION') }),
    base: z.object({ fundingPercent: z.number(), backers: z.number(), amountRaised: z.number(), label: z.literal('ASSUMPTION') }),
    optimistic: z.object({ fundingPercent: z.number(), backers: z.number(), amountRaised: z.number(), label: z.literal('ASSUMPTION') }),
  }),
  integrityNote: z.string(),
})


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

    planningRun = await beginPlanningRequest(request, dbUser.id, 'crowdfunding')
    if (planningRun.replay) return NextResponse.json(planningRun.replay, { headers: { 'Cache-Control': 'private, no-store' } })

  const access = await canUserAccessWithCredits(user.id, 'crowdfunding')
  if (!access.allowed) return NextResponse.json({ error: 'This module requires an eligible plan or a module run pack' }, { status: 403 })
  const creditCheck = access.reason === 'credit' ? { allowed: true } : await checkCredits(dbUser.id, CREDIT_COSTS.CROWDFUNDING)
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
    const parsed = CrowdfundingInputSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: 'Please check the form fields and try again.', details: parsed.error.flatten() }, { status: 400 })

    const i = parsed.data
    const idea = await db.query.ideas.findFirst({
      where: and(eq(ideas.id, i.ideaId), eq(ideas.userId, dbUser.id)),
    })
    if (!idea) return NextResponse.json({ error: 'Idea not found' }, { status: 404 })
    if (idea.isActive === false) return NextResponse.json({ error: 'This idea is no longer active in your workspace.' }, { status: 404 })
    if (idea.isReadOnly) return NextResponse.json({ error: 'This idea is read-only. Choose an editable idea before running this tool.' }, { status: 403 })
    bindPlanningIdea(planningRun,dbUser.id,idea)
    const contextSnapshot = await preparePlanningContext(planningRun, dbUser.id, idea.id, 'crowdfunding')

    const calculations = calculateCampaign(i)
    const estimatedConversionRate = i.conversionRatePercent
    // Synthetic teaching data is never evidence of a real campaign's odds.
    const benchmark = { totalCount: 0, avgFundingPct: null, dataLabel: 'NO_VERIFIED_CATEGORY_BENCHMARK' }

    // ── Web search ──────────────────────────────────────────────────────────────
    const publicSearch = await webSearch(publicResearchQuery({ industry: i.category, location: i.country, publicResearchFocus: idea.publicResearchFocus }, 'crowdfunding campaign demand delivery eligibility'), 4)
    const sourceReport = planningRun.sourceReport
    const searchResp = { ...publicSearch, results: deduplicateSources([...publicSearch.results,...(sourceReport?.sources ?? [])]) }
    const today = new Date().toISOString().split('T')[0]

    const prompt = `You are a crowdfunding campaign expert analyzing a campaign's readiness.
${planningMethod('campaign')}

CAMPAIGN DETAILS:
Startup: ${idea.name} | ${i.category} | ${i.country}
Currency: ${i.currency} (all founder amounts use this currency, do not convert)
Campaign Description: ${i.projectDescription}
Funding Goal: ${i.fundingGoal}
Duration: ${i.campaignDurationDays} days
Pre-Launch Community: ${i.preLaunchCommunitySize}
Social Followers: ${i.socialFollowers}
Email List: ${i.emailListSize}
Reward Tiers: ${i.rewardTiers} (lowest: ${i.lowestReward}, avg: ${i.averageReward}, highest: ${i.highestReward})
Has Video: ${i.hasVideo}
Marketing Budget: ${i.marketingBudget}
Visitor Forecast (explicit assumption, not the sum of audience lists): ${i.expectedVisitors}
Conversion Hypothesis: ${i.conversionRatePercent}%
Funding Model: ${i.allOrNothing ? 'All or nothing' : 'Keep what you raise'}
Platform Fee: ${i.platformFeePercent}% | Processing Fee: ${i.processingFeePercent}% plus ${i.processingFeePerBacker}/backer
Reward Cost/Backer: ${i.rewardCostPerBacker} | Shipping/Backer: ${i.shippingCostPerBacker}
Fixed Production Cost: ${i.productionFixedCost} | Contingency: ${i.contingencyPercent}%

COMPUTED METRICS (deterministic formulas applied to founder assumptions):
${JSON.stringify(calculations)}

BENCHMARK LIMIT: No verified category distribution was supplied. Never invent success probabilities, median funding amounts or campaign examples. fundingBands, goalBands, campaignDurationAnalysis and categoryBenchmark must be omitted or empty. Synthetic examples must never influence the readiness recommendation.

SEARCH CONTEXT:
${!searchResp.results.length ? 'No supplied source passages. All market claims = AI_ESTIMATE_UNVERIFIED.' : searchResp.results.map(r => `- ${r.title}: ${r.content.slice(0, 1400)} [URL: ${r.url}; kind: ${r.retrievalKind ?? 'snippet'}; retrieved: ${r.fetchedAt}]`).join('\n')}

Today: ${today}

SCORING (score within max weights — do NOT exceed):
problemProductAppealScore max: ${CAMPAIGN_WEIGHTS.problemAndProductAppeal}
fundingGoalFeasibilityScore max: ${CAMPAIGN_WEIGHTS.fundingGoalFeasibility}
preLaunchAudienceScore max: ${CAMPAIGN_WEIGHTS.preLaunchAudience}
campaignPageQualityScore max: ${CAMPAIGN_WEIGHTS.campaignPageQuality}
rewardStrategyScore max: ${CAMPAIGN_WEIGHTS.rewardStrategy}
pricingEconomicsScore max: ${CAMPAIGN_WEIGHTS.pricingEconomics}
marketingReadinessScore max: ${CAMPAIGN_WEIGHTS.marketingReadiness}
founderCredibilityScore max: ${CAMPAIGN_WEIGHTS.founderCredibility}
earlyMomentumPlanScore max: ${CAMPAIGN_WEIGHTS.earlyMomentumPlan}
operationalReadinessScore max: ${CAMPAIGN_WEIGHTS.operationalReadiness}

CLASSIFICATION BANDS (for your reference):
80-100: READY_TO_LAUNCH | 65-79: LAUNCH_AFTER_IMPROVEMENTS | 50-64: TEST_FURTHER | <50: MAJOR_REWORK_REQUIRED

CRITICAL RULES:
- Never fabricate backer numbers, funding results, or platform statistics
- All projections labeled ASSUMPTION
- No synthetic benchmark may be used as real evidence. Unknown category success statistics remain unavailable.
- Do not use final funding data to predict success (no data leakage)
- Disclaimer in integrityNote: "These are educational decision-support categories, not statistically guaranteed probabilities of success."
- Copy conservative/base/optimistic numeric scenarios from the computed object; they are explicit assumptions, never probabilities.
- A video checkbox is planned content, not evidence that a video or campaign page was reviewed. Assess page quality only from supplied artifacts. All preLaunchChecklist statuses are pending unless founder evidence explicitly confirms completion.
- Zero reward/shipping costs and missing visitor evidence must be flagged as launch blockers. Give a delivery checklist (supplier quote, prototype, fulfillment capacity, customs/taxes, reserve, timeline) and a falsifiable prelaunch test.
- Complete core recommendations, strengths/weaknesses, reward tier strategy, marketing channels, four-week plan and risk register with concrete deliverables. Optional fields must add useful depth without unsupported statistics. Consider: founderAssumptions, fundingBands, goalBands, backerSegments, rewardEconomics, campaignDurationAnalysis, categoryBenchmark, campaignPageScorecard, campaignStoryScorecard, earlyMomentumAnalysis, marketingFunnel, socialProofAnalysis, preLaunchChecklist, preLaunchReadinessScore, firstDayTarget, firstWeekTarget.`

    const aiResult = await generateWithFallback({
      maxTokensPerCall: isOwnerAccount(dbUser) ? undefined : plan.maxTokensPerCall,
      sources: searchResp.results,
      ...(sourceReport ? { privateContextMaxChars: SOURCE_REPORT_CONTEXT_MAX_CHARS, researchMode: 'reuse' as const, maxResearchRounds: 0 }
        : { maxResearchRounds: searchResp.results.length ? 1 : 2 }),
    researchPrompt: publicResearchBrief(idea), prompt, privateContext: planningContextPrompt(contextSnapshot, sourceReport), schema: CrowdfundingAiSchema, temperature: 0, preferredAiProvider: dbUser.preferredAiProvider, customOpenRouterKey })
    const ai = { ...aiResult.data, scenarios: calculations.scenarios,
      rewardEconomics: calculations.rewardEconomics,
      // Aggregate visitor/average-reward inputs cannot establish how many
      // backers select each tier or what share belongs to an audience segment.
      backerSegments: undefined,
      rewardTierAnalysis: (aiResult.data.rewardTierAnalysis ?? []).map(row => ({ ...row, backerEstimate: 'Not measured — collect tier-selection evidence' })),
      fundingBands: undefined, goalBands: undefined, campaignDurationAnalysis: undefined, categoryBenchmark: undefined,
      // Presence of an idea/video checkbox does not establish completed launch work.
      preLaunchChecklist: aiResult.data.preLaunchChecklist?.map(item => ({ ...item, status: 'pending' as const })),
    }

    // Calculate total performance score
    const rawPerformanceScore =
      clampScore(ai.problemProductAppealScore, CAMPAIGN_WEIGHTS.problemAndProductAppeal) +
      clampScore(ai.fundingGoalFeasibilityScore, CAMPAIGN_WEIGHTS.fundingGoalFeasibility) +
      clampScore(ai.preLaunchAudienceScore, CAMPAIGN_WEIGHTS.preLaunchAudience) +
      clampScore(ai.campaignPageQualityScore, CAMPAIGN_WEIGHTS.campaignPageQuality) +
      clampScore(ai.rewardStrategyScore, CAMPAIGN_WEIGHTS.rewardStrategy) +
      clampScore(ai.pricingEconomicsScore, CAMPAIGN_WEIGHTS.pricingEconomics) +
      clampScore(ai.marketingReadinessScore, CAMPAIGN_WEIGHTS.marketingReadiness) +
      clampScore(ai.founderCredibilityScore, CAMPAIGN_WEIGHTS.founderCredibility) +
      clampScore(ai.earlyMomentumPlanScore, CAMPAIGN_WEIGHTS.earlyMomentumPlan) +
      clampScore(ai.operationalReadinessScore, CAMPAIGN_WEIGHTS.operationalReadiness)

    const blockedDemand = i.expectedVisitors === 0 || i.conversionRatePercent === 0
    // This intake supplies forecasts and a video checkbox, not reviewed launch
    // artifacts or verified paid demand. Positive economics alone cannot clear
    // the launch recommendation, even when a writer supplies perfect scores.
    const scoreCap = calculations.computedMetrics.goalNetSurplus < 0 || calculations.computedMetrics.contributionPerBacker <= 0 || blockedDemand ? 49 : 64
    if (typeof ai.preLaunchReadinessScore === 'number') ai.preLaunchReadinessScore = Math.min(ai.preLaunchReadinessScore, scoreCap)
    const performanceScore = Math.min(rawPerformanceScore, scoreCap)
    const recommendation = performanceScore >= 80 ? 'READY_TO_LAUNCH' : performanceScore >= 65 ? 'LAUNCH_AFTER_IMPROVEMENTS' : performanceScore >= 50 ? 'TEST_FURTHER' : 'MAJOR_REWORK_REQUIRED'
    ai.recommendation = recommendation
    const { band, label: classLabel, disclaimer } = getCampaignClassificationBand(performanceScore)

    const saved = await db.transaction(async tx => {
      const [account] = await tx.select({ accountStatus: users.accountStatus }).from(users).where(eq(users.id, dbUser.id)).for('update')
      if (!account || !isActiveAccount(account)) throw new AdminAccessError('This account is not active.', 403, 'account_inactive')
      await lockPlanningIdea(tx, dbUser.id, i.ideaId)
      if (!planningRun?.lease) await assertPlanningContextUnchanged(tx, dbUser.id, idea.id, contextSnapshot)
      if (!planningRun?.lease) await assertPlanningSourceUnchanged(tx,dbUser.id,idea.id,sourceReport)
      const charged = access.reason === 'credit' ? await consumeModulePack(tx, dbUser.id, 'crowdfundingCredits', i.ideaId) : await deductCredits(dbUser.id, CREDIT_COSTS.CROWDFUNDING, 'CROWDFUNDING', i.ideaId, undefined, tx)
      if (!charged) return null
      const [created] = await tx.insert(crowdfundingAnalyses).values({
        ideaId: i.ideaId,
        userId: dbUser.id,
        performanceScore,
        classificationBand: `${band} — ${classLabel}`,
        fundingGoal: i.fundingGoal,
        expectedFunding: toDatabaseInteger(ai.scenarios.base.amountRaised),
        expectedBackers: toDatabaseInteger(ai.scenarios.base.backers),
        conversionRate: `${estimatedConversionRate}% (ASSUMPTION)`,
        rewardTiers: ai.rewardTierAnalysis,
        scenarioAnalysis: { ...ai.scenarios, disclaimer: 'ASSUMPTION — not guaranteed outcomes' },
        marketingChannels: ai.marketingChannels,
        prelaunchPlan: ai.thirtyDayPrelaunchPlan,
        riskRegister: ai.riskRegister,
        recommendation,
        reportData: {
          inputs: i,
          ideaSnapshot: planningIdeaSnapshot(idea),
          sourceReport: sourceReport?.snapshot ?? null,
          planningContext: contextSnapshot,
          ...calculations,
          scoreReview: { rawPerformanceScore, scoreCap, reason: blockedDemand ? 'The entered demand forecast has no visitors or no conversion. Review demand before launch.' : 'Launch artifacts and paid demand have not been independently reviewed. Economic scenarios alone cannot establish launch readiness.' },
          researchSources: planningSources(aiResult.sources ?? searchResp.results),
          evidenceGaps: ['No verified category success distribution is supplied. A readiness score does not estimate the probability of funding.', 'Check platform eligibility and local fee, tax and fulfillment requirements.'],
          benchmark,
          ai,
          performanceScore,
          classificationBand: classLabel,
          disclaimer,
        },
      }).returning()
      await completePlanningRequest(tx, planningRun?.lease ?? null, created.id,planningRun?.ideaBinding)
      return created
    })
    if (!saved) return NextResponse.json({ error: 'Insufficient credits. Refresh your balance and try again.' }, { status: 402 })

    return NextResponse.json({
      analysisId: saved.id,
      performanceScore,
      classificationBand: classLabel,
      band,
      disclaimer,
      recommendation,
      result: saved.reportData,
    })
  } catch (error) {
    if (error instanceof PlanningSourceReportError || error instanceof PlanningContextError) return NextResponse.json({ error: error.message, code: error.code },{ status: error.status, headers: { 'Cache-Control':'private, no-store' } })
    if (error instanceof PlanningRequestError) return NextResponse.json({ error: error.message, retryAfter: error.retryAfter, code: error.code }, { status: error.status, headers: { 'Cache-Control': 'private, no-store', ...(error.retryAfter ? { 'Retry-After': String(error.retryAfter) } : {}) } })
    if (error instanceof AdminAccessError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    console.error('[crowdfunding] Analysis failed', { type: error instanceof Error ? error.name : 'UnknownError' })
    return NextResponse.json({ error: 'Analysis could not complete. No credits were charged. Please try again.' }, { status: 503 })
  } finally {
    await failPlanningRequest(planningRun?.lease ?? null)
    if (concurrencyAcquired) await decrementConcurrency(dbUser.id)
  }
}
