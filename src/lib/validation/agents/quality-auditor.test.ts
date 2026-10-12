import { describe, expect, it } from 'vitest'
import { auditEvidence } from './quality-auditor'
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
})
