export type SearchResult = {
  title: string
  url: string
  content: string
  source: string
  fetchedAt: string // ISO 8601
}

export type SearchResponse = {
  results: SearchResult[]
  degraded: boolean
  evidenceStrength: 'WEAK' | 'MODERATE' | 'STRONGER'
}

// Maximum response body size from a search provider (1 MB).
const MAX_RESPONSE_BYTES = 1_000_000

// Per-provider request timeout (ms).
const SEARCH_TIMEOUT_MS = 15_000

async function readBoundedJson(response: Response): Promise<unknown> {
  const reader = response.body?.getReader()
  if (!reader) return response.json()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > MAX_RESPONSE_BYTES) throw new Error('Search response too large')
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

function hostname(url: string): string {
  try { return new URL(url).hostname } catch { return String(url).slice(0, 100) }
}

function sanitizeQuery(query: string): string {
  return String(query).slice(0, 500).replace(/[\x00-\x1F]/g, ' ').trim()
}

function toStrength(count: number): 'WEAK' | 'MODERATE' | 'STRONGER' {
  if (count >= 5) return 'STRONGER'
  if (count >= 3) return 'MODERATE'
  return 'WEAK'
}

// ─── Provider adapters ──────────────────────────────────────────────────────

async function tavilySearch(query: string, maxResults: number, apiKey: string): Promise<SearchResult[]> {
  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ query, max_results: Math.min(maxResults, 10), search_depth: 'advanced' }),
    signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`Tavily ${res.status}`)
  const data = await readBoundedJson(res) as { results?: { title: string; url: string; content: string }[] }
  const fetchedAt = new Date().toISOString()
  return (data.results ?? [])
    .slice(0, maxResults)
    .map((r) => ({
      title: String(r.title ?? '').slice(0, 300),
      url: String(r.url ?? ''),
      content: String(r.content ?? '').slice(0, 1000),
      source: hostname(r.url),
      fetchedAt,
    }))
    .filter((r) => r.url && r.title)
}

async function serperSearch(query: string, maxResults: number, apiKey: string): Promise<SearchResult[]> {
  const res = await fetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-KEY': apiKey },
    body: JSON.stringify({ q: query, num: Math.min(maxResults, 10) }),
    signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`Serper ${res.status}`)
  const data = await readBoundedJson(res) as { organic?: { title: string; link: string; snippet: string }[] }
  const fetchedAt = new Date().toISOString()
  return (data.organic ?? [])
    .slice(0, maxResults)
    .map((r) => ({
      title: String(r.title ?? '').slice(0, 300),
      url: String(r.link ?? ''),
      content: String(r.snippet ?? '').slice(0, 1000),
      source: hostname(r.link),
      fetchedAt,
    }))
    .filter((r) => r.url && r.title)
}

async function serpApiSearch(query: string, maxResults: number, apiKey: string, baseUrl: string): Promise<SearchResult[]> {
  const url = new URL(baseUrl)
  url.searchParams.set('engine', 'google')
  url.searchParams.set('q', query)
  url.searchParams.set('num', String(Math.min(maxResults, 10)))
  url.searchParams.set('api_key', apiKey)
  const res = await fetch(url.toString(), {
    method: 'GET',
    signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
    redirect: 'follow',
  })
  if (!res.ok) throw new Error(`SerpAPI ${res.status}`)
  const data = await readBoundedJson(res) as {
    organic_results?: { title: string; link: string; snippet?: string; displayed_link?: string }[]
  }
  const fetchedAt = new Date().toISOString()
  return (data.organic_results ?? [])
    .slice(0, maxResults)
    .map((r) => ({
      title: String(r.title ?? '').slice(0, 300),
      url: String(r.link ?? ''),
      content: String(r.snippet ?? r.displayed_link ?? '').slice(0, 1000),
      source: hostname(r.link),
      fetchedAt,
    }))
    .filter((r) => r.url && r.title)
}

// Deduplicate by URL so merging multiple provider results stays clean.
function deduplicateByUrl(results: SearchResult[]): SearchResult[] {
  const seen = new Set<string>()
  return results.filter((r) => {
    if (seen.has(r.url)) return false
    seen.add(r.url)
    return true
  })
}

// ─── Main entry point ───────────────────────────────────────────────────────

export async function webSearch(
  query: string,
  maxResults = 5
): Promise<SearchResponse> {
  const tavilyKey = process.env.TAVILY_API_KEY?.trim()
  const serperKey = process.env.SERPER_API_KEY?.trim()
  const serpApiKey = process.env.SERPAPI_API_KEY?.trim()
  const serpApiBase = (process.env.SERPAPI_BASE_URL?.trim()) || 'https://serpapi.com/search'

  // No keys configured at all → degrade gracefully
  if (!tavilyKey && !serperKey && !serpApiKey) {
    return { results: [], degraded: true, evidenceStrength: 'WEAK' }
  }

  const safeQuery = sanitizeQuery(query)
  const cap = Math.min(maxResults, 10)

  // Try all three providers in cascade; first success wins, later providers fill gaps.
  // We attempt them concurrently to minimise latency, then merge and deduplicate.
  const settled = await Promise.allSettled([
    tavilyKey  ? tavilySearch(safeQuery, cap, tavilyKey)                    : Promise.reject(new Error('no-key')),
    serperKey  ? serperSearch(safeQuery, cap, serperKey)                    : Promise.reject(new Error('no-key')),
    serpApiKey ? serpApiSearch(safeQuery, cap, serpApiKey, serpApiBase)      : Promise.reject(new Error('no-key')),
  ])

  // Flatten results: Tavily first (richer content), then Serper, then SerpAPI.
  const merged: SearchResult[] = []
  for (const s of settled) {
    if (s.status === 'fulfilled') merged.push(...s.value)
  }

  const results = deduplicateByUrl(merged).slice(0, maxResults)

  // If every provider errored or returned nothing, degrade.
  if (results.length === 0) {
    return { results: [], degraded: true, evidenceStrength: 'WEAK' }
  }

  return {
    results,
    degraded: false,
    evidenceStrength: toStrength(results.length),
  }
}
