import { Redis } from '@upstash/redis'
import { createHash, randomUUID } from 'node:crypto'
import type { SearchResponse } from './search'

const memory = new Map<string, { expires: number; count: number }>()
const cache = new Map<string, { expires: number; value: SearchResponse }>()
export const searchDigest = (query: string) => createHash('sha256').update(query.toLowerCase().trim()).digest('hex')
const configuredRedis = () => process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  ? Redis.fromEnv({ retry: { retries: 0 }, signal: () => AbortSignal.timeout(2000) }) : null
const limit = (value: string | undefined, fallback: number, max: number) => {
  const number = value === undefined || value === '' ? fallback : Number(value)
  return Number.isInteger(number) && number >= 0 ? Math.min(max, number) : fallback
}

export async function cachedSearch(digest: string): Promise<SearchResponse | null> {
  const item = cache.get(digest)
  if (item && item.expires > Date.now()) return item.value
  try { return await configuredRedis()?.get<SearchResponse>('validore:search:cache:' + digest) ?? null } catch { return null }
}

export async function cacheSearch(digest: string, value: SearchResponse) {
  const seconds = value.results.length ? 21600 : 180
  if (cache.size >= 250) cache.delete(cache.keys().next().value!)
  cache.set(digest, { value, expires: Date.now() + seconds * 1000 })
  try { await configuredRedis()?.set('validore:search:cache:' + digest, value, { ex: seconds }) } catch { /* Cache failure cannot enable paid calls. */ }
}

/** One atomic reservation limits the whole report across agents and durable
 * worker replays, plus a global daily allowance across users.
 */
export async function reserveKeyedSearch(budgetId: string): Promise<boolean> {
  if (process.env.SEARCH_KEYED_ENABLED === 'false') return false
  const perReport = limit(process.env.SEARCH_KEYED_MAX_PER_REPORT, 2, 4)
  const perDay = limit(process.env.SEARCH_KEYED_DAILY_LIMIT, 30, 10000)
  if (!perReport || !perDay) return false
  const keys = ['validore:search:budget:' + searchDigest(budgetId), 'validore:search:daily:' + new Date().toISOString().slice(0, 10)]
  const redis = configuredRedis()
  if (redis) {
    try {
      return Number(await redis.eval(
        "local a=tonumber(redis.call('GET',KEYS[1]) or '0'); local b=tonumber(redis.call('GET',KEYS[2]) or '0'); if a>=tonumber(ARGV[1]) or b>=tonumber(ARGV[2]) then return 0 end; redis.call('INCR',KEYS[1]); redis.call('EXPIRE',KEYS[1],86400); redis.call('INCR',KEYS[2]); redis.call('EXPIRE',KEYS[2],172800); return 1",
        keys, [perReport, perDay],
      )) === 1
    } catch { return false }
  }
  if (process.env.NODE_ENV === 'production') return false
  for (const [key, value] of memory) if (value.expires <= Date.now()) memory.delete(key)
  if ((memory.get(keys[0])?.count ?? 0) >= perReport || (memory.get(keys[1])?.count ?? 0) >= perDay) return false
  if (memory.size >= 500) return false
  keys.forEach(key => memory.set(key, { count: (memory.get(key)?.count ?? 0) + 1, expires: Date.now() + 86400_000 }))
  return true
}

export async function acquireSearchLock(digest: string): Promise<(() => Promise<void>) | null> {
  const redis = configuredRedis()
  if (!redis) return process.env.NODE_ENV === 'production' ? null : async () => {}
  const key = 'validore:search:lock:' + digest
  const token = randomUUID()
  try {
    if (!(await redis.set(key, token, { nx: true, ex: 40 }))) return null
    return async () => {
      try { await redis.eval("if redis.call('GET',KEYS[1]) == ARGV[1] then return redis.call('DEL',KEYS[1]) else return 0 end", [key], [token]) } catch { /* Expiry releases abandoned locks. */ }
    }
  } catch { return null }
}
