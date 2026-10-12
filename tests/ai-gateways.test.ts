import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { createGatewayRouter, parseGatewayOutput } from '../src/lib/ai/gateways'

const environment = () => ({
  KIOS_API_KEY: 'kios-test-key', KIOS_BASE_URL: 'https://kios.example/v1', KIOS_MODELS: 'missing,flash,other', KIOS_FREE_MODELS: 'flash',
  SEEKAI_API_KEY: 'seek-test-key', SEEKAI_BASE_URL: 'https://seek.example/v1', SEEKAI_MODELS: 'reasoner,free', SEEKAI_FREE_MODELS: 'free',
  AI_GATEWAY_ORDER: 'kios,seekai',
})
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

describe('configured gateway routing', () => {
  it('filters advertised models, interleaves hosts, and caches catalog requests', async () => {
    const fetcher: typeof fetch = vi.fn(async input => String(input).includes('kios')
      ? json({ data: [{ id: 'flash' }, { id: 'other' }] })
      : json({ data: [{ id: 'reasoner' }, { id: 'free' }] }))
    const router = createGatewayRouter({ environment, fetcher })
    const candidates = await router.candidates()
    expect(candidates.map(model => model.modelId)).toEqual(['flash', 'reasoner', 'other', 'free'])
    await router.candidates()
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(fetcher).toHaveBeenCalledWith('https://kios.example/v1/models', expect.objectContaining({
      headers: { Authorization: 'Bearer kios-test-key' }, redirect: 'error', cache: 'no-store',
    }))
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
  it('recovers after model cooldown and applies credential failure to the whole host', async () => {
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
    router.failed(first, { statusCode: 401 })
    expect((await router.candidates()).every(model => model.id !== first.id)).toBe(true)
  })
  it('rejects unsafe URLs without sending the configured key', async () => {
    const fetcher: typeof fetch = vi.fn(async () => json({ data: [] }))
    for (const baseURL of ['http://kios.example/v1', 'https://name:password@kios.example/v1', 'https://kios.example/v1?token=private']) {
      const router = createGatewayRouter({ environment: () => ({ KIOS_API_KEY: 'private', KIOS_BASE_URL: baseURL, KIOS_MODELS: 'flash' }), fetcher })
      expect(await router.candidates()).toEqual([])
    }
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('deduplicates simultaneous catalog requests and isolates refreshed credentials', async () => {
    let key = 'first'
    const fetcher: typeof fetch = vi.fn(async () => json({ data: [{ id: 'flash' }] }))
    const router = createGatewayRouter({ environment: () => ({ KIOS_API_KEY: key, KIOS_BASE_URL: 'https://kios.example/v1', KIOS_MODELS: 'flash' }), fetcher })
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
