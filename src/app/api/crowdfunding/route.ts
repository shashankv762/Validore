import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/db'
import { users, ideas, crowdfundingAnalyses, syntheticCampaigns } from '@/db/schema'
import { eq, and, avg, count, sql } from 'drizzle-orm'
import { canUserAccessWithCredits, decrementCredit } from '@/lib/tier-gate'
import { generateWithFallback } from '@/lib/ai/generate'
import { webSearch } from '@/lib/ai/search'
import { z } from 'zod'
import * as fin from '@/lib/financial'
import { CAMPAIGN_WEIGHTS, clampScore, getCampaignClassificationBand } from '@/lib/scoring'

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

  const access = await canUserAccessWithCredits(user.id, 'crowdfunding')
  if (!access.allowed) {
    return NextResponse.json({
      error: 'Access denied. Upgrade to Max Premium or purchase a Crowdfunding Analysis Pack ($49).',
      upgradeRequired: true,
    }, { status: 403 })
  }

  const body = await request.json()
  const parsed = CrowdfundingInputSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const i = parsed.data
  const idea = await db.query.ideas.findFirst({
    where: and(eq(ideas.id, i.ideaId), eq(ideas.userId, dbUser.id)),
  })
  if (!idea) return NextResponse.json({ error: 'Idea not found' }, { status: 404 })

  // Decrement credit if accessed via credit (not tier)
  if (access.reason === 'credit') {
    await decrementCredit(user.id, 'crowdfundingCredits')
  }

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
- Scenarios (conservative/base/optimistic) = ASSUMPTION only`

  const aiResult = await generateWithFallback({ prompt, schema: CrowdfundingAiSchema, temperature: 0 })
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
}