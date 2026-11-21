import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import ReportView from '@/app/dashboard/report/ReportView'
import { FullPersonaSchema, PriceSensitivitySchema } from '@/lib/validation/schemas'
import { PIPELINE_LITE_REPLY, PIPELINE_REPLIES, PIPELINE_IDEA } from './fixtures/agent-payloads'
import { buildCustomerPrompt } from '@/lib/validation/agents/customer'
import { buildSynthesisPrompt } from '@/lib/validation/agents/synthesis'
vi.mock('@/db', () => ({ db: {} }))
import { LiteReportSchema } from '@/lib/validation/engine'

const original = FullPersonaSchema.parse((PIPELINE_REPLIES.customer as { personas: unknown[] }).personas[0])
describe('unmeasured persona price sensitivity', () => {
  it.each(['low', 'medium', 'high', 'unknown'] as const)('preserves %s in Full and Lite schemas so legacy levels still open', priceSensitivity => {
    expect(FullPersonaSchema.parse({ ...original, priceSensitivity }).priceSensitivity).toBe(priceSensitivity)
    expect(LiteReportSchema.parse({ ...PIPELINE_LITE_REPLY, persona: { ...original, priceSensitivity } }).persona.priceSensitivity).toBe(priceSensitivity)
  })
  it('defaults missing legacy sensitivity to unknown rather than inventing medium', () => {
    const missing = { ...original } as Partial<typeof original>
    delete missing.priceSensitivity
    expect(PriceSensitivitySchema.parse(undefined)).toBe('unknown')
    expect(FullPersonaSchema.parse(missing).priceSensitivity).toBe('unknown')
    expect(LiteReportSchema.parse({ ...PIPELINE_LITE_REPLY, persona: missing }).persona.priceSensitivity).toBe('unknown')
  })
  it.each([undefined, 'unknown', 'unmeasured', ''])('renders missing or unmeasured sensitivity neutrally without a medium/WTP fallback: %s', priceSensitivity => {
    for (const field of ['persona', 'personas']) {
      const persona = { ...original, priceSensitivity, incomeRange: 'Unknown' }
      const reportData = field === 'persona' ? { persona } : { personas: [persona] }
      const html = renderToStaticMarkup(createElement(ReportView, { hideDownloads: true, report: { reportData } }))
      expect(html).toContain('Price sensitivity: Not measured')
      expect(html).not.toContain('Price sensitivity: Medium')
      expect(html.toLowerCase()).not.toContain('med wtp')
      expect(html).toContain('bg-[#F7F8FA] text-[#536172]')
    }
  })
  it('labels a recorded high sensitivity as sensitivity, never as high willingness to pay', () => {
    const html = renderToStaticMarkup(createElement(ReportView, { hideDownloads: true, report: { reportData: { personas: [{ ...original, priceSensitivity: 'high' }] } } }))
    expect(html).toContain('Price sensitivity: High')
    expect(html.toLowerCase()).not.toContain('high wtp')
  })
  it('instructs both specialists to retain unknown pricing response and keep it distinct from willingness to pay', () => {
    for (const prompt of [buildCustomerPrompt(PIPELINE_IDEA), buildSynthesisPrompt(PIPELINE_IDEA, 'No direct buyer observations')]) {
      expect(prompt).toContain('unknown')
      expect(prompt).toContain('not willingness to pay')
      expect(prompt).toMatch(/income/)
    }
  })
})
