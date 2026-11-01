import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ read: vi.fn(), cached: vi.fn(), cache: vi.fn(), stored: vi.fn(), indicator: vi.fn(), remember: vi.fn() }))
vi.mock('@/lib/ai/public-web', () => ({ readPublicWeb: mocks.read }))
vi.mock('@/lib/ai/source-cache', () => ({ cachedSource: mocks.cached, cacheSource: mocks.cache }))
vi.mock('@/lib/ai/research-store', () => ({ readStoredPublicSource: mocks.stored, readStoredMarketIndicator: mocks.indicator, rememberPublicSources: mocks.remember }))
import { readMarketIndicator } from '@/lib/ai/open-data'

const row = (date: string, value: number | null) => ({ date, value, country: { id: 'IN', value: 'India' }, indicator: { id: 'SP.POP.TOTL' } })
beforeEach(() => { vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-31T12:00:00Z')); mocks.cached.mockResolvedValue(null); mocks.cache.mockResolvedValue(undefined); mocks.stored.mockResolvedValue(null); mocks.indicator.mockResolvedValue(null); mocks.remember.mockResolvedValue(1) })
afterEach(() => vi.useRealTimers())

describe('official open data tool', () => {
  it('skips missing values and preserves the latest published observation year and units', async () => {
    mocks.read.mockResolvedValue({ text: JSON.stringify([{ pages: 1 }, [row('2026', null), row('2025', 100), row('2024', 95)]]), url: 'https://api.worldbank.org' })
    const result = await readMarketIndicator('IN', 'population')
    expect(result.cached).toBe(false)
    expect(result.source.dataPeriod).toBe('2025')
    expect(result.source.content).toContain('100 people')
    expect(result.source.content).toContain('Previous published observation: 95 (2024)')
    expect(result.source.content).toContain('not startup-specific TAM')
    expect(mocks.read).toHaveBeenCalledWith(expect.stringContaining('api.worldbank.org/v2/country/IN/indicator/SP.POP.TOTL'), expect.objectContaining({ maxBytes: 100_000 }))
    expect(mocks.cache).toHaveBeenCalledWith(result.source, 86_400)
    expect(mocks.remember).toHaveBeenCalledWith([result.source])
  })
  it('reuses a cached original observation without rewriting its retrieval date', async () => {
    const source = { title: 'Population', url: 'https://api.worldbank.org/test', fetchedAt: '2026-10-30T16:00:00Z', dataPeriod: '2025', content: '100 people', source: 'api.worldbank.org' }
    mocks.cached.mockResolvedValue(source)
    expect(await readMarketIndicator('IN', 'population')).toEqual({ source, cached: true })
    expect(mocks.read).not.toHaveBeenCalled()
  })
  it('rejects injected country paths, wrong-country data and missing observations', async () => {
    await expect(readMarketIndicator('IN/../../private', 'population')).rejects.toThrow('two-letter')
    expect(mocks.read).not.toHaveBeenCalled()
    mocks.read.mockResolvedValue({ text: JSON.stringify([{}, [{ ...row('2025', 100), country: { id: 'US' } }]]), url: 'https://api.worldbank.org' })
    await expect(readMarketIndicator('IN', 'population')).rejects.toThrow('No published observation')
    mocks.read.mockResolvedValue({ text: JSON.stringify([{}, [row('2026', null)]]), url: 'https://api.worldbank.org' })
    await expect(readMarketIndicator('IN', 'population')).rejects.toThrow('No published observation')
  })
  it('uses a bundled or stored exact indicator without another web request', async () => {
    const source = { title: 'India population', country: 'IN', indicator: 'SP.POP.TOTL', observationYear: 2025 }
    mocks.indicator.mockResolvedValue(source)
    expect(await readMarketIndicator('IN', 'population')).toEqual({ source, cached: true })
    expect(mocks.indicator).toHaveBeenCalledWith('IN', 'SP.POP.TOTL')
    expect(mocks.read).not.toHaveBeenCalled()
  })
  it('retains a valid negative growth rate', async () => {
    mocks.read.mockResolvedValue({ text: JSON.stringify([{}, [{ ...row('2025', -0.8), indicator: { id: 'NY.GDP.MKTP.KD.ZG' } }]]), url: 'https://api.worldbank.org' })
    expect((await readMarketIndicator('IN', 'gdpGrowth')).source.value).toBe(-0.8)
  })
  it('does not label a redirect to another institution as World Bank evidence', async () => {
    mocks.read.mockResolvedValue({ text: JSON.stringify([{}, [row('2025', 100)]]), url: 'https://untrusted.example/data' })
    await expect(readMarketIndicator('IN', 'population')).rejects.toThrow('outside the official source')
    expect(mocks.remember).not.toHaveBeenCalled()
  })
})
