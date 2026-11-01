import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ eval: vi.fn(), set: vi.fn(), get: vi.fn() }))
vi.mock('@upstash/redis', () => ({ Redis: { fromEnv: () => mocks } }))
beforeEach(() => {
  vi.resetAllMocks()
  vi.resetModules()
  for (const key of ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'SEARCH_KEYED_MAX_PER_REPORT', 'SEARCH_KEYED_DAILY_LIMIT', 'SEARCH_KEYED_ENABLED']) vi.stubEnv(key, '')
  vi.stubEnv('NODE_ENV', 'test')
})
afterEach(() => vi.unstubAllEnvs())

describe('keyed search budgets', () => {
  it('caps combined calls for all specialists on the same report', async () => {
    const { reserveKeyedSearch } = await import('@/lib/ai/search-budget')
    expect(await Promise.all(Array.from({ length: 8 }, () => reserveKeyedSearch('report-a')))).toEqual([true, true, false, false, false, false, false, false])
    expect(await reserveKeyedSearch('report-b')).toBe(true)
  })
  it('enforces the global daily budget across reports', async () => {
    vi.stubEnv('SEARCH_KEYED_DAILY_LIMIT', '1')
    const { reserveKeyedSearch } = await import('@/lib/ai/search-budget')
    expect(await reserveKeyedSearch('report-a')).toBe(true)
    expect(await reserveKeyedSearch('report-b')).toBe(false)
  })
  it('does not spend a production key without a working distributed budget', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const { reserveKeyedSearch } = await import('@/lib/ai/search-budget')
    expect(await reserveKeyedSearch('report-a')).toBe(false)
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.example')
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'test')
    mocks.eval.mockRejectedValue(new Error('Offline'))
    expect(await reserveKeyedSearch('report-a')).toBe(false)
  })
  it('releases only its own lock, preserving a replacement after expiry', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.example')
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'test')
    mocks.set.mockResolvedValue('OK')
    const { acquireSearchLock } = await import('@/lib/ai/search-budget')
    const release = await acquireSearchLock('query-digest')
    const [key, token, options] = mocks.set.mock.calls[0]
    expect(token).not.toBe('1')
    expect(options).toEqual({ nx: true, ex: 40 })
    await release!()
    expect(mocks.eval).toHaveBeenCalledWith(expect.stringContaining("redis.call('GET',KEYS[1]) == ARGV[1]"), [key], [token])
  })
})
