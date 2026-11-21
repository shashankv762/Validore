import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import bundle from '@/data/market/trend-series.json'

const mocks = vi.hoisted(() => ({ read: vi.fn(), cached: vi.fn(), cache: vi.fn() }))
vi.mock('@/lib/ai/public-web', async importOriginal => ({ ...await importOriginal<typeof import('@/lib/ai/public-web')>(), readPublicWeb: mocks.read }))
vi.mock('@/lib/ai/source-cache', () => ({ cachedSource: mocks.cached, cacheSource: mocks.cache }))
import { readMarketTrend, summarizeMarketTrend, type MarketTrendSeries } from '@/lib/ai/market-trends'

const base: MarketTrendSeries = { country: 'IN', countryName: 'India', indicator: 'SP.POP.TOTL', title: 'Population', unit: 'people',
  observations: [{ year: 2024, value: 100 }, { year: 2025, value: 120 }], fetchedAt: '2026-11-14T00:00:00Z', expiresAt: '2026-12-14T00:00:00Z',
  metadataUpdatedAt: '2026-11-11', sourceUrl: 'https://api.worldbank.org/v2/country/IN/indicator/SP.POP.TOTL?format=json&per_page=8', limitation: 'Country scale only.' }
const response = (overrides = {}) => ({ url: 'https://api.worldbank.org/v2/country/IN/indicator/SP.POP.TOTL?format=json&per_page=8',
  text: JSON.stringify([{ page: 1, pages: 9, per_page: 8, total: 66, sourceid: '2', lastupdated: '2026-12-30' },
    Array.from({ length: 8 }, (_, index) => ({ date: String(2026 - index), value: 100 + index, country: { id: 'IN', value: 'India' }, countryiso3code: 'IND', indicator: { id: 'SP.POP.TOTL' } }))]), ...overrides })
beforeEach(() => { vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date('2027-01-01T12:00:00Z')); mocks.cached.mockResolvedValue(null); mocks.cache.mockResolvedValue(undefined) })
afterEach(() => vi.useRealTimers())

describe('dated annual market trends', () => {
  it('distinguishes percentage changes in amounts from percentage-point changes in rates', () => {
    const amount = summarizeMarketTrend(base, 'population')
    expect(amount.relativeChangePercent).toBeCloseTo(20); expect(amount.absoluteChange).toBe(20); expect(amount.percentagePointChange).toBeNull()
    const inflation = summarizeMarketTrend({ ...base, unit: 'annual percent change', observations: [{ year: 2024, value: -1.5 }, { year: 2025, value: 1.2 }] }, 'inflation')
    expect(inflation.percentagePointChange).toBeCloseTo(2.7); expect(inflation.relativeChangePercent).toBeNull()
  })
  it('does not interpolate missing years or divide by a zero base value', () => {
    expect(summarizeMarketTrend({ ...base, observations: [{ year: 2023, value: 100 }, { year: 2025, value: 120 }] }, 'population').previous).toBeNull()
    expect(summarizeMarketTrend({ ...base, observations: [{ year: 2024, value: 0 }, { year: 2025, value: 10 }] }, 'population').relativeChangePercent).toBeNull()
  })
  it('reuses all 48 refreshed series including official fallback archives without another network request', async () => {
    vi.setSystemTime(new Date(Math.max(...bundle.map(item => Date.parse(item.fetchedAt))) + 60_000))
    const names = { 'SP.POP.TOTL': 'population', 'NY.GDP.MKTP.CD': 'gdp', 'NY.GDP.PCAP.CD': 'gdpPerCapita', 'IT.NET.USER.ZS': 'internet',
      'FP.CPI.TOTL.ZG': 'inflation', 'NY.GDP.MKTP.KD.ZG': 'gdpGrowth', 'SP.URB.TOTL.IN.ZS': 'urbanShare', 'SL.UEM.TOTL.ZS': 'unemployment' } as const
    const urls = new Set<string>()
    for (const series of bundle) {
      const result = await readMarketTrend(series.country, names[series.indicator as keyof typeof names])
      expect(result.cached).toBe(true); expect(result.source.fetchedAt).toBe(series.fetchedAt)
      expect(result.source.retrievalUrl).toBe(series.sourceUrl); expect(result.trend.observations).toEqual(series.observations)
      urls.add(result.source.url)
    }
    expect(urls.size).toBe(48); expect(mocks.read).not.toHaveBeenCalled()
  })
  it('fetches and validates an expired series with actual units, reference years and metadata', async () => {
    mocks.read.mockResolvedValue(response())
    const result = await readMarketTrend('IN', 'population')
    expect(result.cached).toBe(false); expect(result.trend.latest).toEqual({ year: 2026, value: 100 })
    expect(result.source).toMatchObject({ country: 'IN', dataPeriod: '2026', metadataUpdatedAt: '2026-12-30', unit: 'people' })
    expect(JSON.parse(result.source.content).instruction).toContain('observation')
    expect(mocks.cache).toHaveBeenCalledWith(result.source, 86_400)
  })
  it('rejects forged country/indicator data, duplicate years, incomplete pages and redirects', async () => {
    await expect(readMarketTrend('IN/../../private', 'population')).rejects.toThrow('country code')
    mocks.read.mockResolvedValue(response({ url: 'https://attacker.example/data' })); await expect(readMarketTrend('IN', 'population')).rejects.toThrow('outside')
    const data = JSON.parse(response().text); data[1][1].date = data[1][0].date
    mocks.read.mockResolvedValue(response({ text: JSON.stringify(data) })); await expect(readMarketTrend('IN', 'population')).rejects.toThrow('duplicate')
    data[1][1].date = '2025'; data[1][1].country.id = 'US'
    mocks.read.mockResolvedValue(response({ text: JSON.stringify(data) })); await expect(readMarketTrend('IN', 'population')).rejects.toThrow('mismatched')
    mocks.read.mockResolvedValue(response({ text: JSON.stringify([{ pages: 1 }, data[1]]) })); await expect(readMarketTrend('IN', 'population')).rejects.toThrow('metadata')
  })
  it('retains genuine missing observations and excludes ongoing-year projections', async () => {
    const data = JSON.parse(response().text)
    data[1] = data[1].map((row: { date: string; value: number }, index: number) => ({ ...row, date: String(2027 - index) }))
    data[1][2].value = null
    mocks.read.mockResolvedValue(response({ text: JSON.stringify(data) }))
    const result = await readMarketTrend('IN', 'population')
    expect(result.trend.observations).toHaveLength(6); expect(result.trend.latest.year).toBe(2026); expect(result.trend.previous).toBeNull()
  })
  it('rejects a skipped annual row even when a latest-page response still contains eight rows', async () => {
    const data = JSON.parse(response().text)
    data[1][0].date = '2027' // 2026 is now absent rather than explicitly null.
    mocks.read.mockResolvedValue(response({ text: JSON.stringify(data) }))
    await expect(readMarketTrend('IN', 'population')).rejects.toThrow('incomplete annual window')
    expect(mocks.cache).not.toHaveBeenCalled()
  })
  it('refetches a cached trend whose units do not belong to its indicator', async () => {
    const stored = { ...base, unit: 'current USD', fetchedAt: '2026-12-31T12:00:00Z', expiresAt: '2027-01-30T12:00:00Z' }
    mocks.cached.mockResolvedValue({ ...stored, url: base.sourceUrl, content: JSON.stringify({ ...stored, kind: 'annual_market_trend' }) })
    mocks.read.mockResolvedValue(response())
    const result = await readMarketTrend('IN', 'population')
    expect(result.cached).toBe(false); expect(result.source.unit).toBe('people')
    expect(mocks.read).toHaveBeenCalledOnce()
  })
})
