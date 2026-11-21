import { createHash } from 'node:crypto'
import type { SearchResult } from './search'
import { qualifiesLocalObservation, type LocalObservationRequirement } from './local-evidence'

export type EvidenceRequirement = {
  id: string
  claimType: 'annual-indicator' | 'price' | 'demand' | 'customer-problem' | 'regulation'
  subject: string
  geography: string | null
  segment: string | null
  unit: string | null
  denominator: string | null
  requestedPeriod: string | 'latest-available'
  freshnessClass: 'annual' | 'current-price' | 'current'
  independentSources: number
}
export type EvidenceObservation = {
  claimType: EvidenceRequirement['claimType']; subject: string; geography: string; segment: string | null
  unit: string; denominator: string | null; period: string; quote: string
  originId: string; reviewedAt: string; reviewedBy: string
}
export type EvidenceCoverage = { requirementId: string; status: 'covered' | 'gap'; sourceUrls: string[]; reasons: string[] }
export const evidenceContentHash = (content: string) => createHash('sha256').update(content).digest('hex')
const ttl = { annual: 30 * 86_400_000, 'current-price': 6 * 3_600_000, current: 7 * 86_400_000 }

export function annualEvidenceRequirement(requirement: LocalObservationRequirement): EvidenceRequirement {
  return { id: [requirement.country, requirement.indicator, requirement.period].join('/'), claimType: 'annual-indicator',
    subject: requirement.indicator, geography: requirement.country, segment: null, unit: null, denominator: null,
    requestedPeriod: String(requirement.period), freshnessClass: 'annual', independentSources: 1 }
}

/** Lexical relevance can find candidates but never discharges a requirement.
 * Unknown entity/geography/period and unreviewed snippets remain explicit gaps. */
export function evaluateEvidenceCoverage(requirements: EvidenceRequirement[], sources: SearchResult[], now = Date.now()): EvidenceCoverage[] {
  return requirements.slice(0, 20).map(requirement => {
    const qualified: { source: SearchResult; origin: string }[] = []
    const reasons = new Set<string>()
    for (const source of sources.slice(0, 100)) {
      if (!requirement.geography || !requirement.subject || !requirement.requestedPeriod) { reasons.add('Required dimensions are unknown'); continue }
      const fetched = Date.parse(source.fetchedAt), expires = Date.parse(source.expiresAt ?? '')
      try {
        const url = new URL(source.url)
        if (url.protocol !== 'https:' || url.hostname !== source.source || url.username || url.password || url.port && url.port !== '443') { reasons.add('Source identity does not match its canonical URL'); continue }
      } catch { reasons.add('Source identity is invalid'); continue }
      if (!Number.isFinite(fetched) || fetched > now || now - fetched > ttl[requirement.freshnessClass] || !Number.isFinite(expires) || expires <= now || source.supersededBy) { reasons.add('Evidence is expired, superseded or has incomplete freshness metadata'); continue }
      if (source.excerpted || source.retrievalKind !== 'page' && source.retrievalKind !== 'open-data') { reasons.add('Search snippets, partial excerpts and discovery references are leads only'); continue }
      if (source.contentHash && source.contentHash !== evidenceContentHash(source.content)) { reasons.add('Source passage hash does not match'); continue }
      if (requirement.claimType === 'annual-indicator') {
        const period = requirement.requestedPeriod === 'latest-available' ? 'latest-available' : Number(requirement.requestedPeriod)
        if (requirement.freshnessClass !== 'annual' || requirement.segment || requirement.denominator || requirement.unit && requirement.unit !== source.unit ||
          period === 'latest-available' && source.observationScope !== 'latest-available' ||
          !qualifiesLocalObservation(source, { country: requirement.geography, indicator: requirement.subject, period }, now)) { reasons.add('Annual indicator dimensions do not match'); continue }
        qualified.push({ source, origin: source.datasetId?.startsWith('world-bank-wdi') ? 'world-bank-wdi' : source.source })
      } else {
        if (!source.contentHash || !requirement.unit || requirement.requestedPeriod === 'latest-available') { reasons.add('An exact reviewed observation and period are required'); continue }
        const observation = source.observations?.find(value => value.claimType === requirement.claimType && value.subject === requirement.subject && value.geography === requirement.geography &&
          value.segment === requirement.segment && value.unit === requirement.unit && value.denominator === requirement.denominator && value.period === requirement.requestedPeriod &&
          value.quote.length >= 20 && source.content.includes(value.quote) && value.originId && value.reviewedBy && Number.isFinite(Date.parse(value.reviewedAt)) && Date.parse(value.reviewedAt) >= fetched && Date.parse(value.reviewedAt) <= now)
        if (!observation) { reasons.add('No reviewed original passage matches the claim dimensions'); continue }
        qualified.push({ source, origin: observation.originId })
      }
    }
    const required = Math.max(1, Math.min(3, Number.isInteger(requirement.independentSources) ? requirement.independentSources : 1))
    const covered = new Set(qualified.map(value => value.origin)).size >= required
    if (qualified.length && !covered) reasons.add('Independent corroboration is missing; repeated releases do not count twice')
    return { requirementId: requirement.id, status: covered ? 'covered' : 'gap', sourceUrls: [...new Set(qualified.map(value => value.source.url))],
      reasons: covered ? [] : reasons.size ? [...reasons] : ['No qualifying evidence is available; this is not negative evidence'] }
  })
}
