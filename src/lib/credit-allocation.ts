import { CREDIT_COSTS } from './credit-costs'

export type CreditBalances = { creditBalance: number; purchasedCredits: number; rewardCredits?: number }

export function totalCredits(user: CreditBalances): number {
  return Math.max(0, user.creditBalance) + Math.max(0, user.purchasedCredits) + Math.max(0, user.rewardCredits ?? 0)
}

/** Use expiring plan credits first, then earned credits, then paid top-ups. */
export function allocateCredits(user: CreditBalances, cost: number, rewardOnly = false) {
  const availableRewards = Math.max(0, user.rewardCredits ?? 0)
  if (!Number.isSafeInteger(cost) || cost < 1) throw new Error('Invalid credit cost')
  if ((rewardOnly ? availableRewards : totalCredits(user)) < cost) return null
  const monthly = rewardOnly ? 0 : Math.min(Math.max(0, user.creditBalance), cost)
  const reward = Math.min(availableRewards, cost - monthly)
  const purchased = cost - monthly - reward
  return { monthly, reward, purchased }
}

export function canFundExtraLite(user: CreditBalances & { tier: string }): boolean {
  return user.tier === 'free' && (user.rewardCredits ?? 0) >= CREDIT_COSTS.LITE_VALIDATION
}

/** Extra Free-plan validations must be funded entirely by earned ad credits. */
export function affordableValidations(user: CreditBalances & { tier: string; validationsThisMonth: number }, cost: number, limit: number) {
  const included = Math.min(Math.floor(totalCredits(user) / cost), Math.max(0, limit - user.validationsThisMonth))
  if (user.tier !== 'free') return included
  const rewards = Math.max(0, user.rewardCredits ?? 0)
  const rewardsForIncluded = Math.min(rewards, Math.max(0, included * cost - Math.max(0, user.creditBalance)))
  return included + Math.floor((rewards - rewardsForIncluded) / cost)
}
