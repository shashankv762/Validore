import { parseHTML } from 'linkedom'
import { publicWebUrl, readPublicWeb } from './public-web'
import { cachedSearch, cacheSearch, searchDigest, acquireSearchLock } from './search-budget'
import { keyedSearch } from './keyed-search'
import { retrieveMarketMemory } from './market-memory'
import { retrievePublicResearch } from './research-store'

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
  licenseUrl?: string
}
export type SearchResponse = {
  results: SearchResult[]
  degraded: boolean
  evidenceStrength: 'WEAK' | 'MODERATE' | 'STRONGER'
  providers?: string[]
  keyedAttemptedAt?: number
}
type SearchOptions = { signal?: AbortSignal; allowKeyed?: boolean; budgetId?: string }
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

const pending = new Map<string, Promise<SearchResponse>>()

/** Reuse sources first. Only an explicit agent request can spend a search credit,
 * and only when general web results are insufficient. Bibliographic records alone
 * cannot establish current competitor pricing or demand.
 */
export async function webSearch(query: string, maxResults = 5, options: SearchOptions = {}): Promise<SearchResponse> {
  const safeQuery = clean(query, 350)
  if (!safeQuery) return { results: [], degraded: true, evidenceStrength: 'WEAK', providers: [] }
  const count = Number.isFinite(maxResults) ? Math.max(1, Math.min(8, Math.floor(maxResults))) : 5
  const digest = searchDigest(safeQuery)
  const key = digest + (options.allowKeyed ? ':agent' : ':public')
  const existing = pending.get(key)
  if (existing) { const result = await existing; return { ...result, results: result.results.slice(0, count) } }
  const work = (async () => {
    const cached = await cachedSearch(digest)
    let result = cached ?? await publicSearch(safeQuery, 8, options)
    const hasKey = ['TAVILY_API_KEY', 'SERPER_API_KEY', 'SERPAPI_API_KEY'].some(name => Boolean(process.env[name]?.trim()))
    const needsSearch = (value: SearchResponse) => (value.degraded || value.results.length < 2) && (!value.keyedAttemptedAt || Date.now() - value.keyedAttemptedAt >= 180_000)
    if (options.allowKeyed && options.budgetId && hasKey && needsSearch(result) && !options.signal?.aborted) {
      const release = await acquireSearchLock(digest)
      if (release) {
        try {
          const latest = await cachedSearch(digest)
          if (latest && !needsSearch(latest)) result = latest
          else {
            const extra = await keyedSearch(safeQuery, 8, options.budgetId, options.signal)
            result = { ...result, keyedAttemptedAt: Date.now() }
            if (extra.results.length) result = { ...result, results: deduplicateSources([...extra.results, ...result.results]).slice(0, 8), degraded: false, evidenceStrength: 'WEAK', providers: [...(result.providers ?? []), extra.provider!] }
          }
        } finally { await release() }
      }
    }
    if ((!cached || result !== cached) && !options.signal?.aborted) await cacheSearch(digest, result)
    const remembered = [...await retrievePublicResearch(safeQuery, 4), ...retrieveMarketMemory(safeQuery, { maxResults: 3 })]
    return remembered.length ? { ...result, results: deduplicateSources([...result.results, ...remembered]), providers: [...(result.providers ?? []), 'Market memory'] } : result
  })()
  pending.set(key, work)
  try { const result = await work; return { ...result, results: result.results.slice(0, count) } } finally { pending.delete(key) }
}
