import type { PlanTier } from './plans'

/** Immutable normal-access budget captured with the validation's debit. */
export type ValidationEntitlementSnapshot = {
  version: 1
  tier: PlanTier
  ownerUnlimited: boolean
  maxTokensPerCall: number
  maxConcurrentRequests: number
  monthlyValidationLimit: number
  creditCost: number
  admittedAt: string
  validationWindowEndsAt: string | null
}
