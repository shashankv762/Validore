import { createHash } from 'node:crypto'
import { and, desc, eq, gt, lte, sql } from 'drizzle-orm'
import { db } from '@/db'
import { researchSources } from '@/db/schema'
import { publicWebUrl } from './public-web'
import type { SearchResult } from './search'
import seedData from '@/data/market/seed-sources.json'

// Only independently retrieved public sources from reviewed institutions may
// enter the durable shared store. Model outputs, private answers, search queries,
// and arbitrary third-party pages never cross this boundary.
const PUBLIC_INSTITUTIONS = ['worldbank.org', 'rbi.org.in', 'npci.org.in', 'mospi.gov.in', 'data.gov.in', 'pib.gov.in', 'udyamregistration.gov.in', 'startupindia.gov.in', 'census.gov', 'oecd.org', 'ilo.org', 'ilostat.ilo.org', 'un.org', 'unctad.org', 'imf.org', 'enterprisesurveys.org', 'hai.stanford.edu']
const MAX_AGE_MS = 30 * 86_400_000
const hash = (value: string) => createHash('sha256').update(value).digest('hex')
const words = (value: string) => [...new Set(value.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? [])].filter(word => !['the', 'and', 'for', 'with', 'market', 'data', 'latest', 'current', 'size'].includes(word)).slice(0, 20)
const enabled = () => process.env.RESEARCH_STORE_ENABLED !== 'false'
const storedDatabase = () => enabled() && Boolean(process.env.DATABASE_URL)

function requestedCountries(query: string): Set<string> {
  const countries = new Set<string>()
  for (const [code, pattern] of [
    ['IN', /\b(india|indian)\b/i], ['US', /\b(united states|usa|american)\b/i],
    ['GB', /\b(united kingdom|britain|british|uk)\b/i], ['SG', /\bsingapore\b/i],
    ['BR', /\b(brazil|brazilian)\b/i], ['WLD', /\b(world|worldwide|global)\b/i],
  ] as const) if (pattern.test(query) || new RegExp('\\b' + code + '\\b').test(query)) countries.add(code)
  return countries
}
const inRequestedGeography = (source: SearchResult, countries: Set<string>) => !source.country || !countries.size || countries.has(source.country)

export function preparePublicSource(value: unknown, now = Date.now()): SearchResult | null {
  if (!value || typeof value !== 'object') return null
  const item = value as Partial<SearchResult>
  if (!['page', 'open-data'].includes(item.retrievalKind ?? '') || typeof item.url !== 'string' || item.url.length > 2000 ||
    typeof item.title !== 'string' || !item.title.trim() || typeof item.content !== 'string' || item.content.length < 20 ||
    typeof item.fetchedAt !== 'string') return null
  let url: URL
  try { url = publicWebUrl(item.url) } catch { return null }
  if (url.protocol !== 'https:' || !PUBLIC_INSTITUTIONS.some(host => url.hostname === host || url.hostname.endsWith('.' + host))) return null
  if ([...url.searchParams.keys()].some(key => /token|secret|password|auth|key|email|signature/i.test(key))) return null
  // Search/form endpoints can reflect user input. Only known document and
  // dataset selectors may become shared memory, never arbitrary query text.
  const selectors = new Set(['id', 'prid', 'lang', 'reg', 'page', 'year', 'date', 'format', 'per_page', 'catid', 'nid', 'dt', 'download', 'indicator'])
  if ([...url.searchParams].some(([key, value]) => !selectors.has(key.toLowerCase()) || !/^[a-z\d.,:_;-]{1,128}$/i.test(value))) return null
  const fetched = Date.parse(item.fetchedAt)
  if (!Number.isFinite(fetched) || fetched > now || fetched < now - MAX_AGE_MS) return null
  const expiry = Math.min(typeof item.expiresAt === 'string' ? Date.parse(item.expiresAt) : fetched + (item.retrievalKind === 'open-data' ? MAX_AGE_MS : 7 * 86_400_000), fetched + MAX_AGE_MS)
  if (!Number.isFinite(expiry) || expiry <= now || expiry <= fetched) return null
  if (/\b(?:sk-[a-z\d_-]{16,}|bearer\s+[a-z\d._-]{20,})/i.test(item.content)) return null
  const clean = (text: string, limit: number) => text.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, limit)
  const optional = (value: unknown, limit: number) => typeof value === 'string' ? clean(value, limit) : ''
  const hasObservation = item.retrievalKind === 'open-data'
  if (hasObservation && (url.hostname !== 'api.worldbank.org' || typeof item.value !== 'number' || !Number.isFinite(item.value) ||
    typeof item.observationYear !== 'number' || !Number.isInteger(item.observationYear) || item.observationYear < 1900 || item.observationYear > new Date(fetched).getUTCFullYear() ||
    typeof item.country !== 'string' || !/^(?:[A-Z]{2}|WLD)$/.test(item.country) ||
    typeof item.indicator !== 'string' || !/^[A-Z0-9.]{4,80}$/.test(item.indicator) ||
    url.pathname !== '/v2/country/' + item.country + '/indicator/' + item.indicator ||
    item.dataPeriod !== String(item.observationYear) || typeof item.unit !== 'string' || !item.unit.trim())) return null
  if (hasObservation && typeof item.value === 'number' && (item.value < 0 && !['FP.CPI.TOTL.ZG', 'NY.GDP.MKTP.KD.ZG'].includes(item.indicator!) ||
    ['IT.NET.USER.ZS', 'SP.URB.TOTL.IN.ZS', 'SL.UEM.TOTL.ZS'].includes(item.indicator!) && item.value > 100)) return null
  return { title: clean(item.title, 250), url: url.href, source: url.hostname, content: clean(item.content, 1800),
    retrievalKind: item.retrievalKind, fetchedAt: new Date(fetched).toISOString(), expiresAt: new Date(expiry).toISOString(),
    ...(typeof item.dataPeriod === 'string' ? { dataPeriod: clean(item.dataPeriod, 150) } : {}),
    publishedAt: typeof item.publishedAt === 'string' && Number.isFinite(Date.parse(item.publishedAt)) ? item.publishedAt.slice(0, 40) : null,
    ...(typeof item.value === 'number' && Number.isFinite(item.value) && typeof item.observationYear === 'number' && Number.isInteger(item.observationYear) && item.observationYear >= 1900 && item.observationYear <= new Date(fetched).getUTCFullYear() &&
      typeof item.indicator === 'string' && typeof item.unit === 'string' && typeof item.country === 'string' ? {
        value: item.value, observationYear: item.observationYear, indicator: clean(item.indicator, 80), unit: clean(item.unit, 160), country: clean(item.country, 3),
        countryName: optional(item.countryName, 100) || clean(item.country, 3), datasetId: optional(item.datasetId, 100),
        metadataUpdatedAt: optional(item.metadataUpdatedAt, 30),
        ...(item.licenseUrl === 'https://data.worldbank.org/summary-terms-of-use' ? { licenseUrl: item.licenseUrl } : {}),
      } : {}) }
}

export function seededResearch(query: string, limit = 6, now = Date.now()): SearchResult[] {
  if (!enabled()) return []
  const terms = words(query.slice(0, 500))
  const countries = requestedCountries(query.slice(0, 500))
  if (!terms.length) return []
  return (seedData as unknown[]).map(item => preparePublicSource(item, now)).filter((item): item is SearchResult => item !== null)
    .filter(source => inRequestedGeography(source, countries))
    .map(source => ({ source, score: terms.reduce((score, term) => score + Number((source.title + ' ' + source.content).toLowerCase().includes(term)), 0) }))
    .filter(item => item.score > 0).sort((a, b) => b.score - a.score || b.source.fetchedAt.localeCompare(a.source.fetchedAt))
    .slice(0, Math.max(0, Math.min(12, Math.floor(limit)))).map(item => item.source)
}

export async function rememberPublicSources(sources: SearchResult[]): Promise<number> {
  if (!storedDatabase()) return 0
  let saved = 0
  try {
    for (const source of sources.slice(0, 12)) {
      const safe = preparePublicSource(source)
      if (!safe) continue
      const urlHash = hash(safe.url)
      const id = hash(safe.url + '\n' + safe.content + '\n' + (safe.dataPeriod ?? '') + '\n' + (safe.publishedAt ?? ''))
      await db.insert(researchSources).values({ id, urlHash, source: safe, searchText: safe.title + ' ' + safe.content,
        fetchedAt: new Date(safe.fetchedAt), expiresAt: new Date(safe.expiresAt!) })
        .onConflictDoUpdate({ target: researchSources.id, set: { source: safe, fetchedAt: new Date(safe.fetchedAt), expiresAt: new Date(safe.expiresAt!) }, setWhere: lte(researchSources.fetchedAt, new Date(safe.fetchedAt)) })
      saved++
    }
  } catch { console.warn('[research-store] Public evidence persistence unavailable; continuing with retrieved sources') }
  return saved
}

export async function retrievePublicResearch(query: string, limit = 6): Promise<SearchResult[]> {
  const bounded = Math.max(0, Math.min(12, Math.floor(limit)))
  const seeds = seededResearch(query, bounded)
  const terms = words(query.slice(0, 500))
  const countries = requestedCountries(query.slice(0, 500))
  if (!storedDatabase() || !terms.length || !bounded) return seeds
  try {
    // Terms are bound parameters, never SQL syntax or user-controlled column names.
    const document = sql`to_tsvector('english', ${researchSources.searchText})`
    const search = sql`websearch_to_tsquery('english', ${terms.join(' OR ')})`
    const rows = await db.select({ source: researchSources.source }).from(researchSources)
      .where(and(gt(researchSources.expiresAt, new Date()), sql`${document} @@ ${search}`))
      .orderBy(desc(sql`ts_rank(${document}, ${search})`), desc(researchSources.fetchedAt)).limit(bounded * 2)
    const unique = new Map<string, SearchResult>()
    for (const source of [...rows.map(row => row.source), ...seeds]) {
      const safe = preparePublicSource(source)
      if (safe && inRequestedGeography(safe, countries) && (!unique.has(safe.url) || safe.fetchedAt > unique.get(safe.url)!.fetchedAt)) unique.set(safe.url, safe)
    }
    return [...unique.values()].slice(0, bounded)
  } catch { console.warn('[research-store] Retrieval unavailable; using bundled official observations'); return seeds }
}

export async function readStoredMarketIndicator(country: string, indicator: string): Promise<SearchResult | null> {
  if (!enabled()) return null
  const candidates: unknown[] = (seedData as SearchResult[]).filter(item => item.country === country && item.indicator === indicator)
  if (storedDatabase()) {
    try {
      const rows = await db.select({ source: researchSources.source }).from(researchSources)
        .where(and(gt(researchSources.expiresAt, new Date()), sql`${researchSources.source}->>'country' = ${country}`, sql`${researchSources.source}->>'indicator' = ${indicator}`))
        .orderBy(desc(researchSources.fetchedAt)).limit(12)
      candidates.push(...rows.map(row => row.source))
    } catch { /* Bundled observations still work when persistence is unavailable. */ }
  }
  return candidates.map(item => preparePublicSource(item)).filter((item): item is SearchResult => item !== null && item.country === country && item.indicator === indicator)
    .sort((a, b) => (b.observationYear ?? 0) - (a.observationYear ?? 0) || b.fetchedAt.localeCompare(a.fetchedAt))[0] ?? null
}

export async function readStoredPublicSource(url: string): Promise<SearchResult | null> {
  if (!storedDatabase()) return null
  try {
    const rows = await db.select({ source: researchSources.source }).from(researchSources)
      .where(and(eq(researchSources.urlHash, hash(url)), gt(researchSources.expiresAt, new Date())))
      .orderBy(desc(researchSources.fetchedAt)).limit(1)
    return preparePublicSource(rows[0]?.source)
  } catch { return null }
}

export async function pruneResearchHistory(now = new Date()): Promise<void> {
  if (!storedDatabase()) return
  const before = new Date(now.getTime() - 90 * 86_400_000)
  // A bounded batch avoids long table locks when maintenance catches up.
  await db.execute(sql`delete from ${researchSources} where ${researchSources.id} in
    (select ${researchSources.id} from ${researchSources} where ${researchSources.expiresAt} < ${before} order by ${researchSources.expiresAt} limit 1000)`)
}
