import { NextRequest, NextResponse } from 'next/server'
import { planningContextPrompt, assertPlanningContextUnchanged, PlanningContextError } from '@/lib/planning/context'
import { decryptApiKey } from '@/lib/byok-crypto'
import { validAuthOrigin } from '@/lib/auth-form'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/db'
import { users, ideas, pricingSimulations } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import { checkCredits, deductCredits } from '@/lib/credits'
import { CREDIT_COSTS } from '@/lib/credit-costs'
import { canUserAccess } from '@/lib/tier-gate'
import { generateWithFallback } from '@/lib/ai/generate'
import { publicResearchBrief, publicResearchQuery } from '@/lib/ai/research-brief'
import { webSearch, deduplicateSources } from '@/lib/ai/search'
import { z } from 'zod'
import { PricingInputSchema, calculatePricing } from '@/lib/planning/economics'
import { planningMethod } from '@/lib/planning/knowledge'
import { planningSources, validatePricingOutput } from '@/lib/planning/evidence'
import { pricingEconomicScores } from '@/lib/planning/pricing-scores'
import { PRICING_WEIGHTS, clampScore, validateWeightTable } from '@/lib/scoring'
import { rateLimitCheck, checkAndIncrementConcurrency, decrementConcurrency } from '@/lib/rate-limit'
import { moduleHistory } from '@/lib/module-history'
import { AdminAccessError, effectiveTier, isActiveAccount, isOwnerAccount } from '@/lib/admin-access'
import { getPlan } from '@/lib/plan-catalog'
import { beginPlanningRequest, bindPlanningIdea, preparePlanningContext, completePlanningRequest, failPlanningRequest, lockPlanningIdea, planningIdeaSnapshot, PlanningRequestError, type PlanningRun } from '@/lib/planning/requests'
import { assertPlanningSourceUnchanged, PlanningSourceReportError } from '@/lib/planning/source-report'
import { SOURCE_REPORT_CONTEXT_MAX_CHARS } from '@/lib/planning/source-report-contract'

export async function GET(request: NextRequest) { return moduleHistory(request, 'pricing') }

const PricingAiSchema = z.object({
  customerWtpInsights: z.string().trim().min(20).max(2000),
  customerValueAnalysis: z.string().trim().min(20).max(2000),
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
  pricingModelRecommendation: z.string().trim().min(10).max(1600),
  recommendedPriceToTest: z.string().trim().min(3).max(1000),
  validationStepsRequired: z.array(z.string().trim().min(10).max(1000)).min(2).max(8),
  thirtyDayValidationPlan: z.array(z.object({
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
    mitigation: z.string().trim().min(10).max(1000),
  })).min(1).max(8),
  // Scoring (0-max for each weight)
  customerWtpScore: z.number().min(0).max(PRICING_WEIGHTS.customerWillingnessToPay),
  customerValueScore: z.number().min(0).max(PRICING_WEIGHTS.customerValue),
  competitivePositionScore: z.number().min(0).max(PRICING_WEIGHTS.competitivePosition),
  demandPotentialScore: z.number().min(0).max(PRICING_WEIGHTS.demandPotential),
  scalabilityScore: z.number().min(0).max(PRICING_WEIGHTS.scalability),
  pricingSimplicityScore: z.number().min(0).max(PRICING_WEIGHTS.pricingSimplicity),
  integrityNote: z.string(),
  pricingProblem: z.string().optional(),
  customerSegments: z.array(z.object({ segment: z.string(), size: z.string(), wtp: z.number(), priceElasticity: z.string() })).optional(),
  customerPersonas: z.array(z.object({ name: z.string(), description: z.string(), budget: z.string(), decisionFactors: z.array(z.string()) })).optional(),
  wtpQuestionnaire: z.array(z.object({ question: z.string(), options: z.array(z.string()), insight: z.string() })).optional(),
  competitorPricingMatrix: z.array(z.object({ competitor: z.string(), price: z.number(), tier: z.string(), features: z.array(z.string()), positioning: z.string() })).optional(),
  competitivePricingMap: z.array(z.object({ label: z.string(), price: z.number(), quality: z.number(), isUs: z.boolean() })).optional(),
  costBreakdown: z.object({ cogs: z.number(), fixedCosts: z.number(), variableCosts: z.number(), targetMargin: z.number(), breakEvenPrice: z.number() }).optional(),
  pricingModels: z.array(z.object({ name: z.string(), description: z.string(), recommendedPrice: z.number(), pros: z.array(z.string()), cons: z.array(z.string()), suitabilityScore: z.number() })).optional(),
  psychologicalPricing: z.array(z.object({ technique: z.string(), example: z.string(), psychologicalImpact: z.string(), recommendedUse: z.string() })).optional(),
  discountSensitivityTable: z.array(z.object({ discountPct: z.number(), expectedVolumeLift: z.number(), netRevenueImpact: z.number(), recommendation: z.string() })).optional(),
  priceElasticity: z.object({ coefficient: z.number(), interpretation: z.string(), elasticityType: z.enum(['elastic','inelastic','unitary']), implications: z.array(z.string()) }).optional(),
  whatIfAnalysis: z.array(z.object({ scenario: z.string(), assumption: z.string(), financialImpact: z.string(), recommendation: z.string() })).optional(),
  pricingDecisionMatrix: z.array(z.object({ option: z.string(), score: z.number(), evidence: z.string(), risk: z.enum(['high','medium','low']), verdict: z.string() })).optional(),
  pricingVsVolumeMatrix: z.array(z.object({ pricePoint: z.number(), estimatedVolume: z.number(), revenue: z.number(), contributionMargin: z.number() })).optional(),
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

    planningRun = await beginPlanningRequest(request, dbUser.id, 'pricing')
    if (planningRun.replay) return NextResponse.json(planningRun.replay, { headers: { 'Cache-Control': 'private, no-store' } })

  if (!await canUserAccess(user.id, 'canPricingSimulator')) return NextResponse.json({ error: 'This module requires an eligible plan' }, { status: 403 })
  const creditCheck = await checkCredits(dbUser.id, CREDIT_COSTS.PRICING)
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
    const parsed = PricingInputSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: 'Please check the form fields and try again.', details: parsed.error.flatten() }, { status: 400 })

    const i = parsed.data
    const idea = await db.query.ideas.findFirst({
      where: and(eq(ideas.id, i.ideaId), eq(ideas.userId, dbUser.id)),
    })
    if (!idea) return NextResponse.json({ error: 'Idea not found' }, { status: 404 })
    if (idea.isActive === false) return NextResponse.json({ error: 'This idea is no longer active in your workspace.' }, { status: 404 })
    if (idea.isReadOnly) return NextResponse.json({ error: 'This idea is read-only. Choose an editable idea before running this tool.' }, { status: 403 })
    bindPlanningIdea(planningRun,dbUser.id,idea)
    const contextSnapshot = await preparePlanningContext(planningRun, dbUser.id, idea.id, 'pricing')

    const calculations = calculatePricing(i)
    const { contributionMargin, contributionMarginPct, grossMarginPct, markupPct, breakEvenUnits, ltv, ltvCacRatio, cacPayback } = calculations.computedMetrics
    const { scenarios, sensitivityMatrix } = calculations

    // Web search for competitor pricing
    const publicSearch = await webSearch(publicResearchQuery(idea, 'pricing competitors'), 5)
    const sourceReport = planningRun.sourceReport
    const searchResp = { ...publicSearch, results: deduplicateSources([...publicSearch.results,...(sourceReport?.sources ?? [])]) }

    // AI analysis
    const today = new Date().toISOString().split('T')[0]
    const prompt = `You are an expert pricing strategist analyzing pricing for this startup.
${planningMethod('pricing')}

STARTUP: ${idea.name} | ${idea.industry} | ${idea.location}
Product: ${idea.product}
Target Customer: ${idea.targetCustomer}
Business Model: ${idea.businessModel}

All input monetary amounts are in Indian rupees (INR), matching the simulator. Use INR for your recommendations. If comparing a foreign-currency source, retain its original currency and label any conversion assumption.
CURRENT PRICE INPUT: ${i.sellingPrice} INR
Variable Cost: ${i.variableCostPerUnit}
Fixed Cost/Month: ${i.fixedCostMonthly}
Expected Paying Customers/Month: ${i.expectedCustomers}
Billing Model: ${i.billingModel}
Retention: ${i.retentionMonths} billing periods (used only for recurring)
Payment Fees: ${i.paymentFeePercent}%
Demand Elasticity Hypothesis: ${i.demandElasticity}
Visitor-to-Payer Conversion Hypothesis: ${i.conversionRatePercent}%
Estimated CAC: ${i.estimatedCac}

COMPUTED FINANCIALS (verified formulas):
- Contribution Margin: ${contributionMargin.toFixed(2)} (${contributionMarginPct.toFixed(1)}%)
- Gross Margin: ${grossMarginPct.toFixed(1)}%
- Markup: ${markupPct === null ? 'Unavailable (zero product cost)' : markupPct.toFixed(1)}% (NOTE: Markup ≠ Margin — markup is calculated on cost, margin on revenue)
- Break-Even Customers/Month: ${breakEvenUnits ?? 'Not attainable with this contribution margin'}
- LTV: ${ltv.toFixed(2)} | LTV:CAC: ${ltvCacRatio === null ? 'Unavailable (zero CAC)' : ltvCacRatio.toFixed(2)} | CAC Payback: ${cacPayback === null ? 'Unavailable; monthly payback applies only to recurring purchases with positive contribution and nonzero CAC' : cacPayback.toFixed(1) + ' months'}

SEARCH RESULTS FOR COMPETITOR PRICING:
${!searchResp.results.length
  ? 'No retrieved pricing page. competitorPrices and competitorPricingMatrix must be empty arrays; list the evidence gap.'
  : searchResp.results.map(r => `- ${r.title}: ${r.content.slice(0, 1400)} [URL: ${r.url}; kind: ${r.retrievalKind ?? 'snippet'}; retrieved: ${r.fetchedAt}]`).join('\n')}

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
- competitorPrices dateChecked must match the cited page's supplied retrieval date, including when that page is cached. Today's date is not proof of a new check.
- Never fabricate prices. Retrieve the official pricing page before reporting a competitor price. source must be its exact URL from research, retain plan/unit/currency and date. Empty competitor arrays are correct when pages cannot be retrieved.
- No price sensitivity survey was supplied. In vanWestendorpInsights use "Not measured — collect customer survey responses" for each barrier and acceptableRange; do not manufacture a price corridor. wtpQuestionnaire should propose the four perception questions plus a real purchase test.
- recommendedPriceToTest is a hypothesis, not a guaranteed optimal price
- validationStepsRequired must list what real evidence is still needed before finalising price
- Keep core analysis useful and concise. Optional sections must add a decision or test; omit unsupported numbers, personas posing as actual interviews, invented elasticities or survey results. Deterministic calculations and scenarios are provided below; do not overwrite them. Consider fields including: pricingProblem, customerSegments, customerPersonas, wtpQuestionnaire, competitorPricingMatrix, competitivePricingMap, costBreakdown, pricingModels, psychologicalPricing, discountSensitivityTable, priceElasticity, whatIfAnalysis, pricingDecisionMatrix, pricingVsVolumeMatrix`

    const aiResult = await generateWithFallback({
      sources: searchResp.results,
      ...(sourceReport ? { privateContextMaxChars: SOURCE_REPORT_CONTEXT_MAX_CHARS, researchMode: 'reuse' as const, maxResearchRounds: 0 }
        : { maxResearchRounds: searchResp.results.length ? 1 : 2 }),
    researchPrompt: publicResearchBrief(idea),
      privateContext: planningContextPrompt(contextSnapshot, sourceReport),
      prompt,
      schema: PricingAiSchema,
      validateOutput: validatePricingOutput,
      temperature: 0,
      preferredAiProvider: dbUser.preferredAiProvider,
      maxTokensPerCall: isOwnerAccount(dbUser) ? undefined : plan.maxTokensPerCall,
      customOpenRouterKey,
    })

    const sources = aiResult.sources ?? searchResp.results
    const ai = { ...aiResult.data,
      // Financial tables come from one calculation path shared with the preview.
      competitorPrices: aiResult.data.competitorPrices.filter(row => row.source && sources.some(source => source.url === row.source && source.retrievalKind === 'page')),
      competitorPricingMatrix: undefined,
      competitivePricingMap: undefined,
      costBreakdown: { cogs: i.variableCostPerUnit, fixedCosts: i.fixedCostMonthly, variableCosts: i.variableCostPerUnit,
        targetMargin: contributionMarginPct, breakEvenPrice: calculations.computedMetrics.breakEvenPrice },
      // Demand and discount outcomes use the same entered elasticity and fees
      // as the visible scenarios. A generated table cannot invent another curve.
      discountSensitivityTable: undefined,
      customerSegments: undefined,
      vanWestendorpInsights: { tooExpensive: 'Not measured — collect customer survey responses', expensive: 'Not measured — collect customer survey responses',
        bargain: 'Not measured — collect customer survey responses', tooCheap: 'Not measured — collect customer survey responses',
        acceptableRange: 'Not measured — collect customer survey responses', label: 'ASSUMPTION' as const },
      pricingVsVolumeMatrix: scenarios.map(row => ({ pricePoint: row.price, estimatedVolume: row.estimatedCustomers, revenue: row.revenue, contributionMargin: row.contributionMargin })),
      priceElasticity: { coefficient: -i.demandElasticity, elasticityType: i.demandElasticity > 1 ? 'elastic' : i.demandElasticity < 1 ? 'inelastic' : 'unitary',
        interpretation: 'Founder-controlled constant elasticity scenario assumption; no observed demand curve was supplied.', implications: ['Run comparable purchase tests at several prices before using this curve for planning.'] },
    }

    // Compute formula-based scores
    const { cmScore, beScore, cacLtvScore } = pricingEconomicScores(calculations.computedMetrics, i.expectedCustomers)

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
      inputs: i, ...calculations, aiAnalysis: ai, pricingScore, ideaSnapshot: planningIdeaSnapshot(idea), sourceReport: sourceReport?.snapshot ?? null,
          planningContext: contextSnapshot,
      researchSources: planningSources(sources),
      evidenceGaps: [
        'Willingness to pay, survey price barriers and demand elasticity have not been measured by this simulator.',
        ...(!ai.competitorPrices.length ? ['No competitor pricing page was retrieved; competitor prices remain unavailable.'] : []),
      ],
    }

    const saved = await db.transaction(async tx => {
      const [account] = await tx.select({ accountStatus: users.accountStatus }).from(users).where(eq(users.id, dbUser.id)).for('update')
      if (!account || !isActiveAccount(account)) throw new AdminAccessError('This account is not active.', 403, 'account_inactive')
      await lockPlanningIdea(tx, dbUser.id, i.ideaId)
      if (!planningRun?.lease) await assertPlanningContextUnchanged(tx, dbUser.id, idea.id, contextSnapshot)
      if (!planningRun?.lease) await assertPlanningSourceUnchanged(tx,dbUser.id,idea.id,sourceReport)
      const charged = await deductCredits(dbUser.id, CREDIT_COSTS.PRICING, 'PRICING', i.ideaId, undefined, tx)
      if (!charged) return null
      const [created] = await tx.insert(pricingSimulations).values({
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
      await completePlanningRequest(tx, planningRun?.lease ?? null, created.id,planningRun?.ideaBinding)
      return created
    })
    if (!saved) return NextResponse.json({ error: 'Insufficient credits. Refresh your balance and try again.' }, { status: 402 })

    return NextResponse.json({ simulationId: saved.id, result: fullResult })
  } catch (error) {
    if (error instanceof PlanningSourceReportError || error instanceof PlanningContextError) return NextResponse.json({ error: error.message, code: error.code },{ status: error.status, headers: { 'Cache-Control':'private, no-store' } })
    if (error instanceof PlanningRequestError) return NextResponse.json({ error: error.message, retryAfter: error.retryAfter, code: error.code }, { status: error.status, headers: { 'Cache-Control': 'private, no-store', ...(error.retryAfter ? { 'Retry-After': String(error.retryAfter) } : {}) } })
    if (error instanceof AdminAccessError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    console.error('[pricing] Analysis failed', { type: error instanceof Error ? error.name : 'UnknownError' })
    return NextResponse.json({ error: 'Analysis could not complete. Please try again.' }, { status: 503 })
  } finally {
    await failPlanningRequest(planningRun?.lease ?? null)
    if (concurrencyAcquired) await decrementConcurrency(dbUser.id)
  }
}
