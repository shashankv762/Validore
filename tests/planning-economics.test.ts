import { describe, expect, it } from 'vitest'
import { calculateCampaign, calculatePricing, pricingCalculationSnapshot, campaignEconomicsSnapshot, campaignChartScenarios, CrowdfundingInputSchema, PricingInputSchema, planningCalculationIssues } from '@/lib/planning/economics'
import { CANVAS_KEYS, normalizeCanvasConfidence, planningSources, preserveFounderMilestones, validateCanvasOutput, validatePitchOutput, validatePricingOutput } from '@/lib/planning/evidence'
import type { SearchResult } from '@/lib/ai/search'

const ideaId = '11111111-1111-4111-8111-111111111111'
const pricing = PricingInputSchema.parse({ ideaId, sellingPrice: 1000, expectedCustomers: 100, variableCostPerUnit: 300,
  fixedCostMonthly: 50000, discountPercent: 10, conversionRatePercent: 3.5, estimatedCac: 500, retentionMonths: 18 })
const campaign = CrowdfundingInputSchema.parse({ ideaId, fundingGoal: 50000, projectDescription: 'A real founder supplied campaign description.',
  category: 'Technology', country: 'United States', preLaunchCommunitySize: 1000, socialFollowers: 1000, emailListSize: 1000,
  campaignDurationDays: 30, rewardTiers: 3, lowestReward: 25, averageReward: 100, highestReward: 500,
  hasVideo: false, marketingBudget: 2000, expectedVisitors: 20000, rewardCostPerBacker: 30, shippingCostPerBacker: 10, productionFixedCost: 5000 })
const source: SearchResult = { title: 'Official pricing', url: 'https://example.com/pricing', content: 'Plan costs INR 1000 per month.', source: 'example.com', fetchedAt: '2026-11-14T00:00:00Z', retrievalKind: 'page' }

describe('one consistent pricing calculation path', () => {
  it('calculates base economics, discounts, visitor needs and the saved sensitivity center', () => {
    const result = calculatePricing(pricing)
    expect(result.computedMetrics).toMatchObject({ contributionMargin: 700, contributionMarginPct: 70,
      revenue: 100000, operatingProfit: 20000, breakEvenUnits: 72, ltv: 12600, ltvCacRatio: 25.2,
      discountBreakEven: 117, discountVolumeLiftRequired: 17, requiredVisitors: 2858 })
    expect(result.scenarios[2]).toMatchObject({ price: 1000, estimatedCustomers: 100, profit: 20000 })
    expect(result.sensitivityMatrix[2][2].profit).toBe(result.computedMetrics.operatingProfit)
  })
  it('includes fees and changes LTV with actual billing cadence', () => {
    const recurring = calculatePricing({ ...pricing, paymentFeePercent: 3 })
    const oneTime = calculatePricing({ ...pricing, paymentFeePercent: 3, billingModel: 'one_time' })
    expect(recurring.computedMetrics.contributionMargin).toBe(670)
    expect(oneTime.computedMetrics.ltv).toBe(670)
    expect(oneTime.computedMetrics.cacPayback).toBeNull()
    expect(oneTime.computedMetrics.contributionAfterAcquisition).toBe(170)
    expect(oneTime.computedMetrics.cacPaybackNote).toContain('one-time purchase')
    expect(recurring.computedMetrics.ltv).toBe(670 * 18)
    expect(recurring.sensitivityMatrix[2][2].profit).toBe(17000)
  })
  it('makes demand response explicit rather than fixing it invisibly', () => {
    expect(calculatePricing({ ...pricing, demandElasticity: 0 }).scenarios.every(row => row.estimatedCustomers === 100)).toBe(true)
    expect(calculatePricing({ ...pricing, demandElasticity: 2 }).scenarios[0].estimatedCustomers).toBe(278)
  })
  it('does not turn impossible economics or missing denominators into zero', () => {
    const result = calculatePricing({ ...pricing, variableCostPerUnit: 1200, estimatedCac: 0, conversionRatePercent: 0 })
    expect(result.computedMetrics).toMatchObject({ breakEvenUnits: null, breakEvenRevenue: null, cacPayback: null, ltvCacRatio: null, discountBreakEven: null, requiredVisitors: null })
    expect(JSON.stringify(result)).not.toMatch(/NaN|Infinity/)
    expect(calculatePricing({ ...pricing, variableCostPerUnit: 0 }).computedMetrics.markupPct).toBeNull()
  })
  it('rejects nonfinite, fractional customer counts and negative financial inputs', () => {
    for (const patch of [{ sellingPrice: Infinity }, { expectedCustomers: 2.5 }, { demandElasticity: -1 }, { variableCostPerUnit: -1 }]) expect(PricingInputSchema.safeParse({ ...pricing, ...patch }).success).toBe(false)
  })
  it.each([
    { sellingPrice: 1e-310, variableCostPerUnit: 0, fixedCostMonthly: 1e9 },
    { sellingPrice: 1e9, expectedCustomers: 10_000_000 },
    { conversionRatePercent: 1e-310 },
    { estimatedCac: 1e-310 },
    { sellingPrice: 1, variableCostPerUnit: 1 - Number.EPSILON, fixedCostMonthly: 1e9 },
  ])('rejects finite inputs with unsupported derived money, ratios or counts: %j', patch => {
    const result = PricingInputSchema.safeParse({ ...pricing, ...patch })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues.some(issue => issue.message.includes('supported numeric range'))).toBe(true)
  })
  it('preserves legitimate small per-unit amounts when their derived scenario values are supported', () => {
    const input = PricingInputSchema.parse({ ...pricing, sellingPrice: 0.0001, variableCostPerUnit: 0.000001,
      fixedCostMonthly: 1, estimatedCac: 0.00001, expectedCustomers: 1_000_000 })
    expect(input.variableCostPerUnit).toBe(0.000001)
    const calculated = calculatePricing(input)
    expect(calculated.computedMetrics.revenue).toBe(100)
    expect(calculated.computedMetrics.contributionMargin).toBe(0.000099)
    expect(calculated.scenarios[2].price).toBe(0.0001)
    expect(planningCalculationIssues(calculatePricing(input))).toEqual([])
  })
  it('restores complete historical pricing calculations without applying the current input formula', () => {
    const saved = calculatePricing({ ...pricing, sellingPrice: 1500 })
    const reopened = pricingCalculationSnapshot({ inputs: pricing, ...saved })
    expect(reopened).toEqual(saved)
    expect(reopened!.computedMetrics.operatingProfit).not.toBe(calculatePricing(pricing).computedMetrics.operatingProfit)
    expect(pricingCalculationSnapshot({ ...saved, computedMetrics: { ...saved.computedMetrics, operatingProfit: NaN } })).toBeNull()
    expect(pricingCalculationSnapshot({ computedMetrics: { revenue: 1000 } })).toBeNull()
  })
})

describe('campaign gross pledges versus delivery cash', () => {
  it('uses saved input calculations for the chart and never fills missing legacy data with invented pledges', () => {
    const expected = calculateCampaign(campaign).scenarios
    expect(campaignChartScenarios(campaign, { base: { amountRaised: 999999 } })).toEqual(expected)
    expect(campaignChartScenarios(undefined, expected)?.base.amountRaised).toBe(expected.base.amountRaised)
    expect(campaignChartScenarios(undefined, undefined)).toBeNull()
    expect(campaignChartScenarios({ fundingGoal: 50000 }, { conservative: { amountRaised: NaN } })).toBeNull()
  })
  it('preserves a complete historical campaign scenario snapshot when current input calculations differ', () => {
    const saved = calculateCampaign(campaign)
    expect(campaignChartScenarios({ ...campaign, averageReward: 200 }, saved.scenarios)).toEqual(saved.scenarios)
    expect(campaignEconomicsSnapshot(saved)).toMatchObject({ scenarios: saved.scenarios, computedMetrics: saved.computedMetrics })
    expect(campaignEconomicsSnapshot({ scenarios: saved.scenarios })).toBeNull()
  })
  it('calculates collected fees, delivery, reserve and money left from entered costs', () => {
    const result = calculateCampaign(campaign)
    expect(result.computedMetrics).toMatchObject({ requiredBackers: 500, requiredVisitors: 14286, goalNetSurplus: 15800, minimumViableGoal: 16400 })
    expect(result.scenarios.base).toMatchObject({ backers: 700, amountRaised: 70000, collected: 70000, fees: 6300, fulfillmentCost: 33000, contingencyReserve: 3500, netProceeds: 25200 })
    expect(result.scenarios.conservative).toMatchObject({ backers: 350, amountRaised: 35000, collected: 0, netProceeds: -2200 })
  })
  it.each([40, 250])('uses the same attainable whole-backer proceeds for a nondivisible goal of %s', fundingGoal => {
    const requiredBackers = Math.ceil(fundingGoal / 100)
    const result = calculateCampaign({ ...campaign, fundingGoal, expectedVisitors: 100, conversionRatePercent: requiredBackers,
      marketingBudget: 0, productionFixedCost: 0 })
    const goal = result.computedMetrics
    expect(goal.grossPledgesAtGoal).toBe(requiredBackers * 100)
    expect(goal.feesAtGoal).toBe(result.scenarios.base.fees)
    expect(goal.fulfillmentAtGoal).toBe(result.scenarios.base.fulfillmentCost)
    expect(goal.reserveAtGoal).toBe(result.scenarios.base.contingencyReserve)
    expect(goal.goalNetSurplus).toBe(result.scenarios.base.netProceeds)
    expect(goal.goalNetSurplus).toBe(requiredBackers * 47)
    expect(result.calculationAssumptions.goalBasis).toContain('Minimum whole backers')
    expect(result.warnings.join(' ')).not.toContain('do not cover')
  })
  it('rejects positive tiny pledge/conversion inputs that overflow derived counts', () => {
    for (const patch of [{ lowestReward: 1e-310, averageReward: 1e-310 }, { conversionRatePercent: 1e-310 }]) {
      expect(CrowdfundingInputSchema.safeParse({ ...campaign, ...patch }).success).toBe(false)
    }
  })
  it('models keep-what-you-raise obligations when below goal', () => {
    expect(calculateCampaign({ ...campaign, allOrNothing: false }).scenarios.conservative).toMatchObject({ collected: 35000, fulfillmentCost: 19000, fees: 3150, netProceeds: 8750 })
  })
  it('does not use display rounding to clear an all-or-nothing funding goal', () => {
    const result = calculateCampaign({ ...campaign, fundingGoal: 1, lowestReward: 0.3333, averageReward: 0.3333,
      expectedVisitors: 100, conversionRatePercent: 3, marketingBudget: 0, productionFixedCost: 0,
      rewardCostPerBacker: 0.1, shippingCostPerBacker: 0, contingencyPercent: 0 })
    expect(result.computedMetrics.requiredBackers).toBe(4)
    expect(result.scenarios.base).toMatchObject({ backers: 3, amountRaised: 1, goalReached: false,
      collected: 0, fees: 0, fulfillmentCost: 0, netProceeds: 0 })
  })
  it('preserves a small positive reward contribution instead of flagging it as zero', () => {
    const result = calculateCampaign({ ...campaign, lowestReward: 0.01, averageReward: 0.01,
      rewardCostPerBacker: 0.005, shippingCostPerBacker: 0, processingFeePerBacker: 0 })
    expect(result.computedMetrics.contributionPerBacker).toBeCloseTo(0.0041)
    expect(result.warnings.join(' ')).not.toContain('loses money')
  })
  it('never sums overlapping audiences or manufactures a forecast', () => {
    const result = calculateCampaign({ ...campaign, expectedVisitors: 0 })
    expect(result.scenarios.base.backers).toBe(0)
    expect(result.warnings.join(' ')).toContain('may overlap')
    expect(result.calculationAssumptions.scenarioBasis).toContain('no statistical success probability')
  })
  it('reports reward losses and impossible minimum goal, including zero conversion', () => {
    const result = calculateCampaign({ ...campaign, rewardCostPerBacker: 150, conversionRatePercent: 0 })
    expect(result.computedMetrics.minimumViableGoal).toBeNull()
    expect(result.computedMetrics.requiredVisitors).toBeNull()
    expect(result.warnings.join(' ')).toContain('loses money')
    expect(JSON.stringify(result)).not.toMatch(/NaN|Infinity/)
  })
  it('validates reward ordering, currency and integer campaign counts', () => {
    for (const patch of [{ averageReward: 1000 }, { lowestReward: 110 }, { rewardTiers: 2.2 }, { currency: 'invented' }]) expect(CrowdfundingInputSchema.safeParse({ ...campaign, ...patch }).success).toBe(false)
  })
})

describe('planning evidence and founder facts', () => {
  const block = { content: 'Specific hypothesis', confidenceScore: 95, label: 'STRONGER_EVIDENCE', keyAssumptions: ['A customer will pay'], sourceUrls: [source.url], evidenceNote: 'External research context' }
  it('recomputes canvas confidence and caps unsupported block claims', () => {
    const canvas = { ...Object.fromEntries(CANVAS_KEYS.map(key => [key, block])), overallConfidenceScore: 99 } as Record<typeof CANVAS_KEYS[number], typeof block> & { overallConfidenceScore: number }
    expect(normalizeCanvasConfidence(canvas, [source]).overallConfidenceScore).toBe(50)
    expect(normalizeCanvasConfidence(canvas, []).overallConfidenceScore).toBe(25)
    expect(normalizeCanvasConfidence(canvas, []).problem.label).toBe('ASSUMPTION')
    expect(validateCanvasOutput({ ...canvas, problem: { ...block, sourceUrls: ['https://invented.example'] } }, [source])[0].field).toBe('problem.sourceUrls')
  })
  it('requires a retrieved pricing page and preserves retrieval quality', () => {
    expect(validatePricingOutput({ competitorPrices: [{ source: source.url }] }, [source])).toEqual([])
    expect(validatePricingOutput({ competitorPrices: [{ source: source.url }] }, [{ ...source, retrievalKind: 'snippet' }])).toHaveLength(1)
    expect(planningSources([source, source])).toHaveLength(1)
  })
  it('rejects prices with the wrong currency, cadence or a copied seat-limit number', () => {
    const page = { ...source, content: 'Pro: INR 1,000 per month. Includes 3 seats. Enterprise: INR 10,000 per year.' }
    const check = (price: string) => validatePricingOutput({ competitorPrices: [{ source: source.url, price }] }, [page])
    expect(check('₹1,000 per month')).toEqual([])
    expect(check('INR 10,000 per year')).toEqual([])
    for (const price of ['USD 1000 per month', 'INR 1000 per year', 'INR 3 per month', 'Free']) expect(check(price)).toHaveLength(1)
  })
  it('uses the supplied retrieval date instead of pretending a cached page was rechecked', () => {
    expect(validatePricingOutput({ competitorPrices: [{ source: source.url, price: 'INR 1000 per month', dateChecked: '2026-11-14' }] }, [source])).toEqual([])
    expect(validatePricingOutput({ competitorPrices: [{ source: source.url, dateChecked: '2026-11-15' }] }, [source])[0].field).toBe('competitorPrices.0.dateChecked')
  })
  it('does not borrow the preceding offer cadence for a new amount in the same pricing passage', () => {
    for (const content of ['INR 100 per month. Pro INR 200 per year.', 'INR 100 per month, Pro INR 200 per year.']) {
      const page = { ...source, content }
      expect(validatePricingOutput({ competitorPrices: [{ source: source.url, price: 'INR 200 per month' }] }, [page])).toHaveLength(1)
      expect(validatePricingOutput({ competitorPrices: [{ source: source.url, price: 'INR 200 per year' }] }, [page])).toEqual([])
    }
  })
  it('keeps achieved status only for the exact founder-reported milestone', () => {
    const result = preserveFounderMilestones({ roadmap: [{ milestones: [
      { milestone: 'Prototype', status: 'ACHIEVED' as const }, { milestone: 'Launch', status: 'ACHIEVED' as const }, { milestone: 'Invented customers', status: 'ACHIEVED' as const },
    ] }] }, [{ milestone: 'Prototype', status: 'ACHIEVED' }, { milestone: 'Launch', status: 'PLANNED' }])
    expect(result.roadmap[0].milestones.map(item => item.status)).toEqual(['ACHIEVED', 'PLANNED', 'PLANNED'])
  })
  it('rejects duplicate slide numbering and repetitive investor questions', () => {
    const slide = { slideNumber: 1, title: 'Purpose', content: 'Message', keyPoints: ['Point'], speakerNotes: 'Notes' }
    expect(validatePitchOutput({ slides: [slide, slide], investorQa: [{ question: 'Why?', answer: 'Because' }, { question: ' why? ', answer: 'Because' }] }, [])).toHaveLength(2)
  })
})
