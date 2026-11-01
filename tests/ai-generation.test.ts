import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { NoObjectGeneratedError } from 'ai'

const mocks = vi.hoisted(() => ({ text: vi.fn(), candidates: vi.fn(), failed: vi.fn(), canTry: vi.fn(), create: vi.fn() }))
vi.mock('ai', async importOriginal => ({ ...await importOriginal<typeof import('ai')>(), generateText: mocks.text }))
vi.mock('@ai-sdk/openai', () => ({ createOpenAI: mocks.create }))
vi.mock('../src/lib/ai/providers', () => ({
  openrouter: { chat: vi.fn() }, FREE_MODEL_CHAIN: ['free-model'], openaiProvider: vi.fn(), googleProvider: vi.fn(), anthropicProvider: vi.fn(),
}))
vi.mock('../src/lib/ai/gateways', async () => ({
  ...await vi.importActual<typeof import('../src/lib/ai/gateways')>('../src/lib/ai/gateways'),
  gatewayRouter: { candidates: mocks.candidates, failed: mocks.failed, canTry: mocks.canTry },
}))
import { generateWithFallback } from '../src/lib/ai/generate'
import { publicResearchBrief, publicResearchQuery } from '@/lib/ai/research-brief'

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
})
afterEach(() => vi.unstubAllEnvs())

describe('gateway generation fallback', () => {
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
      .mockResolvedValueOnce({ text: '{"score":7}', usage: { totalTokens: 10 } })
    const privateContext = JSON.stringify({ answers: [{ answer: 'Private founder observation 4529' }] })
    await generateWithFallback({ prompt: 'Prior finding derived from a private answer: revenue is confidential', researchPrompt: 'Public retail market research brief', privateContext, schema })
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
  it('falls back after invalid structured output and keeps each key with its host', async () => {
    mocks.text.mockResolvedValueOnce({ text: 'READY', usage: { totalTokens: 2 } })
      .mockResolvedValueOnce({ text: '{"score":100}', usage: { totalTokens: 20 } })
      .mockResolvedValueOnce({ text: '{"score":7}', usage: { totalTokens: 30 } })
    const result = await generateWithFallback({ prompt: 'Validate', schema, agentRole: 'finance', preferredAiProvider: 'paid_models' })
    expect(result).toEqual({ data: { score: 7 }, provider: 'seekai/reasoner', tokensUsed: 52, toolCalls: [], sources: [] })
    expect(mocks.failed).toHaveBeenCalledWith(first, expect.any(Error))
    expect(mocks.create.mock.calls.map(([config]) => [config.baseURL, config.apiKey])).toEqual([
      [first.baseURL, first.apiKey], [second.baseURL, second.apiKey],
    ])
    expect(mocks.text.mock.calls[1][0]).toEqual(expect.objectContaining({ maxRetries: 0, maxOutputTokens: 4000 }))
    expect(mocks.text.mock.calls[0][0]).not.toHaveProperty('output')
    expect(mocks.text.mock.calls[1][0].output.name).toBe('json')
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
