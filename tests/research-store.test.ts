import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import seed from '@/data/market/seed-sources.json'
import catalog from '@/data/market/source-catalog.json'
import { preparePublicSource, readStoredMarketIndicator, rememberPublicSources, retrievePublicResearch, seededResearch } from '@/lib/ai/research-store'
import { retrieveDatasetCatalog } from '@/lib/ai/market-memory'
import type { SearchResult } from '@/lib/ai/search'

const mocks = vi.hoisted(() => ({ insert: vi.fn(), rows: vi.fn(), where: vi.fn() }))
vi.mock('@/db', () => ({ db: {
  insert: () => ({ values: (value: unknown) => ({ onConflictDoUpdate: (options: unknown) => mocks.insert(value, options) }) }),
  select: () => ({ from: () => ({ where: (condition: unknown) => { mocks.where(condition); return { orderBy: () => ({ limit: mocks.rows }) } } }) }),
} }))
const now = Date.parse('2026-11-01T00:00:00Z')
const observation = () => structuredClone(seed.find(item => item.country === 'IN' && item.indicator === 'SP.POP.TOTL')!)
beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(now)
  vi.stubEnv('DATABASE_URL', ''); vi.stubEnv('RESEARCH_STORE_ENABLED', 'true')
  mocks.insert.mockResolvedValue(undefined); mocks.rows.mockResolvedValue([])
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs() })

describe('collected official observations', () => {
  it('has the complete six-geography, eight-indicator matrix and preserves provenance', () => {
    expect(seed).toHaveLength(48)
    expect(new Set(seed.map(item => item.country))).toEqual(new Set(['IN', 'US', 'GB', 'SG', 'BR', 'WLD']))
    expect(new Set(seed.map(item => item.indicator)).size).toBe(8)
    expect(new Set(seed.map(item => item.country + ':' + item.indicator)).size).toBe(48)
    for (const item of seed) {
      const safe = preparePublicSource(item, now)
      expect(safe).toMatchObject({ value: item.value, country: item.country, indicator: item.indicator, dataPeriod: String(item.observationYear), fetchedAt: item.fetchedAt, unit: item.unit })
      expect(Date.parse(item.expiresAt)).toBeGreaterThan(now)
      expect(item.observationYear).toBeLessThan(2026)
      expect(item.content).toContain('not live transaction data')
    }
  })
  it('does not substitute a different geography for an explicit local query', () => {
    for (const [query, country] of [['IN population', 'IN'], ['US GDP', 'US'], ['Brazil inflation', 'BR'], ['UK internet', 'GB'], ['Singapore urban population', 'SG'], ['global population', 'WLD']]) {
      const sources = seededResearch(query, 6, now)
      expect(sources.length).toBeGreaterThan(0)
      expect(sources.every(item => item.country === country)).toBe(true)
    }
    expect(seededResearch('India and global GDP', 12, now).every(item => item.country === 'IN' || item.country === 'WLD')).toBe(true)
  })
  it('excludes expired/future records rather than silently changing timestamps', () => {
    expect(seededResearch('India population', 6, Date.parse('2026-12-10'))).toEqual([])
    expect(preparePublicSource({ ...observation(), fetchedAt: new Date(now + 1).toISOString() }, now)).toBeNull()
    expect(preparePublicSource({ ...observation(), expiresAt: new Date(now).toISOString() }, now)).toBeNull()
  })
  it('labels directory entries as references rather than numerical observations', () => {
    expect(catalog).toHaveLength(10)
    const sources = retrieveDatasetCatalog('India payments RBI official statistics', now)
    expect(sources.length).toBeGreaterThan(0)
    expect(sources.every(item => item.content.startsWith('DATASET REFERENCE, not a numerical observation.'))).toBe(true)
  })
  it('returns the exact bundled indicator with no database or network dependency', async () => {
    expect(await readStoredMarketIndicator('IN', 'SP.POP.TOTL')).toMatchObject({ country: 'IN', indicator: 'SP.POP.TOTL', value: observation().value })
    expect(mocks.rows).not.toHaveBeenCalled()
    vi.stubEnv('RESEARCH_STORE_ENABLED', 'false')
    expect(await readStoredMarketIndicator('IN', 'SP.POP.TOTL')).toBeNull()
  })
})

describe('shared research persistence boundary', () => {
  it.each(['snippet', 'memory', 'model', 'private-answer'])('does not promote %s content to independently retrieved evidence', retrievalKind => {
    expect(preparePublicSource({ ...observation(), retrievalKind }, now)).toBeNull()
  })
  it.each([
    'https://api.worldbank.org.attacker.example/data', 'http://api.worldbank.org/data',
    'https://user:pass@api.worldbank.org/data', 'https://127.0.0.1/data',
    'https://api.worldbank.org/data?api_key=private', 'https://www.rbi.org.in/search?q=private-answer',
  ])('rejects an unsafe or reflecting URL: %s', url => {
    expect(preparePublicSource({ ...observation(), retrievalKind: 'page', url }, now)).toBeNull()
  })
  it('rejects missing or mismatched structured observation metadata', () => {
    for (const changes of [{ value: Number.NaN }, { country: 'US' }, { dataPeriod: '2030' }, { observationYear: 2030 }, { unit: '' }, { value: -1 }]) {
      expect(preparePublicSource({ ...observation(), ...changes }, now)).toBeNull()
    }
  })
  it('accepts legitimate negative inflation and keeps source text bounded', () => {
    const inflation = seed.find(item => item.country === 'IN' && item.indicator === 'FP.CPI.TOTL.ZG')!
    const prepared = preparePublicSource({ ...inflation, value: -0.2, content: 'Official negative inflation observation. '.repeat(100) }, now)!
    expect(prepared.value).toBe(-0.2)
    expect(prepared.content.length).toBeLessThanOrEqual(1800)
  })
  it('never persists snippets, arbitrary competitor pages, or secrets', async () => {
    vi.stubEnv('DATABASE_URL', 'postgres://mock.invalid/test')
    const inputs = [observation(), { ...observation(), retrievalKind: 'snippet' },
      { ...observation(), retrievalKind: 'page', url: 'https://competitor.example/pricing' },
      { ...observation(), content: 'Bearer private_token_123456789012345678901234567890' }]
    expect(await rememberPublicSources(inputs as unknown as SearchResult[])).toBe(1)
    expect(mocks.insert).toHaveBeenCalledOnce()
    const [value, options] = mocks.insert.mock.calls[0]
    expect(value.id).toMatch(/^[a-f0-9]{64}$/)
    expect(options.set).not.toHaveProperty('createdAt')
    expect(value.source).not.toHaveProperty('privateContext')
  })
  it('binds search terms as SQL parameters and excludes wrong-country stored rows', async () => {
    vi.stubEnv('DATABASE_URL', 'postgres://mock.invalid/test')
    mocks.rows.mockResolvedValue([{ source: seed.find(item => item.country === 'US' && item.indicator === 'SP.POP.TOTL') }])
    const sources = await retrievePublicResearch("India population'); DROP TABLE users; --")
    expect(sources.every(item => item.country === 'IN')).toBe(true)
    const query = new PgDialect().sqlToQuery(mocks.where.mock.calls[0][0])
    expect(query.sql).not.toContain('DROP TABLE')
    expect(query.params.some(value => typeof value === 'string' && value.includes('population'))).toBe(true)
  })
})
