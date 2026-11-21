import { describe, expect, it } from 'vitest'
import { hasUsefulValidationCoverage } from '@/lib/validation/delivery-quality'
import { FullReportSchema } from '@/lib/validation/schemas'
import { PIPELINE_LITE_REPLY, PIPELINE_REPLIES } from './fixtures/agent-payloads'

describe('useful validation delivery', () => {
  const report = (agents: Record<string, string>, lite = false) => ({
    ...(lite ? structuredClone(PIPELINE_LITE_REPLY) : FullReportSchema.parse(Object.assign({}, ...Object.values(PIPELINE_REPLIES)))),
    agentTrail: { agents },
  })
  it('does not bill an isolated finance result as a delivered full report', () => {
    expect(hasUsefulValidationCoverage(report({ market: 'failed', customer: 'failed', competitor: 'failed', finance: 'ok', risk: 'failed', evidence: 'failed', product: 'failed', growth: 'failed', synthesis: 'failed' }), false)).toBe(false)
  })
  it('preserves useful partial research and planning when a reviewer is unavailable', () => {
    expect(hasUsefulValidationCoverage(report({ market: 'ok', customer: 'ok', finance: 'ok', product: 'ok', growth: 'ok', synthesis: 'failed' }), false)).toBe(true)
    expect(hasUsefulValidationCoverage(report({ market: 'ok', finance: 'ok', product: 'ok', synthesis: 'failed' }), false)).toBe(true)
  })
  it('requires source specialist work plus synthesis for a delivered Lite report', () => {
    expect(hasUsefulValidationCoverage(report({ market: 'failed', customer: 'failed', synthesis: 'ok' }, true), true)).toBe(false)
    expect(hasUsefulValidationCoverage(report({ market: 'ok', customer: 'failed', synthesis: 'ok' }, true), true)).toBe(true)
  })
  it('keeps legacy and complete monolithic report compatibility', () => {
    expect(hasUsefulValidationCoverage({ decision: 'TEST_FURTHER' }, false)).toBe(false)
    expect(hasUsefulValidationCoverage(report({ monolithic: 'partial' }), false)).toBe(true)
  })
  it('rejects schema-shaped empty monolithic output and empty plans despite successful role labels', () => {
    const complete = report({ monolithic: 'ok' })
    expect(hasUsefulValidationCoverage({ ...complete, actionPlan: [] }, false)).toBe(false)
    expect(hasUsefulValidationCoverage({ ...complete, uvpOptions: ['', '', ''], selectedUvp: '' }, false)).toBe(false)
    expect(hasUsefulValidationCoverage({ ...complete, nextStepRationale: ' ' }, false)).toBe(false)
    expect(hasUsefulValidationCoverage({ ...report({ market: 'ok', customer: 'ok', synthesis: 'ok' }, true), actionPlan: [] }, true)).toBe(false)
  })
  it('requires explicit experiment criteria and useful customer or market content', () => {
    const complete = report({ market: 'ok', customer: 'ok', growth: 'ok' })
    expect(hasUsefulValidationCoverage({ ...complete, actionPlan: complete.actionPlan.map(step => ({ ...step, passCriterion: '' })) }, false)).toBe(false)
    expect(hasUsefulValidationCoverage({ ...complete, personas: [], pestleAnalysis: { political: [], economic: [], social: [], technological: [], legal: [], environmental: [] } }, false)).toBe(false)
  })
  it('rejects invalid scores and unsupported sizing even in cached specialist reports', () => {
    const complete = report({ market: 'ok', customer: 'ok', growth: 'ok' })
    const sizing = FullReportSchema.parse(complete).tamSamSom
    expect(hasUsefulValidationCoverage({ ...complete, marketScore: Infinity }, false)).toBe(false)
    expect(hasUsefulValidationCoverage({ ...complete, tamSamSom: { ...sizing, tam: { ...sizing.tam, value: 'USD 1,000,000' } } }, false)).toBe(false)
  })
})
