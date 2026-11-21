export const CREDIT_COSTS = {
  LITE_VALIDATION: 50,
  DEEP_VALIDATION: 300,
  LEAN_CANVAS: 200,
  CROWDFUNDING: 500,
  PITCH_DECK: 800,
  PRICING: 250,
  CUSTOMER_EVIDENCE: 20,
} as const

export const TIER_MONTHLY_CREDITS = {
  free: 0,
  premium: 1500,
  max_premium: 4500,
} as const

// Signup and daily credits carry forward; Free has no automatic monthly grant.
export const STARTING_CREDITS = 200
export const DAILY_LOGIN_CREDITS = 10
