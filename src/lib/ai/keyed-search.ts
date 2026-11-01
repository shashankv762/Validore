import type { SearchResult } from './search'
import { publicWebUrl } from './public-web'
import { reserveKeyedSearch } from './search-budget'

const cooldown = new Map<string, number>()
type Row = { title?: string; url?: string; link?: string; content?: string; snippet?: string }
async function readJson(response: Response): Promise<Record<string, unknown>> {
  const reader = response.body?.getReader()
  if (!reader) throw new Error('Empty search response')
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) break
      size += next.value.byteLength
      if (size > 1_000_000) { await reader.cancel(); throw new Error('Search response too large') }
      chunks.push(next.value)
    }
  } finally { reader.releaseLock() }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

/** Used only after keyless search is insufficient and an agent requests more
 * evidence. Never fan out to all paid search APIs for the same query.
 */
export async function keyedSearch(query: string, count: number, budgetId: string, signal?: AbortSignal): Promise<{ results: SearchResult[]; provider?: string }> {
  const providers = (process.env.SEARCH_PROVIDER_ORDER || 'tavily,serper,serpapi').split(',').map(value => value.trim())
  for (const provider of [...new Set(providers)]) {
    if (!['tavily', 'serper', 'serpapi'].includes(provider)) continue
    const key = process.env[provider.toUpperCase() + '_API_KEY']?.trim()
    if (!key || (cooldown.get(provider) ?? 0) > Date.now()) continue
    if (!(await reserveKeyedSearch(budgetId))) break
    try {
      const timeout = signal ? AbortSignal.any([signal, AbortSignal.timeout(8000)]) : AbortSignal.timeout(8000)
      let url: string
      let init: RequestInit
      if (provider === 'tavily') {
        url = 'https://api.tavily.com/search'
        init = { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, max_results: Math.min(count, 5), search_depth: 'basic', include_answer: false, include_raw_content: false }) }
      } else if (provider === 'serper') {
        url = 'https://google.serper.dev/search'
        init = { method: 'POST', headers: { 'X-API-KEY': key, 'Content-Type': 'application/json' }, body: JSON.stringify({ q: query, num: Math.min(count, 5) }) }
      } else {
        const target = new URL('https://serpapi.com/search.json')
        target.search = new URLSearchParams({ engine: 'google', q: query, num: String(Math.min(count, 5)), api_key: key }).toString()
        url = target.href
        init = { method: 'GET' }
      }
      const response = await fetch(url, { ...init, signal: timeout, redirect: 'error', cache: 'no-store' })
      if (!response.ok) {
        cooldown.set(provider, Date.now() + ([401, 402, 403, 429].includes(response.status) ? 300_000 : 30_000))
        continue
      }
      const data = await readJson(response)
      const rows = (provider === 'tavily' ? data.results : provider === 'serper' ? data.organic : data.organic_results) as Row[] | undefined
      const results: SearchResult[] = []
      for (const row of Array.isArray(rows) ? rows.slice(0, count) : []) {
        try {
          const link = publicWebUrl(String(row.url || row.link || ''))
          if (!row.title) continue
          results.push({ title: String(row.title).slice(0, 250), url: link.href, content: String(row.content || row.snippet || '').slice(0, 1800), source: link.hostname, fetchedAt: new Date().toISOString() })
        } catch { /* Malformed search entries are not evidence. */ }
      }
      if (results.length) return { results, provider }
    } catch { /* Never log request URLs or provider errors containing a key. */ }
  }
  return { results: [] }
}
