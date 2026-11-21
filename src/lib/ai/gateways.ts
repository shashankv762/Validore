import { createHash } from 'node:crypto'
import { z } from 'zod'
import { OPENCODE_FREE_MODELS, OPENROUTER_FREE_MODELS, PIXROUTER_FREE_MODELS, ROLE_MODELS, allowedModelId } from './model-policy'
import { reserveGatewayRequest } from './provider-budget'
import { FULL_AGENT_ROLES, type AgentRole } from './roles'
import { isRetryableGenerationFailure, temporaryFailureRetryAt } from './generation-failure'

export type { AgentRole } from './roles'
export type GatewayProtocol = 'openai' | 'anthropic' | 'responses'
export type GatewayCandidate = { id: string; baseURL: string; apiKey: string; modelId: string; fingerprint: string;
  protocol?: GatewayProtocol; anthropicAuthMode?: 'api_key' | 'bearer' }
export type GatewayDiagnosticState = 'catalog_verified' | 'catalog_unverified' | 'model_not_listed' | 'authentication_rejected' |
  'rate_limited' | 'upstream_unavailable' | 'network_unavailable' | 'request_timeout' | 'request_budget_exhausted' | 'provider_cooldown'
export type GatewayDiagnostic = { provider: string; model: string; state: GatewayDiagnosticState; httpStatus?: number; retryAt?: string }
export type GatewayScope = { role?: AgentRole; freeOnly?: boolean; onDiagnostic?: (diagnostic: GatewayDiagnostic) => void }
type Environment = Record<string, string | undefined>
type Dependencies = { environment?: () => Environment; fetcher?: typeof fetch; now?: () => number }
type Catalog = { expires: number; models: Set<string> | null; authorized: boolean; freeModels?: Set<string>; toolModels?: Set<string>;
  failure?: Pick<GatewayDiagnostic, 'state' | 'httpStatus' | 'retryAt'> }

// Explicit protocols and origins prevent one provider's credential from being
// reused at an unrelated gateway. MODELS is an operator allowlist, not a claim
// about pricing; FREE_MODELS must list only independently confirmed free IDs.
type GatewayProfile = { id: string; prefix: string; baseURL?: string; origin?: string; models?: readonly string[];
  protocol?: GatewayProtocol; protocols?: readonly GatewayProtocol[] }
const profiles: GatewayProfile[] = [
  { id: 'ollama', prefix: 'OLLAMA', baseURL: 'http://127.0.0.1:11434/v1' },
  { id: 'pixrouter', prefix: 'PIXROUTER', baseURL: 'https://pixrouter.com/v1', origin: 'https://pixrouter.com', models: PIXROUTER_FREE_MODELS },
  { id: 'opencode', prefix: 'OPENCODE', baseURL: 'https://opencode.ai/inference/openai/v1', origin: 'https://opencode.ai', models: OPENCODE_FREE_MODELS },
  { id: 'openrouter', prefix: 'OPENROUTER', baseURL: 'https://openrouter.ai/api/v1', origin: 'https://openrouter.ai', models: OPENROUTER_FREE_MODELS },
  { id: 'seekai', prefix: 'SEEKAI', baseURL: 'https://seekai.cc/v1', origin: 'https://seekai.cc' },
  { id: 'kios', prefix: 'KIOS', baseURL: 'https://kiosapi.com/v1', origin: 'https://kiosapi.com' },
  // The provider explicitly retired Chat Completions and Messages; only
  // Responses remains supported on this host (live gateway response).
  { id: 'freegg', prefix: 'FREEGG', baseURL: 'https://freegg.app/v1', origin: 'https://freegg.app', protocol: 'responses', protocols: ['responses'] },
  { id: 'qronos', prefix: 'QRONOS', baseURL: 'https://qronos.me/v1', origin: 'https://qronos.me', protocol: 'anthropic', protocols: ['anthropic'] },
  { id: 'utim', prefix: 'UTIM', baseURL: 'https://api.utim.dev/v1', origin: 'https://api.utim.dev' },
  { id: 'artbloom', prefix: 'ARTBLOOM', baseURL: 'https://api.artbloom.tech/v1', origin: 'https://api.artbloom.tech', protocols: ['openai', 'anthropic'] },
  { id: 'apinex',      prefix: 'APINEX'      },  // api.apinex.bond
  { id: 'orca',        prefix: 'ORCA'        },  // api.orcarouter.ai
  { id: 'agentrouter', prefix: 'AGENTROUTER' },  // agentrouter.org — last-resort fallback
]

const roles = FULL_AGENT_ROLES
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
  const transientFailures = new Map<string, { expiry: number; provider: string }>()
  const rememberFailure = (key: string, expiry: number, candidate: GatewayCandidate, error: unknown) => {
    failures.set(key, expiry)
    if (isRetryableGenerationFailure(error)) transientFailures.set(key, { expiry, provider: candidate.id })
    else transientFailures.delete(key)
  }

  const prune = () => {
    for (const [key, value] of catalogs) if (value.expires <= now()) catalogs.delete(key)
    for (const [key, expiry] of failures) if (expiry <= now()) failures.delete(key)
    for (const [key, value] of transientFailures) if (value.expiry <= now()) transientFailures.delete(key)
  }

  // Fetch and cache the /models catalog for a given gateway.
  // A 30-second short TTL on failure means a cold-start outage self-heals quickly.
  const catalog = async (config: GatewayCandidate, timeoutMs: number): Promise<Catalog> => {
    const cacheKey = config.fingerprint + '/' + (config.protocol ?? 'openai') + '/' + (config.anthropicAuthMode ?? 'api_key')
    const cached = catalogs.get(cacheKey)
    if (cached && cached.expires > now()) return cached
    const inFlight = pending.get(cacheKey)
    if (inFlight) return inFlight
    const request = (async () => {
      let result: Catalog = { models: null, authorized: true, expires: now() + 30_000 }
      try {
        if (!(await reserveGatewayRequest(config))) {
          const retryAt = now() + 60_000
          rememberFailure(config.fingerprint, retryAt, config, { statusCode: 429 })
          const blocked: Catalog = { ...result, authorized: false, failure: { state: 'request_budget_exhausted', retryAt: new Date(retryAt).toISOString() } }
          catalogs.set(cacheKey, blocked)
          return blocked
        }
        const response = await fetcher(config.baseURL + '/models', {
          headers: config.protocol === 'anthropic'
            ? { 'anthropic-version': '2023-06-01', ...(config.anthropicAuthMode === 'bearer' ? { Authorization: 'Bearer ' + config.apiKey } : { 'x-api-key': config.apiKey }) }
            : { Authorization: 'Bearer ' + config.apiKey },
          redirect: 'error',
          cache: 'no-store',
          signal: AbortSignal.timeout(Math.max(1, timeoutMs)),
        })
        if (response.status === 401 || response.status === 402 || response.status === 403) {
          result = { models: null, authorized: false, expires: now() + 60_000,
            failure: { state: 'authentication_rejected', httpStatus: response.status } }
        } else if (isRetryableGenerationFailure({ statusCode: response.status })) {
          const failure = { statusCode: response.status, responseHeaders: Object.fromEntries(response.headers) }
          const expiry = temporaryFailureRetryAt(failure, now(), 120_000)!
          rememberFailure(config.fingerprint, expiry, config, failure)
          result = { models: null, authorized: false, expires: expiry, failure: {
            state: response.status === 429 ? 'rate_limited' : 'upstream_unavailable', httpStatus: response.status, retryAt: new Date(expiry).toISOString(),
          } }
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
              if (body.data.length === 0 || ids.length > 0) {
                // A paginated catalog cannot prove that an explicitly configured
                // alias is absent from pages that were not returned.
                result = { models: 'has_more' in body && body.has_more === true ? null : new Set(ids), authorized: true, expires: now() + 300_000,
                  failure: { state: 'catalog_verified' } }
                if (config.id === 'openrouter') {
                  const rows = body.data as { id: string; pricing?: { prompt?: string; completion?: string }; supported_parameters?: string[] }[]
                  result.freeModels = new Set(rows.filter(row => row.pricing && Number(row.pricing.prompt) === 0 && Number(row.pricing.completion) === 0).map(row => row.id))
                  result.toolModels = new Set(rows.filter(row => row.supported_parameters?.includes('tools')).map(row => row.id))
                }
              }
            }
          }
        }
      } catch (error) {
        // Never log raw provider errors — they may contain credentials or founder data.
        const expiry = temporaryFailureRetryAt(error, now())
        if (expiry !== undefined) {
          rememberFailure(config.fingerprint, expiry, config, error)
          const statusCode = error && typeof error === 'object' && 'statusCode' in error &&
            typeof error.statusCode === 'number' ? error.statusCode : undefined
          const state: GatewayDiagnosticState = statusCode === 429 ? 'rate_limited'
            : statusCode === 401 || statusCode === 402 || statusCode === 403 ? 'authentication_rejected'
              : statusCode !== undefined ? 'upstream_unavailable'
                : error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError') ? 'request_timeout' : 'network_unavailable'
          result = { models: null, authorized: false, expires: expiry,
            failure: { state, ...(statusCode ? { httpStatus: statusCode } : {}), retryAt: new Date(expiry).toISOString() } }
        } else {
          // A malformed/unrecognized catalog does not prove a configured alias
          // unavailable, but the acceptance report must not call it verified.
          result = { ...result, failure: { state: 'catalog_unverified' } }
        }
      }
      catalogs.set(cacheKey, result)
      return result
    })()
    pending.set(cacheKey, request)
    try { return await request } finally { pending.delete(cacheKey) }
  }

  // Share the exact operational/model funding filters with cooldown lookup.
  // A disabled provider or ineligible paid model cannot delay another run.
  const configuration = ({ role, freeOnly = false }: GatewayScope = {}) => {
      const env = environment()
      const order = modelList(env.AI_GATEWAY_ORDER)
      const enabled = env.AI_GATEWAY_ENABLED?.trim() ? new Set(modelList(env.AI_GATEWAY_ENABLED)) : null

      const configs = profiles.flatMap((profile) => {
        if (enabled && !enabled.has(profile.id)) return []
        const localProvider = profile.id === 'ollama'
        if (localProvider && env.OLLAMA_ENABLED !== 'true') return []
        const configuredKey = env[profile.prefix + '_API_KEY']?.trim()
        const apiKey = configuredKey || (localProvider ? 'ollama' : undefined)
        if (!apiKey || apiKey === 'no-key') return []
        try {
          const protocol = (env[profile.prefix + '_PROTOCOL']?.trim() || profile.protocol || 'openai') as GatewayProtocol
          if (!(profile.protocols ?? ['openai']).includes(protocol)) return []
          const anthropicAuthMode = env[profile.prefix + '_ANTHROPIC_AUTH_MODE']?.trim() || 'api_key'
          if (protocol === 'anthropic' && !['api_key', 'bearer'].includes(anthropicAuthMode)) return []
          const url = new URL(env[profile.prefix + '_BASE_URL'] || profile.baseURL || '')
          const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
          if ((url.protocol !== 'https:' && !(localProvider && loopback && url.protocol === 'http:')) || url.username || url.password || url.search || url.hash) return []
          if (localProvider && !loopback && !configuredKey) return []
          if (profile.origin && url.origin !== profile.origin) return []
          // The installed Anthropic adapter appends /messages, not /v1/messages.
          // Normalize explicitly supplied Anthropic roots to their /v1 prefix.
          if (protocol === 'anthropic' && url.pathname === '/') url.pathname = '/v1'
          const baseURL = url.toString().replace(/\/$/, '')
          const fingerprint = createHash('sha256').update(profile.id + baseURL + apiKey).digest('hex')
          const free = new Set(modelList(env[profile.prefix + '_FREE_MODELS'] || profile.models?.join(',')))
          let models = modelList(env[profile.prefix + '_MODELS'] || env[profile.prefix + '_FREE_MODELS'] || profile.models?.join(',')).filter((id) => allowedModelId(id) && (!freeOnly || free.has(id)))
          if (profile.id === 'openrouter' && freeOnly) models = models.filter(id => id.endsWith(':free') || id === 'openrouter/free')
          if (profile.id === 'opencode' && freeOnly) models = models.filter(id => (OPENCODE_FREE_MODELS as readonly string[]).includes(id))
          if (profile.id === 'pixrouter' && freeOnly) models = models.filter(id => (PIXROUTER_FREE_MODELS as readonly string[]).includes(id))
          if (localProvider && freeOnly) models = models.filter(id => !/(?::|-|\/)cloud(?:\b|$)/i.test(id))
          // Promote agent-preferred models to the front within each provider's list.
          const preferred = role ? modelList(env['AI_AGENT_' + role.toUpperCase() + '_MODELS'] || ROLE_MODELS[role]?.join(',')) : []
          models = [...preferred.filter(id => models.includes(id)), ...models.filter(id => !preferred.includes(id))]
          if (models.length === 0) return []
          return [{ id: profile.id, apiKey, baseURL, fingerprint, models, protocol,
            ...(protocol === 'anthropic' ? { anthropicAuthMode: anthropicAuthMode as 'api_key' | 'bearer' } : {}) }]
        } catch { return [] }
      }).sort((a, b) => {
        const rank = (id: string) =>
          order.includes(id) ? order.indexOf(id) : order.length + profiles.findIndex((p) => p.id === id)
        return rank(a.id) - rank(b.id)
      })
      return { env, configs }
  }

  return {
    // Returns ordered, interleaved GatewayCandidate list ready for sequential
    // fallback. Catalog health-check + per-model circuit-breaker are applied here.
    async candidates({ role, freeOnly = false, timeoutMs = 5_000, onDiagnostic }:
      GatewayScope & { timeoutMs?: number } = {}): Promise<GatewayCandidate[]> {
      prune()
      const { env, configs } = configuration({ role, freeOnly })

      // Stagger gateway selection by agent-role index so each agent naturally
      // hits a different primary provider, spreading load and isolating failures.
      const offset = env.AI_GATEWAY_ROTATE === 'true' && role && configs.length ? roles.indexOf(role) % configs.length : 0
      const rotated = [...configs.slice(offset), ...configs.slice(0, offset)]

      const lists = await Promise.all(rotated.map(async (config) => {
        // Skip gateways whose entire API key is in cooldown.
        if ((failures.get(config.fingerprint) ?? 0) > now()) {
          const retryAt = failures.get(config.fingerprint)!
          for (const model of config.models) onDiagnostic?.({ provider: config.id, model, state: 'provider_cooldown', retryAt: new Date(retryAt).toISOString() })
          return []
        }
        const available = await catalog(
          { ...config, modelId: config.models[0] },
          Math.max(1, Math.min(5_000, timeoutMs))
        )
        if (!available.authorized) {
          for (const model of config.models) onDiagnostic?.({ provider: config.id, model,
            state: available.failure?.state ?? 'catalog_unverified',
            ...(available.failure?.httpStatus ? { httpStatus: available.failure.httpStatus } : {}),
            ...(available.failure?.retryAt ? { retryAt: available.failure.retryAt } : {}) })
          return []
        }
        const eligible = config.models
          .filter((id) =>
            (!available.models || available.models.has(id)) &&
            (!freeOnly || !available.freeModels || available.freeModels.has(id)) &&
            (!available.toolModels || available.toolModels.has(id)) &&
            (failures.get(config.fingerprint + '/' + id) ?? 0) <= now()
          )
          .map((modelId) => ({
            id: config.id,
            baseURL: config.baseURL,
            apiKey: config.apiKey,
            fingerprint: config.fingerprint,
            modelId,
            protocol: config.protocol,
            ...(config.anthropicAuthMode ? { anthropicAuthMode: config.anthropicAuthMode } : {}),
          }))
        for (const model of config.models) {
          const cooldownUntil = failures.get(config.fingerprint + '/' + model) ?? 0
          const listed = !available.models || available.models.has(model)
          const freeEligible = !freeOnly || !available.freeModels || available.freeModels.has(model)
          const toolEligible = !available.toolModels || available.toolModels.has(model)
          const state: GatewayDiagnosticState = cooldownUntil > now() ? 'provider_cooldown'
            : !listed || !freeEligible || !toolEligible ? 'model_not_listed'
              : available.failure?.state ?? 'catalog_unverified'
          onDiagnostic?.({ provider: config.id, model, state,
            ...(available.failure?.httpStatus ? { httpStatus: available.failure.httpStatus } : {}),
            ...(cooldownUntil > now() ? { retryAt: new Date(cooldownUntil).toISOString() }
              : available.failure?.retryAt ? { retryAt: available.failure.retryAt } : {}) })
        }
        return eligible
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

    // A durable retry during a capacity cooldown must remain a failed step;
    // otherwise the empty candidate list would be memoized as terminal null.
    retryableCooldownUntil(scope: GatewayScope = {}, customCandidates?: ReadonlyArray<Pick<GatewayCandidate, 'fingerprint' | 'modelId'>>,
      recentFailures?: ReadonlyMap<string, number>): number | undefined {
      prune()
      const eligible = customCandidates ?? configuration(scope).configs.flatMap(config => {
        const cached = catalogs.get(config.fingerprint + '/' + config.protocol + '/' + (config.anthropicAuthMode ?? 'api_key'))
        if (cached?.authorized === false && !transientFailures.has(config.fingerprint)) return []
        return config.models.filter(id => (!cached?.models || cached.models.has(id)) &&
          (!scope.freeOnly || !cached?.freeModels || cached.freeModels.has(id)) && (!cached?.toolModels || cached.toolModels.has(id)))
          .map(modelId => ({ fingerprint: config.fingerprint, modelId }))
      })
      const deadlines: number[] = []
      for (const candidate of eligible) {
        const hostUntil = failures.get(candidate.fingerprint) ?? 0
        const modelKey = candidate.fingerprint + '/' + candidate.modelId
        const modelUntil = failures.get(modelKey) ?? 0
        // Terminal key failures override earlier temporary model failures.
        if (hostUntil > now() && !transientFailures.has(candidate.fingerprint)) continue
        const recentUntil = recentFailures?.get(modelKey)
        if (transientFailures.has(candidate.fingerprint) || transientFailures.has(modelKey) || recentUntil !== undefined) {
          deadlines.push(Math.max(hostUntil, modelUntil, recentUntil ?? 0, now() + 1000))
        }
      }
      return deadlines.length ? Math.min(...deadlines) : undefined
    },

    // Records a failure and sets an appropriate cooldown based on error type.
    //   401/402/403 → entire gateway cooldown (5 min) — key invalid / billing unavailable
    //   429/503/529 → model cooldown (2 min) — rate-limited / capacity
    //   empty/timeout → model cooldown (15 s) — transient, retry quickly on next model
    //   other errors → model cooldown (30 s)
    failed(candidate: GatewayCandidate, error: unknown): void {
      const status =
        error && typeof error === 'object' && 'statusCode' in error
          ? (error as { statusCode?: number }).statusCode
          : undefined
      const msg = error instanceof Error ? error.message : ''

      if (status === 401 || status === 402 || status === 403) {
        rememberFailure(candidate.fingerprint, now() + 300_000, candidate, error)
        return
      }
      if (typeof status === 'number' && isRetryableGenerationFailure({ statusCode: status })) {
        const keyWide = status === 429 && (candidate.id === 'opencode' || candidate.id === 'pixrouter')
        const fallback = status === 429 && candidate.id === 'pixrouter' ? 300_000 : [429, 503, 529].includes(status) ? 120_000 : 30_000
        rememberFailure(keyWide ? candidate.fingerprint : candidate.fingerprint + '/' + candidate.modelId,
          temporaryFailureRetryAt(error, now(), fallback)!, candidate, error)
        return
      }
      const isEmptyOrTimeout =
        msg.includes('Empty response') || msg.includes('timed out') || msg.includes('AbortError')
      const fallback = isEmptyOrTimeout ? 15_000 : 30_000
      rememberFailure(candidate.fingerprint + '/' + candidate.modelId, temporaryFailureRetryAt(error, now(), fallback) ?? now() + fallback, candidate, error)
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
    throw new SyntaxError('AI output was not valid JSON')
  }
  const parsed = schema.safeParse(value)
  if (!parsed.success) throw parsed.error
  return parsed.data
}
