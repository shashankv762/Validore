import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import seed from '@/data/market/seed-sources.json'
import type { SearchResult } from '@/lib/ai/search'

const mocks = vi.hoisted(() => ({ read: vi.fn(), cached: vi.fn(), keyed: vi.fn(), recall: vi.fn() }))
vi.mock('@/db', () => ({ db: {} }))
vi.mock('@/lib/ai/public-web', async original => ({ ...await original<typeof import('@/lib/ai/public-web')>(), readPublicWeb: mocks.read }))
vi.mock('@/lib/ai/keyed-search', () => ({ keyedSearch: mocks.keyed }))
vi.mock('@/lib/ai/search-budget', () => ({
  searchDigest: (query: string) => query.toLowerCase(), cachedSearch: mocks.cached,
  cacheSearch: vi.fn(), acquireSearchLock: async () => null,
}))
vi.mock('@/lib/ai/research-store', () => ({ retrievePublicResearch: mocks.recall }))
vi.mock('@/lib/ai/market-memory', () => ({ retrieveMarketMemory: () => [] }))
import { webSearch } from '@/lib/ai/search'
import { localEvidenceManifest, localObservationEvidence, parseLocalObservationQuery, qualifiesLocalObservation } from '@/lib/ai/local-evidence'

const now = Math.max(...seed.map(source => Date.parse(source.fetchedAt))) + 1_000
const source = () => structuredClone(seed.find(source => source.country === 'IN' && source.indicator === 'SP.POP.TOTL')!) as SearchResult
const requirement = { country: 'IN', indicator: 'SP.POP.TOTL', period: 'latest-available' as const }
beforeEach(() => {
  vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime(now)
  vi.stubEnv('RESEARCH_STORE_ENABLED', 'true'); vi.stubEnv('SEARXNG_BASE_URL', '')
  vi.stubEnv('TAVILY_API_KEY', ''); vi.stubEnv('SERPER_API_KEY', ''); vi.stubEnv('SERPAPI_API_KEY', '')
  mocks.cached.mockResolvedValue(null); mocks.recall.mockResolvedValue([])
  mocks.read.mockRejectedValue(new Error('Synthetic network unavailable'))
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs() })

describe('local-first exact annual evidence', () => {
  it('answers a covered observation before query cache, network or keyed search', async () => {
    const result = await webSearch('India population latest available annual observation')
    expect(result.results).toHaveLength(1)
    expect(result.results[0]).toMatchObject({ country: 'IN', indicator: 'SP.POP.TOTL', observationYear: source().observationYear })
    expect(result.providers).toEqual(['Local annual observations'])
    expect(mocks.read).not.toHaveBeenCalled(); expect(mocks.cached).not.toHaveBeenCalled(); expect(mocks.keyed).not.toHaveBeenCalled()
  })
  it('returns complete metadata and original retrieval times without mutating the corpus', () => {
    const first = localObservationEvidence(requirement, now)[0]
    first.title = 'Changed by caller'
    const next = localObservationEvidence(requirement, now)[0]
    expect(next.title).not.toBe('Changed by caller')
    expect(next.fetchedAt).toBe(source().fetchedAt)
    expect(next.unit).toBe('people'); expect(next.dataPeriod).toBe(String(next.observationYear))
    expect(next.licenseUrl).toBe('https://data.worldbank.org/summary-terms-of-use')
  })
  it('distinguishes more specific indicators from generic population and GDP', () => {
    expect(parseLocalObservationQuery('India urban population share 2025')?.indicator).toBe('SP.URB.TOTL.IN.ZS')
    expect(parseLocalObservationQuery('US GDP per capita 2025')?.indicator).toBe('NY.GDP.PCAP.CD')
    expect(parseLocalObservationQuery('Brazil real GDP growth latest annual data')?.indicator).toBe('NY.GDP.MKTP.KD.ZG')
    expect(parseLocalObservationQuery('World Bank population India 2025')?.country).toBe('IN')
  })
  it('does not treat macro context as startup demand, prices, forecast or a multi-topic answer', () => {
    for (const query of ['India population and customer demand', 'India startup TAM population', 'India GDP pricing competitors',
      'India GDP forecast 2027', 'India and USA population', 'India population and inflation',
      'India population 2024 2025', 'India urban population', 'https://private.example/?token=secret', 'India population '.repeat(40)]) {
      expect(parseLocalObservationQuery(query), query).toBeNull()
    }
  })
  it('uses the existing adapters for a real gap rather than claiming local coverage', async () => {
    const result = await webSearch('India shop inventory software pricing')
    expect(result.degraded).toBe(true); expect(result.results).toEqual([])
    expect(mocks.read).toHaveBeenCalled(); expect(mocks.keyed).not.toHaveBeenCalled()
  })
  it('honors disabled local evidence and does not extend stale timestamps', async () => {
    vi.stubEnv('RESEARCH_STORE_ENABLED', 'false')
    expect(localObservationEvidence(requirement, now)).toEqual([])
    await webSearch('India population latest available annual observation')
    expect(mocks.read).toHaveBeenCalled()
    vi.stubEnv('RESEARCH_STORE_ENABLED', 'true')
    expect(localObservationEvidence(requirement, now + 31 * 86_400_000)).toEqual([])
  })
  it('rejects wrong unit, geography, source, type, period, future date and unsupported values', () => {
    const original = source()
    const bad: Partial<SearchResult>[] = [{ country: 'US' }, { unit: 'USD' }, { indicator: 'NY.GDP.MKTP.CD' },
      { retrievalKind: 'memory' }, { url: 'https://example.com/data' }, { dataPeriod: '2020' },
      { fetchedAt: new Date(now + 1000).toISOString() }, { expiresAt: new Date(now - 1).toISOString() },
      { value: NaN }, { value: -1 }, { value: 1.5 }, { licenseUrl: 'https://example.com/license' }]
    for (const patch of bad) expect(qualifiesLocalObservation({ ...original, ...patch }, requirement, now)).toBe(false)
    expect(qualifiesLocalObservation(original, { ...requirement, period: original.observationYear! - 1 }, now)).toBe(false)
  })
  it('produces stable public-only corpus metadata and honors cancellation', async () => {
    expect(localEvidenceManifest().recordCount).toBe(48)
    expect(localEvidenceManifest().coverage).toHaveLength(48)
    expect(localEvidenceManifest().contentVersion).toMatch(/^[a-f0-9]{64}$/)
    expect(JSON.stringify(localEvidenceManifest())).not.toContain('apiKey')
    const signal = AbortSignal.abort()
    await expect(webSearch('India population', 5, { signal })).rejects.toThrow()
    expect(mocks.read).not.toHaveBeenCalled()
  })
})
