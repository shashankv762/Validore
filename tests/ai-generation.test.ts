import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { NoObjectGeneratedError } from 'ai'

const mocks = vi.hoisted(() => ({ text: vi.fn(), candidates: vi.fn(), failed: vi.fn(), canTry: vi.fn(), create: vi.fn(), cooldownUntil: vi.fn() }))
vi.mock('ai', async importOriginal => ({ ...await importOriginal<typeof import('ai')>(), generateText: mocks.text }))
vi.mock('@ai-sdk/openai', () => ({ createOpenAI: mocks.create }))
vi.mock('../src/lib/ai/providers', () => ({
  openrouter: { chat: vi.fn() }, FREE_MODEL_CHAIN: ['free-model'], openaiProvider: vi.fn(), googleProvider: vi.fn(), anthropicProvider: vi.fn(),
}))
vi.mock('../src/lib/ai/gateways', async () => ({
  ...await vi.importActual<typeof import('../src/lib/ai/gateways')>('../src/lib/ai/gateways'),
  gatewayRouter: { candidates: mocks.candidates, failed: mocks.failed, canTry: mocks.canTry, retryableCooldownUntil: mocks.cooldownUntil },
}))
import { generateWithFallback } from '../src/lib/ai/generate'
import { publicResearchBrief, publicResearchQuery } from '@/lib/ai/research-brief'
import { CustomerAgentSchema } from '@/lib/validation/schemas'
import { GenerationUnavailableError } from '@/lib/ai/generation-failure'
import { createGatewayRouter } from '@/lib/ai/gateways'

const first = { id: 'kios', modelId: 'flash', baseURL: 'https://kios.example/v1', apiKey: 'key-one', fingerprint: 'one' }
const second = { id: 'seekai', modelId: 'reasoner', baseURL: 'https://seek.example/v1', apiKey: 'key-two', fingerprint: 'two' }
const schema = z.object({ score: z.number().min(0).max(10) })

beforeEach(() => {
  vi.resetAllMocks()
  for (const name of ['OPENROUTER_API_KEY', 'OPENAI_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY', 'ANTHROPIC_API_KEY']) vi.stubEnv(name, '')
  vi.stubEnv('AI_DIRECT_FIRST', 'false')
  vi.stubEnv('AI_FREE_ONLY', 'true')
  mocks.create.mockImplementation(() => ({ chat: (modelId: string) => modelId }))
  mocks.candidates.mockResolvedValue([first, second])
  mocks.canTry.mockReturnValue(true)
  mocks.cooldownUntil.mockImplementation((_scope, _candidates, recent?: ReadonlyMap<string, number>) => recent?.size ? Math.min(...recent.values()) : undefined)
})
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })

describe('gateway generation fallback', () => {
  it('retains complete bounded private records only in explicitly tool-free analysis', async () => {
    const privateContext = JSON.stringify({ records: Array.from({ length: 40 }, (_, id) => ({ id, content: 'Review detail '.repeat(200) + 'LAST-SENTENCE-' + id })) })
    expect(privateContext.length).toBeGreaterThan(24000)
    mocks.text.mockResolvedValue({ text: '{"score":7}', usage: {} })
    await generateWithFallback({ prompt: 'Analyze every selected review', schema, privateContext, privateContextMaxChars: 384000, researchMode: 'reuse', maxResearchRounds: 0 })
    expect(mocks.text).toHaveBeenCalledOnce()
    expect(mocks.text.mock.calls[0][0].prompt).toContain(privateContext)
    expect(mocks.text.mock.calls[0][0]).not.toHaveProperty('tools')
  })
  it.each([
    { privateContextMaxChars: 384001, researchMode: 'reuse' as const, maxResearchRounds: 0 },
    { privateContextMaxChars: 160000, researchMode: 'auto' as const, maxResearchRounds: 0 },
    { privateContextMaxChars: 160000, researchMode: 'reuse' as const },
  ])('rejects unsafe complete-private-context overrides before model access', async budget => {
    await expect(generateWithFallback({ prompt: 'Analyze', schema, ...budget })).rejects.toThrow('Invalid complete private context budget')
    expect(mocks.text).not.toHaveBeenCalled()
    expect(mocks.candidates).not.toHaveBeenCalled()
  })
  it('rejects oversized complete records rather than silently truncating them', async () => {
    await expect(generateWithFallback({ prompt: 'Analyze', schema, privateContext: 'x'.repeat(4001), privateContextMaxChars: 4000, researchMode: 'reuse', maxResearchRounds: 0 })).rejects.toThrow('Complete private context exceeds')
    expect(mocks.text).not.toHaveBeenCalled()
  })
  it('preserves transient metadata after provider fallback while excluding raw provider responses', async () => {
    mocks.text.mockRejectedValue(Object.assign(new Error('PRIVATE-PROVIDER-RESPONSE'), { statusCode: 429, responseHeaders: { 'retry-after': '900' } }))
    const now = Date.now()
    const error = await generateWithFallback({ prompt: 'Validate', schema, researchMode: 'reuse' }).catch(error => error)
    expect(error).toBeInstanceOf(GenerationUnavailableError)
    expect(error.retryable).toBe(true)
    expect(error.retryAt).toBeGreaterThanOrEqual(now + 900000)
    expect(error.message).not.toContain('PRIVATE-PROVIDER-RESPONSE')
    expect(JSON.stringify(error)).not.toContain('PRIVATE-PROVIDER-RESPONSE')
  })
  it('retains an applicable cooldown deadline when no candidates remain and avoids another model call', async () => {
    const retryAt = Date.now() + 120000
    mocks.candidates.mockResolvedValue([]); mocks.cooldownUntil.mockReturnValue(retryAt)
    const error = await generateWithFallback({ prompt: 'Validate', schema, researchMode: 'reuse' }).catch(error => error)
    expect(error).toMatchObject({ retryable: true, retryAt })
    expect(mocks.text).not.toHaveBeenCalled()
    expect(mocks.cooldownUntil).toHaveBeenCalledWith({ role: undefined, freeOnly: true }, undefined, expect.any(Map))
  })
  it('keeps terminal provider billing failures nonretryable without a source-body cause', async () => {
    mocks.text.mockRejectedValue(Object.assign(new Error('PRIVATE-BILLING-BODY'), { statusCode: 402, responseHeaders: { 'retry-after': '900' } }))
    const error = await generateWithFallback({ prompt: 'Validate', schema, researchMode: 'reuse' }).catch(error => error)
    expect(error).toMatchObject({ retryable: false })
    expect(error.retryAt).toBeUndefined(); expect(error.cause).toBeUndefined()
    expect(JSON.stringify(error)).not.toContain('PRIVATE-BILLING-BODY')
  })
  it.each(['disabled', 'ineligible'])('does not let a %s gateway cooldown contaminate terminal failures on the current provider', async restriction => {
    let enabled = 'freegg,utim'
    const router = createGatewayRouter({ environment: () => ({ AI_GATEWAY_ENABLED: enabled, FREEGG_API_KEY: 'synthetic-key', FREEGG_MODELS: 'paid-model',
      FREEGG_FREE_MODELS: 'free-model', UTIM_API_KEY: 'synthetic-utim', UTIM_MODELS: 'free-model', UTIM_FREE_MODELS: 'free-model' }),
      fetcher: async () => new Response('{}', { status: 404 }) })
    const previous = (await router.candidates()).find(candidate => candidate.id === 'freegg')!
    router.failed(previous, { statusCode: 429, responseHeaders: { 'Retry-After': '900' } })
    if (restriction === 'disabled') enabled = 'utim'
    vi.stubEnv('AI_WORKSPACE_MODEL_POLICY', 'free_only')
    mocks.candidates.mockImplementation(router.candidates)
    mocks.cooldownUntil.mockImplementation(router.retryableCooldownUntil)
    mocks.failed.mockImplementation(router.failed)
    mocks.text.mockRejectedValue(Object.assign(new Error('Private billing response'), { statusCode: 402 }))
    const error = await generateWithFallback({ prompt: 'Validate', schema, researchMode: 'reuse' }).catch(error => error)
    expect(error).toMatchObject({ retryable: false })
    expect(error.retryAt).toBeUndefined()
    expect(mocks.text).toHaveBeenCalledOnce()
  })
  it('applies a configured plan ceiling to both research and output calls across fallback and repair', async () => {
    mocks.text.mockResolvedValueOnce({ text: 'READY', usage: { totalTokens: 2 } })
      .mockResolvedValueOnce({ text: '{"score":100}', usage: { totalTokens: 10 } })
      .mockResolvedValueOnce({ text: '{"score":100}', usage: { totalTokens: 10 } })
      .mockResolvedValueOnce({ text: '{"score":7}', usage: { totalTokens: 10 } })
    expect((await generateWithFallback({ prompt: 'Validate', schema, agentRole: 'synthesis', maxTokensPerCall: 500 })).data.score).toBe(7)
    expect(mocks.text).toHaveBeenCalledTimes(4)
    for (const [options] of mocks.text.mock.calls) expect(options.maxOutputTokens).toBe(500)
  })
  it('retains a role safety budget when the plan ceiling is higher', async () => {
    mocks.text.mockResolvedValue({ text: '{"score":7}', usage: {} })
    await generateWithFallback({ prompt: 'Validate', schema, agentRole: 'finance', researchMode: 'reuse', maxTokensPerCall: 128000 })
    expect(mocks.text.mock.calls[0][0].maxOutputTokens).toBe(4000)
  })
  it('clamps a 6500-token preparation request to the configured plan ceiling within its 200-second stage',async()=>{
    mocks.text.mockResolvedValue({text:'{"score":7}',usage:{}})
    await generateWithFallback({prompt:'Complete preparation',schema,researchMode:'reuse',maxResearchRounds:0,maxModelCalls:2,timeoutMs:200000,maxOutputTokens:6500,maxTokensPerCall:1000})
    expect(mocks.text).toHaveBeenCalledOnce();expect(mocks.text.mock.calls[0][0].maxOutputTokens).toBe(1000)
  })
  it.each([0, 255, 500.5, 128001])('rejects invalid plan token ceilings before model calls: %s', async maxTokensPerCall => {
    await expect(generateWithFallback({ prompt: 'Validate', schema, maxTokensPerCall })).rejects.toThrow('Invalid AI request budget')
    expect(mocks.text).not.toHaveBeenCalled()
  })
  it('uses public descriptors without exposing names, inventions, contacts, or private histories', () => {
    const idea = { name: 'Secret venture name', industry: 'Retail founder@example.com', location: 'India +91 99999 99999', targetCustomer: 'Independent shops',
      coreProblem: 'Confidential invention detail', answers: ['Private interview detail'] }
    const brief = publicResearchBrief(idea)
    expect(brief).toContain('Independent shops')
    for (const value of [idea.name, idea.coreProblem, idea.answers[0], 'founder@example.com', '99999']) {
      expect(brief).not.toContain(value)
      expect(publicResearchQuery(idea, 'market statistics')).not.toContain(value)
    }
  })
  it('includes private founder answers only in tool-free output, including provider fallbacks', async () => {
    mocks.text.mockResolvedValueOnce({ text: 'READY', usage: { totalTokens: 2 } })
      .mockResolvedValueOnce({ text: '{"score":100}', usage: { totalTokens: 10 } })
      .mockResolvedValueOnce({ text: '{"score":100}', usage: { totalTokens: 10 } })
      .mockResolvedValueOnce({ text: '{"score":7}', usage: { totalTokens: 10 } })
    const privateContext = JSON.stringify({ answers: [{ answer: 'Private founder observation 4529' }] })
    const result = await generateWithFallback({ prompt: 'Prior finding derived from a private answer: revenue is confidential', researchPrompt: 'Public retail market research brief', privateContext, schema })
    expect(result.provider).toBe('seekai/reasoner')
    expect(mocks.text.mock.calls[2][0].instructions).toContain('OUTPUT CORRECTION')
    expect(JSON.stringify(mocks.text.mock.calls[0][0])).not.toContain('Private founder observation')
    expect(JSON.stringify(mocks.text.mock.calls[0][0])).not.toContain('revenue is confidential')
    for (const [options] of mocks.text.mock.calls.slice(1)) {
      expect(options.prompt).toContain(privateContext)
      expect(options).not.toHaveProperty('tools')
      expect(options).not.toHaveProperty('messages')
    }
  })
  it('defaults to no research tools when private context has no separate public research brief', async () => {
    mocks.text.mockResolvedValue({ text: '{"score":7}', usage: {} })
    await generateWithFallback({ prompt: 'Review private findings', privateContext: '{"answer":"private"}', schema })
    expect(mocks.text).toHaveBeenCalledOnce()
    expect(mocks.text.mock.calls[0][0]).not.toHaveProperty('tools')
  })
  it('honors the smaller interview request budget across provider failures', async () => {
    mocks.candidates.mockResolvedValue(Array.from({ length: 10 }, (_, index) => ({ ...first, modelId: 'model-' + index })))
    mocks.text.mockRejectedValue(new Error('Unavailable'))
    await expect(generateWithFallback({ prompt: 'Tailor a question', schema, researchMode: 'reuse', maxModelCalls: 2 })).rejects.toThrow()
    expect(mocks.text).toHaveBeenCalledTimes(2)
    for (const [options] of mocks.text.mock.calls) expect(options).not.toHaveProperty('tools')
  })
  it('reserves the last available call for output instead of exhausting the budget on research', async () => {
    mocks.text.mockResolvedValue({ text: '{"score":7}', usage: { totalTokens: 12 } })
    const result = await generateWithFallback({ prompt: 'Validate', schema, maxModelCalls: 1 })
    expect(result.data.score).toBe(7)
    expect(mocks.text).toHaveBeenCalledOnce()
    expect(mocks.text.mock.calls[0][0]).not.toHaveProperty('tools')
  })
  it('uses one follow-up research round when the module already supplied search evidence', async () => {
    mocks.text.mockResolvedValueOnce({ toolCalls: [{ toolName: 'read_page' }], response: { messages: [] }, usage: { totalTokens: 5 } })
      .mockResolvedValueOnce({ text: '{"score":7}', usage: { totalTokens: 12 } })
    const result = await generateWithFallback({ prompt: 'Review known sources', schema, maxResearchRounds: 1 })
    expect(result.tokensUsed).toBe(17)
    expect(mocks.text).toHaveBeenCalledTimes(2)
    expect(mocks.text.mock.calls[1][0]).not.toHaveProperty('tools')
  })
  it('reuses a completed research team without spending another research request', async () => {
    mocks.text.mockResolvedValue({ text: '{"score":7}', usage: { totalTokens: 15 } })
    const result = await generateWithFallback({ prompt: 'Review the completed team findings.', schema, agentRole: 'synthesis', researchMode: 'reuse' })
    expect(result.data.score).toBe(7)
    expect(mocks.text).toHaveBeenCalledTimes(1)
    expect(mocks.text.mock.calls[0][0]).not.toHaveProperty('tools')
  })
  it('can prefer a verified native provider without waiting for failing gateways', async () => {
    vi.stubEnv('AI_FREE_ONLY', 'false')
    vi.stubEnv('AI_DIRECT_FIRST', 'true')
    vi.stubEnv('GOOGLE_GENERATIVE_AI_API_KEY', 'test-key')
    vi.stubEnv('GOOGLE_AI_MODEL', 'test-native-model')
    mocks.text.mockResolvedValue({ output: { score: 7 }, usage: { totalTokens: 20 } })
    expect((await generateWithFallback({ prompt: 'Validate', schema, preferredAiProvider: 'paid_models' })).provider).toBe('google/test-native-model')
    expect(mocks.candidates).not.toHaveBeenCalled()
  })
  it('falls back after one unsuccessful output repair and keeps each key with its host', async () => {
    mocks.text.mockResolvedValueOnce({ text: 'READY', usage: { totalTokens: 2 } })
      .mockResolvedValueOnce({ text: '{"score":100}', usage: { totalTokens: 20 } })
      .mockResolvedValueOnce({ text: '{"score":100}', usage: { totalTokens: 20 } })
      .mockResolvedValueOnce({ text: '{"score":7}', usage: { totalTokens: 30 } })
    const result = await generateWithFallback({ prompt: 'Validate', schema, agentRole: 'finance', preferredAiProvider: 'paid_models' })
    expect(result).toEqual({ data: { score: 7 }, provider: 'seekai/reasoner', tokensUsed: 72, toolCalls: [], sources: [] })
    expect(mocks.failed).toHaveBeenCalledWith(first, expect.any(Error))
    expect(mocks.create.mock.calls.map(([config]) => [config.baseURL, config.apiKey])).toEqual([
      [first.baseURL, first.apiKey], [second.baseURL, second.apiKey],
    ])
    expect(mocks.text.mock.calls[1][0]).toEqual(expect.objectContaining({ maxRetries: 0, maxOutputTokens: 4000 }))
    expect(mocks.text.mock.calls[0][0]).not.toHaveProperty('output')
    expect(mocks.text.mock.calls[1][0].output.name).toBe('json')
    expect(mocks.text.mock.calls.map(([options]) => options.model)).toEqual(['flash', 'flash', 'flash', 'reasoner'])
    expect(mocks.text.mock.calls[3][0].instructions).not.toContain('OUTPUT CORRECTION')
  })
  it('corrects a malformed customer survey enum on the same model with schema-only guidance', async () => {
    vi.stubEnv('AI_DIAGNOSTICS', 'true')
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    const data = { wtpSurveyQuestions: [
      { question: 'What would you pay?', type: 'open' },
      { question: 'How useful is this?', type: 'scale' },
      { question: 'Which plan would you choose?', type: 'multiple_choice', options: ['Monthly', 'Annual'] },
    ] }
    const invalid = { wtpSurveyQuestions: data.wtpSurveyQuestions.map((question, index) => index === 2 ? { ...question, type: 'private-invalid-value-9823' } : question) }
    mocks.text.mockResolvedValueOnce({ text: JSON.stringify(invalid), usage: { totalTokens: 20 } })
      .mockResolvedValueOnce({ text: JSON.stringify(data), usage: { totalTokens: 25 } })
    const result = await generateWithFallback({ prompt: 'Draft customer survey questions', schema: CustomerAgentSchema.pick({ wtpSurveyQuestions: true }), agentRole: 'customer', researchMode: 'reuse' })
    expect(result).toEqual({ data, provider: 'kios/flash', tokensUsed: 45, toolCalls: [], sources: [] })
    expect(mocks.text.mock.calls.map(([options]) => options.model)).toEqual(['flash', 'flash'])
    expect(mocks.create).toHaveBeenCalledOnce()
    expect(mocks.failed).not.toHaveBeenCalled()
    const repair = mocks.text.mock.calls[1][0]
    expect(repair.instructions).toContain('"field":"wtpSurveyQuestions.2.type","expected":{"enum":["open","scale","multiple_choice"]}')
    expect(repair.instructions).toContain('Do not invent missing facts')
    expect(repair.prompt).toBe(mocks.text.mock.calls[0][0].prompt)
    expect(JSON.stringify(repair)).not.toContain('private-invalid-value-9823')
    expect(repair).not.toHaveProperty('tools')
    expect(repair).not.toHaveProperty('messages')
    expect(info).toHaveBeenCalledWith('[ai] Generation metadata', expect.objectContaining({ provider: 'kios/flash', agentRole: 'customer', phase: 'repair' }))
    expect(JSON.stringify(info.mock.calls)).not.toContain('Which plan')
  })
  it.each([
    new Error('Network unavailable'),
    new SyntaxError('Provider HTTP body was not JSON'),
    Object.assign(new Error('Authentication failed'), { statusCode: 401 }),
    Object.assign(new Error('Quota exhausted'), { statusCode: 429 }),
    Object.assign(new Error('Timed out'), { name: 'AbortError' }),
  ])('does not retry transport/provider failures as output correction: %s', async error => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mocks.text.mockRejectedValueOnce(error).mockResolvedValueOnce({ text: '{"score":7}', usage: {} })
    const result = await generateWithFallback({ prompt: 'Validate', schema, agentRole: 'customer', researchMode: 'reuse' })
    expect(result.provider).toBe('seekai/reasoner')
    expect(mocks.text.mock.calls.map(([options]) => options.model)).toEqual(['flash', 'reasoner'])
    for (const [options] of mocks.text.mock.calls) expect(options.instructions).not.toContain('OUTPUT CORRECTION')
    expect(warn).toHaveBeenCalledWith('[ai] Candidate unavailable', expect.objectContaining({ agentRole: 'customer' }))
    expect(JSON.stringify(warn.mock.calls)).not.toContain(error.message)
  })
  it('reserves the final call for another candidate when there is no room for repair', async () => {
    mocks.text.mockResolvedValueOnce({ text: '{"score":100}', usage: { totalTokens: 10 } })
      .mockResolvedValueOnce({ text: '{"score":7}', usage: { totalTokens: 20 } })
    const result = await generateWithFallback({ prompt: 'Validate', schema, researchMode: 'reuse', maxModelCalls: 2 })
    expect(result.provider).toBe('seekai/reasoner')
    expect(mocks.text.mock.calls.map(([options]) => options.model)).toEqual(['flash', 'reasoner'])
  })
  it('shares the six-call ceiling across output repair and subsequent failing candidates', async () => {
    mocks.candidates.mockResolvedValue(Array.from({ length: 30 }, (_, index) => ({ ...first, modelId: 'model-' + index })))
    mocks.text.mockResolvedValue({ text: '{"score":100}', usage: { totalTokens: 10 } })
    await expect(generateWithFallback({ prompt: 'Validate', schema, researchMode: 'reuse' })).rejects.toThrow('No AI provider completed')
    expect(mocks.text.mock.calls.map(([options]) => options.model)).toEqual(['model-0', 'model-0', 'model-1', 'model-2', 'model-3', 'model-4'])
    expect(mocks.text.mock.calls.filter(([options]) => options.instructions.includes('OUTPUT CORRECTION'))).toHaveLength(1)
  })
  it('shares the original deadline while reserving research and fallback windows', async () => {
    let now = 1000
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    const timeouts = vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => new AbortController().signal)
    mocks.text.mockImplementationOnce(async () => { now = 1020; return { text: 'READY', usage: {} } })
      .mockImplementationOnce(async () => { now = 1060; return { text: '{"score":100}', usage: {} } })
      .mockImplementationOnce(async () => { now = 1101; return { text: '{"score":100}', usage: {} } })
    await expect(generateWithFallback({ prompt: 'Validate', schema, timeoutMs: 100 })).rejects.toThrow('No AI provider completed')
    expect(timeouts.mock.calls.map(([timeout]) => timeout)).toEqual([25, 47, 40])
    expect(mocks.text.mock.calls.map(([options]) => options.model)).toEqual(['flash', 'flash', 'reasoner'])
    expect(mocks.text.mock.calls.some(([options]) => options.instructions.includes('OUTPUT CORRECTION'))).toBe(false)
    expect(mocks.create).toHaveBeenCalledTimes(2)
  })
  it('does not begin repair after the original deadline has already elapsed', async () => {
    let now = 1000
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    mocks.text.mockImplementationOnce(async () => { now = 1101; return { text: '{"score":100}', usage: {} } })
    await expect(generateWithFallback({ prompt: 'Validate', schema, researchMode: 'reuse', timeoutMs: 100 })).rejects.toThrow('No AI provider completed')
    expect(mocks.text).toHaveBeenCalledOnce()
  })
  it('requests only free gateway candidates in free-only mode', async () => {
    vi.stubEnv('AI_DIRECT_FIRST', 'true')
    vi.stubEnv('GOOGLE_GENERATIVE_AI_API_KEY', 'test-key')
    mocks.candidates.mockResolvedValue([first])
    mocks.text.mockResolvedValue({ text: '{"score":5}', usage: {} })
    await generateWithFallback({ prompt: 'Validate', schema, preferredAiProvider: 'free_models', agentRole: 'market' })
    expect(mocks.candidates).toHaveBeenCalledWith(expect.objectContaining({ freeOnly: true, role: 'market' }))
  })
  it('reuses a valid fenced JSON response rejected by SDK JSON mode without another request', async () => {
    const fence = String.fromCharCode(96).repeat(3)
    const error = new NoObjectGeneratedError({
      text: fence + 'json\n{"score":7}\n' + fence,
      response: { id: 'response-1', modelId: 'flash', timestamp: new Date('2026-10-31T00:00:00Z') },
      usage: { inputTokens: 10, outputTokens: 10, totalTokens: 20,
        inputTokenDetails: { noCacheTokens: 10, cacheReadTokens: 0, cacheWriteTokens: 0 },
        outputTokenDetails: { textTokens: 10, reasoningTokens: 0 } },
      finishReason: 'stop',
    })
    mocks.text.mockResolvedValueOnce({ text: 'READY', usage: { totalTokens: 2 } }).mockRejectedValueOnce(error)
    const result = await generateWithFallback({ prompt: 'Validate', schema })
    expect(result.data).toEqual({ score: 7 })
    expect(result.provider).toBe('kios/flash')
    expect(result.tokensUsed).toBe(22)
    expect(mocks.text).toHaveBeenCalledTimes(2)
    expect(mocks.failed).not.toHaveBeenCalled()
  })
  it.each([false, true])('repairs SDK-rejected malformed JSON without another research request (native=%s)', async native => {
    if (native) {
      vi.stubEnv('AI_FREE_ONLY', 'false')
      vi.stubEnv('AI_DIRECT_FIRST', 'true')
      vi.stubEnv('GOOGLE_GENERATIVE_AI_API_KEY', 'test-key')
      vi.stubEnv('GOOGLE_AI_MODEL', 'test-native-model')
    }
    const rejectedText = '<tool_call>search_web confidential-output-4562</tool_call>'
    const error = new NoObjectGeneratedError({
      text: rejectedText,
      response: { id: 'response-2', modelId: 'flash', timestamp: new Date('2026-10-31T00:00:00Z') },
      usage: { inputTokens: 10, outputTokens: 10, totalTokens: 20,
        inputTokenDetails: { noCacheTokens: 10, cacheReadTokens: 0, cacheWriteTokens: 0 },
        outputTokenDetails: { textTokens: 10, reasoningTokens: 0 } },
      finishReason: 'stop',
    })
    mocks.text.mockResolvedValueOnce({ text: 'READY', usage: { totalTokens: 2 } })
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce({ text: '{"score":7}', output: { score: 7 }, usage: { totalTokens: 10 } })
    const result = await generateWithFallback({ prompt: 'Validate', schema, preferredAiProvider: native ? 'paid_models' : 'free_models' })
    expect(result.data).toEqual({ score: 7 })
    expect(result.provider).toBe(native ? 'google/test-native-model' : 'kios/flash')
    expect(result.tokensUsed).toBe(32)
    expect(mocks.text).toHaveBeenCalledTimes(3)
    const report = mocks.text.mock.calls[1][0]
    const repair = mocks.text.mock.calls[2][0]
    expect(repair.model).toBe(report.model)
    expect(repair.instructions).toContain('"field":"$","expected":"One syntactically valid JSON value')
    expect(repair.prompt).toBe(report.prompt)
    expect(repair).not.toHaveProperty('tools')
    expect(repair).not.toHaveProperty('messages')
    expect(JSON.stringify(repair)).not.toContain('confidential-output-4562')
    expect(mocks.failed).not.toHaveBeenCalled()
  })
  it('normalizes legacy paid preferences and separates research from tool-free JSON generation', async () => {
    vi.stubEnv('AI_DIRECT_FIRST', 'true')
    vi.stubEnv('OPENAI_API_KEY', 'native-key')
    vi.stubEnv('OPENAI_AI_MODEL', 'paid-native-model')
    mocks.text.mockResolvedValue({ text: '{"score":5}', usage: {} })
    await generateWithFallback({ prompt: 'Validate', schema, preferredAiProvider: 'paid_models' })
    expect(mocks.candidates).toHaveBeenCalledWith(expect.objectContaining({ freeOnly: true }))
    const options = mocks.text.mock.calls[0][0]
    expect(options.tools).toHaveProperty('search_web')
    expect(options.toolChoice).toBe('auto')
    const report = mocks.text.mock.calls[1][0]
    expect(report).not.toHaveProperty('tools')
    expect(report).not.toHaveProperty('messages')
    expect(report.output.name).toBe('json')
    expect(report.instructions).toContain('RESEARCH IS FINISHED')
  })
  it('preserves real tool observations across report fallbacks without executing textual tool markup', async () => {
    const source = { title: 'Source', url: 'https://example.org', content: 'Observed evidence', source: 'example.org', fetchedAt: '2026-10-31T00:00:00Z' }
    mocks.text.mockImplementationOnce(async options => {
      await options.tools.calculate.execute({ operation: 'multiply', values: [37, 19] }, { toolCallId: 'calculate-1', messages: [], context: {} })
      return { toolCalls: [{ toolName: 'calculate' }], response: { messages: [{ role: 'assistant', content: 'Research transcript' }] }, usage: { totalTokens: 10 } }
    }).mockResolvedValueOnce({ text: 'READY', usage: { totalTokens: 2 } })
      .mockResolvedValueOnce({ text: '<tool_call>search_web private data</tool_call>', usage: { totalTokens: 5 } })
      .mockResolvedValueOnce({ text: '{"score":7}', usage: { totalTokens: 8 } })
    const result = await generateWithFallback({ prompt: 'Validate', schema, sources: [source], agentRole: 'finance' })
    expect(result.tokensUsed).toBe(25)
    expect(result.sources).toEqual([source])
    expect(result.toolCalls).toEqual([expect.objectContaining({ tool: 'calculate', status: 'complete' })])
    for (const [report] of mocks.text.mock.calls.slice(2)) {
      expect(report).not.toHaveProperty('tools')
      expect(report).not.toHaveProperty('messages')
      expect(report.prompt).toContain('703')
      expect(report.prompt).toContain('Observed evidence')
      expect(report.prompt).not.toContain('<tool_call>')
      expect(report.prompt).not.toContain('Research transcript')
    }
    expect(mocks.text).toHaveBeenCalledTimes(4)
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
    expect(mocks.text).toHaveBeenCalledTimes(6)
  })
})
