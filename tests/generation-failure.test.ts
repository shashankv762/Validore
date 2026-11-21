import { describe, expect, it } from 'vitest'
import { GenerationUnavailableError, isRetryableGenerationFailure, retryAfterDeadline, temporaryFailureRetryAt } from '@/lib/ai/generation-failure'
import { createGatewayRouter } from '@/lib/ai/gateways'

describe('durable provider failure classification', () => {
  it.each([408, 429, 500, 503, 529])('retains retryable HTTP %i without retaining a provider body', statusCode => {
    expect(isRetryableGenerationFailure(Object.assign(new Error('private provider response'), { statusCode }))).toBe(true)
  })
  it.each([400, 401, 402, 403, 404, 422])('keeps terminal HTTP %i degraded rather than retrying', statusCode => {
    expect(isRetryableGenerationFailure(Object.assign(new Error('private provider response'), { statusCode }))).toBe(false)
  })
  it('distinguishes connection failures from output/schema errors and preserves safe aggregate metadata', () => {
    expect(isRetryableGenerationFailure(new Error('provider', { cause: Object.assign(new Error('private'), { code: 'ECONNRESET' }) }))).toBe(true)
    expect(isRetryableGenerationFailure(Object.assign(new SyntaxError('private output'), { cause: { code: 'ECONNRESET' } }))).toBe(false)
    expect(isRetryableGenerationFailure(new Error('Unclassified failure'))).toBe(false)
    const aggregate = new GenerationUnavailableError('No provider completed', true)
    expect(isRetryableGenerationFailure(aggregate)).toBe(true)
    expect(JSON.stringify(aggregate)).not.toContain('private')
  })
  it('keeps retries recoverable during an applicable cooldown while billing and unrelated BYOK failures stay isolated', async () => {
    let now = 1000
    const router = createGatewayRouter({ now: () => now, environment: () => ({ AI_GATEWAY_ENABLED: 'freegg', FREEGG_API_KEY: 'synthetic-key', FREEGG_MODELS: 'model' }),
      fetcher: async () => new Response('{}', { status: 404 }) })
    const candidate = (await router.candidates())[0]
    router.failed(candidate, Object.assign(new Error('capacity'), { statusCode: 429 }))
    expect(router.canTry(candidate)).toBe(false)
    expect(router.retryableCooldownUntil()).toBe(now + 120000)
    expect(router.retryableCooldownUntil({}, [{ fingerprint: 'other-key-hash', modelId: 'model' }])).toBeUndefined()
    now += 120001
    expect(router.retryableCooldownUntil()).toBeUndefined()
    router.failed(candidate, Object.assign(new Error('billing'), { statusCode: 402 }))
    expect(router.retryableCooldownUntil()).toBeUndefined()
    router.failed({ ...candidate, id: 'custom_openrouter', fingerprint: 'custom-key-hash' }, Object.assign(new Error('capacity'), { statusCode: 429 }))
    expect(router.retryableCooldownUntil()).toBeUndefined()
    expect(router.retryableCooldownUntil({}, [{ fingerprint: 'custom-key-hash', modelId: 'model' }])).toBe(now + 120000)
  })
  it('honors delay/date headers on FreeGG and excludes disabled or ineligible model cooldowns', async () => {
    let now = Date.UTC(2026, 10, 16)
    let enabled = 'freegg'
    const router = createGatewayRouter({ now: () => now, environment: () => ({ AI_GATEWAY_ENABLED: enabled, FREEGG_API_KEY: 'synthetic-key',
      FREEGG_MODELS: 'paid-model,free-model', FREEGG_FREE_MODELS: 'free-model', UTIM_API_KEY: 'synthetic-utim', UTIM_MODELS: 'model' }),
      fetcher: async () => new Response('{}', { status: 404 }) })
    const paid = (await router.candidates())[0]
    router.failed(paid, { statusCode: 429, responseHeaders: { 'Retry-After': '900' } })
    now += 120001
    expect(router.canTry(paid)).toBe(false)
    expect(router.retryableCooldownUntil({ freeOnly: true })).toBeUndefined()
    expect(router.retryableCooldownUntil()).toBe(Date.UTC(2026, 10, 16) + 900000)
    enabled = 'utim'
    expect(router.retryableCooldownUntil()).toBeUndefined()
    enabled = 'freegg'
    now = Date.UTC(2026, 10, 16) + 900001
    expect(router.canTry(paid)).toBe(true)
    const expires = now + 300000
    router.failed(paid, { statusCode: 503, responseHeaders: { 'retry-after': new Date(expires).toUTCString() } })
    expect(router.retryableCooldownUntil()).toBe(Math.floor(expires / 1000) * 1000)
  })
  it('keeps a temporary catalog capacity failure recoverable without attempting a model', async () => {
    const now = Date.UTC(2026, 10, 16)
    const router = createGatewayRouter({ now: () => now, environment: () => ({ AI_GATEWAY_ENABLED: 'freegg', FREEGG_API_KEY: 'synthetic-key', FREEGG_MODELS: 'model' }),
      fetcher: async () => new Response('{}', { status: 429, headers: { 'Retry-After': '180' } }) })
    expect(await router.candidates()).toEqual([])
    expect(router.retryableCooldownUntil()).toBe(now + 180000)
  })
  it('bounds safe retry metadata and never interprets a terminal billing header as retry permission', () => {
    const now = Date.UTC(2026, 10, 16)
    expect(retryAfterDeadline({ 'Retry-After': '900' }, now)).toBe(now + 900000)
    expect(retryAfterDeadline({ 'retry-after': new Date(now + 180000).toUTCString() }, now)).toBe(now + 180000)
    expect(retryAfterDeadline({ 'retry-after': '999999999999999' }, now)).toBe(now + 86400000)
    for (const value of ['-1', '1.5', '1e3', 'Infinity', '', '900\r\nprivate-header', 'x'.repeat(129)]) expect(retryAfterDeadline({ 'retry-after': value }, now)).toBeUndefined()
    expect(temporaryFailureRetryAt({ statusCode: 402, responseHeaders: { 'retry-after': '900' } }, now)).toBeUndefined()
  })
})
