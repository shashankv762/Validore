import type { EvidenceItem } from '../schemas'
import type { SearchResult } from '@/lib/ai/search'

function httpUrl(value?: string): string | null {
  if (!value) return null
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.href : null }
  catch { return null }
}

/** A deterministic supervisor checks citation provenance without another paid AI call. */
export function auditEvidence(evidence: EvidenceItem[], sources: SearchResult[]) {
  const known = new Map(sources.map(source => [httpUrl(source.url), source]).filter(([url]) => url !== null) as [string, SearchResult][])
  let unmatched = 0
  const keyEvidence = evidence.map(item => {
    const link = httpUrl(item.link)
    const source = link ? known.get(link) : undefined
    if (!source) {
      unmatched++
      return { ...item, link: '', source: '', publication: '', fetchedAt: undefined,
        strength: 'WEAK' as const, label: 'AI_ESTIMATE_UNVERIFIED' as const }
    }
    return { ...item, link: source.url, source: source.source, fetchedAt: source.fetchedAt,
      strength: item.strength === 'WEAK' ? 'WEAK' as const : 'MODERATE' as const,
      label: item.label === 'VERIFIED' || !item.label ? 'AI_ESTIMATE_UNVERIFIED' as const : item.label }
  })
  return { keyEvidence, qualityAudit: { citationsChecked: evidence.length, unmatchedCitations: unmatched,
    note: 'Citations were matched against retrieved sources. Claim accuracy still requires review.' } }
}
