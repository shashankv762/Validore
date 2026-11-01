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

export function effectiveAiPreference(value: unknown): 'free_models' | 'paid_models' | 'custom_openrouter' {
  if (value === 'custom_openrouter') return value
  return !freeModelsOnly() && value === 'paid_models' ? value : 'free_models'
}
