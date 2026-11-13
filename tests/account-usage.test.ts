import { describe, expect, it } from 'vitest'
import { actionAllowance, creditCycleStart, creditEntryDescription, creditOverview } from '@/lib/account-usage'

const user = { tier: 'free' as const, creditBalance: 50, purchasedCredits: 2000, crowdfundingCredits: 1, pitchDeckCredits: 0, validationsThisMonth: 1 }

describe('workspace credit accounting', () => {
  it('separates remaining plan credits from purchased credits in the allowance meter', () => {
    expect(creditOverview(user)).toMatchObject({ allocation: 100, monthlySpent: 50, percentage: 50, total: 2050 })
    expect(creditOverview({ ...user, creditBalance: 0 })).toMatchObject({ monthlySpent: 100, percentage: 100, total: 2000 })
  })
  it('does not let a top-up bypass validation quotas or plan access', () => {
    expect(actionAllowance(user, 'LITE_VALIDATION').runs).toBe(1)
    expect(actionAllowance({ ...user, validationsThisMonth: 2 }, 'LITE_VALIDATION').runs).toBe(0)
    expect(actionAllowance(user, 'DEEP_VALIDATION').permitted).toBe(false)
    expect(actionAllowance(user, 'PRICING').permitted).toBe(false)
  })
  it('counts module credits separately and charges Max universal credits', () => {
    expect(actionAllowance(user, 'CROWDFUNDING')).toEqual({ permitted: true, runs: 1, unit: 'module credit' })
    expect(actionAllowance(user, 'PITCH_DECK').permitted).toBe(false)
    expect(actionAllowance({ ...user, tier: 'max_premium', creditBalance: 1000, purchasedCredits: 0 }, 'CROWDFUNDING')).toMatchObject({ runs: 2, unit: 'credits' })
  })
  it('uses the actual 30-day credit window rather than a calendar-month assumption', () => {
    expect(creditCycleStart(new Date('2026-11-20T12:00:00Z'), new Date('2026-11-01T00:00:00Z')).toISOString()).toBe('2026-10-21T12:00:00.000Z')
  })
  it('does not show internal JSON identifiers in transaction details', () => {
    expect(creditEntryDescription('{"entityId":"private-internal-id","monthly":50,"purchased":0}')).toBe('50 plan credits · 0 purchased credits')
    expect(creditEntryDescription(null)).toBe('—')
  })
  it('uses the current cycle allocation while a changed plan starts next cycle', () => {
    expect(creditOverview({ ...user, creditCycleAllowance: 100 }, { monthlyCredits: 250 })).toMatchObject({ allocation: 100, monthlySpent: 50, percentage: 50 })
    expect(creditOverview({ ...user, creditCycleAllowance: 0, creditBalance: 0 }, { monthlyCredits: 250 }).percentage).toBe(0)
  })
  it('shows unlimited owner access independently of stored balances and applies edited plan benefits to ordinary accounts', () => {
    const owner = { ...user, unlimited: true, creditBalance: 0, purchasedCredits: 0, crowdfundingCredits: 0 }
    expect(actionAllowance(owner, 'CROWDFUNDING')).toMatchObject({ permitted: true, unlimited: true })
    expect(actionAllowance(owner, 'DEEP_VALIDATION')).toMatchObject({ permitted: true, unlimited: true })
    expect(actionAllowance(user, 'PRICING', 2, { canPricingSimulator: true })).toMatchObject({ permitted: true })
    expect(actionAllowance({ ...user, tier: 'max_premium' }, 'PRICING', 50, { canPricingSimulator: false })).toMatchObject({ permitted: false })
  })
})
