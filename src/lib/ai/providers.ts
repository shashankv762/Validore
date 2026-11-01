import { createOpenAI } from '@ai-sdk/openai'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createAnthropic } from '@ai-sdk/anthropic'
import { OPENROUTER_FREE_MODELS } from './model-policy'

// OpenRouter — free model chain (default, zero cost)
export const openrouter = createOpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY ?? 'no-key',
})

// Free model chain: try in order, first success wins
// The router selects currently available free models; operators can pin IDs via env.
export const FREE_MODEL_CHAIN = OPENROUTER_FREE_MODELS

export type FreeModel = typeof FREE_MODEL_CHAIN[number]

export const RESEARCH_MODEL = OPENROUTER_FREE_MODELS[0]

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
