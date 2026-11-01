import { describe, expect, it } from 'vitest'
import { allocateCredits, affordableValidations, canFundExtraLite, totalCredits } from '@/lib/credit-allocation'
import { actionAllowance, creditEntryDescription, creditOverview } from '@/lib/account-usage'

const user = { tier: 'free', creditBalance: 100, purchasedCredits: 1000, rewardCredits: 50, validationsThisMonth: 0 }

describe('earned credits and spending order', () => {
  it('uses plan credits before rewards, and rewards before paid credits', () => {
    expect(totalCredits(user)).toBe(1150)
    expect(allocateCredits(user, 125)).toEqual({ monthly: 100, reward: 25, purchased: 0 })
    expect(allocateCredits(user, 175)).toEqual({ monthly: 100, reward: 50, purchased: 25 })
    expect(allocateCredits(user, 1151)).toBeNull()
  })
  it('requires a whole Lite run of earned credits above the included limit', () => {
    expect(allocateCredits(user, 50, true)).toEqual({ monthly: 0, purchased: 0, reward: 50 })
    expect(allocateCredits({ ...user, rewardCredits: 49 }, 50, true)).toBeNull()
    expect(canFundExtraLite(user)).toBe(true)
    expect(canFundExtraLite({ ...user, tier: 'premium' })).toBe(false)
  })
  it('does not count the same rewards toward both included and extra runs', () => {
    expect(affordableValidations(user, 50, 2)).toBe(3)
    expect(affordableValidations({ ...user, creditBalance: 0, rewardCredits: 50 }, 50, 2)).toBe(2)
    expect(affordableValidations({ ...user, validationsThisMonth: 2 }, 50, 2)).toBe(1)
    expect(affordableValidations({ ...user, validationsThisMonth: 7, rewardCredits: 100 }, 50, 2)).toBe(2)
    expect(affordableValidations({ ...user, validationsThisMonth: 2, rewardCredits: 0 }, 50, 2)).toBe(0)
    expect(affordableValidations({ ...user, tier: 'premium', validationsThisMonth: 15, rewardCredits: 600 }, 300, 15)).toBe(0)
  })
  it('keeps plan entitlements and the plan meter separate from earned balances', () => {
    const account = { ...user, tier: 'free' as const, crowdfundingCredits: 0, pitchDeckCredits: 0 }
    expect(creditOverview(account)).toMatchObject({ allocation: 100, rewardRemaining: 50, monthlySpent: 0, total: 1150 })
    expect(actionAllowance(account, 'LITE_VALIDATION').runs).toBe(3)
    expect(actionAllowance(account, 'DEEP_VALIDATION').permitted).toBe(false)
    expect(actionAllowance(account, 'PITCH_DECK').permitted).toBe(false)
    expect(creditEntryDescription('{"monthly":0,"reward":50,"purchased":0,"entityId":"private-id"}')).toBe('0 plan credits · 0 purchased credits · 50 earned credits')
  })
  it('rejects fractional and invalid amounts without allocating balances', () => {
    for (const cost of [0, -1, NaN, 1.5, Infinity]) expect(() => allocateCredits(user, cost)).toThrow('Invalid credit cost')
  })
})
