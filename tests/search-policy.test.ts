import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SearchResponse } from '@/lib/ai/search'

const mocks = vi.hoisted(() => ({ read: vi.fn(), keyed: vi.fn(), cache: new Map<string, unknown>(), release: vi.fn() }))
vi.mock('@/lib/ai/public-web', async importOriginal => ({ ...await importOriginal<typeof import('@/lib/ai/public-web')>(), readPublicWeb: mocks.read }))
vi.mock('@/lib/ai/keyed-search', () => ({ keyedSearch: mocks.keyed }))
vi.mock('@/lib/ai/search-budget', () => ({
  searchDigest: (query: string) => query.toLowerCase(), cachedSearch: async (key: string) => mocks.cache.get(key) ?? null,
  cacheSearch: async (key: string, value: unknown) => { mocks.cache.set(key, value) }, acquireSearchLock: async () => mocks.release,
}))
import { webSearch } from '@/lib/ai/search'
const source = (index: number) => ({ title: 'Research ' + index, url: 'https://example.org/' + index, content: 'Public findings', source: 'example.org', fetchedAt: '2026-10-31T00:00:00Z' })
beforeEach(() => {
  vi.clearAllMocks()
  mocks.cache.clear()
  vi.stubEnv('TAVILY_API_KEY', 'test-only')
  vi.stubEnv('SEARXNG_BASE_URL', '')
})
afterEach(() => vi.unstubAllEnvs())

describe('efficient source search', () => {
  it('does not use keyed APIs for background research, even with no public results', async () => {
    mocks.read.mockRejectedValue(new Error('Unavailable'))
    const result = await webSearch('test background research')
    expect(result.results).toEqual([])
    expect(mocks.keyed).not.toHaveBeenCalled()
  })
  it('reuses adequate cached public sources without spending a search credit', async () => {
    mocks.cache.set('cached topic', { results: [source(1), source(2)], degraded: false, evidenceStrength: 'WEAK' } satisfies SearchResponse)
    expect((await webSearch('Cached topic', 5, { allowKeyed: true, budgetId: 'report-a' })).results).toHaveLength(2)
    expect(mocks.read).not.toHaveBeenCalled()
    expect(mocks.keyed).not.toHaveBeenCalled()
  })
  it('uses a single keyed fallback for concurrent agent requests when only limited indexes are available', async () => {
    mocks.cache.set('limited topic', { results: [source(1), source(2)], degraded: true, evidenceStrength: 'WEAK' } satisfies SearchResponse)
    mocks.keyed.mockResolvedValue({ results: [source(3), source(4)], provider: 'tavily' })
    const [short, full] = await Promise.all([
      webSearch('Limited topic', 1, { allowKeyed: true, budgetId: 'report-a' }),
      webSearch('Limited topic', 5, { allowKeyed: true, budgetId: 'report-a' }),
    ])
    expect(mocks.keyed).toHaveBeenCalledTimes(1)
    expect(short.results).toHaveLength(1)
    expect(full.results).toHaveLength(4)
    expect(mocks.release).toHaveBeenCalledTimes(1)
  })
  it('does not repeatedly spend on the same empty keyed result', async () => {
    mocks.cache.set('empty topic', { results: [], degraded: true, evidenceStrength: 'WEAK' } satisfies SearchResponse)
    mocks.keyed.mockResolvedValue({ results: [] })
    await webSearch('Empty topic', 5, { allowKeyed: true, budgetId: 'report-a' })
    await webSearch('Empty topic', 5, { allowKeyed: true, budgetId: 'report-b' })
    expect(mocks.keyed).toHaveBeenCalledTimes(1)
  })
})
