import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ read: vi.fn(), cached: vi.fn(), cache: vi.fn(), stored: vi.fn(), indicator: vi.fn(), remember: vi.fn() }))
vi.mock('@/lib/ai/public-web', () => ({ readPublicWeb: mocks.read }))
vi.mock('@/lib/ai/source-cache', () => ({ cachedSource: mocks.cached, cacheSource: mocks.cache }))
vi.mock('@/lib/ai/research-store', () => ({ readStoredPublicSource: mocks.stored, readStoredMarketIndicator: mocks.indicator, rememberPublicSources: mocks.remember }))
import { readMarketIndicator } from '@/lib/ai/open-data'

const row = (date: string, value: number | null) => ({ date, value, country: { id: 'IN', value: 'India' }, indicator: { id: 'SP.POP.TOTL' } })
const response = (rows = [row('2026', null), row('2025', 100), row('2024', 95)], overrides = {}, indicator = 'SP.POP.TOTL') => ({
  text: JSON.stringify([{ page: 1, pages: 1, per_page: 12, total: rows.length, sourceid: '2', lastupdated: '2026-10-30', ...overrides }, rows]),
  url: 'https://api.worldbank.org/v2/country/IN/indicator/' + indicator + '?format=json&date=2018:2026&per_page=12',
})
const cachedObservation = { title: 'India population', url: response().url, country: 'IN', indicator: 'SP.POP.TOTL',
  observationYear: 2025, value: 100, unit: 'people', fetchedAt: '2026-10-30T16:00:00Z', dataPeriod: '2025', content: '100 people',
  source: 'api.worldbank.org', retrievalKind: 'open-data' }
beforeEach(() => { vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-31T12:00:00Z')); mocks.cached.mockResolvedValue(null); mocks.cache.mockResolvedValue(undefined); mocks.stored.mockResolvedValue(null); mocks.indicator.mockResolvedValue(null); mocks.remember.mockResolvedValue(1) })
afterEach(() => vi.useRealTimers())

describe('official open data tool', () => {
  it('skips missing values and preserves the latest published observation year and units', async () => {
    mocks.read.mockResolvedValue(response())
    const result = await readMarketIndicator('IN', 'population')
    expect(result.cached).toBe(false)
    expect(result.source.dataPeriod).toBe('2025')
    expect(result.source.metadataUpdatedAt).toBe('2026-10-30')
    expect(result.source.content).toContain('100 people')
    expect(result.source.content).toContain('Previous published observation: 95 (2024)')
    expect(result.source.content).toContain('not startup-specific TAM')
    expect(mocks.read).toHaveBeenCalledWith(expect.stringContaining('api.worldbank.org/v2/country/IN/indicator/SP.POP.TOTL'), expect.objectContaining({ maxBytes: 100_000 }))
    expect(mocks.cache).toHaveBeenCalledWith(result.source, 86_400)
    expect(mocks.remember).toHaveBeenCalledWith([result.source])
  })
  it('reuses a cached original observation without rewriting its retrieval date', async () => {
    const source = cachedObservation
    mocks.cached.mockResolvedValue(source)
    expect(await readMarketIndicator('IN', 'population')).toEqual({ source, cached: true })
    expect(mocks.read).not.toHaveBeenCalled()
  })
  it('rejects injected country paths, wrong-country data and missing observations', async () => {
    await expect(readMarketIndicator('IN/../../private', 'population')).rejects.toThrow('two-letter')
    expect(mocks.read).not.toHaveBeenCalled()
    mocks.read.mockResolvedValue(response([{ ...row('2025', 100), country: { id: 'US', value: 'United States' } }]))
    await expect(readMarketIndicator('IN', 'population')).rejects.toThrow('mismatched')
    mocks.read.mockResolvedValue(response([row('2026', null)]))
    await expect(readMarketIndicator('IN', 'population')).rejects.toThrow('No published observation')
  })
  it('uses a bundled or stored exact indicator without another web request', async () => {
    const source = cachedObservation
    mocks.indicator.mockResolvedValue(source)
    expect(await readMarketIndicator('IN', 'population')).toEqual({ source, cached: true })
    expect(mocks.indicator).toHaveBeenCalledWith('IN', 'SP.POP.TOTL')
    expect(mocks.read).not.toHaveBeenCalled()
  })
  it('retains a valid negative growth rate', async () => {
    mocks.read.mockResolvedValue(response([{ ...row('2025', -0.8), indicator: { id: 'NY.GDP.MKTP.KD.ZG' } }], {}, 'NY.GDP.MKTP.KD.ZG'))
    expect((await readMarketIndicator('IN', 'gdpGrowth')).source.value).toBe(-0.8)
  })
  it('does not label a redirect to another institution as World Bank evidence', async () => {
    mocks.read.mockResolvedValue({ ...response(), url: 'https://untrusted.example/data' })
    await expect(readMarketIndicator('IN', 'population')).rejects.toThrow('outside the official source')
    expect(mocks.remember).not.toHaveBeenCalled()
  })
  it.each([
    ['an incomplete page', response(undefined, { pages: 2, total: 20 })],
    ['a different dataset', response(undefined, { sourceid: '99' })],
    ['a future revision', response(undefined, { lastupdated: '2026-11-01' })],
    ['an invalid calendar date', response(undefined, { lastupdated: '2026-02-30' })],
    ['duplicate annual rows', response([row('2025', 100), row('2025', 110)])],
    ['an absent row instead of an explicit missing value', response([row('2025', 100), row('2023', 95)])],
    ['a fractional population', response([row('2025', 100.5)])],
  ])('does not cache %s as official numerical evidence', async (_name, page) => {
    mocks.read.mockResolvedValue(page)
    await expect(readMarketIndicator('IN', 'population')).rejects.toThrow()
    expect(mocks.cache).not.toHaveBeenCalled(); expect(mocks.remember).not.toHaveBeenCalled()
  })
  it('falls through mismatched cached units and country to the valid stored observation', async () => {
    mocks.cached.mockResolvedValue({ ...cachedObservation, unit: 'current USD' })
    mocks.stored.mockResolvedValue({ ...cachedObservation, country: 'US' })
    mocks.indicator.mockResolvedValue(cachedObservation)
    expect(await readMarketIndicator('IN', 'population')).toEqual({ source: cachedObservation, cached: true })
    expect(mocks.read).not.toHaveBeenCalled()
  })
  it('refreshes stale cached numbers and rejects rates over the physical population bound', async () => {
    mocks.cached.mockResolvedValue({ ...cachedObservation, fetchedAt: '2026-01-01T00:00:00Z' })
    mocks.read.mockResolvedValue(response())
    expect((await readMarketIndicator('IN', 'population')).cached).toBe(false)
    mocks.cached.mockResolvedValue(null)
    mocks.read.mockResolvedValue(response([{ ...row('2025', 101), indicator: { id: 'IT.NET.USER.ZS' } }], {}, 'IT.NET.USER.ZS'))
    await expect(readMarketIndicator('IN', 'internet')).rejects.toThrow('domain')
  })
})
