import { AsyncLocalStorage } from 'node:async_hooks'
import { createHash } from 'node:crypto'
import { Redis } from '@upstash/redis'

type Scope = { budgetId: string; operation?: { kind: 'search' | 'page' | 'data'; key: string } }
type State = { expires: number; attempts: number; active: number; bytes: number; reservedBytes: number; elapsed: number; reservedMs: number; operations: Record<string, number>; seen: Set<string> }
const scope = new AsyncLocalStorage<Scope>()
export const currentResearchBudgetId = () => scope.getStore()?.budgetId
const memory = new Map<string, State>()
export const RESEARCH_HTTP_LIMITS = Object.freeze({ search: 2, page: 3, data: 1, attempts: 8, concurrent: 2, milliseconds: 25_000, bytes: 4_000_000 })
const hash = (value: string) => createHash('sha256').update(value).digest('hex')
const redis = () => process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  ? Redis.fromEnv({ retry: { retries: 0 }, signal: () => AbortSignal.timeout(1500) }) : null

/** The opaque run identity contains no query or private founder information.
 * Nested tools inherit one admission budget, including redirects and retries. */
export function withResearchHttpBudget<T>(budgetId: string, run: () => Promise<T>, operation?: Scope['operation']): Promise<T> {
  return scope.run({ budgetId, operation }, run)
}

export class ResearchBudgetExceeded extends Error {
  constructor() { super('The shared research budget is unavailable or exhausted. Use qualified local evidence and record the remaining gaps.'); this.name = 'ResearchBudgetExceeded' }
}

/** Reserve response bytes and request time before transport starts. Releasing
 * unused reservations permits small successful reads without exceeding caps. */
export async function reserveResearchHttp(url: string, maxBytes: number): Promise<{ timeoutMs: number; finish: (bytes: number) => Promise<void> } | null> {
  const context = scope.getStore()
  if (!context) return null // Non-agent public import callers retain their own bounded transport.
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0 || maxBytes > 1_000_000) throw new ResearchBudgetExceeded()
  const operation = context.operation ?? { kind: new URL(url).hostname === 'api.worldbank.org' ? 'data' : 'page', key: url }
  const key = 'validore:research:http:v1:' + hash(context.budgetId)
  const operationKey = 'op:' + hash(operation.kind + ':' + operation.key)
  const cap = RESEARCH_HTTP_LIMITS[operation.kind]
  const client = redis()
  let timeoutMs = 0
  const started = Date.now()
  if (client) {
    try {
      timeoutMs = Number(await client.eval(`
        local attempts=tonumber(redis.call('HGET',KEYS[1],'attempts') or '0')
        local active=tonumber(redis.call('HGET',KEYS[1],'active') or '0')
        local used=tonumber(redis.call('HGET',KEYS[1],'bytes') or '0')+tonumber(redis.call('HGET',KEYS[1],'reservedBytes') or '0')
        local remaining=25000-tonumber(redis.call('HGET',KEYS[1],'elapsed') or '0')-tonumber(redis.call('HGET',KEYS[1],'reservedMs') or '0')
        local seen=redis.call('HEXISTS',KEYS[1],ARGV[1])
        if attempts>=8 or active>=2 or used+tonumber(ARGV[4])>4000000 or remaining<1 or (seen==0 and tonumber(redis.call('HGET',KEYS[1],ARGV[2]) or '0')>=tonumber(ARGV[3])) then return 0 end
        local duration=math.min(10000,remaining)
        if seen==0 then redis.call('HSET',KEYS[1],ARGV[1],1); redis.call('HINCRBY',KEYS[1],ARGV[2],1) end
        redis.call('HINCRBY',KEYS[1],'attempts',1); redis.call('HINCRBY',KEYS[1],'active',1)
        redis.call('HINCRBY',KEYS[1],'reservedBytes',ARGV[4]); redis.call('HINCRBY',KEYS[1],'reservedMs',duration)
        redis.call('EXPIRE',KEYS[1],86400); return duration`, [key], [operationKey, operation.kind, cap, maxBytes]))
    } catch { throw new ResearchBudgetExceeded() }
  } else {
    if (process.env.NODE_ENV === 'production') throw new ResearchBudgetExceeded()
    for (const [id, state] of memory) if (state.expires <= started) memory.delete(id)
    if (!memory.has(key) && memory.size >= 200) throw new ResearchBudgetExceeded()
    const state = memory.get(key) ?? { expires: started + 86_400_000, attempts: 0, active: 0, bytes: 0, reservedBytes: 0, elapsed: 0, reservedMs: 0, operations: {}, seen: new Set<string>() }
    const remaining = RESEARCH_HTTP_LIMITS.milliseconds - state.elapsed - state.reservedMs
    if (state.attempts >= RESEARCH_HTTP_LIMITS.attempts || state.active >= RESEARCH_HTTP_LIMITS.concurrent || state.bytes + state.reservedBytes + maxBytes > RESEARCH_HTTP_LIMITS.bytes || remaining < 1 ||
        !state.seen.has(operationKey) && (state.operations[operation.kind] ?? 0) >= cap) throw new ResearchBudgetExceeded()
    if (!state.seen.has(operationKey)) { state.seen.add(operationKey); state.operations[operation.kind] = (state.operations[operation.kind] ?? 0) + 1 }
    timeoutMs = Math.min(10_000, remaining)
    state.attempts++; state.active++; state.reservedBytes += maxBytes; state.reservedMs += timeoutMs
    memory.set(key, state)
  }
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 10_000) throw new ResearchBudgetExceeded()
  let finished = false
  return { timeoutMs, finish: async bytes => {
    if (finished) return
    finished = true
    const elapsed = Math.min(timeoutMs, Math.max(0, Date.now() - started))
    const consumed = Number.isFinite(bytes) ? Math.min(maxBytes, Math.max(0, Math.ceil(bytes))) : maxBytes
    if (client) {
      try { await client.eval("redis.call('HINCRBY',KEYS[1],'active',-1); redis.call('HINCRBY',KEYS[1],'reservedBytes',-tonumber(ARGV[1])); redis.call('HINCRBY',KEYS[1],'reservedMs',-tonumber(ARGV[2])); redis.call('HINCRBY',KEYS[1],'bytes',ARGV[3]); redis.call('HINCRBY',KEYS[1],'elapsed',ARGV[4]); return 1", [key], [maxBytes, timeoutMs, consumed, elapsed]) }
      catch { /* An abandoned reservation remains charged; never reopen capacity on uncertainty. */ }
    } else {
      const state = memory.get(key)
      if (state) { state.active--; state.reservedBytes -= maxBytes; state.reservedMs -= timeoutMs; state.bytes += consumed; state.elapsed += elapsed }
    }
  } }
}
