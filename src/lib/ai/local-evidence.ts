import { createHash } from 'node:crypto'
import { bundledObservations as seedData, bundledTrends, MARKET_BUNDLE_VERSION } from './bundled-market'
import type { SearchResult } from './search'
import { validWorldBankRevision } from './world-bank'

/** Narrow exact-observation requests only. This contract cannot represent TAM,
 * customer demand, competitor prices or a forecast, so macro context cannot
 * accidentally satisfy those questions. */
export type LocalObservationRequirement = { country: string; indicator: string; period: number | 'latest-available' }
const definitions = [
  { id: 'SP.URB.TOTL.IN.ZS', unit: '% of total population', pattern: /\burban\s+population\s+share\b/i },
  { id: 'SP.POP.TOTL', unit: 'people', pattern: /\b(?:total\s+population|population)\b/i },
  { id: 'NY.GDP.PCAP.CD', unit: 'current US dollars per person', pattern: /\bgdp\s+per\s+capita\b/i },
  { id: 'NY.GDP.MKTP.KD.ZG', unit: 'annual % change in real GDP', pattern: /\b(?:real\s+)?gdp\s+growth\b/i },
  { id: 'NY.GDP.MKTP.CD', unit: 'current US dollars', pattern: /\b(?:nominal\s+)?gdp\b/i },
  { id: 'IT.NET.USER.ZS', unit: '% of population', pattern: /\b(?:internet\s+(?:use|users|penetration)|individuals\s+using\s+the\s+internet)\b/i },
  { id: 'FP.CPI.TOTL.ZG', unit: 'annual % change in consumer prices', pattern: /\b(?:consumer\s+price\s+|cpi\s+)?inflation\b/i },
  { id: 'SL.UEM.TOTL.ZS', unit: '% of total labor force (modeled ILO estimate)', pattern: /\b(?:modeled\s+ilo\s+)?unemployment(?:\s+rate)?\b/i },
]
const countryPatterns = [
  ['IN', /\b(?:india|indian)\b/gi, /\bIN\b/], ['US', /\b(?:united states|usa)\b/gi, /\bUS\b(?!\s+dollars)/],
  ['GB', /\b(?:united kingdom|britain|uk)\b/gi, /\bGB\b/], ['SG', /\bsingapore\b/gi, /\bSG\b/],
  ['BR', /\bbrazil\b/gi, /\bBR\b/], ['WLD', /\b(?:world(?!\s+bank)|worldwide|global)\b/gi, /\bWLD\b/],
] as const
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
export const LOCAL_EVIDENCE_VERSION = MARKET_BUNDLE_VERSION ?? digest([])
const index = new Map<string, readonly SearchResult[]>()
for (const value of seedData as SearchResult[]) {
  const key = value.country + '/' + value.indicator
  index.set(key, [...(index.get(key) ?? []), { ...value, observationScope: 'latest-available', ...(MARKET_BUNDLE_VERSION ? { dataBundleVersion: MARKET_BUNDLE_VERSION } : {}) }])
}
// Exact historical questions reuse the immutable annual values, preserving the
// original retrieval and revision. Missing years are never manufactured.
for (const series of bundledTrends) {
  const key = series.country + '/' + series.indicator
  const latest = index.get(key)?.[0]
  if (!latest) continue
  for (const point of series.observations) {
    if (point.year === latest.observationYear) continue
    const url = new URL(latest.url)
    url.searchParams.set('date', String(point.year))
    index.set(key, [...(index.get(key) ?? []), { ...latest, url: url.href, value: point.value,
      observationYear: point.year, dataPeriod: String(point.year), retrievalUrl: series.sourceUrl, observationScope: 'historical',
      title: `World Bank: ${series.title}, ${series.countryName} (${point.year})`,
      content: `${series.title}: ${point.value} ${series.unit}. Country: ${series.countryName} (${series.country}). Observation year: ${point.year}. Source: World Bank WDI, indicator ${series.indicator}; dataset revision ${series.metadataUpdatedAt}. Selected from the immutable historical series retrieved at ${series.fetchedAt}. ${series.limitation}`,
    }])
  }
}

export function parseLocalObservationQuery(query: string): LocalObservationRequirement | null {
  if (query.length > 350 || /https?:|@|\b(?:tam|sam|som|demand|customer|forecast|prediction|competitor|trend|today|realtime|real-time)\b/i.test(query)) return null
  let rest = query.normalize('NFKC').trim()
  const countries = countryPatterns.filter(([, name, code]) => new RegExp(name.source, 'i').test(rest) || code.test(rest))
  if (countries.length !== 1) return null
  const [country, name, code] = countries[0]
  rest = rest.replace(new RegExp(name.source, 'gi'), ' ').replace(code, ' ')
  // Codes are matched literally; a specialized GDP phrase wins over GDP.
  let definition = definitions.find(value => rest.toUpperCase().includes(value.id))
  if (definition) rest = rest.replace(new RegExp(definition.id.replace(/\./g, '\\.'), 'gi'), ' ')
  else {
    definition = definitions.find(value => value.pattern.test(rest))
    if (!definition) return null
    rest = rest.replace(definition.pattern, ' ')
  }
  const years = rest.match(/\b(?:19|20)\d{2}\b/g) ?? []
  if (years.length > 1) return null
  const period = years.length ? Number(years[0]) : 'latest-available'
  rest = rest.replace(/\b(?:19|20)\d{2}\b/g, ' ').replace(/\b(?:what|is|the|of|in|for|show|give|me|please|world|bank|wdi|latest|available|annual|observation|observations|data|value|total|current|usd|us|dollars|percent|percentage)\b/gi, ' ').replace(/[\s?,.:()%\-]/g, '')
  return rest ? null : { country, indicator: definition.id, period }
}

export function qualifiesLocalObservation(source: SearchResult, requirement: LocalObservationRequirement, now = Date.now()): boolean {
  const definition = definitions.find(value => value.id === requirement.indicator)
  if (!definition || source.country !== requirement.country || source.indicator !== requirement.indicator || source.unit !== definition.unit || source.retrievalKind !== 'open-data') return false
  const fetched = Date.parse(source.fetchedAt), expires = Date.parse(source.expiresAt ?? '')
  const year = new Date(now).getUTCFullYear()
  if (!Number.isFinite(fetched) || fetched > now || now - fetched > 30 * 86_400_000 || !Number.isFinite(expires) || expires <= now || expires > fetched + 30 * 86_400_000) return false
  if (source.source !== 'api.worldbank.org' || typeof source.content !== 'string' || source.content.length < 20 || source.content.length > 12_000 ||
    typeof source.title !== 'string' || !source.title.trim() || !validWorldBankRevision(source.metadataUpdatedAt ?? '', fetched)) return false
  if (typeof source.observationYear !== 'number' || !Number.isInteger(source.observationYear) || source.observationYear >= year || source.observationYear < year - 8 || source.dataPeriod !== String(source.observationYear)) return false
  if (requirement.period !== 'latest-available' && source.observationYear !== requirement.period) return false
  if (requirement.period === 'latest-available' && source.observationScope === 'historical') return false
  if (typeof source.value !== 'number' || !Number.isFinite(source.value) || (source.value < 0 && !['FP.CPI.TOTL.ZG', 'NY.GDP.MKTP.KD.ZG'].includes(source.indicator))) return false
  if (['IT.NET.USER.ZS', 'SP.URB.TOTL.IN.ZS', 'SL.UEM.TOTL.ZS'].includes(source.indicator) && source.value > 100 || source.indicator === 'SP.POP.TOTL' && !Number.isSafeInteger(source.value)) return false
  try {
    const url = new URL(source.url)
    return url.protocol === 'https:' && url.hostname === 'api.worldbank.org' && !url.username && !url.password && (!url.port || url.port === '443') && url.pathname === `/v2/country/${requirement.country}/indicator/${requirement.indicator}` && source.licenseUrl === 'https://data.worldbank.org/summary-terms-of-use'
  } catch { return false }
}

export function localObservationEvidence(requirement: LocalObservationRequirement, now = Date.now()): SearchResult[] {
  if (process.env.RESEARCH_STORE_ENABLED === 'false' || !/^(?:[A-Z]{2}|WLD)$/.test(requirement.country)) return []
  const rows = index.get(requirement.country + '/' + requirement.indicator) ?? []
  return rows.filter(source => qualifiesLocalObservation(source, requirement, now))
    .sort((a, b) => b.observationYear! - a.observationYear! || b.fetchedAt.localeCompare(a.fetchedAt)).slice(0, 1)
    .map(source => ({ ...source }))
}

/** Public corpus metadata only; no private queries or runtime user information. */
export function localEvidenceManifest() {
  return { schemaVersion: 1, contentVersion: LOCAL_EVIDENCE_VERSION, recordCount: seedData.length,
    coverage: [...index.keys()].sort(), maxRetrievalAgeDays: 30,
    historicalRecordCount: [...index.values()].reduce((count, values) => count + values.length, 0),
    scope: 'Exact latest-available or historical annual WDI observations, not startup demand, category TAM or current prices',
    records: (seedData as SearchResult[]).map(source => ({ key: `${source.country}/${source.indicator}/${source.observationYear}`, contentHash: digest(source), fetchedAt: source.fetchedAt, expiresAt: source.expiresAt })),
  }
}
