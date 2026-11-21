import { z } from 'zod'
import { PlanningArtifactSelectionSchema } from './context-contract'
import { SourceReportIdSchema } from './source-report-contract'

const amount = z.number().finite().min(0).max(1_000_000_000)
const count = z.number().int().min(0).max(10_000_000)
const percent = z.number().finite().min(0).max(100)
const round = (value: number) => Math.round(value * 100) / 100
const meaningful = round
// Usage-based prices can be smaller than a currency's settlement unit. Keep
// those unit hypotheses distinct from zero; aggregate money still rounds to cents.
const perUnit = (value: number) => value !== 0 && Math.abs(value) < 0.01 ? Number(value.toPrecision(8)) : round(value)
// Rounded values must have a safely representable hundredths numerator;
// counts must remain exact integers. Small per-unit amounts are still allowed.
export const MAX_CALCULATED_VALUE = Number.MAX_SAFE_INTEGER / 100
const calculatedCountFields = new Set(['breakEvenUnits', 'discountBreakEven', 'requiredVisitors', 'estimatedCustomers', 'customers', 'backers', 'requiredBackers'])
export function planningCalculationIssues(value: unknown, path: (string | number)[] = []): { path: (string | number)[]; message: string }[] {
  if (typeof value === 'number') {
    const isCount = calculatedCountFields.has(String(path.at(-1)))
    const supported = isCount ? Number.isSafeInteger(value) && value >= 0 : Number.isFinite(value) && Math.abs(value) <= MAX_CALCULATED_VALUE
    return supported ? [] : [{ path, message: 'These inputs produce a calculation outside the supported numeric range. Adjust the price, costs, volume or conversion rate.' }]
  }
  if (!value || typeof value !== 'object') return []
  return Object.entries(value).flatMap(([key, entry]) => planningCalculationIssues(entry, [...path, Array.isArray(value) ? Number(key) : key]))
}
export function refinePricingCalculations(input: PricingInputs, ctx: z.RefinementCtx) {
  const issues = planningCalculationIssues(calculatePricing(input))
  for (const issue of issues.slice(0, 8)) ctx.addIssue({ code: 'custom', path: ['sellingPrice'], message: `${issue.message} (${issue.path.join('.')})` })
}

const pricingInputFields = z.object({
  ideaId: z.string().uuid(),
  sourceReportId: SourceReportIdSchema,
  ...PlanningArtifactSelectionSchema.shape,
  sellingPrice: amount.positive(), expectedCustomers: count,
  variableCostPerUnit: amount, fixedCostMonthly: amount,
  discountPercent: percent, conversionRatePercent: percent,
  estimatedCac: amount, retentionMonths: z.number().int().min(1).max(60),
  demandElasticity: z.number().finite().min(0).max(5).default(1.5),
  paymentFeePercent: percent.max(50).default(0),
  billingModel: z.enum(['recurring', 'one_time']).default('recurring'),
})
export type PricingInputs = z.infer<typeof pricingInputFields>
export const PricingInputSchema = pricingInputFields.superRefine(refinePricingCalculations)

export function calculatePricing(input: PricingInputs) {
  const i = input
  const feePerUnit = i.sellingPrice * i.paymentFeePercent / 100
  const contributionMargin = i.sellingPrice - i.variableCostPerUnit - feePerUnit
  const contributionMarginPct = contributionMargin / i.sellingPrice * 100
  const grossMarginPct = (i.sellingPrice - i.variableCostPerUnit) / i.sellingPrice * 100
  const breakEvenUnits = contributionMargin > 0 ? Math.ceil(i.fixedCostMonthly / contributionMargin) : null
  const revenue = i.sellingPrice * i.expectedCustomers
  const operatingProfit = contributionMargin * i.expectedCustomers - i.fixedCostMonthly
  const ltv = contributionMargin * (i.billingModel === 'recurring' ? i.retentionMonths : 1)
  const discountedPrice = i.sellingPrice * (1 - i.discountPercent / 100)
  const discountedMargin = discountedPrice * (1 - i.paymentFeePercent / 100) - i.variableCostPerUnit
  const originalContribution = contributionMargin * i.expectedCustomers
  const discountBreakEven = discountedMargin > 0 && contributionMargin > 0 ? Math.ceil(originalContribution / discountedMargin) : null
  const computedMetrics = {
    contributionMargin: perUnit(contributionMargin), contributionMarginPct: round(contributionMarginPct),
    grossMarginPct: round(grossMarginPct), feePerUnit: perUnit(feePerUnit),
    markupPct: i.variableCostPerUnit > 0 ? round((i.sellingPrice - i.variableCostPerUnit) / i.variableCostPerUnit * 100) : null,
    markupNote: 'Markup uses product cost as its denominator. Gross margin uses revenue; contribution margin also deducts the entered payment fee.',
    breakEvenUnits, breakEvenRevenue: breakEvenUnits === null ? null : round(breakEvenUnits * i.sellingPrice),
    revenue: round(revenue), operatingProfit: round(operatingProfit), ltv: perUnit(ltv),
    ltvCacRatio: i.estimatedCac > 0 ? meaningful(ltv / i.estimatedCac) : null,
    cacPayback: i.billingModel === 'recurring' && contributionMargin > 0 && i.estimatedCac > 0 ? meaningful(i.estimatedCac / contributionMargin) : null,
    contributionAfterAcquisition: perUnit(ltv - i.estimatedCac),
    cacPaybackNote: i.billingModel === 'recurring' ? 'Months of constant contribution needed to recover the entered acquisition cost.' : 'Monthly payback is unavailable for a one-time purchase. Compare one-purchase contribution with acquisition cost instead.',
    discountBreakEven, discountedPrice: perUnit(discountedPrice), discountedMargin: perUnit(discountedMargin),
    discountedRevenue: round(discountedPrice * i.expectedCustomers),
    discountedOperatingProfit: round(discountedMargin * i.expectedCustomers - i.fixedCostMonthly),
    firstMonthProfitAfterAcquisition: round(operatingProfit - i.expectedCustomers * i.estimatedCac),
    discountVolumeLiftRequired: discountBreakEven !== null && i.expectedCustomers > 0 ? round((discountBreakEven / i.expectedCustomers - 1) * 100) : null,
    requiredVisitors: i.conversionRatePercent > 0 ? Math.ceil(i.expectedCustomers / (i.conversionRatePercent / 100)) : null,
    breakEvenPrice: i.expectedCustomers > 0 ? perUnit((i.variableCostPerUnit + i.fixedCostMonthly / i.expectedCustomers) / (1 - i.paymentFeePercent / 100)) : null,
    undefinedMetricsNote: 'A null metric is unavailable or cannot be reached with these costs. It is not zero. LTV assumes constant contribution per billing period, no discounting, refunds or expansion. Profit excludes acquisition spend and tax.',
    label: 'ASSUMPTION' as const,
  }
  const priceScenarios = [0.6, 0.8, 1, 1.2, 1.5].map(multiplier => {
    const price = i.sellingPrice * multiplier
    // Constant elasticity is a founder-controlled assumption, never measured demand.
    const estimatedCustomers = Math.round(i.expectedCustomers / Math.pow(multiplier, i.demandElasticity))
    const margin = price * (1 - i.paymentFeePercent / 100) - i.variableCostPerUnit
    return {
      label: multiplier === 1 ? 'Base price' : `${Math.round(multiplier * 100)}% of base price`,
      price: perUnit(price), estimatedCustomers, revenue: round(price * estimatedCustomers), contributionMargin: perUnit(margin),
      profit: round(margin * estimatedCustomers - i.fixedCostMonthly),
      breakEvenUnits: margin > 0 ? Math.ceil(i.fixedCostMonthly / margin) : null,
      label2: 'ASSUMPTION' as const,
    }
  })
  const volumeScenarios = [0.6, 0.8, 1, 1.2, 1.5].map(multiplier => {
    const customers = Math.round(i.expectedCustomers * multiplier)
    return { label: `${Math.round(multiplier * 100)}% of base volume`, customers,
      revenue: round(i.sellingPrice * customers), profit: round(contributionMargin * customers - i.fixedCostMonthly) }
  })
  const sensitivityMatrix = [-20, -10, 0, 10, 20].map(priceChange => [-20, -10, 0, 10, 20].map(volumeChange => {
    const price = i.sellingPrice * (1 + priceChange / 100)
    const customers = Math.round(i.expectedCustomers * (1 + volumeChange / 100))
    return { priceChange, volumeChange, profit: round((price * (1 - i.paymentFeePercent / 100) - i.variableCostPerUnit) * customers - i.fixedCostMonthly) }
  }))
  return { computedMetrics, scenarios: priceScenarios, volumeScenarios, sensitivityMatrix,
    calculationAssumptions: { methodVersion: 'pricing_v2', currency: 'INR', period: 'Monthly', billingModel: i.billingModel,
      demandElasticity: i.demandElasticity, demandModel: 'Constant elasticity hypothesis, not observed demand',
      paymentFeePercent: i.paymentFeePercent, taxAndAcquisitionSpendIncluded: false } }
}

const savedNumber = z.number().finite().min(-MAX_CALCULATED_VALUE).max(MAX_CALCULATED_VALUE)
const savedCount = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)
const savedMetric = savedNumber.nullable()
const savedPricingCalculation = z.object({
  computedMetrics: z.object({
    contributionMargin: savedNumber, contributionMarginPct: savedNumber, grossMarginPct: savedNumber, feePerUnit: savedNumber,
    markupPct: savedMetric, markupNote: z.string(), breakEvenUnits: savedCount.nullable(), breakEvenRevenue: savedMetric,
    revenue: savedNumber, operatingProfit: savedNumber, ltv: savedNumber, ltvCacRatio: savedMetric, cacPayback: savedMetric,
    contributionAfterAcquisition: savedNumber, cacPaybackNote: z.string(), discountBreakEven: savedCount.nullable(),
    discountedPrice: savedNumber, discountedMargin: savedNumber, discountedRevenue: savedNumber, discountedOperatingProfit: savedNumber,
    firstMonthProfitAfterAcquisition: savedNumber, discountVolumeLiftRequired: savedMetric, requiredVisitors: savedCount.nullable(),
    breakEvenPrice: savedMetric, undefinedMetricsNote: z.string(), label: z.literal('ASSUMPTION'),
  }).passthrough(),
  scenarios: z.array(z.object({ label: z.string(), price: savedNumber, estimatedCustomers: savedCount, revenue: savedNumber,
    contributionMargin: savedNumber, profit: savedNumber, breakEvenUnits: savedCount.nullable(), label2: z.literal('ASSUMPTION') })).length(5),
  volumeScenarios: z.array(z.object({ label: z.string(), customers: savedCount, revenue: savedNumber, profit: savedNumber })).length(5),
  sensitivityMatrix: z.array(z.array(z.object({ priceChange: savedNumber, volumeChange: savedNumber, profit: savedNumber })).length(5)).length(5),
  calculationAssumptions: z.object({ methodVersion: z.string().optional(), currency: z.literal('INR'), period: z.literal('Monthly'),
    billingModel: z.enum(['recurring','one_time']), demandElasticity: savedNumber, demandModel: z.string(), paymentFeePercent: savedNumber,
    taxAndAcquisitionSpendIncluded: z.boolean() }),
})

/** A complete saved calculation is an artifact, not a request to run the
 * newest formula. Local input edits explicitly return to calculatePricing. */
export function pricingCalculationSnapshot(saved: unknown): ReturnType<typeof calculatePricing> | null {
  const parsed = savedPricingCalculation.safeParse(saved)
  return parsed.success ? parsed.data as ReturnType<typeof calculatePricing> : null
}

const crowdfundingInputFields = z.object({
  ideaId: z.string().uuid(), fundingGoal: amount.positive().int().max(2_147_483_647),
  sourceReportId: SourceReportIdSchema,
  ...PlanningArtifactSelectionSchema.shape,
  projectDescription: z.string().trim().min(20).max(8000),
  category: z.string().trim().min(1).max(120), country: z.string().trim().min(1).max(120),
  preLaunchCommunitySize: count, socialFollowers: count, emailListSize: count,
  campaignDurationDays: z.number().int().min(1).max(60), rewardTiers: z.number().int().min(1).max(20),
  lowestReward: amount.positive(), averageReward: amount.positive(), highestReward: amount.positive(),
  hasVideo: z.boolean(), marketingBudget: amount,
  currency: z.enum(['USD', 'INR', 'GBP', 'EUR', 'CAD', 'AUD']).default('USD'),
  expectedVisitors: count.default(0), conversionRatePercent: percent.default(3.5),
  platformFeePercent: percent.max(30).default(5), processingFeePercent: percent.max(30).default(4),
  processingFeePerBacker: amount.default(0), rewardCostPerBacker: amount.default(0),
  shippingCostPerBacker: amount.default(0), productionFixedCost: amount.default(0),
  contingencyPercent: percent.default(10), allOrNothing: z.boolean().default(true),
})
export type CrowdfundingInputs = z.infer<typeof crowdfundingInputFields>
export const CrowdfundingInputSchema = crowdfundingInputFields.superRefine((i, ctx) => {
  if (i.lowestReward > i.averageReward || i.averageReward > i.highestReward) ctx.addIssue({ code: 'custom', path: ['averageReward'], message: 'Average reward must be between the lowest and highest rewards.' })
  if (i.platformFeePercent + i.processingFeePercent >= 100) ctx.addIssue({ code: 'custom', path: ['processingFeePercent'], message: 'Combined fees must be below 100%.' })
  for (const issue of planningCalculationIssues(calculateCampaign(i)).slice(0, 8)) ctx.addIssue({ code: 'custom', path: ['averageReward'], message: `${issue.message} (${issue.path.join('.')})` })
})

export function calculateCampaign(i: CrowdfundingInputs) {
  const feeRate = (i.platformFeePercent + i.processingFeePercent) / 100
  const costPerBacker = i.rewardCostPerBacker + i.shippingCostPerBacker + i.processingFeePerBacker
  const contributionPerBacker = i.averageReward * (1 - feeRate) - costPerBacker
  const requiredBackers = Math.ceil(i.fundingGoal / i.averageReward)
  const grossPledgesAtGoal = requiredBackers * i.averageReward
  const costsAtGoal = requiredBackers * (i.rewardCostPerBacker + i.shippingCostPerBacker) + i.productionFixedCost + i.marketingBudget
  const reserveAtGoal = costsAtGoal * i.contingencyPercent / 100
  const goalNetSurplus = grossPledgesAtGoal * (1 - feeRate) - requiredBackers * i.processingFeePerBacker - costsAtGoal - reserveAtGoal
  const bufferedMargin = i.averageReward * (1 - feeRate) - i.processingFeePerBacker - (i.rewardCostPerBacker + i.shippingCostPerBacker) * (1 + i.contingencyPercent / 100)
  const minimumViableBackers = bufferedMargin > 0 ? Math.ceil((i.productionFixedCost + i.marketingBudget) * (1 + i.contingencyPercent / 100) / bufferedMargin) : null
  const scenarios = Object.fromEntries(([['conservative', 0.5], ['base', 1], ['optimistic', 1.5]] as const).map(([label, multiplier]) => {
    const conversion = Math.min(100, i.conversionRatePercent * multiplier)
    const backers = Math.floor(i.expectedVisitors * conversion / 100)
    const grossPledges = backers * i.averageReward
    // Settlement/display rounding cannot turn a below-goal campaign into a
    // funded one. Use the same unrounded pledges for eligibility and costs.
    const amountRaised = round(grossPledges)
    const goalReached = grossPledges >= i.fundingGoal
    const collected = !i.allOrNothing || goalReached ? grossPledges : 0
    const fees = collected * feeRate + (collected > 0 ? backers * i.processingFeePerBacker : 0)
    const fulfillment = collected > 0 ? backers * (i.rewardCostPerBacker + i.shippingCostPerBacker) + i.productionFixedCost : 0
    const reserve = (fulfillment + i.marketingBudget) * i.contingencyPercent / 100
    return [label, { backers, amountRaised, fundingPercent: round(amountRaised / i.fundingGoal * 100),
      conversionRatePercent: round(conversion), goalReached, collected: round(collected), fees: round(fees),
      fulfillmentCost: round(fulfillment), contingencyReserve: round(reserve),
      netProceeds: round(collected - fees - fulfillment - i.marketingBudget - reserve), label: 'ASSUMPTION' as const }]
  })) as Record<'conservative' | 'base' | 'optimistic', { backers: number; amountRaised: number; fundingPercent: number; conversionRatePercent: number; goalReached: boolean; collected: number; fees: number; fulfillmentCost: number; contingencyReserve: number; netProceeds: number; label: 'ASSUMPTION' }>
  const warnings = [
    ...(i.expectedVisitors === 0 ? ['No campaign visitor forecast was supplied; scenario pledges are zero. Audience lists are not added together because they may overlap.'] : []),
    ...(i.rewardCostPerBacker === 0 || i.shippingCostPerBacker === 0 ? ['Reward production or shipping is entered as zero. Confirm these costs before interpreting net proceeds.'] : []),
    ...(goalNetSurplus < 0 ? ['The minimum whole-backer pledges reaching the funding goal do not cover the entered fees, fulfillment, marketing and reserve.'] : []),
    ...(contributionPerBacker <= 0 ? ['Each additional reward loses money at the entered pledge and costs.'] : []),
    'Fee percentages are editable assumptions. Confirm platform eligibility, local processing fees, tax and shipping treatment before launch.',
  ]
  // Tier-specific costs and demand were not entered. Show the average reward
  // economics rather than letting a model invent a tier mix or omit fees.
  const averageVariableCost = costPerBacker + i.averageReward * feeRate
  const rewardEconomics = averageVariableCost > 0 ? [{ tier: 'Entered average reward', cost: round(averageVariableCost), revenue: i.averageReward,
    roi: round(contributionPerBacker / averageVariableCost * 100),
    recommendation: 'Per-backer return on entered reward, shipping and payment costs; excludes fixed setup, marketing and contingency. Supply tier-specific costs and demand before allocating backers to rewards.' }] : []
  return { scenarios, warnings, rewardEconomics, computedMetrics: {
    requiredBackers, requiredVisitors: i.conversionRatePercent > 0 ? Math.ceil(requiredBackers / (i.conversionRatePercent / 100)) : null,
    marketingCostPerBacker: requiredBackers > 0 ? round(i.marketingBudget / requiredBackers) : null,
    contributionPerBacker: perUnit(contributionPerBacker), goalNetSurplus: round(goalNetSurplus), grossPledgesAtGoal: round(grossPledgesAtGoal),
    feesAtGoal: round(grossPledgesAtGoal * feeRate + requiredBackers * i.processingFeePerBacker),
    fulfillmentAtGoal: round(costsAtGoal - i.marketingBudget), reserveAtGoal: round(reserveAtGoal),
    minimumViableGoal: minimumViableBackers === null ? null : round(minimumViableBackers * i.averageReward),
    conversionRatePercent: i.conversionRatePercent, label: 'ASSUMPTION' as const,
  }, calculationAssumptions: { methodVersion: 'campaign_v2', currency: i.currency, fundingModel: i.allOrNothing ? 'All or nothing' : 'Keep what you raise',
    audienceDeduplicated: false, taxIncluded: false, feeBasis: 'Percentage of collected pledges plus fee per collected backer',
    goalBasis: 'Minimum whole backers reaching the stated goal, all pledging the entered average reward; fees, delivery and surplus use those same gross pledges.',
    scenarioBasis: 'Entered visitors × conversion hypothesis (0.5× / 1× / 1.5×); no statistical success probability' } }
}

const savedCampaignScenarios = z.object(Object.fromEntries(['conservative', 'base', 'optimistic'].map(key => [key,
  z.object({ fundingPercent: z.number().finite().min(0), backers: count, amountRaised: z.number().finite().min(0) }).passthrough(),
])))

const savedCampaignEconomics = z.object({
  scenarios: z.object(Object.fromEntries(['conservative','base','optimistic'].map(key => [key, z.object({
    backers: savedCount, amountRaised: savedNumber, fundingPercent: savedNumber, conversionRatePercent: savedNumber,
    goalReached: z.boolean(), collected: savedNumber, fees: savedNumber, fulfillmentCost: savedNumber,
    contingencyReserve: savedNumber, netProceeds: savedNumber, label: z.literal('ASSUMPTION'),
  })]))),
  computedMetrics: z.object({ requiredBackers: savedCount, requiredVisitors: savedCount.nullable(), marketingCostPerBacker: savedMetric,
    contributionPerBacker: savedNumber, goalNetSurplus: savedNumber, grossPledgesAtGoal: savedNumber, feesAtGoal: savedNumber,
    fulfillmentAtGoal: savedNumber, reserveAtGoal: savedNumber, minimumViableGoal: savedMetric, conversionRatePercent: savedNumber, label: z.literal('ASSUMPTION') }),
  warnings: z.array(z.string()),
  calculationAssumptions: z.object({ methodVersion: z.string().optional(), currency: z.string(), fundingModel: z.string(),
    audienceDeduplicated: z.boolean(), taxIncluded: z.boolean(), feeBasis: z.string(), goalBasis: z.string(), scenarioBasis: z.string() }),
})
export function campaignEconomicsSnapshot(saved: unknown): Pick<ReturnType<typeof calculateCampaign>, 'scenarios' | 'computedMetrics' | 'warnings' | 'calculationAssumptions'> | null {
  const parsed = savedCampaignEconomics.safeParse(saved)
  return parsed.success ? parsed.data as Pick<ReturnType<typeof calculateCampaign>, 'scenarios' | 'computedMetrics' | 'warnings' | 'calculationAssumptions'> : null
}

/** The saved scenario snapshot is authoritative on reopening. Recalculation
 * is a fallback for legacy records without a complete saved scenario set. */
export function campaignChartScenarios(inputs: unknown, saved: unknown) {
  const parsedSaved = savedCampaignScenarios.safeParse(saved)
  if (parsedSaved.success) return parsedSaved.data as Record<'conservative' | 'base' | 'optimistic', { fundingPercent: number; backers: number; amountRaised: number }>
  const parsedInputs = CrowdfundingInputSchema.safeParse(inputs)
  if (parsedInputs.success) return calculateCampaign(parsedInputs.data).scenarios
  return null
}
