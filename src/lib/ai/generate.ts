import { generateObject } from 'ai'
import { z } from 'zod'
import {
  openrouter,
  FREE_MODEL_CHAIN,
  openaiProvider,
  googleProvider,
  anthropicProvider,
} from './providers'

export type GenerateOptions<T> = {
  prompt: string
  schema: z.ZodSchema<T>
  temperature?: number
  timeoutMs?: number
  preferredAiProvider?: string | null
  customOpenRouterKey?: string | null
}

export type GenerateResult<T> = {
  data: T
  provider: string
  tokensUsed: number
}

export async function generateWithFallback<T>(
  options: GenerateOptions<T>
): Promise<GenerateResult<T>> {
  const { prompt, schema, temperature = 0, timeoutMs = 120_000, preferredAiProvider } = options

  const tryFreeChain = async () => {
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
        continue
      }
    }
    return null
  }

  const tryPaidChain = async () => {
    if (process.env.GOOGLE_GENERATIVE_AI_API_KEY && process.env.GOOGLE_GENERATIVE_AI_API_KEY !== 'no-key') {
      try {
        const result = await generateObject({
          model: googleProvider('gemini-1.5-flash'),
          schema, prompt, temperature,
        })
        return { data: result.object, provider: 'google/gemini-1.5-flash', tokensUsed: result.usage?.totalTokens ?? 0 }
      } catch {}
    }
    if (process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY !== 'no-key') {
      try {
        const result = await generateObject({
          model: anthropicProvider('claude-3-haiku-20240307'),
          schema, prompt, temperature,
        })
        return { data: result.object, provider: 'anthropic/claude-3-haiku', tokensUsed: result.usage?.totalTokens ?? 0 }
      } catch {}
    }
    if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'no-key') {
      try {
        const result = await generateObject({
          model: openaiProvider('gpt-4o'),
          schema, prompt, temperature,
        })
        return { data: result.object, provider: 'openai/gpt-4o', tokensUsed: result.usage?.totalTokens ?? 0 }
      } catch {}
    }
    return null
  }

  let result = null

  // Custom OpenRouter key (BYOK) — try first if configured
  if (preferredAiProvider === 'custom_openrouter' && options.customOpenRouterKey) {
    try {
      const { createOpenAI } = await import('@ai-sdk/openai')
      const customRouter = createOpenAI({
        baseURL: 'https://openrouter.ai/api/v1',
        apiKey: options.customOpenRouterKey,
      })
      const { generateObject } = await import('ai')
      const r = await generateObject({
        model: customRouter('openai/gpt-4o-mini'),
        schema: options.schema,
        prompt: options.prompt,
        temperature: options.temperature ?? 0.7,
      })
      return { data: r.object as T, provider: 'custom_openrouter', tokensUsed: r.usage?.totalTokens ?? 0 }
    } catch (err) {
      console.warn('[BYOK] Custom OpenRouter key failed, falling back to platform chain:', err)
      // Fall through to default chain
    }
  }

  // FIX-12: Route based on user's saved AI provider preference
  // 'paid_models'  → skip free chain, go straight to paid providers
  // 'free_models'  → use only free chain, no paid fallback
  // anything else  → default: free first, paid fallback
  if (preferredAiProvider === 'paid_models') {
    result = await tryPaidChain()
    if (!result) result = await tryFreeChain()
  } else if (preferredAiProvider === 'free_models') {
    result = await tryFreeChain()
    // No paid fallback when user explicitly chose free only
  } else {
    result = await tryFreeChain()
    if (!result) result = await tryPaidChain()
  }

  if (result) return result

  throw new Error(
    'No AI provider available. Configure OPENROUTER_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY, ANTHROPIC_API_KEY, or OPENAI_API_KEY in .env.local'
  )
}