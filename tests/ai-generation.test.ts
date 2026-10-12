import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

const mocks = vi.hoisted(() => ({ text: vi.fn(), candidates: vi.fn(), failed: vi.fn(), canTry: vi.fn(), create: vi.fn() }))
vi.mock('ai', () => ({ generateText: mocks.text, Output: { object: vi.fn(value => value) } }))
vi.mock('@ai-sdk/openai', () => ({ createOpenAI: mocks.create }))
vi.mock('../src/lib/ai/providers', () => ({
  openrouter: { chat: vi.fn() }, FREE_MODEL_CHAIN: ['free-model'], openaiProvider: vi.fn(), googleProvider: vi.fn(), anthropicProvider: vi.fn(),
}))
vi.mock('../src/lib/ai/gateways', async () => ({
  ...await vi.importActual<typeof import('../src/lib/ai/gateways')>('../src/lib/ai/gateways'),
  gatewayRouter: { candidates: mocks.candidates, failed: mocks.failed, canTry: mocks.canTry },
}))
import { generateWithFallback } from '../src/lib/ai/generate'

const first = { id: 'kios', modelId: 'flash', baseURL: 'https://kios.example/v1', apiKey: 'key-one', fingerprint: 'one' }
const second = { id: 'seekai', modelId: 'reasoner', baseURL: 'https://seek.example/v1', apiKey: 'key-two', fingerprint: 'two' }
const schema = z.object({ score: z.number().min(0).max(10) })

beforeEach(() => {
  vi.resetAllMocks()
  for (const name of ['OPENROUTER_API_KEY', 'OPENAI_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY', 'ANTHROPIC_API_KEY']) vi.stubEnv(name, '')
  mocks.create.mockImplementation(() => ({ chat: (modelId: string) => modelId }))
  mocks.candidates.mockResolvedValue([first, second])
  mocks.canTry.mockReturnValue(true)
})
afterEach(() => vi.unstubAllEnvs())

describe('gateway generation fallback', () => {
  it('falls back after invalid structured output and keeps each key with its host', async () => {
    mocks.text.mockResolvedValueOnce({ text: '{"score":100}', usage: { totalTokens: 20 } })
      .mockResolvedValueOnce({ text: '{"score":7}', usage: { totalTokens: 30 } })
    const result = await generateWithFallback({ prompt: 'Validate', schema, agentRole: 'finance', preferredAiProvider: 'paid_models' })
    expect(result).toEqual({ data: { score: 7 }, provider: 'seekai/reasoner', tokensUsed: 30 })
    expect(mocks.failed).toHaveBeenCalledWith(first, expect.any(Error))
    expect(mocks.create.mock.calls.map(([config]) => [config.baseURL, config.apiKey])).toEqual([
      [first.baseURL, first.apiKey], [second.baseURL, second.apiKey],
    ])
    expect(mocks.text.mock.calls[0][0]).toEqual(expect.objectContaining({ maxRetries: 0, maxOutputTokens: 16_000 }))
    expect(mocks.text.mock.calls[0][0]).not.toHaveProperty('output')
  })
  it('requests only free gateway candidates in free-only mode', async () => {
    mocks.candidates.mockResolvedValue([first])
    mocks.text.mockResolvedValue({ text: '{"score":5}', usage: {} })
    await generateWithFallback({ prompt: 'Validate', schema, preferredAiProvider: 'free_models', agentRole: 'market' })
    expect(mocks.candidates).toHaveBeenCalledWith(expect.objectContaining({ freeOnly: true, role: 'market' }))
  })
  it('keeps custom-key failures isolated from shared providers', async () => {
    mocks.text.mockRejectedValue(new Error('Provider failure with private details'))
    await expect(generateWithFallback({ prompt: 'Validate', schema, preferredAiProvider: 'custom_openrouter', customOpenRouterKey: 'custom-key' }))
      .rejects.toThrow('Your custom AI provider could not complete the request')
    expect(mocks.candidates).not.toHaveBeenCalled()
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ apiKey: 'custom-key', baseURL: 'https://openrouter.ai/api/v1' }))
  })
  it('caps attempts even when a large configuration contains failing models', async () => {
    mocks.candidates.mockResolvedValue(Array.from({ length: 30 }, (_, index) => ({ ...first, modelId: 'model-' + index })))
    mocks.text.mockRejectedValue(new Error('Unavailable'))
    await expect(generateWithFallback({ prompt: 'Validate', schema })).rejects.toThrow('No AI provider completed')
    expect(mocks.text).toHaveBeenCalledTimes(20)
  })
})
