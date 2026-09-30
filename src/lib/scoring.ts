import { z } from 'zod'

// ============ STARTUP VALIDATION SCORE (100 pts) ============
export const STARTUP_WEIGHTS = {
  problemValidation: 20,
  customerValidation: 20,
  marketOpportunity: 15,
  competitiveDifferentiation: 10,
  willingnessToPay: 15,
  businessModel: 10,
  financialFeasibility: 5,
  executionFeasibility: 5,
} as const

export function calculateStartupValidationScore(
  scores: typeof STARTUP_WEIGHTS
): number {
  return Object.values(scores).reduce((a, b) => a + b, 0)
}

export function clampScore(score: number, maxWeight: number): number {
  return Math.max(0, Math.min(score, maxWeight))
}

export const EvidenceStrength = z.enum(['WEAK', 'MODERATE', 'STRONGER'])
export type EvidenceStrength = z.infer<typeof EvidenceStrength>

export const ValidationDecision = z.enum(['GO', 'MODIFY', 'TEST_FURTHER', 'NO_GO'])
export type ValidationDecision = z.infer<typeof ValidationDecision>

export const CrowdfundingDecision = z.enum([
  'READY_TO_LAUNCH', 'LAUNCH_AFTER_IMPROVEMENTS', 'TEST_FURTHER', 'MAJOR_REWORK_REQUIRED'
])
export type CrowdfundingDecision = z.infer<typeof CrowdfundingDecision>

// ============ BUSINESS MODEL VALIDATION SCORE (100 pts) ============
export const BM_WEIGHTS = {
  problemEvidence: 15,
  customerEvidence: 15,
  valueProposition: 10,
  solutionFeasibility: 10,
  channelFeasibility: 10,
  revenueValidation: 10,
  costFeasibility: 10,
  unitEconomics: 10,
  competitivePosition: 5,
  executionReadiness: 5,
} as const

// ============ CAMPAIGN PERFORMANCE SCORE (100 pts) ============
export const CAMPAIGN_WEIGHTS = {
  problemAndProductAppeal: 15,
  fundingGoalFeasibility: 15,
  preLaunchAudience: 15,
  campaignPageQuality: 10,
  rewardStrategy: 10,
  pricingEconomics: 10,
  marketingReadiness: 10,
  founderCredibility: 5,
  earlyMomentumPlan: 5,
  operationalReadiness: 5,
} as const

export function getCampaignClassificationBand(score: number): {
  band: string
  label: string
  disclaimer: string
} {
  const disclaimer =
    'These are educational decision-support categories, not statistically guaranteed probabilities of success.'
  if (score >= 80) return { band: '80-100', label: 'Strong Readiness', disclaimer }
  if (score >= 65) return { band: '65-79', label: 'Promising but Improvements Required', disclaimer }
  if (score >= 50) return { band: '50-64', label: 'Significant Risk', disclaimer }
  return { band: '<50', label: 'Major Rework Required', disclaimer }
}

// ============ PITCH DECK QUALITY SCORE (100 pts) ============
export const PITCH_WEIGHTS = {
  problemClarity: 10,
  solutionStrength: 10,
  customerEvidence: 10,
  marketOpportunity: 10,
  businessModel: 10,
  competitivePositioning: 10,
  gtmStrategy: 10,
  financialLogic: 10,
  teamExecutionReadiness: 10,
  presentationQuality: 10,
} as const

// ============ PRICING STRATEGY SCORE (100 pts) ============
export const PRICING_WEIGHTS = {
  customerWillingnessToPay: 20,
  customerValue: 15,
  competitivePosition: 10,
  contributionMargin: 15,
  breakEvenFeasibility: 10,
  cacLtvEconomics: 10,
  demandPotential: 10,
  scalability: 5,
  pricingSimplicity: 5,
} as const

// Validate all weight tables sum to 100
export function validateWeightTable(weights: Record<string, number>): boolean {
  return Object.values(weights).reduce((a, b) => a + b, 0) === 100
}
