import { describe, expect, it } from 'vitest'
import { buildFinancialReview } from '@/lib/validation/agents/finance-review'

const assumptions = { estimatedSellingPrice: 1500, estimatedVariableCost: 300, estimatedFixedCostMonthly: 50000,
  estimatedCACMonthly: 800, estimatedMonthlyCustomers: 50, estimatedChurnRate: 0.1, currency: 'INR' }

describe('deterministic financial review before judgment', () => {
  it('exposes cohort loss and acquisition outlay even when the assumed LTV:CAC ratio is attractive', () => {
    const result = buildFinancialReview(assumptions)
    expect(result.computedUnitEconomics.ltvCacRatio).toBe(15)
    expect(result.financialProjection[0]).toMatchObject({ customers: 50, revenue: 75000, acquisitionCost: 40000, profitLoss: -30000 })
    expect(result.financialProjection[1]).toMatchObject({ customers: 45, newCustomers: 0, profitLoss: 4000 })
    expect(result.review.status).toBe('available')
    if (result.review.status !== 'available') throw new Error('Review missing')
    expect(result.review.base.months.map(month => month.month)).toEqual([1, 6, 12])
    expect(result.review.base.months[2].customers).toBeLessThan(20)
    expect(result.review.base.cumulativeOperatingResult).toBeLessThan(-200000)
    expect(result.review.base.monthlyAcquisitionGrowthRate).toBe(0)
    expect(result.review.limitation).toContain('no opening cash was supplied')
  })

  it('labels sensitivity as authored scenarios, changing one explicit input at a time', () => {
    const original = structuredClone(assumptions)
    const result = buildFinancialReview(assumptions)
    if (result.review.status !== 'available') throw new Error('Review missing')
    expect(result.review.sensitivity).toHaveLength(3)
    const [price, cac, churn] = result.review.sensitivity
    expect(price).toMatchObject({ currency: 'INR', label: 'PROJECTION', changedInputs: { estimatedSellingPrice: 1200 }, contributionMargin: 900 })
    expect(cac).toMatchObject({ changedInputs: { estimatedCACMonthly: 1000 }, ltvCacRatio: 12 })
    expect(churn.monthlyChurnRate).toBeCloseTo(0.15)
    expect(result.review.limitation).toContain('not evidence-based forecasts or confidence intervals')
    expect(assumptions).toEqual(original)
  })

  it('preserves undefined LTV and impossible break-even instead of manufacturing positive viability', () => {
    const result = buildFinancialReview({ ...assumptions, estimatedVariableCost: 1600, estimatedChurnRate: 0 })
    expect(result.computedUnitEconomics).toMatchObject({ ltv: null, ltvCacRatio: null, breakEvenCustomers: null })
    expect(result.financialProjection.every(month => month.profitLoss < 0)).toBe(true)
  })

  it('keeps unavailable finance explicitly unknown and supplies no invented projections', () => {
    const result = buildFinancialReview()
    expect(result.review.status).toBe('unavailable')
    expect(result.financialProjection).toEqual([])
    expect(result.computedUnitEconomics).toEqual({ label: 'ASSUMPTION' })
  })
})
