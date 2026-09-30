import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/db'
import { users, ideas, pricingSimulations } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import { canUserAccess } from '@/lib/tier-gate'
import { generateWithFallback } from '@/lib/ai/generate'
import { webSearch } from '@/lib/ai/search'
import { z } from 'zod'
import * as fin from '@/lib/financial'
import { PRICING_WEIGHTS, clampScore, validateWeightTable } from '@/lib/scoring'

const PricingInputSchema = z.object({
  ideaId: z.string().uuid(),
  sellingPrice: z.number().positive(),
  expectedCustomers: z.number().positive(),
  variableCostPerUnit: z.number().min(0),
  fixedCostMonthly: z.number().min(0),
  discountPercent: z.number().min(0).max(100),
  conversionRatePercent: z.number().min(0).max(100),
  estimatedCac: z.number().min(0),
  retentionMonths: z.number().min(1).max(60),
})

const PricingAiSchema = z.object({
  customerWtpInsights: z.string(),
  customerValueAnalysis: z.string(),
  competitorPrices: z.array(z.object({
    name: z.string(),
    price: z.string(),
    model: z.string(),
    dateChecked: z.string(),
    source: z.string().optional(),
  })),
  vanWestendorpInsights: z.object({
    tooExpensive: z.string(),
    expensive: z.string(),
    bargain: z.string(),
    tooCheap: z.string(),
    acceptableRange: z.string(),
    label: z.literal('ASSUMPTION'),
  }),
  pricingModelRecommendation: z.string(),
  recommendedPriceToTest: z.string(),
  validationStepsRequired: z.array(z.string()),
  thirtyDayValidationPlan: z.array(z.object({
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
    mitigation: z.string(),
  })),
  // Scoring (0-max for each weight)
  customerWtpScore: z.number().min(0).max(PRICING_WEIGHTS.customerWillingnessToPay),
  customerValueScore: z.number().min(0).max(PRICING_WEIGHTS.customerValue),
  competitivePositionScore: z.number().min(0).max(PRICING_WEIGHTS.competitivePosition),
  demandPotentialScore: z.number().min(0).max(PRICING_WEIGHTS.demandPotential),
  scalabilityScore: z.number().min(0).max(PRICING_WEIGHTS.scalability),
  pricingSimplicityScore: z.number().min(0).max(PRICING_WEIGHTS.pricingSimplicity),
  integrityNote: z.string(),
})

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const dbUser = await db.query.users.findFirst({ where: eq(users.supabaseId, user.id) })
  if (!dbUser) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const allowed = await canUserAccess(user.id, 'canPricingSimulator')
  if (!allowed) return NextResponse.json({ error: 'Upgrade to Premium to use the Pricing Simulator.' }, { status: 403 })

  const body = await request.json()
  const parsed = PricingInputSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const i = parsed.data
  const idea = await db.query.ideas.findFirst({
    where: and(eq(ideas.id, i.ideaId), eq(ideas.userId, dbUser.id)),
  })
  if (!idea) return NextResponse.json({ error: 'Idea not found' }, { status: 404 })

  // ── Financial formulas (all from financial.ts) ──────────────────────────────
  const contributionMargin = fin.calculateContributionMargin(i.sellingPrice, i.variableCostPerUnit)
  const contributionMarginPct = fin.calculateContributionMarginPercent(contributionMargin, i.sellingPrice)
  const grossMarginPct = fin.calculateGrossMarginPercent(i.sellingPrice, i.variableCostPerUnit)
  const markupPct = fin.calculateMarkupPercent(i.sellingPrice, i.variableCostPerUnit)
  const breakEvenUnits = fin.calculateBreakEvenUnits(i.fixedCostMonthly, i.sellingPrice, i.variableCostPerUnit)
  const breakEvenRevenue = fin.calculateBreakEvenRevenue(breakEvenUnits, i.sellingPrice)
  const revenue = i.sellingPrice * i.expectedCustomers
  const totalVariableCosts = i.variableCostPerUnit * i.expectedCustomers
  const operatingProfit = revenue - totalVariableCosts - i.fixedCostMonthly
  const ltv = fin.calculateLTV(contributionMargin, i.retentionMonths)
  const ltvCacRatio = fin.calculateLTVCACRatio(ltv, i.estimatedCac)
  const cacPayback = fin.calculateCACPaybackPeriod(i.estimatedCac, contributionMargin)

  // Discount break-even
  const discountedPrice = i.sellingPrice * (1 - i.discountPercent / 100)
  const discountedCM = fin.calculateContributionMargin(discountedPrice, i.variableCostPerUnit)
  const originalContribution = contributionMargin * i.expectedCustomers
  const discountBreakEven = fin.calculateDiscountBreakEvenVolume(originalContribution, discountedCM)

  // 5 pricing scenarios
  const scenarios = [0.6, 0.8, 1.0, 1.2, 1.5].map(multiplier => {
    const scenarioPrice = Math.round(i.sellingPrice * multiplier)
    const sCM = fin.calculateContributionMargin(scenarioPrice, i.variableCostPerUnit)
    const sCustomers = Math.round(i.expectedCustomers / Math.pow(multiplier, 1.5)) // demand elasticity assumption
    const sRevenue = scenarioPrice * sCustomers
    const sProfit = sRevenue - (i.variableCostPerUnit * sCustomers) - i.fixedCostMonthly
    const sBEUnits = fin.calculateBreakEvenUnits(i.fixedCostMonthly, scenarioPrice, i.variableCostPerUnit)
    return {
      label: multiplier === 1.0 ? 'Base' : multiplier < 1.0 ? `${Math.round(multiplier * 100)}% Price` : `${Math.round(multiplier * 100)}% Price`,
      price: scenarioPrice,
      estimatedCustomers: sCustomers,
      revenue: Math.round(sRevenue),
      contributionMargin: sCM,
      profit: Math.round(sProfit),
      breakEvenUnits: Math.ceil(sBEUnits),
      label2: 'ASSUMPTION' as const,
    }
  })

  // Sensitivity matrix ±20%
  const sensitivityMatrix = [-20, -10, 0, 10, 20].map(priceChange => {
    return [-20, -10, 0, 10, 20].map(volumeChange => {
      const p = i.sellingPrice * (1 + priceChange / 100)
      const v = i.expectedCustomers * (1 + volumeChange / 100)
      const cm = fin.calculateContributionMargin(p, i.variableCostPerUnit)
      const profit = cm * v - i.fixedCostMonthly
      return { priceChange, volumeChange, profit: Math.round(profit) }
    })
  })

  // Web search for competitor pricing
  const searchResp = await webSearch(`${idea.industry} pricing competitors ${idea.location} 2024 2025`, 5)

  // AI analysis
  const today = new Date().toISOString().split('T')[0]
  const prompt = `You are an expert pricing strategist analyzing pricing for this startup.

STARTUP: ${idea.name} | ${idea.industry} | ${idea.location}
Product: ${idea.product}
Target Customer: ${idea.targetCustomer}
Business Model: ${idea.businessModel}

CURRENT PRICE INPUT: ${i.sellingPrice} (local currency)
Variable Cost: ${i.variableCostPerUnit}
Fixed Cost/Month: ${i.fixedCostMonthly}
Expected Customers: ${i.expectedCustomers}
Estimated CAC: ${i.estimatedCac}

COMPUTED FINANCIALS (verified formulas):
- Contribution Margin: ${contributionMargin.toFixed(2)} (${contributionMarginPct.toFixed(1)}%)
- Gross Margin: ${grossMarginPct.toFixed(1)}%
- Markup: ${markupPct.toFixed(1)}% (NOTE: Markup ≠ Margin — markup is calculated on cost, margin on revenue)
- Break-Even Customers/Month: ${Math.ceil(breakEvenUnits)}
- LTV: ${ltv.toFixed(2)} | LTV:CAC: ${ltvCacRatio.toFixed(2)} | CAC Payback: ${cacPayback.toFixed(1)} months

SEARCH RESULTS FOR COMPETITOR PRICING:
${searchResp.degraded
  ? 'No live search results. Mark competitor prices as AI_ESTIMATE_UNVERIFIED, leave source empty.'
  : searchResp.results.map(r => `- ${r.title}: ${r.content.slice(0, 300)} [${r.source}, ${r.fetchedAt}]`).join('\n')}

Today's date: ${today}

SCORING TASK (score within these max weights):
- customerWtpScore max: ${PRICING_WEIGHTS.customerWillingnessToPay} (based on WTP insights — label ASSUMPTION)
- customerValueScore max: ${PRICING_WEIGHTS.customerValue}
- competitivePositionScore max: ${PRICING_WEIGHTS.competitivePosition}
- demandPotentialScore max: ${PRICING_WEIGHTS.demandPotential}
- scalabilityScore max: ${PRICING_WEIGHTS.scalability}
- pricingSimplicityScore max: ${PRICING_WEIGHTS.pricingSimplicity}

NOTE: contributionMarginScore (max ${PRICING_WEIGHTS.contributionMargin}), breakEvenFeasibilityScore (max ${PRICING_WEIGHTS.breakEvenFeasibility}), cacLtvScore (max ${PRICING_WEIGHTS.cacLtvEconomics}) will be computed separately from formulas above.

CRITICAL RULES:
- competitorPrices dateChecked must be: ${today}
- Never fabricate prices — only use prices found in search results. If none found, say AI_ESTIMATE_UNVERIFIED and leave source empty
- vanWestendorpInsights are ASSUMPTION — never claim they are real survey data
- recommendedPriceToTest is a hypothesis, not a guaranteed optimal price
- validationStepsRequired must list what real evidence is still needed before finalising price`

  const aiResult = await generateWithFallback({
    prompt,
    schema: PricingAiSchema,
    temperature: 0,
  })

  const ai = aiResult.data

  // Compute formula-based scores
  const cmScore = clampScore(contributionMarginPct >= 60 ? PRICING_WEIGHTS.contributionMargin : Math.round(contributionMarginPct / 60 * PRICING_WEIGHTS.contributionMargin), PRICING_WEIGHTS.contributionMargin)
  const beScore = clampScore(breakEvenUnits <= i.expectedCustomers * 0.5 ? PRICING_WEIGHTS.breakEvenFeasibility : Math.round((1 - breakEvenUnits / (i.expectedCustomers * 2)) * PRICING_WEIGHTS.breakEvenFeasibility), PRICING_WEIGHTS.breakEvenFeasibility)
  const cacLtvScore = clampScore(ltvCacRatio >= 3 ? PRICING_WEIGHTS.cacLtvEconomics : Math.round((ltvCacRatio / 3) * PRICING_WEIGHTS.cacLtvEconomics), PRICING_WEIGHTS.cacLtvEconomics)

  const pricingScore = clampScore(ai.customerWtpScore, PRICING_WEIGHTS.customerWillingnessToPay)
    + clampScore(ai.customerValueScore, PRICING_WEIGHTS.customerValue)
    + clampScore(ai.competitivePositionScore, PRICING_WEIGHTS.competitivePosition)
    + cmScore + beScore + cacLtvScore
    + clampScore(ai.demandPotentialScore, PRICING_WEIGHTS.demandPotential)
    + clampScore(ai.scalabilityScore, PRICING_WEIGHTS.scalability)
    + clampScore(ai.pricingSimplicityScore, PRICING_WEIGHTS.pricingSimplicity)

  // Validate weight table still sums to 100
  if (!validateWeightTable(PRICING_WEIGHTS)) throw new Error('PRICING_WEIGHTS invariant violated')

  const fullResult = {
    inputs: i,
    computedMetrics: {
      contributionMargin,
      contributionMarginPct,
      grossMarginPct,
      markupPct,
      markupNote: 'Markup is calculated on cost (Price-Cost)/Cost. Gross Margin is calculated on revenue (Price-Cost)/Price. They are NOT the same.',
      breakEvenUnits: Math.ceil(breakEvenUnits),
      breakEvenRevenue: Math.round(breakEvenRevenue),
      revenue: Math.round(revenue),
      operatingProfit: Math.round(operatingProfit),
      ltv,
      ltvCacRatio,
      cacPayback,
      discountBreakEven: Math.ceil(discountBreakEven),
      label: 'ASSUMPTION' as const,
    },
    scenarios,
    sensitivityMatrix,
    aiAnalysis: ai,
    pricingScore,
  }

  const [saved] = await db.insert(pricingSimulations).values({
    ideaId: i.ideaId,
    userId: dbUser.id,
    pricingScore,
    scenarios,
    sensitivityMatrix,
    competitorPrices: ai.competitorPrices,
    recommendedPrice: ai.recommendedPriceToTest,
    validationPlan: ai.thirtyDayValidationPlan,
    reportData: fullResult,
  }).returning()

  return NextResponse.json({ simulationId: saved.id, result: fullResult })
}