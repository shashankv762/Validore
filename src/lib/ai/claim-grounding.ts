import { evidenceContentHash, evaluateEvidenceCoverage, type EvidenceRequirement } from './evidence-requirements'
import type { SearchResult } from './search'

export type SourceClaim = {
  id: string
  sourceUrl: string
  sourceContentHash: string
  quote: string
  quoteStart: number
  quoteEnd: number
  requirement: EvidenceRequirement
}

/** Verify the immutable source revision, exact passage offsets, and declared
 * observation dimensions. This establishes provenance, not broader inference. */
export function validateSourceClaim(claim: SourceClaim, sources: SearchResult[], now = Date.now()) {
  const source = sources.find(value => value.url === claim.sourceUrl && evidenceContentHash(value.content) === claim.sourceContentHash)
  if (!source) return { valid: false as const, reason: 'The exact source revision is unavailable' }
  if (!Number.isInteger(claim.quoteStart) || !Number.isInteger(claim.quoteEnd) || claim.quoteStart < 0 || claim.quoteEnd <= claim.quoteStart ||
      claim.quoteEnd > source.content.length || claim.quote.length < 20 || source.content.slice(claim.quoteStart, claim.quoteEnd) !== claim.quote) {
    return { valid: false as const, reason: 'The exact supporting passage or offsets do not match' }
  }
  const coverage = evaluateEvidenceCoverage([claim.requirement], [source], now)[0]
  if (coverage.status !== 'covered') return { valid: false as const, reason: coverage.reasons.join('; ') }
  return { valid: true as const, sourceUrl: source.url, sourceContentHash: claim.sourceContentHash,
    quoteStart: claim.quoteStart, quoteEnd: claim.quoteEnd,
    limitation: 'The passage and declared dimensions match; this does not establish customer demand beyond the cited observation.' }
}
