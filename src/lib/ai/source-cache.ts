import { Redis } from '@upstash/redis'
import { createHash } from 'node:crypto'
import type { SearchResult } from './search'

const pages = new Map<string, SearchResult>()
const redis = () => process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  ? Redis.fromEnv({ retry: { retries: 0 }, signal: () => AbortSignal.timeout(1500) }) : null
const keyFor = (url: string) => 'validore:research:page:v1:' + createHash('sha256').update(url).digest('hex')
const valid = (value: unknown, url: string): value is SearchResult => {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<SearchResult>
  return item.url === url && typeof item.content === 'string' && item.content.length <= 12_000 &&
    typeof item.title === 'string' && typeof item.source === 'string' && typeof item.fetchedAt === 'string' &&
    typeof item.expiresAt === 'string' && Date.parse(item.expiresAt) > Date.now() && Date.parse(item.fetchedAt) <= Date.now()
}

export async function cachedSource(url: string): Promise<SearchResult | null> {
  const key = keyFor(url)
  const local = pages.get(key)
  if (valid(local, url)) return local
  pages.delete(key)
  try {
    const shared = await redis()?.get<unknown>(key)
    if (valid(shared, url)) {
      if (pages.size >= 150) pages.delete(pages.keys().next().value!)
      pages.set(key, shared)
      return shared
    }
  } catch { /* Research remains available when the optional cache is offline. */ }
  return null
}

export async function cacheSource(source: SearchResult, seconds = 21_600) {
  if (!source.content || source.content.length > 12_000 || !Number.isFinite(Date.parse(source.fetchedAt)) || !Number.isFinite(seconds) || seconds <= 0) return
  const ttl = Math.max(60, Math.min(86_400, Math.floor(seconds)))
  const value = { ...source, expiresAt: new Date(Date.parse(source.fetchedAt) + ttl * 1000).toISOString() }
  if (Date.parse(value.expiresAt) <= Date.now()) return
  const key = keyFor(source.url)
  if (pages.size >= 150) pages.delete(pages.keys().next().value!)
  pages.set(key, value)
  try { await redis()?.set(key, value, { ex: ttl }) } catch { /* A cache write never blocks a report. */ }
}
