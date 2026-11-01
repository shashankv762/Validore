import type { EvidenceItem, FullReport, EvidenceReview } from '../schemas'
import type { SearchResult } from '@/lib/ai/search'

function httpUrl(value?: string): string | null {
  if (!value) return null
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.href : null }
  catch { return null }
}

/** Unsupported sizing must not become an input to the finance or review agents. */
export function auditMarketSizing(sizing: FullReport['tamSamSom'] | undefined, sources: SearchResult[]): FullReport['tamSamSom'] {
  const cited = httpUrl(sizing?.tam.source)
  if (sizing && cited && sources.some(source => httpUrl(source.url) === cited)) return sizing
  return {
    tam: { value: 'Not established', source: '', label: 'PROJECTION', method: 'A retrieved source for the target customer count and annual spending is missing. Establish both inputs before sizing this product\'s market.' },
    sam: { value: 'Not established', label: 'PROJECTION', method: 'Define the serviceable customer segment and geography once the addressable-market inputs are established.' },
    som: { value: 'Not established', label: 'PROJECTION', method: 'Estimate reachable customers and annual revenue from a tested acquisition plan and delivery capacity.' },
  }
}

/** These agents conduct desk research, not customer interviews or experiments. */
export function auditFounderAssumptions(assumptions: FullReport['founderAssumptions']): FullReport['founderAssumptions'] {
  return assumptions.map(assumption => ({ ...assumption, validated: false }))
}

export const DESK_RESEARCH_NOTE = 'Desk research only: these agents have not conducted customer interviews or experiments. Founder hypotheses still require direct testing.'

export function auditSourceReview(review: EvidenceReview, sources: SearchResult[]): EvidenceReview {
  const known = new Set(sources.map(source => httpUrl(source.url)).filter(Boolean))
  return { ...review, checks: review.checks.map(check => {
    const url = httpUrl(check.url)
    return url && known.has(url) ? { ...check, url } : { ...check, url: '', assessment: 'inconclusive' as const,
      rationale: 'The cited source was not retrieved. This claim remains unverified.' }
  }) }
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
