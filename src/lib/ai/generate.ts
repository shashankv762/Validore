import { generateObject } from 'ai'
import { z } from 'zod'
import {
  openrouter,
  FREE_MODEL_CHAIN,
  openaiProvider,
  googleProvider,
} from './providers'

export type GenerateOptions<T> = {
  prompt: string
  schema: z.ZodSchema<T>
  temperature?: number
  timeoutMs?: number
}

export type GenerateResult<T> = {
  data: T
  provider: string
  tokensUsed: number
}

export async function generateWithFallback<T>(
  options: GenerateOptions<T>
): Promise<GenerateResult<T>> {
  const { prompt, schema, temperature = 0, timeoutMs = 120_000 } = options

  // Try OpenRouter free models in sequence
  for (const modelId of FREE_MODEL_CHAIN) {
    if (!process.env.OPENROUTER_API_KEY) break
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      try {
        const result = await generateObject({
          model: openrouter(modelId),
          schema,
          prompt,
          temperature,
          abortSignal: controller.signal,
        })
        clearTimeout(timer)
        return {
          data: result.object,
          provider: `openrouter/${modelId}`,
          tokensUsed: result.usage?.totalTokens ?? 0,
        }
      } finally {
        clearTimeout(timer)
      }
    } catch {
      // Try next model in chain
      continue
    }
  }

  // Fallback: OpenAI paid
  if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'no-key') {
    const result = await generateObject({
      model: openaiProvider('gpt-4o-mini'),
      schema,
      prompt,
      temperature,
    })
    return {
      data: result.object,
      provider: 'openai/gpt-4o-mini',
      tokensUsed: result.usage?.totalTokens ?? 0,
    }
  }

  // Fallback: Google Gemini
  if (
    process.env.GOOGLE_GENERATIVE_AI_API_KEY &&
    process.env.GOOGLE_GENERATIVE_AI_API_KEY !== 'no-key'
  ) {
    const result = await generateObject({
      model: googleProvider('gemini-1.5-flash'),
      schema,
      prompt,
      temperature,
    })
    return {
      data: result.object,
      provider: 'google/gemini-1.5-flash',
      tokensUsed: result.usage?.totalTokens ?? 0,
    }
  }

  throw new Error(
    'No AI provider available. Configure OPENROUTER_API_KEY, OPENAI_API_KEY, or GOOGLE_GENERATIVE_AI_API_KEY in .env.local'
  )
}