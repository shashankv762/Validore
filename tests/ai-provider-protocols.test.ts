import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import type { GatewayCandidate } from '@/lib/ai/gateways'

const mocks = vi.hoisted(() => ({ candidates: vi.fn(), failed: vi.fn(), request: vi.fn() }))
vi.mock('@/lib/ai/gateways', async original => ({ ...await original<typeof import('@/lib/ai/gateways')>(),
  gatewayRouter: { candidates: mocks.candidates, canTry: () => true, failed: mocks.failed },
}))
vi.mock('@/db', () => ({ db: {} }))
import { generateWithFallback } from '@/lib/ai/generate'

const schema = z.object({ value: z.number(), assumption: z.literal(true) })
const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } })
const secret = 'synthetic-protocol-key'
const qronos: GatewayCandidate = { id: 'qronos', baseURL: 'https://qronos.me/v1', apiKey: secret,
  modelId: 'operator-approved-model', protocol: 'anthropic', fingerprint: 'synthetic-protocol-account' }

beforeEach(() => {
  vi.clearAllMocks()
  for (const key of ['OPENAI_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY', 'ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'DATABASE_URL',
    'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'QRONOS_REQUESTS_PER_HOUR', 'FREEGG_REQUESTS_PER_HOUR']) vi.stubEnv(key, '')
  vi.stubEnv('AI_FREE_ONLY', 'false'); vi.stubEnv('AI_WORKSPACE_MODEL_POLICY', 'operator_funded')
  vi.stubEnv('AI_DIRECT_FIRST', 'false'); vi.stubEnv('MARKET_MEMORY_ENABLED', 'false'); vi.stubEnv('RESEARCH_STORE_ENABLED', 'false')
  vi.stubGlobal('fetch', mocks.request)
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('real SDK requests through explicit gateway protocols', () => {
  it('sends bounded low DeepSeek reasoning effort through the real SDK while preserving the 4000-token request ceiling', async () => {
    mocks.candidates.mockResolvedValue([{ id: 'utim', baseURL: 'https://api.utim.dev/v1', apiKey: secret,
      modelId: 'utim/deepseek-v4.1-flash', protocol: 'openai', fingerprint: 'synthetic-utim-account' }])
    mocks.request.mockImplementation(async () => json({ id: 'chatcmpl_synthetic', object: 'chat.completion', created: 1794700000,
      model: 'utim/deepseek-v4.1-flash', choices: [{ index: 0, message: { role: 'assistant', content: '{"value":703,"assumption":true}' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 },
    }))
    const result = await generateWithFallback({ prompt: 'Return a bounded scenario.', agentRole: 'synthesis', schema, researchMode: 'reuse', maxTokensPerCall: 4000, maxModelCalls: 1 })
    expect(result.provider).toBe('utim/utim/deepseek-v4.1-flash')
    const body = JSON.parse(String(mocks.request.mock.calls[0][1].body))
    expect(body).toMatchObject({ model: 'utim/deepseek-v4.1-flash', max_tokens: 4000, reasoning_effort: 'low' })
    expect(body.max_completion_tokens).toBeUndefined()
  })
  it('uses stateless FreeGG Responses requests for research, local tool results and final JSON', async () => {
    const candidate: GatewayCandidate = { id: 'freegg', baseURL: 'https://freegg.app/v1', apiKey: secret,
      modelId: 'gpt-6.1-sol', protocol: 'responses', fingerprint: 'synthetic-freegg-account' }
    mocks.candidates.mockResolvedValue([candidate])
    let calls = 0
    mocks.request.mockImplementation(async (_url, init) => {
      const body = JSON.parse(String(init.body))
      calls++
      const toolRequest = calls === 1
      return json({ id: 'resp_synthetic_' + calls, object: 'response', created_at: 1794700000, model: candidate.modelId, status: 'completed',
        output: toolRequest ? [{ type: 'function_call', id: 'fc_synthetic', call_id: 'call_synthetic', name: 'calculate', arguments: '{"operation":"multiply","values":[37,19]}' }]
          : [{ type: 'message', id: 'msg_synthetic_' + calls, role: 'assistant', content: [{ type: 'output_text', text: body.tools ? 'READY' : '{"value":703,"assumption":true}', annotations: [] }] }],
        usage: { input_tokens: 20, output_tokens: 10, total_tokens: 30 },
      })
    })
    const result = await generateWithFallback({ prompt: 'Review the completed hypothetical calculation.', researchPrompt: 'Public arithmetic acceptance scenario.',
      privateContext: 'PRIVATE-FOUNDER-CONTEXT-5739', agentRole: 'finance', schema, maxResearchRounds: 2, maxModelCalls: 3 })
    expect(result.provider).toBe('freegg/gpt-6.1-sol')
    expect(result.data).toEqual({ value: 703, assumption: true })
    expect(result.tokensUsed).toBe(90)
    expect(mocks.request).toHaveBeenCalledTimes(3)
    for (const [url, init] of mocks.request.mock.calls) {
      expect(String(url)).toBe('https://freegg.app/v1/responses')
      expect(new Headers(init.headers).get('authorization')).toBe('Bearer ' + secret)
      expect(init.redirect).toBe('error')
      const body = JSON.parse(String(init.body))
      expect(body.model).toBe(candidate.modelId)
      expect(body.store).toBe(false)
      expect(body.previous_response_id).toBeUndefined()
      expect(body.conversation).toBeUndefined()
      expect(body.input.some((item: { type?: string }) => item.type === 'item_reference')).toBe(false)
      expect(String(init.body)).not.toContain(secret)
    }
    const research = JSON.parse(String(mocks.request.mock.calls[1][1].body))
    expect(research.input).toContainEqual(expect.objectContaining({ type: 'function_call_output', call_id: 'call_synthetic', output: expect.stringContaining('703') }))
    expect(JSON.stringify(research)).not.toContain('PRIVATE-FOUNDER-CONTEXT-5739')
    const report = JSON.parse(String(mocks.request.mock.calls[2][1].body))
    expect(report.tools).toBeUndefined()
    expect(JSON.stringify(report.input)).toContain('PRIVATE-FOUNDER-CONTEXT-5739')
  })
  it('recovers a FreeGG socket disconnect through the real SDK without changing the stateless report request or token ceiling', async () => {
    vi.stubEnv('AI_DIAGNOSTICS', 'true')
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    const candidate: GatewayCandidate = { id: 'freegg', baseURL: 'https://freegg.app/v1', apiKey: secret,
      modelId: 'gpt-6.1-sol', protocol: 'responses', fingerprint: 'synthetic-freegg-transport' }
    mocks.candidates.mockResolvedValue([candidate])
    mocks.request.mockRejectedValueOnce(new TypeError('fetch failed', {
      cause: Object.assign(new Error('PRIVATE-SOCKET-DETAIL-6942'), { code: 'ECONNRESET' }),
    })).mockImplementation(async () => json({
      id: 'resp_transport_recovered', object: 'response', created_at: 1794700000, model: candidate.modelId, status: 'completed',
      output: [{ type: 'message', id: 'msg_transport_recovered', role: 'assistant',
        content: [{ type: 'output_text', text: '{"value":703,"assumption":true}', annotations: [] }] }],
      usage: { input_tokens: 20, output_tokens: 10, total_tokens: 30 },
    }))
    const result = await generateWithFallback({ prompt: 'Review the hypothetical result.', schema, agentRole: 'customer',
      researchMode: 'reuse', maxTokensPerCall: 4000, maxModelCalls: 2 })
    expect(result.data).toEqual({ value: 703, assumption: true })
    expect(mocks.request).toHaveBeenCalledTimes(2)
    const bodies = mocks.request.mock.calls.map(([_url, init]) => JSON.parse(String(init.body)))
    expect(bodies[1]).toEqual(bodies[0])
    expect(bodies[1]).toMatchObject({ model: candidate.modelId, store: false, max_output_tokens: 4000 })
    expect(bodies[1].tools).toBeUndefined()
    expect(bodies[1].previous_response_id).toBeUndefined()
    expect(bodies[1].conversation).toBeUndefined()
    expect(info).toHaveBeenCalledWith('[ai] Retrying tool-free report', expect.objectContaining({
      type: 'AI_APICallError', isRetryable: true, causes: [{ type: 'Error', code: 'ECONNRESET' }],
    }))
    expect(JSON.stringify(info.mock.calls)).not.toContain('PRIVATE-SOCKET-DETAIL-6942')
    expect(JSON.stringify(info.mock.calls)).not.toContain(secret)
    expect(mocks.failed).not.toHaveBeenCalled()
  })
  it.each(['api_key', 'bearer'] as const)('runs an Anthropic tool-result and JSON report with %s authentication', async anthropicAuthMode => {
    mocks.candidates.mockResolvedValue([{ ...qronos, anthropicAuthMode }])
    mocks.request.mockImplementation(async (_url, init) => {
      const body = JSON.parse(String(init.body))
      const research = Array.isArray(body.tools) && body.tools.some((tool: { name?: string }) => tool.name === 'calculate')
      return json({ id: 'msg_synthetic', type: 'message', role: 'assistant', model: qronos.modelId,
        content: research ? [{ type: 'tool_use', id: 'calculate_synthetic', name: 'calculate', input: { operation: 'multiply', values: [37, 19] } }]
          : [{ type: 'text', text: '{"value":703,"assumption":true}' }],
        stop_reason: research ? 'tool_use' : 'end_turn', stop_sequence: null, usage: { input_tokens: 20, output_tokens: 10 },
      })
    })
    const result = await generateWithFallback({ prompt: 'Review the supplied hypothetical arithmetic.', researchPrompt: 'Public research example.',
      privateContext: 'PRIVATE-FOUNDER-CONTEXT-5739', agentRole: 'finance', schema, maxResearchRounds: 1, maxModelCalls: 2 })
    expect(result.data).toEqual({ value: 703, assumption: true })
    expect(result.provider).toBe('qronos/' + qronos.modelId)
    expect(result.tokensUsed).toBe(60)
    expect(result.toolCalls).toContainEqual(expect.objectContaining({ tool: 'calculate', status: 'complete' }))
    expect(mocks.request).toHaveBeenCalledTimes(2)
    for (const [url, init] of mocks.request.mock.calls) {
      expect(String(url)).toBe('https://qronos.me/v1/messages')
      expect(init.redirect).toBe('error')
      const headers = new Headers(init.headers)
      expect(headers.get('anthropic-version')).toBe('2023-06-01')
      expect(headers.get(anthropicAuthMode === 'api_key' ? 'x-api-key' : 'authorization')).toBe(anthropicAuthMode === 'api_key' ? secret : 'Bearer ' + secret)
      expect(headers.get(anthropicAuthMode === 'api_key' ? 'authorization' : 'x-api-key')).toBeNull()
      expect(JSON.parse(String(init.body)).model).toBe(qronos.modelId)
      expect(String(init.body)).not.toContain(secret)
    }
    const researchBody = JSON.parse(String(mocks.request.mock.calls[0][1].body))
    const reportBody = JSON.parse(String(mocks.request.mock.calls[1][1].body))
    expect(JSON.stringify(researchBody)).not.toContain('PRIVATE-FOUNDER-CONTEXT-5739')
    expect(JSON.stringify(reportBody)).toContain('PRIVATE-FOUNDER-CONTEXT-5739')
    expect(JSON.stringify(reportBody.messages)).toContain('703')
    expect(reportBody.tools).toBeUndefined()
    expect(reportBody.output_config).toBeUndefined()
    expect(reportBody.response_format).toBeUndefined()
  })

  it('passes a supplied OpenAI-compatible alias literally without claiming native OpenAI model identity', async () => {
    mocks.candidates.mockResolvedValue([{ id: 'artbloom', baseURL: 'https://api.artbloom.tech/v1', apiKey: secret,
      modelId: 'gpt-6.1-sol', protocol: 'openai', fingerprint: 'synthetic-artbloom-account' }])
    mocks.request.mockImplementation(async () => json({ id: 'chatcmpl_synthetic', object: 'chat.completion', created: 1794700000,
      model: 'gpt-6.1-sol', choices: [{ index: 0, message: { role: 'assistant', content: '{"value":703,"assumption":true}' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 },
    }))
    const result = await generateWithFallback({ prompt: 'Return a labeled hypothetical result.', schema, researchMode: 'reuse', maxModelCalls: 1 })
    expect(result.provider).toBe('artbloom/gpt-6.1-sol')
    expect(result.data).toEqual({ value: 703, assumption: true })
    expect(mocks.request).toHaveBeenCalledOnce()
    const [url, init] = mocks.request.mock.calls[0]
    expect(String(url)).toBe('https://api.artbloom.tech/v1/chat/completions')
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer ' + secret)
    expect(new Headers(init.headers).get('x-api-key')).toBeNull()
    expect(JSON.parse(String(init.body)).model).toBe('gpt-6.1-sol')
    expect(init.redirect).toBe('error')
    expect(mocks.failed).not.toHaveBeenCalled()
  })
})
