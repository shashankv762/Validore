import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { createGatewayRouter, parseGatewayOutput } from '../src/lib/ai/gateways'

const environment = () => ({
  KIOS_API_KEY: 'kios-test-key', KIOS_BASE_URL: 'https://kiosapi.com/v1', KIOS_MODELS: 'missing,flash,other', KIOS_FREE_MODELS: 'flash',
  SEEKAI_API_KEY: 'seek-test-key', SEEKAI_BASE_URL: 'https://seekai.cc/v1', SEEKAI_MODELS: 'reasoner,free', SEEKAI_FREE_MODELS: 'free',
  AI_GATEWAY_ORDER: 'kios,seekai',
})
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

describe('configured gateway routing', () => {
  it.each([
    ['freegg', 'FREEGG', 'https://freegg.app/v1', 'responses'],
    ['utim', 'UTIM', 'https://api.utim.dev/v1', 'openai'],
    ['artbloom', 'ARTBLOOM', 'https://api.artbloom.tech/v1', 'openai'],
  ])('keeps %s aliases literal, host-bound and out of free-only routing without a free declaration', async (id, prefix, baseURL, protocol) => {
    const fetcher: typeof fetch = vi.fn(async () => json({ data: [{ id: 'gpt-6.1-sol' }, { id: 'gpt-6-luna' }] }))
    const env = { [prefix + '_API_KEY']: 'synthetic-' + id + '-key', [prefix + '_MODELS']: 'gpt-6.1-sol,gpt-6-luna', AI_GATEWAY_ENABLED: id }
    const router = createGatewayRouter({ environment: () => env, fetcher })
    expect(await router.candidates({ freeOnly: true })).toEqual([])
    expect(fetcher).not.toHaveBeenCalled()
    expect(await router.candidates({ freeOnly: false })).toEqual([expect.objectContaining({ id, baseURL, protocol, modelId: 'gpt-6.1-sol' })])
    expect(fetcher).toHaveBeenCalledWith(baseURL + '/models', expect.objectContaining({ headers: { Authorization: 'Bearer synthetic-' + id + '-key' }, redirect: 'error' }))
    const hostile = createGatewayRouter({ environment: () => ({ ...env, [prefix + '_BASE_URL']: 'https://unrelated.example/v1' }), fetcher })
    expect(await hostile.candidates()).toEqual([])
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it.each(['api_key', 'bearer'] as const)('normalizes the Qronos Anthropic root and uses only the selected %s credential header', async anthropicAuthMode => {
    const fetcher: typeof fetch = vi.fn(async () => json({ data: [{ id: 'operator-model' }, { id: 'gpt-6-luna' }] }))
    const env = { QRONOS_API_KEY: 'synthetic-qronos-key', QRONOS_BASE_URL: 'https://qronos.me', QRONOS_MODELS: 'operator-model,gpt-6-luna', QRONOS_ANTHROPIC_AUTH_MODE: anthropicAuthMode }
    const router = createGatewayRouter({ environment: () => env, fetcher })
    expect(await router.candidates()).toEqual([expect.objectContaining({ id: 'qronos', baseURL: 'https://qronos.me/v1', protocol: 'anthropic', anthropicAuthMode, modelId: 'operator-model' })])
    expect(fetcher).toHaveBeenCalledWith('https://qronos.me/v1/models', expect.objectContaining({ headers: {
      'anthropic-version': '2023-06-01', ...(anthropicAuthMode === 'api_key' ? { 'x-api-key': 'synthetic-qronos-key' } : { Authorization: 'Bearer synthetic-qronos-key' }),
    } }))
  })
  it('supports an explicit Anthropic protocol switch only on declared compatible profiles', async () => {
    const fetcher: typeof fetch = vi.fn(async () => json({}, 404))
    const approved = createGatewayRouter({ environment: () => ({ ARTBLOOM_API_KEY: 'synthetic', ARTBLOOM_BASE_URL: 'https://api.artbloom.tech', ARTBLOOM_MODELS: 'literal-model', ARTBLOOM_PROTOCOL: 'anthropic' }), fetcher })
    expect(await approved.candidates()).toEqual([expect.objectContaining({ protocol: 'anthropic', baseURL: 'https://api.artbloom.tech/v1', modelId: 'literal-model' })])
    const invalid = createGatewayRouter({ environment: () => ({ UTIM_API_KEY: 'synthetic', UTIM_MODELS: 'literal-model', UTIM_PROTOCOL: 'anthropic' }), fetcher })
    expect(await invalid.candidates()).toEqual([])
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it.each(['openai', 'anthropic'])('rejects the retired FreeGG %s protocol before sending credentials', async protocol => {
    const fetcher: typeof fetch = vi.fn(async () => json({}, 404))
    const router = createGatewayRouter({ environment: () => ({ FREEGG_API_KEY: 'synthetic', FREEGG_MODELS: 'gpt-6.1-sol', FREEGG_PROTOCOL: protocol }), fetcher })
    expect(await router.candidates()).toEqual([])
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('does not treat an incomplete Anthropic catalog as proof that a configured alias is unavailable', async () => {
    const fetcher: typeof fetch = vi.fn(async () => json({ data: [{ id: 'first-page-model' }], has_more: true, last_id: 'first-page-model' }))
    const router = createGatewayRouter({ environment: () => ({ QRONOS_API_KEY: 'synthetic', QRONOS_MODELS: 'operator-model' }), fetcher })
    expect((await router.candidates()).map(candidate => candidate.modelId)).toEqual(['operator-model'])
  })
  it('never sends Kios or SeekAI credentials to a replacement origin', async () => {
    const fetcher: typeof fetch = vi.fn(async () => json({}, 404))
    const router = createGatewayRouter({ environment: () => ({ ...environment(), KIOS_BASE_URL: 'https://unrelated.example/v1', SEEKAI_BASE_URL: 'https://kiosapi.com/v1' }), fetcher })
    expect(await router.candidates()).toEqual([])
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('uses explicitly enabled installed Ollama models over loopback without a paid API key', async () => {
    const fetcher: typeof fetch = vi.fn(async () => json({ data: [{ id: 'local-tool-model' }] }))
    const env = { OLLAMA_ENABLED: 'true', OLLAMA_MODELS: 'local-tool-model', OLLAMA_FREE_MODELS: 'local-tool-model', AI_GATEWAY_ENABLED: 'ollama' }
    const router = createGatewayRouter({ environment: () => env, fetcher })
    expect(await router.candidates({ freeOnly: true })).toEqual([expect.objectContaining({ id: 'ollama', modelId: 'local-tool-model', baseURL: 'http://127.0.0.1:11434/v1' })])
  })
  it('does not send unauthenticated Ollama traffic to a remote host or enable it implicitly', async () => {
    const fetcher: typeof fetch = vi.fn(async () => json({}, 404))
    for (const extra of [{ OLLAMA_ENABLED: 'false' }, { OLLAMA_BASE_URL: 'https://inference.example.org/v1' }, { OLLAMA_BASE_URL: 'http://inference.example.org/v1', OLLAMA_API_KEY: 'test-key' }]) {
      const router = createGatewayRouter({ environment: () => ({ OLLAMA_ENABLED: 'true', OLLAMA_MODELS: 'local-tool-model', OLLAMA_FREE_MODELS: 'local-tool-model', ...extra }), fetcher })
      expect(await router.candidates({ freeOnly: true })).toEqual([])
    }
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('uses only the curated PixRouter free aliases and keeps the key at the official host', async () => {
    const fetcher: typeof fetch = vi.fn(async () => json({ data: [
      { id: 'thinkingmachines/inkling:free' }, { id: 'qwen/qwen3.8-27b:free' }, { id: 'z-ai/glm-4.5-flash:free' }, { id: 'openrouter/free' },
      { id: 'paid-model' }, { id: 'meta-llama/llama-prompt-guard-2-22m:free' },
    ] }))
    const env = { PIXROUTER_API_KEY: 'pix-test', PIXROUTER_MODELS: 'thinkingmachines/inkling:free,qwen/qwen3.8-27b:free,z-ai/glm-4.5-flash:free,openrouter/free,paid-model,meta-llama/llama-prompt-guard-2-22m:free', PIXROUTER_FREE_MODELS: 'thinkingmachines/inkling:free,qwen/qwen3.8-27b:free,z-ai/glm-4.5-flash:free,openrouter/free,paid-model,meta-llama/llama-prompt-guard-2-22m:free' }
    const router = createGatewayRouter({ environment: () => env, fetcher })
    expect((await router.candidates({ freeOnly: true, role: 'finance' })).map(model => model.modelId)).toEqual([
      'qwen/qwen3.8-27b:free', 'thinkingmachines/inkling:free', 'z-ai/glm-4.5-flash:free', 'openrouter/free',
    ])
    expect(fetcher).toHaveBeenCalledWith('https://pixrouter.com/v1/models', expect.objectContaining({ headers: { Authorization: 'Bearer pix-test' }, redirect: 'error' }))
    const unsafe = createGatewayRouter({ environment: () => ({ ...env, PIXROUTER_BASE_URL: 'https://another.example/v1' }), fetcher })
    expect(await unsafe.candidates({ freeOnly: true })).toEqual([])
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('honors provider order for all roles unless rotation is explicitly enabled', async () => {
    const fetcher: typeof fetch = vi.fn(async () => json({}, 404))
    const router = createGatewayRouter({ environment, fetcher })
    for (const role of ['market', 'customer', 'competitor', 'finance', 'risk', 'synthesis'] as const) {
      expect((await router.candidates({ role }))[0].id).toBe('kios')
    }
  })
  it('filters advertised models, interleaves hosts, and caches catalog requests', async () => {
    const fetcher: typeof fetch = vi.fn(async input => String(input).includes('kios')
      ? json({ data: [{ id: 'flash' }, { id: 'other' }] })
      : json({ data: [{ id: 'reasoner' }, { id: 'free' }] }))
    const router = createGatewayRouter({ environment, fetcher })
    const candidates = await router.candidates()
    expect(candidates.map(model => model.modelId)).toEqual(['flash', 'reasoner', 'other', 'free'])
    await router.candidates()
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(fetcher).toHaveBeenCalledWith('https://kiosapi.com/v1/models', expect.objectContaining({
      headers: { Authorization: 'Bearer kios-test-key' }, redirect: 'error', cache: 'no-store',
    }))
  })
  it.each([[401, 'authentication_rejected'], [429, 'rate_limited'], [503, 'upstream_unavailable']] as const)(
    'reports safe catalog HTTP %i diagnostics without response bodies or headers', async (status, state) => {
      const now = 1_000_000
      const fetcher: typeof fetch = vi.fn(async () => new Response('private provider body', {
        status, headers: status === 429 ? { 'retry-after': '45', 'x-private-upstream': 'must-not-be-recorded' } : {},
      }))
      const router = createGatewayRouter({ environment: () => ({ FREEGG_API_KEY: 'synthetic', FREEGG_MODELS: 'gpt-6.1-sol', AI_GATEWAY_ENABLED: 'freegg' }),
        fetcher, now: () => now })
      const diagnostics: import('../src/lib/ai/gateways').GatewayDiagnostic[] = []
      expect(await router.candidates({ onDiagnostic: item => diagnostics.push(item) })).toEqual([])
      expect(diagnostics).toEqual([expect.objectContaining({ provider: 'freegg', model: 'gpt-6.1-sol', state,
        ...(status === 429 ? { retryAt: new Date(now + 45_000).toISOString() } : { httpStatus: status }),
      })])
      const serialized = JSON.stringify(diagnostics)
      expect(serialized).not.toContain('private provider body')
      expect(serialized).not.toContain('must-not-be-recorded')
    })
  it('reports catalog network failures as retryable-safe metadata only', async () => {
    const router = createGatewayRouter({ environment: () => ({ FREEGG_API_KEY: 'synthetic', FREEGG_MODELS: 'gpt-6.1-sol', AI_GATEWAY_ENABLED: 'freegg' }),
      fetcher: vi.fn(async () => { throw new TypeError('fetch failed', { cause: Object.assign(new Error('private response'), { code: 'ECONNRESET' }) }) }) })
    const diagnostics: import('../src/lib/ai/gateways').GatewayDiagnostic[] = []
    expect(await router.candidates({ onDiagnostic: item => diagnostics.push(item) })).toEqual([])
    expect(diagnostics[0].state).toBe('network_unavailable')
    expect(diagnostics[0].retryAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(JSON.stringify(diagnostics)).not.toContain('private response')
  })
  it('reports catalog timeouts separately from network failures', async () => {
    const router = createGatewayRouter({ environment: () => ({ FREEGG_API_KEY: 'synthetic', FREEGG_MODELS: 'gpt-6.1-sol', AI_GATEWAY_ENABLED: 'freegg' }),
      fetcher: vi.fn(async () => { throw Object.assign(new Error('upstream wait'), { name: 'TimeoutError' }) }) })
    const diagnostics: import('../src/lib/ai/gateways').GatewayDiagnostic[] = []
    expect(await router.candidates({ onDiagnostic: item => diagnostics.push(item) })).toEqual([])
    expect(diagnostics[0].state).toBe('request_timeout')
    expect(diagnostics[0].retryAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })
  it('reports a configured alias missing from a verified catalog without attempting generation', async () => {
    const router = createGatewayRouter({ environment: () => ({ FREEGG_API_KEY: 'synthetic', FREEGG_MODELS: 'configured-alias', AI_GATEWAY_ENABLED: 'freegg' }),
      fetcher: vi.fn(async () => json({ data: [{ id: 'different-model' }] })) })
    const diagnostics: import('../src/lib/ai/gateways').GatewayDiagnostic[] = []
    expect(await router.candidates({ onDiagnostic: item => diagnostics.push(item) })).toEqual([])
    expect(diagnostics).toEqual([{ provider: 'freegg', model: 'configured-alias', state: 'model_not_listed' }])
  })
  it('uses only declared free models and respects an agent model preference', async () => {
    const fetcher: typeof fetch = vi.fn(async () => json({}, 404))
    const router = createGatewayRouter({ environment: () => ({ ...environment(), AI_AGENT_MARKET_MODELS: 'other' }), fetcher })
    expect((await router.candidates({ freeOnly: true })).map(model => model.modelId)).toEqual(['flash', 'free'])
    expect((await router.candidates({ role: 'market' }))[0].modelId).toBe('other')
  })
  it('keeps unknown catalogs as candidates, but stops using rejected credentials', async () => {
    const fetcher: typeof fetch = vi.fn(async input => {
      if (String(input).includes('kios')) throw new Error('Network unavailable')
      return json({}, 401)
    })
    const router = createGatewayRouter({ environment, fetcher })
    expect((await router.candidates()).map(model => model.modelId)).toEqual(['missing', 'flash', 'other'])
  })
  it.each([401, 402, 403])('recovers after model cooldown and applies HTTP %s to the whole host', async (statusCode) => {
    let clock = 0
    const fetcher: typeof fetch = vi.fn(async () => json({}, 404))
    const router = createGatewayRouter({ environment, fetcher, now: () => clock })
    const candidates = await router.candidates()
    const first = candidates[0]
    router.failed(first, new Error('temporary'))
    expect(router.canTry(first)).toBe(false)
    expect((await router.candidates()).some(model => model.modelId === first.modelId)).toBe(false)
    clock = 30_001
    expect(router.canTry(first)).toBe(true)
    router.failed(first, { statusCode })
    expect((await router.candidates()).every(model => model.id !== first.id)).toBe(true)
  })
  it('does not call gateways excluded by the operational allowlist', async () => {
    const fetcher: typeof fetch = vi.fn(async () => json({}, 404))
    const router = createGatewayRouter({ environment: () => ({ ...environment(), AI_GATEWAY_ENABLED: 'kios' }), fetcher })
    expect((await router.candidates()).every(model => model.id === 'kios')).toBe(true)
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(fetcher).toHaveBeenCalledWith('https://kiosapi.com/v1/models', expect.anything())
  })
  it('rejects unsafe URLs without sending the configured key', async () => {
    const fetcher: typeof fetch = vi.fn(async () => json({ data: [] }))
    for (const baseURL of ['http://kiosapi.com/v1', 'https://name:password@kiosapi.com/v1', 'https://kiosapi.com/v1?token=private']) {
      const router = createGatewayRouter({ environment: () => ({ KIOS_API_KEY: 'private', KIOS_BASE_URL: baseURL, KIOS_MODELS: 'flash' }), fetcher })
      expect(await router.candidates()).toEqual([])
    }
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('deduplicates simultaneous catalog requests and isolates refreshed credentials', async () => {
    let key = 'first'
    const fetcher: typeof fetch = vi.fn(async () => json({ data: [{ id: 'flash' }] }))
    const router = createGatewayRouter({ environment: () => ({ KIOS_API_KEY: key, KIOS_BASE_URL: 'https://kiosapi.com/v1', KIOS_MODELS: 'flash' }), fetcher })
    await Promise.all([router.candidates(), router.candidates()])
    expect(fetcher).toHaveBeenCalledTimes(1)
    key = 'second'
    await router.candidates()
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
})

describe('gateway structured output', () => {
  const schema = z.object({ score: z.number().int().min(0).max(10) })
  it('accepts validated JSON or a complete JSON code fence', () => {
    expect(parseGatewayOutput('{"score":7}', schema)).toEqual({ score: 7 })
    const fence = String.fromCharCode(96).repeat(3)
    expect(parseGatewayOutput(fence + 'json\n{"score":7}\n' + fence, schema)).toEqual({ score: 7 })
  })
  it('rejects surrounding instructions, invalid JSON, and out-of-schema results', () => {
    for (const text of ['Use this: {"score":7}', '{"score":100}', '{"score":"7"}', '{broken}']) {
      expect(() => parseGatewayOutput(text, schema)).toThrow()
    }
  })
})
