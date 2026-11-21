import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { APICallError } from '@ai-sdk/provider'
import { z } from 'zod'

const mocks = vi.hoisted(() => ({ text: vi.fn(), candidates: vi.fn(), failed: vi.fn(), create: vi.fn() }))
vi.mock('ai', async original => ({ ...await original<typeof import('ai')>(), generateText: mocks.text }))
vi.mock('@ai-sdk/openai', () => ({ createOpenAI: mocks.create }))
vi.mock('@/lib/ai/gateways', async original => ({ ...await original<typeof import('@/lib/ai/gateways')>(),
  gatewayRouter: { candidates: mocks.candidates, failed: mocks.failed, canTry: () => true },
}))
vi.mock('@/lib/ai/market-memory', () => ({ retrieveMarketMemory: () => [] }))
import { generateWithFallback, OutputBudgetExhaustedError } from '@/lib/ai/generate'

const candidate = { id: 'freegg', modelId: 'gpt-6.1-sol', protocol: 'responses' as const,
  baseURL: 'https://provider.example/v1', apiKey: 'synthetic-private-key', fingerprint: 'transport-test' }
const schema = z.object({ score: z.number().min(0).max(10) })
const success = { text: '{"score":7}', usage: { totalTokens: 20 } }
const secret = 'PRIVATE-TRANSPORT-DATA-8172'
const networkCause = () => Object.assign(new Error(secret), { code: 'ECONNRESET' })
const transportError = (overrides: { statusCode?: number; isRetryable?: boolean; cause?: unknown } = {}) => new APICallError({
  message: secret, url: 'https://provider.example/v1/responses', requestBodyValues: { privateContext: secret },
  isRetryable: true, cause: new TypeError(secret, { cause: networkCause() }), ...overrides,
})

beforeEach(() => {
  vi.resetAllMocks()
  for (const name of ['OPENAI_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY', 'ANTHROPIC_API_KEY']) vi.stubEnv(name, '')
  vi.stubEnv('AI_FREE_ONLY', 'false')
  vi.stubEnv('AI_WORKSPACE_MODEL_POLICY', 'operator_funded')
  vi.stubEnv('AI_DIRECT_FIRST', 'false')
  vi.stubEnv('AI_DIAGNOSTICS', 'true')
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  mocks.candidates.mockResolvedValue([candidate])
  mocks.create.mockImplementation(() => ({ responses: (model: string) => model, chat: (model: string) => model }))
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs() })

const retryLogs = () => vi.mocked(console.info).mock.calls.filter(([event]) => event === '[ai] Retrying tool-free report')

describe('bounded report transport recovery', () => {
  it('recovers one transient report failure using the same tool-free request and completed research', async () => {
    mocks.text.mockImplementationOnce(async options => {
      await options.tools.calculate.execute({ operation: 'multiply', values: [37, 19] }, { toolCallId: 'local-calculation', messages: [], context: {} })
      return { toolCalls: [{ toolName: 'calculate' }], response: { messages: [] }, usage: { totalTokens: 10 } }
    }).mockRejectedValueOnce(transportError()).mockResolvedValueOnce(success)
    const result = await generateWithFallback({ prompt: 'Review the hypothetical calculation', researchPrompt: 'Public arithmetic task',
      privateContext: secret, agentRole: 'customer', schema, maxResearchRounds: 1, maxTokensPerCall: 4000 })

    expect(result).toMatchObject({ data: { score: 7 }, provider: 'freegg/gpt-6.1-sol', tokensUsed: 30 })
    expect(result.toolCalls).toEqual([expect.objectContaining({ tool: 'calculate', status: 'complete' })])
    expect(mocks.text).toHaveBeenCalledTimes(3)
    const report = mocks.text.mock.calls[1][0]
    const retry = mocks.text.mock.calls[2][0]
    expect(retry).toEqual({ ...report, abortSignal: retry.abortSignal })
    expect(retry.abortSignal).not.toBe(report.abortSignal)
    expect(retry).toMatchObject({ maxOutputTokens: 4000, maxRetries: 0 })
    expect(retry.prompt).toContain('703')
    expect(retry).not.toHaveProperty('tools')
    expect(retry).not.toHaveProperty('messages')
    expect(retry.instructions).not.toContain('OUTPUT CORRECTION')
    expect(retryLogs()).toHaveLength(1)
    expect(mocks.failed).not.toHaveBeenCalled()
  })

  it('allows only one transport recovery across all candidates and retains the six-call ceiling', async () => {
    mocks.candidates.mockResolvedValue(Array.from({ length: 20 }, (_, index) => ({ ...candidate, modelId: 'model-' + index })))
    mocks.text.mockRejectedValue(transportError())
    await expect(generateWithFallback({ prompt: 'Review', schema, researchMode: 'reuse' })).rejects.toThrow('No AI provider completed')
    expect(mocks.text.mock.calls.map(([options]) => options.model)).toEqual(['model-0', 'model-0', 'model-1', 'model-2', 'model-3', 'model-4'])
    expect(retryLogs()).toHaveLength(1)
  })

  it.each([401, 402, 403, 408, 429, 500])('never retries HTTP %i as a no-status transport failure, even with a retryable flag and socket cause', async statusCode => {
    mocks.text.mockRejectedValue(transportError({ statusCode }))
    await expect(generateWithFallback({ prompt: 'Review', schema, researchMode: 'reuse' })).rejects.toThrow('No AI provider completed')
    expect(mocks.text).toHaveBeenCalledOnce()
    expect(retryLogs()).toHaveLength(0)
  })

  it.each([
    ['unclassified error', () => new Error(secret)],
    ['SDK non-retryable error', () => transportError({ isRetryable: false })],
    ['unknown cause', () => transportError({ cause: new Error(secret) })],
    ['schema cause', () => transportError({ cause: Object.assign(new SyntaxError(secret), { code: 'ECONNRESET' }) })],
    ['output-budget cause', () => transportError({ cause: Object.assign(new OutputBudgetExhaustedError(), { code: 'ECONNRESET' }) })],
    ['nested HTTP quota', () => transportError({ cause: transportError({ statusCode: 429 }) })],
  ] as const)('does not classify %s as recoverable transport', async (_label, error) => {
    mocks.text.mockRejectedValue(error())
    await expect(generateWithFallback({ prompt: 'Review', schema, researchMode: 'reuse' })).rejects.toThrow('No AI provider completed')
    expect(mocks.text).toHaveBeenCalledOnce()
    expect(retryLogs()).toHaveLength(0)
  })

  it('does not repeat a report that has already exhausted its output budget', async () => {
    mocks.text.mockResolvedValue({ text: '', finishReason: 'length', usage: { totalTokens: 4000, outputTokenDetails: { reasoningTokens: 4000 } } })
    await expect(generateWithFallback({ prompt: 'Review', schema, researchMode: 'reuse', maxTokensPerCall: 4000 })).rejects.toThrow('No AI provider completed')
    expect(mocks.text).toHaveBeenCalledOnce()
    expect(mocks.failed).toHaveBeenCalledWith(candidate, expect.any(OutputBudgetExhaustedError))
    expect(retryLogs()).toHaveLength(0)
  })

  it('does not add transport recovery to a schema repair request', async () => {
    mocks.text.mockResolvedValueOnce({ text: '{"score":100}', usage: {} }).mockRejectedValueOnce(transportError())
    await expect(generateWithFallback({ prompt: 'Review', schema, researchMode: 'reuse' })).rejects.toThrow('No AI provider completed')
    expect(mocks.text).toHaveBeenCalledTimes(2)
    expect(mocks.text.mock.calls[1][0].instructions).toContain('OUTPUT CORRECTION')
    expect(retryLogs()).toHaveLength(0)
  })

  it('preserves the final call for another candidate instead of retrying the first', async () => {
    mocks.candidates.mockResolvedValue([candidate, { ...candidate, modelId: 'second-model' }])
    mocks.text.mockRejectedValueOnce(transportError()).mockResolvedValueOnce(success)
    const result = await generateWithFallback({ prompt: 'Review', schema, researchMode: 'reuse', maxModelCalls: 2 })
    expect(result.provider).toBe('freegg/second-model')
    expect(mocks.text.mock.calls.map(([options]) => options.model)).toEqual(['gpt-6.1-sol', 'second-model'])
    expect(retryLogs()).toHaveLength(0)
  })

  it('cannot retry after the configured call ceiling is reached', async () => {
    mocks.text.mockRejectedValue(transportError())
    await expect(generateWithFallback({ prompt: 'Review', schema, researchMode: 'reuse', maxModelCalls: 1 })).rejects.toThrow('No AI provider completed')
    expect(mocks.text).toHaveBeenCalledOnce()
  })

  it('allocates the retry only the time remaining before the original deadline', async () => {
    let now = 1000
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    const timeouts = vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => new AbortController().signal)
    mocks.text.mockImplementationOnce(async () => { now += 60_000; throw transportError() }).mockResolvedValueOnce(success)
    await generateWithFallback({ prompt: 'Review', schema, researchMode: 'reuse', timeoutMs: 100_000 })
    expect(timeouts.mock.calls.map(([timeout]) => timeout)).toEqual([100_000, 40_000])
    expect(retryLogs()).toHaveLength(1)
  })

  it.each([95_000, 100_001])('does not restart the budget after %i milliseconds have elapsed', async elapsed => {
    let now = 1000
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    mocks.text.mockImplementationOnce(async () => { now += elapsed; throw transportError() })
    await expect(generateWithFallback({ prompt: 'Review', schema, researchMode: 'reuse', timeoutMs: 100_000 })).rejects.toThrow('No AI provider completed')
    expect(mocks.text).toHaveBeenCalledOnce()
    expect(retryLogs()).toHaveLength(0)
  })

  it('does not replace an aborted report signal even if the SDK reports a retryable socket error', async () => {
    const controller = new AbortController()
    vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal)
    mocks.text.mockImplementationOnce(async () => {
      controller.abort(new DOMException(secret, 'TimeoutError'))
      throw transportError()
    })
    await expect(generateWithFallback({ prompt: 'Review', schema, researchMode: 'reuse' })).rejects.toThrow('No AI provider completed')
    expect(mocks.text).toHaveBeenCalledOnce()
    expect(controller.signal.aborted).toBe(true)
    expect(retryLogs()).toHaveLength(0)
  })

  it.each(['AbortError', 'TimeoutError', 'ResponseAborted'])('does not retry a wrapped %s cause', async name => {
    mocks.text.mockRejectedValue(transportError({ cause: Object.assign(new Error(secret), { name, cause: networkCause() }) }))
    await expect(generateWithFallback({ prompt: 'Review', schema, researchMode: 'reuse' })).rejects.toThrow('No AI provider completed')
    expect(mocks.text).toHaveBeenCalledOnce()
    expect(retryLogs()).toHaveLength(0)
  })

  it('logs only allowlisted error and cause names/codes plus retryability, never arbitrary error fields', async () => {
    const cause = Object.assign(new Error(secret), { name: secret, code: secret, cause: networkCause() })
    const error = transportError({ cause })
    Object.assign(error, { responseBody: secret, responseHeaders: { authorization: secret }, data: { prompt: secret } })
    mocks.text.mockRejectedValue(error)
    await expect(generateWithFallback({ prompt: secret, schema, researchMode: 'reuse' })).rejects.toThrow('No AI provider completed')
    const failure = vi.mocked(console.warn).mock.calls.find(([event]) => event === '[ai] Candidate unavailable')![1]
    expect(failure).toMatchObject({ type: 'AI_APICallError', isRetryable: true, causes: [expect.objectContaining({ type: 'Error', code: 'ECONNRESET' })] })
    const logs = JSON.stringify([vi.mocked(console.info).mock.calls, vi.mocked(console.warn).mock.calls])
    expect(logs).not.toContain(secret)
    expect(logs).not.toContain(candidate.apiKey)
    expect(logs).not.toContain('responseBody')
    expect(logs).not.toContain('requestBodyValues')
  })
})
