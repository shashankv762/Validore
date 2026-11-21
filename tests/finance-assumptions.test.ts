import { describe, expect, it, vi } from 'vitest'
vi.mock('@/lib/ai/generate', () => ({ generateWithFallback: vi.fn() }))
import { buildFinancePrompt } from '@/lib/validation/agents/finance'
import { FinanceAgentSchema } from '@/lib/validation/schemas'
import { PIPELINE_IDEA, PIPELINE_REPLIES } from './fixtures/agent-payloads'

describe('Declared financial scenario assumptions', () => {
  it('keeps historical inputs valid while preserving explicit acquisition growth and currency', () => {
    const original = FinanceAgentSchema.parse(PIPELINE_REPLIES.finance)
    const parsed = FinanceAgentSchema.parse({ ...original, unitEconomicsAssumptions: { ...original.unitEconomicsAssumptions,
      estimatedMonthlyGrowthRate: 0.1, currency: 'INR' } })
    expect(parsed.unitEconomicsAssumptions).toMatchObject({ estimatedMonthlyGrowthRate: 0.1, currency: 'INR' })
  })
  it('asks for one declared currency, CAC per acquisition, and no invented growth or lifetime', () => {
    const prompt = buildFinancePrompt(PIPELINE_IDEA, 'No verified financial assumptions were supplied.')
    expect(prompt).toContain('cost PER NEW customer')
    expect(prompt).toContain('gross monthly NEW-customer acquisition')
    expect(prompt).toContain('omit it or use zero')
    expect(prompt).toContain('Never combine currencies')
    expect(prompt).toContain('Do not assume 10% growth')
    expect(prompt).toContain('made-up 24-month lifetime')
  })
})
