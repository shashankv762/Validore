import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { NoObjectGeneratedError } from 'ai'

const mocks = vi.hoisted(() => ({ text: vi.fn(), candidates: vi.fn(), failed: vi.fn(), create: vi.fn(), openai: vi.fn() }))
vi.mock('ai', async original => ({ ...await original<typeof import('ai')>(), generateText: mocks.text }))
vi.mock('@ai-sdk/openai', () => ({ createOpenAI: mocks.create }))
vi.mock('@/lib/ai/providers', () => ({ openaiProvider: mocks.openai, googleProvider: vi.fn(), anthropicProvider: vi.fn() }))
vi.mock('@/lib/ai/gateways', async original => ({ ...await original<typeof import('@/lib/ai/gateways')>(),
  gatewayRouter: { candidates: mocks.candidates, failed: mocks.failed, canTry: () => true },
}))
import { generateWithFallback, OutputQualityError, OutputBudgetExhaustedError, type OutputQualityIssue } from '@/lib/ai/generate'
import { configuredNativeModel, allowedModelId, workspaceModelPolicy, gatewayReasoningEffort } from '@/lib/ai/model-policy'

const first = { id: 'synthetic', modelId: 'first', baseURL: 'https://provider.example/v1', apiKey: 'synthetic-key', fingerprint: 'synthetic-first' }
const second = { ...first, modelId: 'second' }
const schema = z.object({ count: z.number().int().nonnegative(), sampleSize: z.number().int().positive() })
const consistency = (data: z.infer<typeof schema>): OutputQualityIssue[] => data.count > data.sampleSize
  ? [{ field: 'count', expected: 'Observed count must not exceed the supplied sample denominator. Preserve actual counts; do not invent observations.' }] : []
const source = { title: 'Original observed reference', url: 'https://example.org/research', source: 'example.org',
  content: 'Known evidence remains available after research failure.', fetchedAt: '2026-11-14T00:00:00Z', retrievalKind: 'page' as const }

beforeEach(() => {
  vi.resetAllMocks()
  for (const name of ['OPENROUTER_API_KEY', 'OPENAI_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY', 'ANTHROPIC_API_KEY', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN']) vi.stubEnv(name, '')
  vi.stubEnv('AI_FREE_ONLY', 'true'); vi.stubEnv('AI_DIRECT_FIRST', 'false')
  vi.stubEnv('MARKET_MEMORY_ENABLED', 'false'); vi.stubEnv('RESEARCH_STORE_ENABLED', 'false')
  mocks.create.mockReturnValue({ chat: (id: string) => id })
  mocks.candidates.mockResolvedValue([first, second])
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })

describe('bounded semantic output repair', () => {
  it('repairs a schema-valid inconsistent result without replaying rejected output or resetting the budget', async () => {
    mocks.text.mockResolvedValueOnce({ text: '{"count":19,"sampleSize":5}', usage: { totalTokens: 10 } })
      .mockResolvedValueOnce({ text: '{"count":2,"sampleSize":5}', usage: { totalTokens: 12 } })
    const result = await generateWithFallback({ prompt: 'Summarize supplied observations', schema, validateOutput: consistency,
      researchMode: 'reuse', maxModelCalls: 3 })
    expect(result.data).toEqual({ count: 2, sampleSize: 5 })
    expect(result.tokensUsed).toBe(22)
    expect(mocks.text.mock.calls.map(([options]) => options.model)).toEqual(['first', 'first'])
    const initial = mocks.text.mock.calls[0][0]
    const repair = mocks.text.mock.calls[1][0]
    expect(repair.prompt).toBe(initial.prompt)
    expect(repair.instructions).toContain('OUTPUT CORRECTION')
    expect(repair.instructions).toContain('"field":"count"')
    expect(JSON.stringify(repair)).not.toContain('"count":19')
    expect(repair).not.toHaveProperty('tools')
    expect(mocks.failed).not.toHaveBeenCalled()
  })

  it('shares one repair allowance across schema errors and subsequent semantic errors', async () => {
    mocks.text.mockResolvedValueOnce({ text: '{"count":"invalid-private-value","sampleSize":5}', usage: { totalTokens: 7 } })
      .mockResolvedValueOnce({ text: '{"count":19,"sampleSize":5}', usage: { totalTokens: 8 } })
      .mockResolvedValueOnce({ text: '{"count":2,"sampleSize":5}', usage: { totalTokens: 9 } })
    const result = await generateWithFallback({ prompt: 'Summarize supplied observations', schema, validateOutput: consistency,
      researchMode: 'reuse', maxModelCalls: 3 })
    expect(result.provider).toBe('synthetic/second')
    expect(result.tokensUsed).toBe(24)
    expect(mocks.text.mock.calls.map(([options]) => options.model)).toEqual(['first', 'first', 'second'])
    expect(mocks.text.mock.calls.filter(([options]) => options.instructions.includes('OUTPUT CORRECTION'))).toHaveLength(1)
    expect(mocks.failed).toHaveBeenCalledWith(first, expect.any(OutputQualityError))
    expect(JSON.stringify(mocks.text.mock.calls.slice(1))).not.toContain('invalid-private-value')
  })

  it('enforces the six-call ceiling across semantic repair and many fallback candidates', async () => {
    mocks.candidates.mockResolvedValue(Array.from({ length: 20 }, (_, index) => ({ ...first, modelId: 'candidate-' + index })))
    mocks.text.mockResolvedValue({ text: '{"count":19,"sampleSize":5}', usage: { totalTokens: 10 } })
    await expect(generateWithFallback({ prompt: 'Summarize supplied observations', schema, validateOutput: consistency,
      researchMode: 'reuse', maxModelCalls: 6 })).rejects.toThrow('No AI provider completed')
    expect(mocks.text.mock.calls.map(([options]) => options.model)).toEqual(['candidate-0', 'candidate-0', 'candidate-1', 'candidate-2', 'candidate-3', 'candidate-4'])
    expect(mocks.text.mock.calls.filter(([options]) => options.instructions.includes('OUTPUT CORRECTION'))).toHaveLength(1)
  })

  it('reserves the last call for fallback when no semantic-repair slot remains', async () => {
    mocks.text.mockResolvedValueOnce({ text: '{"count":19,"sampleSize":5}', usage: {} })
      .mockResolvedValueOnce({ text: '{"count":2,"sampleSize":5}', usage: {} })
    const result = await generateWithFallback({ prompt: 'Summarize supplied observations', schema, validateOutput: consistency,
      researchMode: 'reuse', maxModelCalls: 2 })
    expect(result.provider).toBe('synthetic/second')
    expect(mocks.text.mock.calls.map(([options]) => options.model)).toEqual(['first', 'second'])
    expect(mocks.text.mock.calls.some(([options]) => options.instructions.includes('OUTPUT CORRECTION'))).toBe(false)
  })
})

describe('interrupted optional research', () => {
  it.each([400, 404, 429, 500, 503, 529])('leaves HTTP %s research failure immediately instead of sending a report to the same unavailable candidate', async statusCode => {
    mocks.text.mockRejectedValueOnce(Object.assign(new Error('Provider-private-response'), { statusCode }))
      .mockResolvedValueOnce({ text: '{"count":2,"sampleSize":5}', usage: { totalTokens: 12 } })
    const result = await generateWithFallback({ prompt: 'Summarize public observations', schema, sources: [source], maxModelCalls: 2 })
    expect(result.provider).toBe('synthetic/second')
    expect(mocks.text.mock.calls.map(([options]) => options.model)).toEqual(['first', 'second'])
    expect(mocks.text.mock.calls[1][0]).not.toHaveProperty('tools')
    expect(mocks.text.mock.calls[1][0].prompt).toContain('"status":"interrupted"')
    expect(mocks.failed).toHaveBeenCalledWith(first, expect.objectContaining({ statusCode }))
  })

  it('retains supplied evidence, completed calculation observations and a safe gap marker for the report', async () => {
    mocks.text.mockImplementationOnce(async options => {
      await options.tools.calculate.execute({ operation: 'multiply', values: [37, 19] }, { toolCallId: 'calculation', messages: [], context: {} })
      throw new Error('Private provider response and secret token 8520 must not be replayed')
    }).mockResolvedValueOnce({ text: '{"count":2,"sampleSize":5}', usage: { totalTokens: 12 } })
    const result = await generateWithFallback({ prompt: 'Summarize the supplied public observations', schema, sources: [source], agentRole: 'finance', maxModelCalls: 2 })
    expect(result.sources).toEqual([source])
    expect(result.toolCalls).toContainEqual(expect.objectContaining({ tool: 'calculate', status: 'complete' }))
    expect(result.tokensUsed).toBe(12)
    expect(mocks.text.mock.calls.map(([options]) => options.model)).toEqual(['first', 'first'])
    const report = mocks.text.mock.calls[1][0]
    expect(report.prompt).toContain(source.content)
    expect(report.prompt).toContain('703')
    expect(report.prompt).toContain('"tool":"research_phase"')
    expect(report.prompt).toContain('"status":"interrupted"')
    expect(report.prompt).toContain('Unresolved research needs remain unknown')
    expect(report).not.toHaveProperty('tools')
    expect(report).not.toHaveProperty('messages')
    expect(JSON.stringify(report)).not.toContain('8520')
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain('8520')
  })

  it('retains the interruption marker across an authentication fallback without exposing private research context', async () => {
    mocks.text.mockRejectedValueOnce(Object.assign(new Error('Secret-auth-response-6492'), { statusCode: 401 }))
      .mockResolvedValueOnce({ text: '{"count":2,"sampleSize":5}', usage: { totalTokens: 12 } })
    const result = await generateWithFallback({ prompt: 'Prior confidential founder finding', privateContext: 'PRIVATE-FOUNDER-7452',
      researchPrompt: 'Public retail customer research', schema, sources: [source], maxModelCalls: 2 })
    expect(result.provider).toBe('synthetic/second')
    const research = mocks.text.mock.calls[0][0]
    const report = mocks.text.mock.calls[1][0]
    expect(JSON.stringify(research)).not.toContain('PRIVATE-FOUNDER-7452')
    expect(JSON.stringify(research)).not.toContain('Prior confidential founder finding')
    expect(report.prompt).toContain('PRIVATE-FOUNDER-7452')
    expect(report.prompt).toContain('"status":"interrupted"')
    expect(report.prompt).toContain(source.content)
    expect(JSON.stringify(report)).not.toContain('Secret-auth-response-6492')
    expect(report).not.toHaveProperty('tools')
  })
})

describe('realistic completion time reservations', () => {
  it.each([4000, 12000])('does not retry blank reasoning-only length output with an identical 4000-token ceiling (reported=%i)', async reportedOutput => {
    const starved = new NoObjectGeneratedError({ text: '', finishReason: 'length',
      response: { id: 'synthetic-starved', modelId: 'first', timestamp: new Date('2026-11-15T00:00:00Z') },
      usage: { inputTokens: 100, outputTokens: reportedOutput, totalTokens: reportedOutput + 100,
        inputTokenDetails: { noCacheTokens: 100, cacheReadTokens: 0, cacheWriteTokens: 0 }, outputTokenDetails: { textTokens: 0, reasoningTokens: 4000 } },
    })
    mocks.text.mockRejectedValueOnce(starved).mockResolvedValueOnce({ text: '{"count":2,"sampleSize":5}', usage: { totalTokens: 30 } })
    const result = await generateWithFallback({ prompt: 'Return the bounded report.', schema, agentRole: 'synthesis', researchMode: 'reuse', maxTokensPerCall: 4000 })
    expect(mocks.text.mock.calls.map(([options]) => options.model)).toEqual(['first', 'second'])
    expect(mocks.text.mock.calls.every(([options]) => options.maxOutputTokens === 4000)).toBe(true)
    expect(mocks.text.mock.calls.some(([options]) => options.instructions.includes('OUTPUT CORRECTION'))).toBe(false)
    expect(mocks.failed).toHaveBeenCalledWith(first, expect.any(OutputBudgetExhaustedError))
    expect(result.tokensUsed).toBe(reportedOutput + 130)
  })
  it('keeps the normal repair allowance available after a budget-starved candidate', async () => {
    mocks.text.mockResolvedValueOnce({ text: '', finishReason: 'length', usage: { totalTokens: 4000, outputTokenDetails: { reasoningTokens: 4000 } } })
      .mockResolvedValueOnce({ text: '{"count":19,"sampleSize":5}', usage: {} })
      .mockResolvedValueOnce({ text: '{"count":2,"sampleSize":5}', usage: {} })
    const result = await generateWithFallback({ prompt: 'Return the bounded report.', schema, validateOutput: consistency, researchMode: 'reuse', maxModelCalls: 3, maxTokensPerCall: 4000 })
    expect(result.data.count).toBe(2)
    expect(mocks.text.mock.calls.map(([options]) => options.model)).toEqual(['first', 'second', 'second'])
    expect(mocks.text.mock.calls[2][0].instructions).toContain('OUTPUT CORRECTION')
  })
  it('skips same-model repair after a slow report and leaves 75 seconds for another model', async () => {
    let now = 0
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    const timeouts = vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => new AbortController().signal)
    mocks.text.mockImplementationOnce(async () => { now = 60_000; return { text: 'READY', usage: {} } })
      .mockImplementationOnce(async () => { now = 165_000; return { text: '{"count":19,"sampleSize":5}', usage: {} } })
      .mockImplementationOnce(async () => { now = 220_000; return { text: '{"count":2,"sampleSize":5}', usage: {} } })
    const result = await generateWithFallback({ prompt: 'Review supplied evidence', schema, validateOutput: consistency, agentRole: 'customer' })
    expect(result.provider).toBe('synthetic/second')
    expect(timeouts.mock.calls.map(([ms]) => ms)).toEqual([60_000, 120_000, 75_000])
    expect(mocks.text.mock.calls.map(([options]) => options.model)).toEqual(['first', 'first', 'second'])
    expect(mocks.text.mock.calls.some(([options]) => options.instructions.includes('OUTPUT CORRECTION'))).toBe(false)
  })

  it('can use the final call to repair when there is no other viable candidate', async () => {
    mocks.candidates.mockResolvedValue([first])
    mocks.text.mockResolvedValueOnce({ text: '{"count":19,"sampleSize":5}', usage: {} })
      .mockResolvedValueOnce({ text: '{"count":2,"sampleSize":5}', usage: {} })
    const result = await generateWithFallback({ prompt: 'Review supplied evidence', schema, validateOutput: consistency, researchMode: 'reuse', maxModelCalls: 2 })
    expect(result.data.count).toBe(2)
    expect(mocks.text.mock.calls.map(([options]) => options.model)).toEqual(['first', 'first'])
    expect(mocks.text.mock.calls[1][0].instructions).toContain('OUTPUT CORRECTION')
  })
})

describe('native API model configuration guard', () => {
  it('treats provider aliases as literals while excluding Luna from every route', () => {
    expect(allowedModelId('gpt-6.1-sol')).toBe(true)
    for (const model of ['gpt-6-luna', 'vendor/LUNA:free', 'luna-latest']) {
      expect(allowedModelId(model)).toBe(false)
      expect(configuredNativeModel('google', undefined, { GOOGLE_AI_MODEL: model })).toBeNull()
    }
  })
  it.each(['gpt-6.1-sol', 'gpt-6-astra', 'gpt-6-luna', 'gpt-5.6-sol'])('rejects Codex orchestration label %s as a native API model', model => {
    expect(configuredNativeModel('openai', 'synthesis', { OPENAI_AI_MODEL: model })).toBeNull()
  })
  it.each(['', 'model with spaces', 'model\nvalue', 'a'.repeat(161)])('rejects malformed or empty native model configuration', model => {
    expect(configuredNativeModel('google', undefined, { GOOGLE_AI_MODEL: model })).toBeNull()
  })
  it('uses an operator-configured role override without claiming catalog verification', () => {
    expect(configuredNativeModel('openai', 'finance', { OPENAI_AI_MODEL: 'operator-global-model', AI_AGENT_FINANCE_OPENAI_MODEL: ' operator-finance-model ' })).toBe('operator-finance-model')
    expect(configuredNativeModel('google', 'market', { GOOGLE_AI_MODEL: 'operator-global-model' })).toBe('operator-global-model')
  })
  it('never invokes a paid native provider for a rejected orchestration ID, and preserves the authorized gateway fallback', async () => {
    vi.stubEnv('AI_FREE_ONLY', 'false'); vi.stubEnv('AI_DIRECT_FIRST', 'true')
    vi.stubEnv('OPENAI_API_KEY', 'synthetic-native-key'); vi.stubEnv('OPENAI_AI_MODEL', 'gpt-6.1-sol')
    mocks.text.mockResolvedValue({ text: '{"count":2,"sampleSize":5}', usage: { totalTokens: 12 } })
    const result = await generateWithFallback({ prompt: 'Summarize supplied observations', schema, preferredAiProvider: 'paid_models', researchMode: 'reuse' })
    expect(result.provider).toBe('synthetic/first')
    expect(mocks.openai).not.toHaveBeenCalled()
    expect(mocks.candidates).toHaveBeenCalledWith(expect.objectContaining({ freeOnly: false }))
  })
})

describe('operator-funded workspace routing', () => {
  it('uses documented low DeepSeek effort for small output budgets without changing aliases or BYOK controls', () => {
    expect(gatewayReasoningEffort('utim/utim/deepseek-v4.1-flash', 4000, {})).toBe('low')
    expect(gatewayReasoningEffort('utim/utim/deepseek-v4.1-flash', 6500, {})).toBeUndefined()
    expect(gatewayReasoningEffort('utim/kc/nvidia/nemotron-3.5-super-vl', 4000, {})).toBeUndefined()
    expect(gatewayReasoningEffort('utim/kc/nvidia/nemotron-3.5-super-vl', 4000, { UTIM_REASONING_EFFORT: 'low' })).toBe('low')
    expect(gatewayReasoningEffort('custom_openrouter/model', 4000, { CUSTOM_OPENROUTER_REASONING_EFFORT: 'high' })).toBeUndefined()
  })
  it('requires both explicit switches and never labels unknown-priced models free', () => {
    expect(workspaceModelPolicy({})).toBe('free_only')
    expect(workspaceModelPolicy({ AI_WORKSPACE_MODEL_POLICY: 'operator_funded', AI_FREE_ONLY: 'true' })).toBe('free_only')
    expect(workspaceModelPolicy({ AI_FREE_ONLY: 'false' })).toBe('free_only')
    expect(workspaceModelPolicy({ AI_FREE_ONLY: 'false', AI_WORKSPACE_MODEL_POLICY: 'operator_funded' })).toBe('operator_funded')
  })
  it('enables configured gateways for default accounts without enabling native paid providers', async () => {
    vi.stubEnv('AI_FREE_ONLY', 'false'); vi.stubEnv('AI_WORKSPACE_MODEL_POLICY', 'operator_funded'); vi.stubEnv('AI_DIRECT_FIRST', 'true')
    vi.stubEnv('OPENAI_API_KEY', 'synthetic-native-key'); vi.stubEnv('OPENAI_AI_MODEL', 'operator-native-model')
    mocks.text.mockResolvedValue({ text: '{"count":2,"sampleSize":5}', usage: {} })
    const result = await generateWithFallback({ prompt: 'Review supplied evidence', schema, researchMode: 'reuse', preferredAiProvider: 'free_models' })
    expect(result.provider).toBe('synthetic/first')
    expect(mocks.candidates).toHaveBeenCalledWith(expect.objectContaining({ freeOnly: false }))
    expect(mocks.openai).not.toHaveBeenCalled()
  })
  it('keeps the free-only guard authoritative even when operator funding is configured', async () => {
    vi.stubEnv('AI_WORKSPACE_MODEL_POLICY', 'operator_funded')
    mocks.text.mockResolvedValue({ text: '{"count":2,"sampleSize":5}', usage: {} })
    await generateWithFallback({ prompt: 'Review supplied evidence', schema, researchMode: 'reuse' })
    expect(mocks.candidates).toHaveBeenCalledWith(expect.objectContaining({ freeOnly: true }))
  })
  it('keeps BYOK isolated and excludes a configured Luna alias without contacting any model', async () => {
    vi.stubEnv('AI_FREE_ONLY', 'false'); vi.stubEnv('AI_WORKSPACE_MODEL_POLICY', 'operator_funded'); vi.stubEnv('OPENROUTER_CUSTOM_MODEL', 'gpt-6-luna')
    await expect(generateWithFallback({ prompt: 'Review supplied evidence', schema, researchMode: 'reuse', preferredAiProvider: 'custom_openrouter', customOpenRouterKey: 'synthetic-user-key' })).rejects.toThrow('Your custom AI provider')
    expect(mocks.text).not.toHaveBeenCalled()
    expect(mocks.candidates).not.toHaveBeenCalled()
  })
})
