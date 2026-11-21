import type { AgentRole } from './roles'

export const OPENCODE_FREE_MODELS = [
  'deepseek-v4.1-flash-free', 'glm-5.3-flash-free', 'mimo-v2.6-flash-free',
  'nemotron-3.5-super-vl-free', 'big-pickle',
] as const

// These PixRouter free aliases passed a real tool-result + JSON round trip.
// Keep the automatic router last: a named model gives more predictable output.
export const PIXROUTER_FREE_MODELS = [
  'thinkingmachines/inkling:free', 'qwen/qwen3.8-27b:free', 'z-ai/glm-4.5-flash:free', 'openrouter/free',
] as const

// Explicit general-purpose models with tool support in the provider catalog.
// Do not silently route research to small code-only or content-safety models.
export const OPENROUTER_FREE_MODELS = [
  'nvidia/nemotron-3.5-super-vl:free',
  'nvidia/nemotron-3-ultra-550b-a55b:free',
  'google/gemma-4-31b-it:free',
] as const

export const ROLE_MODELS: Record<string, string[]> = {
  market: ['qwen/qwen3.8-27b:free', 'thinkingmachines/inkling:free', 'glm-5.3-flash-free', 'nemotron-3.5-super-vl-free'],
  customer: ['qwen/qwen3.8-27b:free', 'thinkingmachines/inkling:free', 'mimo-v2.6-flash-free', 'glm-5.3-flash-free'],
  competitor: ['thinkingmachines/inkling:free', 'qwen/qwen3.8-27b:free', 'deepseek-v4.1-flash-free', 'glm-5.3-flash-free'],
  finance: ['qwen/qwen3.8-27b:free', 'thinkingmachines/inkling:free', 'deepseek-v4.1-flash-free', 'mimo-v2.6-flash-free'],
  risk: ['thinkingmachines/inkling:free', 'qwen/qwen3.8-27b:free', 'glm-5.3-flash-free', 'nemotron-3.5-super-vl-free'],
  evidence: ['qwen/qwen3.8-27b:free', 'thinkingmachines/inkling:free', 'nemotron-3.5-super-vl-free', 'deepseek-v4.1-flash-free'],
  product: ['qwen/qwen3.8-27b:free', 'thinkingmachines/inkling:free', 'mimo-v2.6-flash-free', 'glm-5.3-flash-free'],
  growth: ['thinkingmachines/inkling:free', 'qwen/qwen3.8-27b:free', 'glm-5.3-flash-free', 'mimo-v2.6-flash-free'],
  synthesis: ['thinkingmachines/inkling:free', 'qwen/qwen3.8-27b:free', 'deepseek-v4.1-flash-free', 'nemotron-3.5-super-vl-free'],
}

export function freeModelsOnly() { return process.env.AI_FREE_ONLY !== 'false' }

/** Operator funding is explicit and distinct from a claim that a model is free.
 * The free-only safety switch takes precedence. Native paid-provider access
 * still requires the user's separate paid_models preference. */
export function workspaceModelPolicy(env: Record<string, string | undefined> = process.env): 'free_only' | 'operator_funded' {
  return env.AI_FREE_ONLY === 'false' && env.AI_WORKSPACE_MODEL_POLICY?.trim() === 'operator_funded'
    ? 'operator_funded' : 'free_only'
}

/** Preserve literal gateway aliases while honoring the owner's model exclusion.
 * An alias name never proves public OpenAI identity, capability or pricing. */
export function allowedModelId(model: string): boolean {
  return /^\S{1,200}$/.test(model) && !/[\x00-\x1f\x7f]/.test(model) &&
    !/(?:^|[^a-z0-9])luna(?:$|[^a-z0-9])/i.test(model)
}

export type GatewayReasoningEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'
/** The SDK emits the standard OpenAI-format reasoning_effort control. DeepSeek
 * documents low/high/max and defaults to high; a small JSON budget must leave
 * space for the answer. Gateway forwarding is verified separately in acceptance.
 * https://api-docs.deepseek.com/guides/thinking_mode */
export function gatewayReasoningEffort(providerAndModel: string, outputCeiling: number,
  env: Record<string, string | undefined> = process.env): GatewayReasoningEffort | undefined {
  const slash = providerAndModel.indexOf('/')
  const provider = providerAndModel.slice(0, slash)
  const model = providerAndModel.slice(slash + 1)
  if (slash < 0 || provider === 'custom_openrouter') return undefined
  const configured = env[provider.toUpperCase() + '_REASONING_EFFORT']?.trim()
  if (configured) {
    if (!['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'].includes(configured)) throw new Error('Invalid gateway reasoning effort')
    return configured as GatewayReasoningEffort
  }
  if (provider === 'pixrouter') return 'low'
  if (provider === 'utim' && model === 'utim/deepseek-v4.1-flash' && outputCeiling <= 4000) return 'low'
  return undefined
}

export function effectiveAiPreference(value: unknown): 'free_models' | 'paid_models' | 'custom_openrouter' {
  if (value === 'custom_openrouter') return value
  return !freeModelsOnly() && value === 'paid_models' ? value : 'free_models'
}
/** API identifiers are operator supplied, never inferred from Codex worker names. */
export function configuredNativeModel(provider: 'openai' | 'google' | 'anthropic', role?: AgentRole,
  env: Record<string, string | undefined> = process.env): string | null {
  const prefix = provider === 'google' ? 'GOOGLE' : provider.toUpperCase()
  const model = (role ? env['AI_AGENT_' + role.toUpperCase() + '_' + prefix + '_MODEL'] : undefined)?.trim() || env[prefix + '_AI_MODEL']?.trim()
  if (!model || model.length > 160 || !allowedModelId(model)) return null
  // These are Codex orchestration labels, not documented public API model IDs.
  if (/^gpt-\d(?:\.\d+)?-(?:sol|luna|astra)$/i.test(model)) return null
  return model
}
