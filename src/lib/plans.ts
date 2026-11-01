import { CREDIT_COSTS, TIER_MONTHLY_CREDITS } from './credit-costs'

export type PlanTier = keyof typeof TIER_MONTHLY_CREDITS

export const PLAN_CATALOG = {
  free: { name: 'Free', monthlyPriceUsd: 0, monthlyCredits: TIER_MONTHLY_CREDITS.free, validationLimit: 2, activeIdeaLimit: 1 },
  premium: { name: 'Premium', monthlyPriceUsd: 29, monthlyCredits: TIER_MONTHLY_CREDITS.premium, validationLimit: 15, activeIdeaLimit: 10 },
  max_premium: { name: 'Max Premium', monthlyPriceUsd: 79, monthlyCredits: TIER_MONTHLY_CREDITS.max_premium, validationLimit: 50, activeIdeaLimit: 100 },
} as const

export const CREDIT_ACTIONS = [
  { key: 'LITE_VALIDATION', name: 'Lite validation', cost: CREDIT_COSTS.LITE_VALIDATION, access: 'Free plan' },
  { key: 'DEEP_VALIDATION', name: 'Full validation', cost: CREDIT_COSTS.DEEP_VALIDATION, access: 'Premium and Max Premium' },
  { key: 'LEAN_CANVAS', name: 'AI Lean Canvas', cost: CREDIT_COSTS.LEAN_CANVAS, access: 'Premium and Max Premium' },
  { key: 'PRICING', name: 'Pricing simulator', cost: CREDIT_COSTS.PRICING, access: 'Premium and Max Premium' },
  { key: 'CROWDFUNDING', name: 'Crowdfunding analysis', cost: CREDIT_COSTS.CROWDFUNDING, access: 'Max Premium or a module credit' },
  { key: 'PITCH_DECK', name: 'Pitch deck', cost: CREDIT_COSTS.PITCH_DECK, access: 'Max Premium or a module credit' },
] as const

export function formatUsd(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount)
}
