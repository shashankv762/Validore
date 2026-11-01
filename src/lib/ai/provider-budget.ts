import { Redis } from '@upstash/redis'
import { randomUUID } from 'node:crypto'

const WINDOW_MS = 3_600_000
const memory = new Map<string, number[]>()

/** PixRouter reported a 60-request rolling hourly account limit. Reserve five
 * requests for operations outside this app. Catalogs and completions share
 * this allowance across agents, users, workers and model fallbacks.
 */
export async function reserveGatewayRequest(candidate: { id: string; fingerprint: string }): Promise<boolean> {
  const configured = process.env[candidate.id.toUpperCase() + '_REQUESTS_PER_HOUR']
  if (candidate.id !== 'pixrouter' && !configured) return true
  const parsed = Number(configured)
  const limit = configured && Number.isSafeInteger(parsed) && parsed >= 0 ? Math.min(parsed, 100_000) : 55
  if (limit === 0) return false
  const now = Date.now()
  const key = 'validore:ai:hour:' + candidate.fingerprint
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    try {
      const redis = Redis.fromEnv({ retry: { retries: 0 }, signal: () => AbortSignal.timeout(2000) })
      return Number(await redis.eval(
        "redis.call('ZREMRANGEBYSCORE',KEYS[1],'-inf',ARGV[1]); if redis.call('ZCARD',KEYS[1])>=tonumber(ARGV[2]) then return 0 end; redis.call('ZADD',KEYS[1],ARGV[3],ARGV[4]); redis.call('PEXPIRE',KEYS[1],ARGV[5]); return 1",
        [key], [now - WINDOW_MS, limit, now, randomUUID(), WINDOW_MS],
      )) === 1
    } catch { return false }
  }
  if (process.env.NODE_ENV === 'production') return false
  for (const [id, timestamps] of memory) {
    const active = timestamps.filter(timestamp => timestamp > now - WINDOW_MS)
    if (active.length) memory.set(id, active)
    else memory.delete(id)
  }
  const timestamps = memory.get(key) ?? []
  if (timestamps.length >= limit || (!memory.has(key) && memory.size >= 200)) return false
  memory.set(key, [...timestamps, now])
  return true
}
