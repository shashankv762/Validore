import { describe, expect, it } from 'vitest'
import { auditEvidence, auditMarketSizing, auditFounderAssumptions, auditSourceReview } from './quality-auditor'
import { SynthesisAgentSchema } from '../schemas'
import { z } from 'zod'
const source = { url: 'https://example.com/research', title: 'Research', content: 'A market study', source: 'example.com', fetchedAt: '2026-10-12T00:00:00Z' }
describe('Report quality auditor', () => {
  it('removes fabricated and unsafe citation links, marking claims unverified', () => {
    const result = auditEvidence([{ claim: 'Claim', link: 'https://invented.example/research', strength: 'STRONGER', label: 'VERIFIED' },
      { claim: 'Unsafe', link: 'javascript:alert(1)', strength: 'MODERATE' }], [source])
    expect(result.qualityAudit.unmatchedCitations).toBe(2)
    for (const item of result.keyEvidence) { expect(item.link).toBe(''); expect(item.strength).toBe('WEAK'); expect(item.label).toBe('AI_ESTIMATE_UNVERIFIED') }
  })
  it('uses actual fetch provenance and caps evidence strength at the search level', () => {
    const result = auditEvidence([{ claim: 'Study claim', link: source.url, source: 'invented publication', strength: 'STRONGER', label: 'VERIFIED' }], [source])
    expect(result.keyEvidence[0]).toMatchObject({ source: 'example.com', fetchedAt: source.fetchedAt, strength: 'MODERATE', label: 'AI_ESTIMATE_UNVERIFIED' })
    expect(result.qualityAudit.unmatchedCitations).toBe(0)
  })
  it('withholds unsupported numeric market sizes before downstream agents use them', () => {
    const sizing = {
      tam: { value: '$1.2B', method: '20,000 founders times an assumed $60,000 spend', source: 'AI estimate (unverified)', label: 'PROJECTION' as const },
      sam: { value: '$120M', method: 'Assume 10% of TAM', label: 'PROJECTION' as const },
      som: { value: '$12M', method: 'Assume 10% of SAM', label: 'PROJECTION' as const },
    }
    const result = auditMarketSizing(sizing, [source])
    expect(Object.values(result).map(item => item.value)).toEqual(['Not established', 'Not established', 'Not established'])
    expect(result.tam.source).toBe('')
    expect(sizing.tam.value).toBe('$1.2B')
    expect(auditMarketSizing({ ...sizing, tam: { ...sizing.tam, source: 'https://fabricated.example/report' } }, [source]).tam.value).toBe('Not established')
  })
  it('preserves a sourced sizing method as a projection without calling it verified', () => {
    const sizing = {
      tam: { value: '$2M', method: '10,000 firms at assumed annual spend of $200', source: source.url, label: 'PROJECTION' as const },
      sam: { value: '$200K', method: '1,000 firms reachable in the served region', label: 'PROJECTION' as const },
      som: { value: '$20K', method: 'Capacity to serve 100 paying firms in year one', label: 'PROJECTION' as const },
    }
    expect(auditMarketSizing(sizing, [source])).toEqual(sizing)
  })
  it('does not claim founder hypotheses were validated by automated desk research', () => {
    const hypotheses = [{ id: 1, assumption: 'Customers will pay', category: 'PRICING' as const, preResearchBelief: 'Likely', postResearchFinding: 'Nothing contradicted the price.', validated: true, confidenceChange: 'UNCHANGED' as const }]
    const result = auditFounderAssumptions(hypotheses)
    expect(result[0].validated).toBe(false)
    expect(result[0].postResearchFinding).toBe(hypotheses[0].postResearchFinding)
    expect(hypotheses[0].validated).toBe(true)
  })
  it('retains a complete hypothesis when only its descriptive grouping is unfamiliar', () => {
    const schema = SynthesisAgentSchema.shape.founderAssumptions.element
    const hypothesis = { id: 1, assumption: 'Founders will adopt', category: 'ADOPTION', preResearchBelief: 'Unknown', postResearchFinding: 'Requires a pilot.', validated: false, confidenceChange: 'UNCHANGED' }
    expect(schema.parse(hypothesis)).toEqual({ ...hypothesis, category: 'OTHER' })
    expect(() => schema.parse({ ...hypothesis, assumption: null })).toThrow()
    expect(JSON.stringify(z.toJSONSchema(SynthesisAgentSchema))).toContain('OTHER')
  })
  it('downgrades a source-review claim when its URL was never retrieved', () => {
    const review = auditSourceReview({ summary: 'Research review', checks: [{ claim: 'Demand exists', url: 'https://invented.example/study', assessment: 'supports', rationale: 'A study said so' }], gaps: [] }, [source])
    expect(review.checks[0]).toMatchObject({ url: '', assessment: 'inconclusive' })
  })
})
