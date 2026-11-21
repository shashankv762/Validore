import { describe, expect, it } from 'vitest'
import { pricingEconomicScores } from '@/lib/planning/pricing-scores'
import { calculatePricing, PricingInputSchema } from '@/lib/planning/economics'
const input = PricingInputSchema.parse({ ideaId: '11111111-1111-4111-8111-111111111111', sellingPrice: 1000, expectedCustomers: 100,
  variableCostPerUnit: 300, fixedCostMonthly: 50000, discountPercent: 10, conversionRatePercent: 3.5, estimatedCac: 500, retentionMonths: 18, paymentFeePercent: 20 })
describe('shared pricing economic scores', () => {
  it('scores fee-adjusted contribution rather than the higher gross margin', () => {
    const metrics = calculatePricing(input).computedMetrics
    expect(metrics).toMatchObject({ grossMarginPct: 70, contributionMarginPct: 50 })
    expect(pricingEconomicScores(metrics, input.expectedCustomers).cmScore).toBe(13)
  })
  it('keeps an empty customer forecast and unknown acquisition cost finite and unmeasured', () => {
    const metrics = calculatePricing({ ...input, fixedCostMonthly: 0, expectedCustomers: 0, estimatedCac: 0 }).computedMetrics
    expect(metrics.breakEvenUnits).toBe(0)
    expect(pricingEconomicScores(metrics, 0)).toEqual({ cmScore: 13, beScore: 0, cacLtvScore: 0 })
  })
})
