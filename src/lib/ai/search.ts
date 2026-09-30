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

export async function webSearch(
  query: string,
  maxResults = 5
): Promise<SearchResponse> {
  const tavilyKey = process.env.TAVILY_API_KEY
  const serperKey = process.env.SERPER_API_KEY
  const fetchedAt = new Date().toISOString()

  if (!tavilyKey && !serperKey) {
    return { results: [], degraded: true, evidenceStrength: 'WEAK' }
  }

  try {
    if (tavilyKey) {
      const res = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tavilyKey}`,
        },
        body: JSON.stringify({
          query,
          max_results: maxResults,
          search_depth: 'advanced',
        }),
        signal: AbortSignal.timeout(15000),
      })
      if (!res.ok) throw new Error(`Tavily ${res.status}`)
      const data = await res.json()
      return {
        results: (data.results ?? []).map((r: { title: string; url: string; content: string }) => ({
          title: r.title,
          url: r.url,
          content: r.content,
          source: (() => { try { return new URL(r.url).hostname } catch { return r.url } })(),
          fetchedAt,
        })),
        degraded: false,
        evidenceStrength: 'MODERATE',
      }
    }

    // Serper fallback
    const res = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': serperKey!,
      },
      body: JSON.stringify({ q: query, num: maxResults }),
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) throw new Error(`Serper ${res.status}`)
    const data = await res.json()
    return {
      results: (data.organic ?? []).map((r: { title: string; link: string; snippet: string }) => ({
        title: r.title,
        url: r.link,
        content: r.snippet,
        source: (() => { try { return new URL(r.link).hostname } catch { return r.link } })(),
        fetchedAt,
      })),
      degraded: false,
      evidenceStrength: 'MODERATE',
    }
  } catch {
    return { results: [], degraded: true, evidenceStrength: 'WEAK' }
  }
}