import { parseHTML } from 'linkedom'
import { publicWebUrl, readPublicWeb } from './public-web'
import { cachedSearch, cacheSearch, searchDigest, acquireSearchLock } from './search-budget'
import { keyedSearch } from './keyed-search'
import { retrieveMarketMemory } from './market-memory'
import { retrievePublicResearch } from './research-store'
import { localObservationEvidence, parseLocalObservationQuery, type LocalObservationRequirement } from './local-evidence'
import { annualEvidenceRequirement, evaluateEvidenceCoverage, type EvidenceCoverage, type EvidenceObservation, type EvidenceRequirement } from './evidence-requirements'
import { createResearchCoalescer } from './research-coalescing'
import { withResearchHttpBudget } from './research-http-budget'

export type SearchResult = {
  title: string
  url: string
  content: string
  source: string
  fetchedAt: string
  retrievalKind?: 'snippet' | 'page' | 'memory' | 'open-data'
  publishedAt?: string | null
  dataPeriod?: string
  expiresAt?: string
  datasetId?: string
  country?: string
  countryName?: string
  indicator?: string
  value?: number
  unit?: string
  observationYear?: number
  metadataUpdatedAt?: string
  dataBundleVersion?: string
  licenseUrl?: string
  retrievalUrl?: string
  contentHash?: string
  supersededBy?: string
  observations?: EvidenceObservation[]
  observationScope?: 'latest-available' | 'historical'
  excerpted?: boolean
  originalContentHash?: string
}
export type SearchResponse = {
  results: SearchResult[]
  degraded: boolean
  evidenceStrength: 'WEAK' | 'MODERATE' | 'STRONGER'
  providers?: string[]
  keyedAttemptedAt?: number
  coverage?: EvidenceCoverage[]
}
export type SearchOptions = { signal?: AbortSignal; allowKeyed?: boolean; budgetId?: string; observationRequirement?: LocalObservationRequirement; requirements?: EvidenceRequirement[]; existingSources?: SearchResult[] }
const clean = (value: unknown, limit: number) => typeof value === 'string' ? value.replace(/[\x00-\x1f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, limit) : ''

function source(title: unknown, link: unknown, content: unknown): SearchResult | null {
  if (typeof link !== 'string') return null
  try {
    const url = publicWebUrl(link)
    const safeTitle = clean(title, 250)
    if (!safeTitle) return null
    return { title: safeTitle, url: url.href, content: clean(content, 1800), source: url.hostname, fetchedAt: new Date().toISOString() }
  } catch { return null }
}
const present = (value: SearchResult | null): value is SearchResult => value !== null

export function deduplicateSources(results: SearchResult[]): SearchResult[] {
  const known = new Map<string, SearchResult>()
  const quality = (source: SearchResult) => source.retrievalKind === 'page' || source.retrievalKind === 'open-data' ? 3 : source.retrievalKind === 'memory' ? 2 : 1
  for (const result of results) {
    const previous = known.get(result.url)
    if (!previous || quality(result) > quality(previous) || (quality(result) === quality(previous) && result.content.length > previous.content.length)) known.set(result.url, result)
  }
  return [...known.values()]
}

async function duckDuckGo(query: string, count: number, options: SearchOptions) {
  const page = await readPublicWeb('https://html.duckduckgo.com/html/?q=' + encodeURIComponent(query), options)
  const { document } = parseHTML(page.text)
  return Array.from(document.querySelectorAll('.result')).slice(0, count).map(element => {
    const anchor = element.querySelector('.result__a')
    if (!anchor) return null
    let link = anchor.getAttribute('href') || ''
    try {
      const target = new URL(link, 'https://duckduckgo.com')
      link = target.searchParams.get('uddg') || target.href
    } catch { return null }
    return source(anchor.textContent, link, element.querySelector('.result__snippet')?.textContent)
  }).filter(present)
}

async function searxng(query: string, count: number, options: SearchOptions) {
  const url = publicWebUrl(process.env.SEARXNG_BASE_URL!.replace(/\/$/, '') + '/search')
  url.searchParams.set('q', query)
  url.searchParams.set('format', 'json')
  const page = await readPublicWeb(url.href, options)
  const data = JSON.parse(page.text) as { results?: { title?: string; url?: string; content?: string }[] }
  return (data.results ?? []).slice(0, count).map(item => source(item.title, item.url, item.content)).filter(present)
}

async function wikipedia(query: string, count: number, options: SearchOptions) {
  const page = await readPublicWeb('https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&srlimit=' + count + '&srsearch=' + encodeURIComponent(query), options)
  const data = JSON.parse(page.text) as { query?: { search?: { title: string; snippet: string; pageid: number }[] } }
  return (data.query?.search ?? []).map(item => source(item.title, 'https://en.wikipedia.org/?curid=' + item.pageid,
    parseHTML('<div>' + item.snippet + '</div>').document.documentElement.textContent)).filter(present)
}

async function crossref(query: string, count: number, options: SearchOptions) {
  const page = await readPublicWeb('https://api.crossref.org/works?rows=' + count + '&query=' + encodeURIComponent(query), options)
  const data = JSON.parse(page.text) as { message?: { items?: { title?: string[]; URL?: string; publisher?: string; 'container-title'?: string[]; abstract?: string }[] } }
  return (data.message?.items ?? []).map(item => source(item.title?.[0], item.URL,
    [item['container-title']?.[0], item.publisher, item.abstract ? parseHTML('<div>' + item.abstract + '</div>').document.documentElement.textContent : 'Bibliographic record only; the full study has not been read.'].filter(Boolean).join('. '))).filter(present)
}

async function publicSearch(query: string, maxResults = 5, options: SearchOptions = {}): Promise<SearchResponse> {
  const safeQuery = clean(query, 350)
  const count = Number.isFinite(maxResults) ? Math.max(1, Math.min(8, Math.floor(maxResults))) : 5
  if (!safeQuery) return { results: [], degraded: true, evidenceStrength: 'WEAK', providers: [] }
  const adapters = process.env.SEARXNG_BASE_URL
    ? [{ name: 'SearXNG', run: searxng }, { name: 'DuckDuckGo', run: duckDuckGo }]
    : [{ name: 'DuckDuckGo', run: duckDuckGo }]
  const results: SearchResult[] = []
  const providers: string[] = []
  for (const adapter of adapters) {
    if (options.signal?.aborted) break
    try {
      const found = await adapter.run(safeQuery, count, options)
      if (found.length) { results.push(...found); providers.push(adapter.name); break }
    } catch { /* A blocked public search is not evidence. Try open indexes. */ }
  }
  const generalSearchSucceeded = results.length > 0
  if (!generalSearchSucceeded && !options.signal?.aborted) {
    const fallback = await Promise.allSettled([wikipedia(safeQuery, count, options), crossref(safeQuery, Math.min(3, count), options)])
    fallback.forEach((item, index) => {
      if (item.status === 'fulfilled' && item.value.length) {
        results.push(...item.value)
        providers.push(index === 0 ? 'Wikipedia' : 'Crossref')
      }
    })
  }
  return { results: deduplicateSources(results).slice(0, count), degraded: !generalSearchSucceeded, evidenceStrength: 'WEAK', providers }
}

const coalesce = createResearchCoalescer<SearchResponse>()

/** Reuse sources first. Only an explicit agent request can spend a search credit,
 * and only when general web results are insufficient. Bibliographic records alone
 * cannot establish current competitor pricing or demand.
 */
export async function webSearch(query: string, maxResults = 5, options: SearchOptions = {}): Promise<SearchResponse> {
  const safeQuery = clean(query, 350)
  if (!safeQuery) return { results: [], degraded: true, evidenceStrength: 'WEAK', providers: [] }
  const count = Number.isFinite(maxResults) ? Math.max(1, Math.min(8, Math.floor(maxResults))) : 5
  options.signal?.throwIfAborted()
  // A truncated multi-purpose query must never become a narrow local lookup.
  const requirement = options.observationRequirement ?? (query.length <= 350 ? parseLocalObservationQuery(safeQuery) : null)
  const requirements = options.requirements?.slice(0, 20) ?? (requirement ? [annualEvidenceRequirement(requirement)] : [])
  if (requirement) {
    const local = localObservationEvidence(requirement)
    const coverage = evaluateEvidenceCoverage(requirements, local)
    if (local.length && coverage.every(value => value.status === 'covered')) return { results: local.slice(0, count), degraded: false, evidenceStrength: 'WEAK', providers: ['Local annual observations'], coverage }
  }
  // Candidates are obtained before adapters. Retrieval relevance alone does not
  // suppress live work; every explicit material requirement must qualify.
  const remembered = deduplicateSources([...(options.existingSources ?? []), ...await retrievePublicResearch(safeQuery, 8), ...retrieveMarketMemory(safeQuery, { maxResults: 3 })])
  options.signal?.throwIfAborted()
  const localCoverage = evaluateEvidenceCoverage(requirements, remembered)
  if (localCoverage.length && localCoverage.every(value => value.status === 'covered')) {
    const urls = new Set(localCoverage.flatMap(value => value.sourceUrls))
    const results = remembered.filter(source => urls.has(source.url)).slice(0, count)
    const coverage = evaluateEvidenceCoverage(requirements, results)
    return { results, degraded: coverage.some(value => value.status === 'gap'), evidenceStrength: 'WEAK', providers: ['Qualified stored evidence'], coverage }
  }
  const digest = searchDigest(safeQuery)
  const requirementKey = requirement ? ':' + [requirement.country, requirement.indicator, requirement.period].join('/') : ''
  const key = digest + requirementKey + ':' + searchDigest(JSON.stringify(requirements)) + ':' + (options.budgetId ?? 'public') + (options.allowKeyed ? ':agent' : ':public')
  const result = await coalesce(key, options.signal, async sharedSignal => {
    const sharedOptions = { ...options, signal: sharedSignal }
    const work = async () => {
      const cached = await cachedSearch(digest)
      const cacheCovers = cached && (!requirements.length || evaluateEvidenceCoverage(requirements, [...remembered, ...cached.results]).every(value => value.status === 'covered'))
      if (!cacheCovers && requirement?.period === 'latest-available' && options.budgetId) {
        // A known authoritative indicator endpoint precedes broad discovery.
        try {
          const { readMarketIndicator, OPEN_INDICATORS } = await import('./open-data')
          const indicator = (Object.keys(OPEN_INDICATORS) as (keyof typeof OPEN_INDICATORS)[]).find(key => OPEN_INDICATORS[key].id === requirement.indicator)
          if (indicator) {
            const direct = await withResearchHttpBudget(options.budgetId, () => readMarketIndicator(requirement.country, indicator, sharedSignal))
            const directCoverage = evaluateEvidenceCoverage(requirements, [...remembered, direct.source])
            if (directCoverage.every(value => value.status === 'covered')) return { results: [direct.source], degraded: false, evidenceStrength: 'WEAK' as const, providers: ['Original official dataset'] }
          }
        } catch { /* A failed original read is an unresolved requirement, not evidence. */ }
      }
      let result = cacheCovers ? cached : await publicSearch(safeQuery, 8, sharedOptions)
      const hasKey = ['TAVILY_API_KEY', 'SERPER_API_KEY', 'SERPAPI_API_KEY'].some(name => Boolean(process.env[name]?.trim()))
      const needsSearch = (value: SearchResponse) => (value.degraded || value.results.length < 2) && (!value.keyedAttemptedAt || Date.now() - value.keyedAttemptedAt >= 180_000)
      if (options.allowKeyed && options.budgetId && hasKey && needsSearch(result) && !sharedSignal.aborted) {
        const release = await acquireSearchLock(digest)
        if (release) {
          try {
            const latest = await cachedSearch(digest)
            if (latest && !needsSearch(latest)) result = latest
            else {
              const extra = await keyedSearch(safeQuery, 8, options.budgetId, sharedSignal)
              result = { ...result, keyedAttemptedAt: Date.now() }
              if (extra.results.length) result = { ...result, results: deduplicateSources([...extra.results, ...result.results]).slice(0, 8), degraded: false, evidenceStrength: 'WEAK', providers: [...(result.providers ?? []), extra.provider!] }
            }
          } finally { await release() }
        }
      }
      if ((!cached || result !== cached) && !sharedSignal.aborted) await cacheSearch(digest, result)
      return result
    }
    return options.budgetId ? withResearchHttpBudget(options.budgetId, work, { kind: 'search', key: digest }) : work()
  })
  options.signal?.throwIfAborted()
  const combined = deduplicateSources([...remembered, ...result.results])
  const coverage = evaluateEvidenceCoverage(requirements, combined)
  const qualified = new Set(coverage.flatMap(value => value.sourceUrls))
  // Qualified local observations stay ahead of leads even in a partial answer.
  const sorted = [...combined.filter(source => qualified.has(source.url)), ...result.results.filter(source => !qualified.has(source.url)), ...remembered.filter(source => !qualified.has(source.url))]
  const results = deduplicateSources(sorted).slice(0, count)
  return { ...result, results, ...(coverage.length ? { coverage: evaluateEvidenceCoverage(requirements, results) } : {}),
    ...(remembered.length ? { providers: [...(result.providers ?? []), 'Market memory'] } : {}) }
}
