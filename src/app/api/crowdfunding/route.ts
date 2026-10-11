import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/db'
import { users, ideas, crowdfundingAnalyses, syntheticCampaigns } from '@/db/schema'
import { eq, and, avg, count, sql } from 'drizzle-orm'
import { checkCredits, deductCredits } from '@/lib/credits'
import { CREDIT_COSTS } from '@/lib/credit-costs'
import { generateWithFallback } from '@/lib/ai/generate'
import { webSearch } from '@/lib/ai/search'
import { z } from 'zod'
import * as fin from '@/lib/financial'
import { CAMPAIGN_WEIGHTS, clampScore, getCampaignClassificationBand } from '@/lib/scoring'
import { rateLimitCheck, checkAndIncrementConcurrency, decrementConcurrency } from '@/lib/rate-limit'

const CrowdfundingInputSchema = z.object({
  ideaId: z.string().uuid(),
  fundingGoal: z.number().positive(),
  projectDescription: z.string().min(20),
  category: z.string(),
  country: z.string(),
  preLaunchCommunitySize: z.number().min(0),
  socialFollowers: z.number().min(0),
  emailListSize: z.number().min(0),
  campaignDurationDays: z.number().min(1).max(60),
  rewardTiers: z.number().min(1).max(20),
  lowestReward: z.number().positive(),
  averageReward: z.number().positive(),
  highestReward: z.number().positive(),
  hasVideo: z.boolean(),
  marketingBudget: z.number().min(0),
})

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
  recommendationReasons: z.array(z.string()),
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
  keyWeaknesses: z.array(z.string()),
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
    week: z.string(),
    activity: z.string(),
    owner: z.string(),
    kpi: z.string(),
    expectedOutput: z.string(),
  })),
  riskRegister: z.array(z.object({
    risk: z.string(),
    probability: z.enum(['low', 'medium', 'high']),
    impact: z.enum(['low', 'medium', 'high']),
    riskLevel: z.enum(['low', 'medium', 'high', 'critical']),
    mitigation: z.string(),
  })),
  scenarios: z.object({
    conservative: z.object({ fundingPercent: z.number(), backers: z.number(), amountRaised: z.number(), label: z.literal('ASSUMPTION') }),
    base: z.object({ fundingPercent: z.number(), backers: z.number(), amountRaised: z.number(), label: z.literal('ASSUMPTION') }),
    optimistic: z.object({ fundingPercent: z.number(), backers: z.number(), amountRaised: z.number(), label: z.literal('ASSUMPTION') }),
  }),
  integrityNote: z.string(),
})

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

  const creditCheck = await checkCredits(dbUser.id, CREDIT_COSTS.CROWDFUNDING)
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
    const parsed = CrowdfundingInputSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

    const i = parsed.data
    const idea = await db.query.ideas.findFirst({
      where: and(eq(ideas.id, i.ideaId), eq(ideas.userId, dbUser.id)),
    })
    if (!idea) return NextResponse.json({ error: 'Idea not found' }, { status: 404 })

    // ── Financial formulas ──────────────────────────────────────────────────────
    const expectedAvgContribution = i.averageReward
    const requiredBackers = fin.calculateRequiredBackers(i.fundingGoal, expectedAvgContribution)
    const estimatedConversionRate = 3.5 // industry benchmark ASSUMPTION
    const requiredVisitors = fin.calculateRequiredVisitors(requiredBackers, estimatedConversionRate)
    const marketingCostPerBacker = i.marketingBudget > 0 ? fin.calculateCostPerBacker(i.marketingBudget, requiredBackers) : 0

    // ── Benchmark data from synthetic dataset (labeled SYNTHETIC DATA) ──────────
    const benchmarkData = await db.select({
      avgFundingPct: avg(sql<number>`CAST(${syntheticCampaigns.fundingPercentage} AS DECIMAL)`),
      successCount: count(sql`CASE WHEN ${syntheticCampaigns.campaignStatus} = 'Successful' THEN 1 END`),
      totalCount: count(),
      avgBackers: avg(syntheticCampaigns.numberOfBackers),
      avgGoal: avg(syntheticCampaigns.fundingGoal),
    }).from(syntheticCampaigns)
      .where(eq(syntheticCampaigns.category, i.category))

    const benchmark = benchmarkData[0]
    const categorySuccessRate = benchmark.totalCount > 0
      ? Number(benchmark.successCount) / Number(benchmark.totalCount) * 100
      : 38 // fallback overall avg

    // ── Web search ──────────────────────────────────────────────────────────────
    const searchResp = await webSearch(`${i.category} crowdfunding campaigns ${i.country} success rate 2024`, 4)
    const today = new Date().toISOString().split('T')[0]

    const prompt = `You are a crowdfunding campaign expert analyzing a campaign's readiness.

CAMPAIGN DETAILS:
Startup: ${idea.name} | ${i.category} | ${i.country}
Funding Goal: ${i.fundingGoal}
Duration: ${i.campaignDurationDays} days
Pre-Launch Community: ${i.preLaunchCommunitySize}
Social Followers: ${i.socialFollowers}
Email List: ${i.emailListSize}
Reward Tiers: ${i.rewardTiers} (lowest: ${i.lowestReward}, avg: ${i.averageReward}, highest: ${i.highestReward})
Has Video: ${i.hasVideo}
Marketing Budget: ${i.marketingBudget}

COMPUTED METRICS (verified formulas, label ASSUMPTION for projections):
- Required Backers: ${Math.ceil(requiredBackers)} (= Goal ÷ Avg Reward)
- Required Visitors (at 3.5% conversion ASSUMPTION): ${Math.ceil(requiredVisitors)}
- Cost Per Backer (ASSUMPTION): ${marketingCostPerBacker.toFixed(2)}

BENCHMARK DATA (SYNTHETIC DATA — labeled accordingly, NOT real Kickstarter data):
- ${i.category} Category Success Rate in dataset: ${categorySuccessRate.toFixed(1)}%
- Avg Funding % in category: ${Number(benchmark.avgFundingPct ?? 0).toFixed(1)}%
- Avg Backers: ${Number(benchmark.avgBackers ?? 0).toFixed(0)}
- DATA LABEL: SYNTHETIC DATA — educational benchmarks, not real platform statistics

SEARCH CONTEXT:
${searchResp.degraded ? 'No live search. All market claims = AI_ESTIMATE_UNVERIFIED.' : searchResp.results.map(r => `- ${r.title}: ${r.content.slice(0, 250)} [${r.source}]`).join('\n')}

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
- Synthetic benchmark labeled SYNTHETIC DATA
- Do not use final funding data to predict success (no data leakage)
- Disclaimer in integrityNote: "These are educational decision-support categories, not statistically guaranteed probabilities of success."
- Scenarios (conservative/base/optimistic) = ASSUMPTION only
- Generate all fields including: founderAssumptions, fundingBands, goalBands, backerSegments, rewardEconomics, campaignDurationAnalysis, categoryBenchmark, campaignPageScorecard, campaignStoryScorecard, earlyMomentumAnalysis, marketingFunnel, socialProofAnalysis, preLaunchChecklist, preLaunchReadinessScore, firstDayTarget, firstWeekTarget.`

    const aiResult = await generateWithFallback({ prompt, schema: CrowdfundingAiSchema, temperature: 0, preferredAiProvider: dbUser.preferredAiProvider, customOpenRouterKey })
    const ai = aiResult.data

    // Calculate total performance score
    const performanceScore =
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

    const { band, label: classLabel, disclaimer } = getCampaignClassificationBand(performanceScore)

    await deductCredits(dbUser.id, CREDIT_COSTS.CROWDFUNDING, 'CROWDFUNDING', i.ideaId)
    const [saved] = await db.insert(crowdfundingAnalyses).values({
      ideaId: i.ideaId,
      userId: dbUser.id,
      performanceScore,
      classificationBand: `${band} — ${classLabel}`,
      fundingGoal: i.fundingGoal,
      expectedFunding: ai.scenarios.base.amountRaised,
      expectedBackers: ai.scenarios.base.backers,
      conversionRate: `${estimatedConversionRate}% (ASSUMPTION)`,
      rewardTiers: ai.rewardTierAnalysis,
      scenarioAnalysis: { ...ai.scenarios, disclaimer: 'ASSUMPTION — not guaranteed outcomes' },
      marketingChannels: ai.marketingChannels,
      prelaunchPlan: ai.thirtyDayPrelaunchPlan,
      riskRegister: ai.riskRegister,
      recommendation: ai.recommendation,
      reportData: {
        inputs: i,
        computedMetrics: { requiredBackers: Math.ceil(requiredBackers), requiredVisitors: Math.ceil(requiredVisitors), marketingCostPerBacker },
        benchmark: { ...benchmark, dataLabel: 'SYNTHETIC DATA' },
        ai,
        performanceScore,
        classificationBand: classLabel,
        disclaimer,
      },
    }).returning()

    return NextResponse.json({
      analysisId: saved.id,
      performanceScore,
      classificationBand: classLabel,
      band,
      disclaimer,
      recommendation: ai.recommendation,
      result: saved.reportData,
    })
  } finally {
    await decrementConcurrency(dbUser.id)
  }
}