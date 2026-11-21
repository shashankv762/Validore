import { createHash, randomUUID } from 'node:crypto'
import { FULL_AGENT_ROLES } from '../../src/lib/ai/roles'
import { allowedModelId, workspaceModelPolicy, PIXROUTER_FREE_MODELS, OPENCODE_FREE_MODELS, OPENROUTER_FREE_MODELS } from '../../src/lib/ai/model-policy'

// Keep this explicit CLI allowlist aligned with the production registry. The
// contract test enumerates real registered profiles without external requests.
export const ACCEPTANCE_GATEWAYS = {
  ollama: 'OLLAMA', pixrouter: 'PIXROUTER', opencode: 'OPENCODE', openrouter: 'OPENROUTER',
  seekai: 'SEEKAI', kios: 'KIOS', freegg: 'FREEGG', qronos: 'QRONOS', utim: 'UTIM', artbloom: 'ARTBLOOM',
  apinex: 'APINEX', orca: 'ORCA', agentrouter: 'AGENTROUTER',
} as const
export type AcceptanceGateway = keyof typeof ACCEPTANCE_GATEWAYS
export type AcceptanceEnvironment = Record<string, string | undefined>
export type AcceptanceCliOptions = {
  provider?: AcceptanceGateway; freeOnly: boolean; resume: boolean; mode: 'lite' | 'full';
  models?: string[]; maxModels: number; timeoutMs: number; maxTokensPerCall?: number;
}
export class AcceptanceOptionsError extends Error {}

export function parseAcceptanceOptions(args: string[], kind: 'validation' | 'providers'): AcceptanceCliOptions {
  const flags = new Map<string, string>()
  for (const argument of args) {
    if (argument === '--live') continue
    const [name, ...rest] = argument.split('=')
    const value = rest.join('=')
    const boolean = ['--free-only', ...(kind === 'validation' ? ['--resume'] : [])]
    const valued = ['--provider', ...(kind === 'validation' ? ['--mode', '--max-tokens-per-call'] : ['--models', '--max-models', '--timeout-ms'])]
    if (flags.has(name) || (!boolean.includes(name) && !valued.includes(name)) ||
      (boolean.includes(name) ? rest.length > 0 : !value)) throw new AcceptanceOptionsError('Invalid or repeated acceptance option. Use the command without --live for usage.')
    flags.set(name, value)
  }
  const provider = flags.get('--provider')
  if (provider && !Object.hasOwn(ACCEPTANCE_GATEWAYS, provider)) throw new AcceptanceOptionsError('The selected provider is not a registered gateway.')
  const mode = flags.get('--mode') ?? 'lite'
  if (mode !== 'lite' && mode !== 'full') throw new AcceptanceOptionsError('Mode must be lite or full.')
  const models = flags.has('--models') ? [...new Set(flags.get('--models')!.split(',').map(value => value.trim()))] : undefined
  if (models?.some(model => !allowedModelId(model) || /^sk-[a-z\d_-]{16,}$/i.test(model))) throw new AcceptanceOptionsError('Model selection contains an invalid or excluded ID. Select only configured model IDs; Luna is excluded.')
  const maxModels = Number(flags.get('--max-models') ?? 12)
  const timeoutMs = Number(flags.get('--timeout-ms') ?? 180_000)
  const maxTokensPerCall = flags.has('--max-tokens-per-call') ? Number(flags.get('--max-tokens-per-call')) : undefined
  if (!Number.isSafeInteger(maxModels) || maxModels < 1 || maxModels > 12) throw new AcceptanceOptionsError('Model probes are limited to 1–12 models per invocation.')
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 10_000 || timeoutMs > 240_000) throw new AcceptanceOptionsError('Probe timeout must be 10000–240000 milliseconds per model.')
  if (maxTokensPerCall !== undefined && (!Number.isSafeInteger(maxTokensPerCall) || maxTokensPerCall < 256 || maxTokensPerCall > 128000)) throw new AcceptanceOptionsError('The plan token ceiling must be an integer from 256 to 128000.')
  return { provider: provider as AcceptanceGateway | undefined, freeOnly: flags.has('--free-only'), resume: flags.has('--resume'),
    mode, models, maxModels, timeoutMs, maxTokensPerCall }
}

/** Process-local narrowing only; this never edits environment files or widens
 * free-only policy. Explicit --provider selects a configured gateway to test
 * before adding it to the server's active provider chain. */
export function configureAcceptanceEnvironment(env: AcceptanceEnvironment, options: AcceptanceCliOptions, kind: 'validation' | 'providers') {
  if (options.freeOnly) env.AI_FREE_ONLY = 'true'
  if (options.provider) {
    env.AI_GATEWAY_ENABLED = options.provider
    env.AI_GATEWAY_ORDER = options.provider
  }
  // The public seed bundle remains available to workflow acceptance, but no
  // customer database or durable public-research database can be accessed.
  delete env.DATABASE_URL
  delete env.TEST_DATABASE_URL
  if (kind === 'providers') {
    env.RESEARCH_STORE_ENABLED = 'false'
    env.MARKET_MEMORY_ENABLED = 'false'
    for (const name of ['TAVILY_API_KEY', 'SERPER_API_KEY', 'SERPAPI_API_KEY', 'SEARXNG_BASE_URL']) delete env[name]
  }
}

const secretValues = (env: AcceptanceEnvironment) => Object.entries(env)
  .filter(([name, value]) => /(?:API_KEY|TOKEN|SECRET|PASSWORD|DATABASE_URL)$/.test(name) && value && value.length >= 8)
  .map(([, value]) => value!)

export function assertSafeModelConfiguration(env: AcceptanceEnvironment, options: AcceptanceCliOptions) {
  const secrets = secretValues(env)
  const names = Object.values(ACCEPTANCE_GATEWAYS).flatMap(prefix => [prefix + '_MODELS', prefix + '_FREE_MODELS'])
  const values = [...names.flatMap(name => env[name]?.split(',') ?? []), ...(options.models ?? [])]
  if (values.some(value => secrets.some(secret => value.includes(secret)))) throw new AcceptanceOptionsError('A configured model field contains credential material. Correct that field before running acceptance.')
}

/** Only a reviewed set of nonsecret controls contributes to resume identity.
 * No API key, key hash, token, database address or private input is included. */
export function acceptanceRuntimeConfiguration(env: AcceptanceEnvironment) {
  const names = ['AI_FREE_ONLY', 'AI_WORKSPACE_MODEL_POLICY', 'AI_GATEWAY_ENABLED', 'AI_GATEWAY_ORDER', 'AI_GATEWAY_ROTATE',
    'AI_DIRECT_FIRST', 'AI_SPECIALIST_CONCURRENCY', 'MARKET_MEMORY_ENABLED', 'RESEARCH_STORE_ENABLED', 'OLLAMA_ENABLED',
    ...Object.values(ACCEPTANCE_GATEWAYS).flatMap(prefix => ['MODELS', 'FREE_MODELS', 'BASE_URL', 'PROTOCOL', 'ANTHROPIC_AUTH_MODE', 'REASONING_EFFORT', 'REQUESTS_PER_HOUR'].map(suffix => prefix + '_' + suffix)),
    ...FULL_AGENT_ROLES.map(role => 'AI_AGENT_' + role.toUpperCase() + '_MODELS')]
  const secrets = secretValues(env)
  const clean = (name: string) => {
    const raw = env[name]
    if (raw === undefined) return null
    let value = raw
    if (name.endsWith('_BASE_URL')) {
      try { const url = new URL(raw); value = url.origin + url.pathname }
      catch { value = '[invalid endpoint]' }
    }
    return secrets.some(secret => value.includes(secret)) ? '[redacted invalid configuration]' : value
  }
  return { ...Object.fromEntries(names.map(name => [name, clean(name)])), resolvedWorkspaceModelPolicy: workspaceModelPolicy(env) }
}

export function acceptanceRuntimeFingerprint(env: AcceptanceEnvironment) {
  return createHash('sha256').update(JSON.stringify(acceptanceRuntimeConfiguration(env))).digest('hex')
}

export function validationResumeFingerprint(options: Pick<AcceptanceCliOptions, 'mode' | 'provider' | 'maxTokensPerCall'>,
  idea: unknown, codeFingerprint: string, env: AcceptanceEnvironment) {
  return createHash('sha256').update(JSON.stringify({ version: 3, mode: options.mode, provider: options.provider ?? 'configured',
    idea, codeFingerprint, configuration: acceptanceRuntimeConfiguration(env), maxTokensPerCall: options.maxTokensPerCall ?? null })).digest('hex')
}

export function acceptanceArtifacts(kind: 'validation' | 'providers', provider: AcceptanceGateway | 'configured', mode: 'lite' | 'full' = 'lite', started = new Date(), runId = randomUUID()) {
  const stem = kind === 'validation' ? 'validation-acceptance-' + mode : 'ai-provider-acceptance'
  const timestamp = started.toISOString().replace(/[:.]/g, '-')
  return { path: 'reports/' + stem + '-' + provider + '.json',
    legacyPath: 'reports/' + stem + '.json',
    archivePath: 'reports/acceptance-runs/' + stem + '-' + provider + '-' + timestamp + '-' + runId + '.json' }
}

export function isAcceptanceGateway(value: string): value is AcceptanceGateway {
  return Object.hasOwn(ACCEPTANCE_GATEWAYS, value)
}

/** Select configured IDs before catalog filtering so an unavailable configured
 * model is reported as a failed check instead of silently disappearing. */
export function configuredAcceptanceModels(env: AcceptanceEnvironment, options: AcceptanceCliOptions) {
  const list = (value?: string) => [...new Set((value ?? '').split(',').map(item => item.trim()).filter(allowedModelId))].slice(0, 30)
  const defaults: Partial<Record<AcceptanceGateway, readonly string[]>> = { pixrouter: PIXROUTER_FREE_MODELS, opencode: OPENCODE_FREE_MODELS, openrouter: OPENROUTER_FREE_MODELS }
  const enabled = env.AI_GATEWAY_ENABLED?.trim() ? new Set(list(env.AI_GATEWAY_ENABLED)) : null
  const freeOnly = workspaceModelPolicy(env) === 'free_only'
  return (Object.entries(ACCEPTANCE_GATEWAYS) as [AcceptanceGateway, string][]).flatMap(([provider, prefix]) => {
    if (enabled && !enabled.has(provider) || options.provider && options.provider !== provider) return []
    if (provider === 'ollama' ? env.OLLAMA_ENABLED !== 'true' : !env[prefix + '_API_KEY']?.trim() || env[prefix + '_API_KEY']?.trim() === 'no-key') return []
    const free = new Set(list(env[prefix + '_FREE_MODELS'] || defaults[provider]?.join(',')))
    const configured = list(env[prefix + '_MODELS'] || env[prefix + '_FREE_MODELS'] || defaults[provider]?.join(','))
    return configured.filter(model => (!options.models || options.models.includes(model)) && (!freeOnly || free.has(model)))
      .filter(model => !freeOnly || provider !== 'pixrouter' || (PIXROUTER_FREE_MODELS as readonly string[]).includes(model))
      .filter(model => !freeOnly || provider !== 'opencode' || (OPENCODE_FREE_MODELS as readonly string[]).includes(model))
      .filter(model => !freeOnly || provider !== 'openrouter' || model.endsWith(':free') || model === 'openrouter/free')
      .filter(model => !freeOnly || provider !== 'ollama' || !/(?::|-|\/)cloud(?:\b|$)/i.test(model))
      .map(model => ({ provider, model }))
  })
}
