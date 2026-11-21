import { describe, expect, it } from 'vitest'
import { auditEvidence, auditMarketSizing, auditFounderAssumptions, auditSourceReview, hasReviewedBlockingEvidence, validateCustomerSignals } from './quality-auditor'
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
    expect(result.keyEvidence[0]).toMatchObject({ source: 'example.com', fetchedAt: source.fetchedAt, strength: 'WEAK', label: 'AI_ESTIMATE_UNVERIFIED' })
    const page = { ...source, content: 'The report documents that local retailers lose three hours every week reconciling inventory.', retrievalKind: 'page' as const }
    const unsupported = auditEvidence([{ claim: 'All retailers doubled revenue', link: page.url, strength: 'STRONGER' }], [page])
    expect(unsupported.keyEvidence[0].strength).toBe('WEAK')
    const original = auditEvidence([{ claim: 'Retailers report weekly reconciliation pain', link: page.url,
      evidenceExcerpt: 'local retailers lose three hours every week reconciling inventory.', strength: 'STRONGER' }], [page])
    expect(original.keyEvidence[0].strength).toBe('MODERATE')
    expect(result.qualityAudit.unmatchedCitations).toBe(0)
  })
  it('downgrades supports and contradictions without an exact passage from a read source', () => {
    const page = { ...source, content: 'The source describes a pilot serving several independent shops.', retrievalKind: 'page' as const }
    const reviewed = auditSourceReview({ summary: 'Review', checks: [
      { claim: 'Customers are demanding the product.', url: page.url, assessment: 'supports' as const, rationale: 'URL was read.' },
      { claim: 'The product is legally barred.', url: page.url, assessment: 'contradicts' as const, rationale: 'URL was read.', decisionRelevance: 'blocking' as const },
    ], gaps: [] }, [page])
    expect(reviewed.checks.map(check => check.assessment)).toEqual(['inconclusive', 'inconclusive'])
    expect(reviewed.checks[1].decisionRelevance).toBe('material')
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
      tam: { value: '$2M', method: '10,000 eligible firms at reported annual software spend of $200', source: source.url, label: 'PROJECTION' as const,
        inputs: { customerCount: { value: 10000, unit: 'eligible firms', source: source.url, evidenceExcerpt: '10,000 eligible firms' }, annualSpend: { value: 200, currency: 'USD', source: source.url, evidenceExcerpt: 'reported annual software spend of USD 200' } } },
      sam: { value: '$200K', method: '1,000 firms reachable in the served region', label: 'PROJECTION' as const },
      som: { value: '$20K', method: 'Capacity to serve 100 paying firms in year one', label: 'PROJECTION' as const },
    }
    const audited = auditMarketSizing(sizing, [{ ...source, content: 'The study identifies 10,000 eligible firms and reported annual software spend of USD 200.', retrievalKind: 'page' }])
    expect(audited.tam.value).toBe('USD 2,000,000')
    expect(audited.tam.method).toContain('10,000 eligible firms × USD 200')
    expect(audited.sam).toEqual(sizing.sam)
    expect(auditMarketSizing(sizing, [source]).tam.value).toBe('Not established')
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
  it('rejects a blocking conclusion supported by an unrelated exact quote', () => {
    const page = { url: 'https://example.com/annual-report', title: 'Annual report',
      content: 'The company hired 26 engineers and opened an office in Bengaluru.', source: 'example.com',
      fetchedAt: '2026-11-15T00:00:00Z', retrievalKind: 'page' as const }
    const check = { claim: 'Selling this unlicensed medical product is prohibited by Indian law.', url: page.url,
      assessment: 'contradicts' as const, rationale: 'The law prevents the proposed sale.', decisionRelevance: 'blocking' as const,
      evidenceExcerpt: page.content }
    const reviewed = auditSourceReview({ summary: 'Blocking legal issue', checks: [check], gaps: [] }, [page])
    const evidence = [{ claim: check.claim, link: page.url, evidenceExcerpt: page.content, strength: 'MODERATE' as const }]
    expect(reviewed.checks[0]).toMatchObject({ assessment: 'inconclusive', decisionRelevance: 'material' })
    expect(hasReviewedBlockingEvidence({ evidence, review: { ...reviewed, checks: [check] }, sources: [page] })).toBe(false)
  })
  it('bounds public-review counts by extracted records when the denominator is unknown', () => {
    const reviewPage = { ...source, retrievalKind: 'page' as const,
      content: JSON.stringify({ kind: 'public_review_feed', reviews: [{ content: 'The checkout was easy.' }, { content: 'Delivery was late.' }] }) }
    const issues = validateCustomerSignals({ customerSignals: { summary: 'Two synthetic review texts were extracted.', observations: [{ theme: 'delivery', direction: 'negative', count: 9, sampleSize: null,
      sourceType: 'public_review', sourceUrls: [reviewPage.url], limitation: 'Only two extracted reviews were reviewed.' }],
      opposingSignals: [], unresolvedQuestions: [] } }, [reviewPage])
    expect(issues.some(issue => issue.field.endsWith('.count'))).toBe(true)
  })
})
