import { PRICING_WEIGHTS, clampScore } from '@/lib/scoring'

/** The preview and saved analysis score the same fee-adjusted contribution.
 * Missing customer/acquisition denominators cannot establish feasibility. */
export function pricingEconomicScores(metrics: { contributionMarginPct: number; breakEvenUnits: number | null; ltvCacRatio: number | null }, expectedCustomers: number) {
  const cm = metrics.contributionMarginPct
  const cmScore = clampScore(cm >= 60 ? PRICING_WEIGHTS.contributionMargin : Math.round(cm / 60 * PRICING_WEIGHTS.contributionMargin), PRICING_WEIGHTS.contributionMargin)
  const be = metrics.breakEvenUnits
  const beScore = be !== null && Number.isFinite(be) && expectedCustomers > 0
    ? clampScore(be <= expectedCustomers * 0.5 ? PRICING_WEIGHTS.breakEvenFeasibility : Math.round((1 - be / (expectedCustomers * 2)) * PRICING_WEIGHTS.breakEvenFeasibility), PRICING_WEIGHTS.breakEvenFeasibility) : 0
  const ratio = metrics.ltvCacRatio
  const cacLtvScore = ratio !== null && Number.isFinite(ratio)
    ? clampScore(ratio >= 3 ? PRICING_WEIGHTS.cacLtvEconomics : Math.round(ratio / 3 * PRICING_WEIGHTS.cacLtvEconomics), PRICING_WEIGHTS.cacLtvEconomics) : 0
  return { cmScore, beScore, cacLtvScore }
}
