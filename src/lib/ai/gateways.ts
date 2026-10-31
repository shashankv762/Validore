import { createHash } from 'node:crypto'
import { z } from 'zod'

export type AgentRole = 'market' | 'customer' | 'competitor' | 'finance' | 'risk' | 'synthesis'
export type GatewayCandidate = { id: string; baseURL: string; apiKey: string; modelId: string; fingerprint: string }
type Environment = Record<string, string | undefined>
type Dependencies = { environment?: () => Environment; fetcher?: typeof fetch; now?: () => number }
type Catalog = { expires: number; models: Set<string> | null; authorized: boolean }

// All configured OpenAI-compatible gateway providers.
// To add a new provider, append an entry here and set the corresponding
// <PREFIX>_API_KEY, <PREFIX>_BASE_URL, <PREFIX>_MODELS, <PREFIX>_FREE_MODELS
// environment variables — no other code changes needed.
const profiles = [
  { id: 'seekai',      prefix: 'SEEKAI'      },  // seekai.cc — best model coverage
  { id: 'kios',        prefix: 'KIOS'        },  // kiosapi.com
  { id: 'apinex',      prefix: 'APINEX'      },  // api.apinex.bond
  { id: 'orca',        prefix: 'ORCA'        },  // api.orcarouter.ai
  { id: 'agentrouter', prefix: 'AGENTROUTER' },  // agentrouter.org — last-resort fallback
] as const

const roles: AgentRole[] = ['market', 'customer', 'competitor', 'finance', 'risk', 'synthesis']
const modelList = (value?: string) =>
  [...new Set((value ?? '').split(',').map((v) => v.trim()).filter((v) => /^\S{1,200}$/.test(v)))].slice(0, 30)

// ─── Router factory ──────────────────────────────────────────────────────────
// Each instance maintains its own in-process catalog cache and circuit-breaker
// table. Keys never leave their configured host (each provider only sees its own
// key — no cross-provider forwarding).

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

  // Fetch and cache the /models catalog for a given gateway.
  // A 30-second short TTL on failure means a cold-start outage self-heals quickly.
  const catalog = async (config: GatewayCandidate, timeoutMs: number): Promise<Catalog> => {
    const cached = catalogs.get(config.fingerprint)
    if (cached && cached.expires > now()) return cached
    const inFlight = pending.get(config.fingerprint)
    if (inFlight) return inFlight
    const request = (async () => {
      let result: Catalog = { models: null, authorized: true, expires: now() + 30_000 }
      try {
        const response = await fetcher(config.baseURL + '/models', {
          headers: { Authorization: 'Bearer ' + config.apiKey },
          redirect: 'error',
          cache: 'no-store',
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
              const ids = body.data.flatMap((item: unknown) =>
                item && typeof item === 'object' && 'id' in item && typeof item.id === 'string' ? [item.id] : [])
              // A malformed catalog is unknown, not proof that configured models are absent.
              if (body.data.length === 0 || ids.length > 0)
                result = { models: new Set(ids), authorized: true, expires: now() + 300_000 }
            }
          }
        }
      } catch {
        // Never log raw provider errors — they may contain credentials or founder data.
      }
      catalogs.set(config.fingerprint, result)
      return result
    })()
    pending.set(config.fingerprint, request)
    try { return await request } finally { pending.delete(config.fingerprint) }
  }

  return {
    // Returns ordered, interleaved GatewayCandidate list ready for sequential
    // fallback. Catalog health-check + per-model circuit-breaker are applied here.
    async candidates({
      role,
      freeOnly = false,
      timeoutMs = 5_000,
    }: { role?: AgentRole; freeOnly?: boolean; timeoutMs?: number } = {}): Promise<GatewayCandidate[]> {
      prune()
      const env = environment()
      const order = modelList(env.AI_GATEWAY_ORDER)

      const configs = profiles.flatMap((profile) => {
        const apiKey = env[profile.prefix + '_API_KEY']?.trim()
        if (!apiKey || apiKey === 'no-key') return []
        try {
          const url = new URL(env[profile.prefix + '_BASE_URL'] ?? '')
          if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return []
          const baseURL = url.toString().replace(/\/$/, '')
          const fingerprint = createHash('sha256').update(profile.id + baseURL + apiKey).digest('hex')
          const free = new Set(modelList(env[profile.prefix + '_FREE_MODELS']))
          let models = modelList(env[profile.prefix + '_MODELS']).filter((id) => !freeOnly || free.has(id))
          // Promote agent-preferred models to the front within each provider's list.
          const preferred = role ? modelList(env['AI_AGENT_' + role.toUpperCase() + '_MODELS']) : []
          models = [...models.filter((id) => preferred.includes(id)), ...models.filter((id) => !preferred.includes(id))]
          if (models.length === 0) return []
          return [{ id: profile.id, apiKey, baseURL, fingerprint, models }]
        } catch { return [] }
      }).sort((a, b) => {
        const rank = (id: string) =>
          order.includes(id) ? order.indexOf(id) : order.length + profiles.findIndex((p) => p.id === id)
        return rank(a.id) - rank(b.id)
      })

      // Stagger gateway selection by agent-role index so each agent naturally
      // hits a different primary provider, spreading load and isolating failures.
      const offset = role && configs.length ? roles.indexOf(role) % configs.length : 0
      const rotated = [...configs.slice(offset), ...configs.slice(0, offset)]

      const lists = await Promise.all(rotated.map(async (config) => {
        // Skip gateways whose entire API key is in cooldown.
        if ((failures.get(config.fingerprint) ?? 0) > now()) return []
        const available = await catalog(
          { ...config, modelId: config.models[0] },
          Math.max(1, Math.min(5_000, timeoutMs))
        )
        if (!available.authorized) return []
        return config.models
          .filter((id) =>
            (!available.models || available.models.has(id)) &&
            (failures.get(config.fingerprint + '/' + id) ?? 0) <= now()
          )
          .map((modelId) => ({
            id: config.id,
            baseURL: config.baseURL,
            apiKey: config.apiKey,
            fingerprint: config.fingerprint,
            modelId,
          }))
      }))

      // Round-robin interleave across providers so a single slow provider
      // can never block every fallback slot.
      const result: GatewayCandidate[] = []
      for (let i = 0; i < Math.max(0, ...lists.map((l) => l.length)); i++) {
        for (const list of lists) if (list[i]) result.push(list[i])
      }
      return result
    },

    // Returns true if neither the gateway key nor this specific model is in a cooldown window.
    canTry(candidate: GatewayCandidate): boolean {
      return (
        (failures.get(candidate.fingerprint) ?? 0) <= now() &&
        (failures.get(candidate.fingerprint + '/' + candidate.modelId) ?? 0) <= now()
      )
    },

    // Records a failure and sets an appropriate cooldown based on error type.
    //   401/403  → entire gateway cooldown (5 min) — key invalid / quota exhausted
    //   429/503/529 → model cooldown (2 min) — rate-limited / capacity
    //   empty/timeout → model cooldown (15 s) — transient, retry quickly on next model
    //   other errors → model cooldown (30 s)
    failed(candidate: GatewayCandidate, error: unknown): void {
      const status =
        error && typeof error === 'object' && 'statusCode' in error
          ? (error as { statusCode?: number }).statusCode
          : undefined
      const msg = error instanceof Error ? error.message : ''

      if (status === 401 || status === 403) {
        failures.set(candidate.fingerprint, now() + 300_000)
        return
      }
      if (status === 429 || status === 503 || status === 529) {
        failures.set(candidate.fingerprint + '/' + candidate.modelId, now() + 120_000)
        return
      }
      const isEmptyOrTimeout =
        msg.includes('Empty response') || msg.includes('timed out') || msg.includes('AbortError')
      failures.set(candidate.fingerprint + '/' + candidate.modelId, now() + (isEmptyOrTimeout ? 15_000 : 30_000))
    },
  }
}

// Singleton router shared by the entire server process.
export const gatewayRouter = createGatewayRouter()

// ─── Output parser ───────────────────────────────────────────────────────────
// Handles both plain JSON and ```json ... ``` fenced blocks.

export function parseGatewayOutput<T>(text: string, schema: z.ZodSchema<T>): T {
  const trimmed = text.trim()
  // Strip optional fenced code block wrapper.
  const fenced = /^```(?:json)?\s*\n([\s\S]*?)\n```$/i.exec(trimmed)
  // Also handle single-line ``` wrapping without newlines.
  const singleLine = !fenced ? /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed) : null
  let value: unknown
  try {
    value = JSON.parse(fenced ? fenced[1] : singleLine ? singleLine[1] : trimmed)
  } catch {
    throw new Error('AI output was not valid JSON')
  }
  const parsed = schema.safeParse(value)
  if (!parsed.success) throw new Error('AI output did not match the required schema')
  return parsed.data
}
