import { describe, expect, it } from 'vitest'
import { canonicalPitchFunding, validatePitchFunding } from '@/lib/planning/pitch-funding'
import { PitchDeckInputSchema } from '@/lib/planning/pitch-schema'

describe('canonical founder funding terms', () => {
  it('retains one explicit legacy amount and currency without interpreting scale or alternatives', () => {
    expect(canonicalPitchFunding({ fundingAskAmount: 'USD 75,000 after pilot review' })).toMatchObject({ amount: 75000, currency: 'USD' })
    for (const fundingAskAmount of ['USD 100 or INR', 'USD 100 / EUR equivalent', 'USD 100 or CAD 100', 'USD 75k', '$100']) {
      expect(canonicalPitchFunding({ fundingAskAmount })).toBeNull()
      expect(validatePitchFunding({ useOfFundsBreakdown: [{ amount: 100, percentage: 100 }] }, { fundingAskAmount })).toHaveLength(1)
    }
  })
  it('uses the structured founder amount when supplied', () => {
    expect(canonicalPitchFunding({ fundingAsk: { amount: 125000.25, currency: 'INR' } })).toEqual({ amount: 125000.25, currency: 'INR', provenance: 'FOUNDER_REPORTED' })
  })
  it('rejects mixed structured and legacy funding inputs before the pitch writers see them', () => {
    const parsed = PitchDeckInputSchema.safeParse({ ideaId: '11111111-1111-4111-8111-111111111111',
      founderName: 'Founder', founderBackground: 'A sufficiently detailed founder background.', teamSize: 1,
      fundingAsk: { amount: 125000, currency: 'INR' }, fundingAskAmount: 'USD 75,000' })
    expect(parsed.success).toBe(false)
  })
})
