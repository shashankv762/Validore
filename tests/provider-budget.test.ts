import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ eval: vi.fn() }))
vi.mock('@upstash/redis', () => ({ Redis: { fromEnv: () => mocks } }))
const candidate = { id: 'pixrouter', fingerprint: 'hashed-account-key' }
beforeEach(() => {
  vi.resetAllMocks()
  vi.resetModules()
  vi.stubEnv('NODE_ENV', 'test')
  for (const key of ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'PIXROUTER_REQUESTS_PER_HOUR']) vi.stubEnv(key, '')
})
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers() })

describe('shared provider request budgets', () => {
  it('caps concurrent requests across roles and model aliases using the same account', async () => {
    const { reserveGatewayRequest } = await import('@/lib/ai/provider-budget')
    const results = await Promise.all(Array.from({ length: 60 }, () => reserveGatewayRequest(candidate)))
    expect(results.filter(Boolean)).toHaveLength(55)
    expect(await reserveGatewayRequest({ ...candidate, fingerprint: 'different-account' })).toBe(true)
  })
  it('uses a rolling hour, retaining newer calls when older calls expire', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-31T10:00:00Z'))
    vi.stubEnv('PIXROUTER_REQUESTS_PER_HOUR', '2')
    const { reserveGatewayRequest } = await import('@/lib/ai/provider-budget')
    expect(await reserveGatewayRequest(candidate)).toBe(true)
    vi.setSystemTime(new Date('2026-10-31T10:30:00Z'))
    expect(await reserveGatewayRequest(candidate)).toBe(true)
    expect(await reserveGatewayRequest(candidate)).toBe(false)
    vi.setSystemTime(new Date('2026-10-31T11:00:01Z'))
    expect(await reserveGatewayRequest(candidate)).toBe(true)
    expect(await reserveGatewayRequest(candidate)).toBe(false)
  })
  it('requires a working distributed reservation in production', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const { reserveGatewayRequest } = await import('@/lib/ai/provider-budget')
    expect(await reserveGatewayRequest(candidate)).toBe(false)
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.example')
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'test-token')
    mocks.eval.mockRejectedValueOnce(new Error('Offline')).mockResolvedValueOnce(0).mockResolvedValueOnce(1)
    expect(await reserveGatewayRequest(candidate)).toBe(false)
    expect(await reserveGatewayRequest(candidate)).toBe(false)
    expect(await reserveGatewayRequest(candidate)).toBe(true)
  })
  it('supports disabling a provider without sending requests', async () => {
    vi.stubEnv('PIXROUTER_REQUESTS_PER_HOUR', '0')
    const { reserveGatewayRequest } = await import('@/lib/ai/provider-budget')
    expect(await reserveGatewayRequest(candidate)).toBe(false)
    expect(mocks.eval).not.toHaveBeenCalled()
  })
})
