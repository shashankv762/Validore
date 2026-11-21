import { z } from 'zod'
import type { PlanningIssue } from './evidence'

export const PitchFundingSchema = z.object({
  amount: z.number().finite().positive().max(1_000_000_000).refine(value => Math.abs(value * 100 - Math.round(value * 100)) < 0.00001, 'Use at most two decimal places for the funding ask.'),
  currency: z.enum(['USD', 'INR', 'GBP', 'EUR', 'CAD', 'AUD']),
})
type FundingInput = { fundingAsk?: z.infer<typeof PitchFundingSchema>; fundingAskAmount?: string }
/** Legacy free text remains readable. Only an unambiguous currency and single
 * amount become a numerical contract; ranges and bare dollar signs do not. */
export function canonicalPitchFunding(input: FundingInput) {
  if (input.fundingAsk) return { ...input.fundingAsk, provenance: 'FOUNDER_REPORTED' as const }
  const text = input.fundingAskAmount?.trim() ?? ''
  const matches = [...text.matchAll(/\b(USD|INR|GBP|EUR|CAD|AUD)\s*([0-9]+(?:,[0-9]{3})*(?:\.[0-9]{1,2})?)(?![\d.])/gi)]
  const currencyCodes = new Set(text.match(/\b(?:USD|INR|GBP|EUR|CAD|AUD)\b/gi)?.map(code => code.toUpperCase()) ?? [])
  if (matches.length !== 1 || currencyCodes.size !== 1 || /\d/.test(text.replace(matches[0][0], '')) || /\b(?:million|billion|thousand|lakh|crore|k|m|bn)\b/i.test(text.replace(matches[0][0], ''))) return null
  const parsed = PitchFundingSchema.safeParse({ amount: Number(matches[0][2].replaceAll(',', '')), currency: matches[0][1].toUpperCase() })
  return parsed.success ? { ...parsed.data, provenance: 'FOUNDER_REPORTED' as const } : null
}
export function validatePitchFunding(data: { useOfFundsBreakdown?: { amount: number; percentage: number }[] }, input: FundingInput): PlanningIssue[] {
  const rows = data.useOfFundsBreakdown ?? []
  if (!rows.length) return []
  const funding = canonicalPitchFunding(input)
  if (!funding) return [{ field: 'useOfFundsBreakdown', expected: 'Omit numeric allocations until the founder supplies an unambiguous amount and currency. Retain the original funding terms as text.' }]
  const issues: PlanningIssue[] = []
  if (rows.some(row => !Number.isFinite(row.amount) || row.amount < 0 || row.amount > funding.amount || !Number.isFinite(row.percentage) || row.percentage < 0 || row.percentage > 100)) {
    return [{ field: 'useOfFundsBreakdown', expected: 'Use finite, nonnegative allocation amounts no larger than the founder ask, and percentages between zero and 100.' }]
  }
  const cents = Math.round(funding.amount * 100)
  if (rows.reduce((sum, row) => sum + Math.round(row.amount * 100), 0) !== cents) issues.push({ field: 'useOfFundsBreakdown.amount', expected: `Allocation amounts must sum exactly to the founder ask of ${funding.currency} ${funding.amount}. Do not change the ask or invent another currency.` })
  if (Math.abs(rows.reduce((sum, row) => sum + row.percentage, 0) - 100) > 0.01) issues.push({ field: 'useOfFundsBreakdown.percentage', expected: 'Allocation percentages must sum to 100.' })
  if (rows.some(row => Math.abs(row.amount * 100 - Math.round(row.amount * 100)) > 0.00001 || Math.abs(row.percentage - row.amount / funding.amount * 100) > 0.011)) issues.push({ field: 'useOfFundsBreakdown', expected: 'Use at most two decimal places for amounts; each percentage must match its share of the funding ask, rounded to two decimals.' })
  return issues
}
