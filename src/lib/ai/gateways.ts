import { createHash } from 'node:crypto'
import { z } from 'zod'

export type AgentRole = 'market' | 'customer' | 'competitor' | 'finance' | 'risk' | 'synthesis'
export type GatewayCandidate = { id: string; baseURL: string; apiKey: string; modelId: string; fingerprint: string }
type Environment = Record<string, string | undefined>
type Dependencies = { environment?: () => Environment; fetcher?: typeof fetch; now?: () => number }
type Catalog = { expires: number; models: Set<string> | null; authorized: boolean }
const profiles = [{ id: 'kios', prefix: 'KIOS' }, { id: 'seekai', prefix: 'SEEKAI' }, { id: 'agentrouter', prefix: 'AGENTROUTER' }] as const
const roles: AgentRole[] = ['market', 'customer', 'competitor', 'finance', 'risk', 'synthesis']
const modelList = (value?: string) => [...new Set((value ?? '').split(',').map(value => value.trim()).filter(value => /^\S{1,200}$/.test(value)))].slice(0, 30)

// Each instance caches catalogs and short failure cooldowns; keys never leave their configured host.
export function createGatewayRouter(dependencies: Dependencies = {}) {
  const environment = dependencies.environment ?? (() => process.env)
  const fetcher = dependencies.fetcher ?? ((...args: Parameters<typeof fetch>) => fetch(...args))
  const now = dependencies.now ?? Date.now
  const catalogs = new Map<string, Catalog>()
  const pending = new Map<string, Promise<Catalog>>()
  const failures = new Map<string, number>()
  const prune = () => {
    for (const [key, value] of catalogs) if (value.expires <= now()) catalogs.delete(key)
    for (const [key, expiry] of failures) if (expiry <= now()) failures.delete(key)
  }
  const catalog = async (config: GatewayCandidate, timeoutMs: number): Promise<Catalog> => {
    const cached = catalogs.get(config.fingerprint)
    if (cached && cached.expires > now()) return cached
    const inFlight = pending.get(config.fingerprint)
    if (inFlight) return inFlight
    const request = (async () => {
      let result: Catalog = { models: null, authorized: true, expires: now() + 30_000 }
      try {
        const response = await fetcher(config.baseURL + '/models', {
          headers: { Authorization: 'Bearer ' + config.apiKey }, redirect: 'error', cache: 'no-store',
          signal: AbortSignal.timeout(Math.max(1, timeoutMs)),
        })
        if (response.status === 401) {
          result = { models: null, authorized: false, expires: now() + 60_000 }
        } else if (response.ok) {
          // Bound provider-controlled JSON before parsing it.
          const reader = response.body?.getReader()
          if (reader) {
            const chunks: Uint8Array[] = []
            let size = 0
            try {
              while (true) {
                const chunk = await reader.read()
                if (chunk.done) break
                size += chunk.value.byteLength
                if (size > 1_000_000) { await reader.cancel(); throw new Error('Catalog too large') }
                chunks.push(chunk.value)
              }
            } finally { reader.releaseLock() }
            const body: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
            if (body && typeof body === 'object' && 'data' in body && Array.isArray(body.data)) {
              const ids = body.data.flatMap((item: unknown) => item && typeof item === 'object' && 'id' in item && typeof item.id === 'string' ? [item.id] : [])
              // A malformed catalog is unknown, rather than proof that configured models are absent.
              if (body.data.length === 0 || ids.length > 0) result = { models: new Set(ids), authorized: true, expires: now() + 300_000 }
            }
          }
        }
      } catch {
        // No raw provider response/errors in logs: they can contain credentials or founder input.
      }
      catalogs.set(config.fingerprint, result)
      return result
    })()
    pending.set(config.fingerprint, request)
    try { return await request } finally { pending.delete(config.fingerprint) }
  }
  return {
    async candidates({ role, freeOnly = false, timeoutMs = 5_000 }: { role?: AgentRole; freeOnly?: boolean; timeoutMs?: number } = {}): Promise<GatewayCandidate[]> {
      prune()
      const env = environment()
      const order = modelList(env.AI_GATEWAY_ORDER)
      const configs = profiles.flatMap(profile => {
        const apiKey = env[profile.prefix + '_API_KEY']?.trim()
        if (!apiKey || apiKey === 'no-key') return []
        try {
          const url = new URL(env[profile.prefix + '_BASE_URL'] ?? '')
          if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return []
          const baseURL = url.toString().replace(/\/$/, '')
          const fingerprint = createHash('sha256').update(profile.id + baseURL + apiKey).digest('hex')
          const free = new Set(modelList(env[profile.prefix + '_FREE_MODELS']))
          let models = modelList(env[profile.prefix + '_MODELS']).filter(id => !freeOnly || free.has(id))
          const preferred = role ? modelList(env['AI_AGENT_' + role.toUpperCase() + '_MODELS']) : []
          models = [...models.filter(id => preferred.includes(id)), ...models.filter(id => !preferred.includes(id))]
          if (models.length === 0) return []
          return [{ id: profile.id, apiKey, baseURL, fingerprint, models }]
        } catch { return [] }
      }).sort((a, b) => {
        const rank = (id: string) => order.includes(id) ? order.indexOf(id) : order.length + profiles.findIndex(profile => profile.id === id)
        return rank(a.id) - rank(b.id)
      })
      const offset = role && configs.length ? roles.indexOf(role) % configs.length : 0
      const rotated = [...configs.slice(offset), ...configs.slice(0, offset)]
      const lists = await Promise.all(rotated.map(async config => {
        if ((failures.get(config.fingerprint) ?? 0) > now()) return []
        const available = await catalog({ ...config, modelId: config.models[0] }, Math.max(1, Math.min(5_000, timeoutMs)))
        if (!available.authorized) return []
        return config.models.filter(id => (!available.models || available.models.has(id)) && (failures.get(config.fingerprint + '/' + id) ?? 0) <= now())
          .map(modelId => ({ id: config.id, baseURL: config.baseURL, apiKey: config.apiKey, fingerprint: config.fingerprint, modelId }))
      }))
      // Interleave hosts so one unavailable provider cannot consume every fallback attempt.
      const result: GatewayCandidate[] = []
      for (let index = 0; index < Math.max(0, ...lists.map(list => list.length)); index++) {
        for (const list of lists) if (list[index]) result.push(list[index])
      }
      return result
    },
    canTry(candidate: GatewayCandidate) {
      return (failures.get(candidate.fingerprint) ?? 0) <= now() && (failures.get(candidate.fingerprint + '/' + candidate.modelId) ?? 0) <= now()
    },
    failed(candidate: GatewayCandidate, error: unknown) {
      const status = error && typeof error === 'object' && 'statusCode' in error ? error.statusCode : undefined
      failures.set(status === 401 || status === 403 ? candidate.fingerprint : candidate.fingerprint + '/' + candidate.modelId, now() + 30_000)
    },
  }
}

export const gatewayRouter = createGatewayRouter()

export function parseGatewayOutput<T>(text: string, schema: z.ZodSchema<T>): T {
  const trimmed = text.trim()
  const fenced = /^```(?:json)?\s*\n([\s\S]*?)\n```$/i.exec(trimmed)
  let value: unknown
  try { value = JSON.parse(fenced ? fenced[1] : trimmed) } catch { throw new Error('AI output was not valid JSON') }
  const parsed = schema.safeParse(value)
  if (!parsed.success) throw new Error('AI output did not match the required schema')
  return parsed.data
}
