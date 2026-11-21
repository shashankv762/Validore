import { buildFinancialProjection, computeUnitEconomics, type UnitAssumptions } from '@/lib/financial'
import type { PlanningBasis } from '../schemas'

type ScenarioInputs = Partial<Pick<UnitAssumptions, 'estimatedSellingPrice' | 'estimatedCACMonthly' | 'estimatedChurnRate'>>

function summarize(assumptions: UnitAssumptions) {
  const unitEconomics = computeUnitEconomics(assumptions)
  const projection = buildFinancialProjection(assumptions)
  const currency = String(unitEconomics.currency)
  const digits = new Intl.NumberFormat('en-US', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2
  const round = (value: number) => Number(value.toFixed(digits))
  let cumulative = 0
  let lowestCumulative = 0
  for (const month of projection) {
    cumulative = round(cumulative + month.profitLoss)
    lowestCumulative = Math.min(lowestCumulative, cumulative)
  }
  const months = [projection[0], projection[5], projection[11]].map(({ month, customers, newCustomers, churnedCustomers, revenue, costs, profitLoss }) =>
    ({ month, customers, newCustomers, churnedCustomers, revenue, costs, profitLoss }))
  return { unitEconomics, projection, summary: {
    currency, label: 'PROJECTION' as const, months,
    cumulativeOperatingResult: cumulative, largestCumulativeDeficit: Math.abs(lowestCumulative),
    contributionMargin: unitEconomics.contributionMargin, breakEvenCustomers: unitEconomics.breakEvenCustomers,
    ltvCacRatio: unitEconomics.ltvCacRatio, cacPaybackMonths: unitEconomics.cacPaybackMonths,
    monthlyAcquisitionGrowthRate: assumptions.estimatedMonthlyGrowthRate ?? 0, monthlyChurnRate: assumptions.estimatedChurnRate,
  } }
}

/** Arithmetic supplied before judgment, not inferred by the final model.
 * Sensitivity shocks are explicitly authored scenarios, never forecasts or
 * measured probability ranges. All use the same production calculator. */
export function buildFinancialReview(assumptions?: UnitAssumptions, planningBasis?: PlanningBasis) {
  if (!assumptions) return {
    computedUnitEconomics: { label: 'ASSUMPTION' } as Record<string, number | string | null>,
    financialProjection: [] as ReturnType<typeof buildFinancialProjection>,
    review: { status: 'unavailable' as const, limitation: 'The finance specialist did not complete. Financial outcomes remain unknown.' },
  }
  const base = summarize(assumptions)
  const stressTests: { scenario: string; changedInputs: ScenarioInputs }[] = [
    { scenario: 'Selling price 20% lower; all other inputs held constant', changedInputs: { estimatedSellingPrice: assumptions.estimatedSellingPrice * 0.8 } },
    { scenario: 'Acquisition cost per new customer 25% higher; all other inputs held constant', changedInputs: { estimatedCACMonthly: assumptions.estimatedCACMonthly * 1.25 } },
    { scenario: 'Monthly churn 50% higher, capped at 100%; all other inputs held constant', changedInputs: { estimatedChurnRate: Math.min(1, assumptions.estimatedChurnRate * 1.5) } },
  ]
  return {
    computedUnitEconomics: base.unitEconomics,
    financialProjection: base.projection,
    review: {
      status: 'available' as const, basis: 'Explicit finance-agent assumptions; not observed traction, conversion or retention.',
      base: base.summary,
      sensitivity: stressTests.map(({ scenario, changedInputs }) => ({ scenario, changedInputs, ...summarize({ ...assumptions, ...changedInputs }).summary })),
      ...(planningBasis ? { offerComparison: planningBasis.offer.amount !== null && planningBasis.offer.currency === base.summary.currency && planningBasis.offer.period === 'month'
        ? { status: 'comparable' as const, planId: planningBasis.id, offeredPrice: planningBasis.offer.amount,
          ...summarize({ ...assumptions, estimatedSellingPrice: planningBasis.offer.amount }).summary,
          note: 'Price comparison for the shared proposed offer, retaining every other operating-model assumption. The proposed research cohort is not treated as paying customers or observed sales.' }
        : { status: 'not_comparable' as const, planId: planningBasis.id,
          note: 'The proposed offer does not share the base monthly currency/unit. No recurring revenue or conversion is inferred; measure purchase frequency and matching costs before a comparable projection.' } } : {}),
      limitation: 'The sensitivity shocks are authored mechanical tests, not evidence-based forecasts or confidence intervals. Operating results assume immediate collections and exclude taxes, financing, payment delays and setup costs. A modeled cumulative deficit is not cash runway; no opening cash was supplied. Zero acquisition growth does not replace churned customers.',
    },
  }
}

export type FinancialReview = ReturnType<typeof buildFinancialReview>['review']
