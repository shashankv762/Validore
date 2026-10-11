import { createOpenAI } from '@ai-sdk/openai'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createAnthropic } from '@ai-sdk/anthropic'

// OpenRouter — free model chain (default, zero cost)
export const openrouter = createOpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY ?? 'no-key',
})

// Free model chain: try in order, first success wins
export const FREE_MODEL_CHAIN = [
  'deepseek/deepseek-r1-0528-qwen3-8b:free',
  'qwen/qwen3-8b:free',
  'thudm/glm-4-9b:free',
] as const

export type FreeModel = typeof FREE_MODEL_CHAIN[number]

export const RESEARCH_MODEL = 'moonshotai/kimi-k2:free'

// Paid fallback providers
export const openaiProvider = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY ?? 'no-key',
})

export const googleProvider = createGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? 'no-key',
})

export const anthropicProvider = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY ?? 'no-key',
})

export type ModelProvider = 'openrouter' | 'openai' | 'google' | 'anthropic'