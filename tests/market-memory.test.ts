import { afterEach, describe, expect, it, vi } from 'vitest'
import { retrieveMarketMemory, needsCurrentEvidence } from '@/lib/ai/market-memory'
import { compactEvidence } from '@/lib/ai/evidence-context'
import { deduplicateSources, type SearchResult } from '@/lib/ai/search'

const now = Date.parse('2026-10-31T12:00:00Z')
afterEach(() => vi.unstubAllEnvs())

describe('dated market memory', () => {
  it('retrieves relevant public facts with their original geography and observation dates', () => {
    const sources = retrieveMarketMemory('India MSME small business', { now })
    const registration = sources.find(item => item.title.includes('Udyam'))!
    expect(registration.content).toContain('8.7 crore')
    expect(registration.content).toContain('June 2026')
    expect(registration.content).toContain('not a count of active paying customers')
    expect(registration.fetchedAt).toBe('2026-10-31T00:00:00.000Z')
    expect(registration.retrievalKind).toBe('memory')
  })
  it('excludes expired, future-dated and irrelevant-country memories', () => {
    expect(retrieveMarketMemory('India MSME small business', { now: Date.parse('2026-12-01') }).some(item => item.title.includes('Udyam'))).toBe(false)
    expect(retrieveMarketMemory('India MSME', { now: Date.parse('2026-01-01') })).toEqual([])
    expect(retrieveMarketMemory('US small business', { now }).some(item => item.title.includes('Udyam'))).toBe(false)
    expect(retrieveMarketMemory('US MSME business trends', { now }).some(item => item.title.includes('Udyam'))).toBe(false)
    expect(retrieveMarketMemory('specialized underwater basket weaving', { now })).toEqual([])
  })
  it('never passes a historical statistic as current-only evidence and allows disabling memory', () => {
    expect(retrieveMarketMemory('India UPI fintech', { now, currentOnly: true })).toEqual([])
    expect(needsCurrentEvidence('latest competitor pricing')).toBe(true)
    vi.stubEnv('MARKET_MEMORY_ENABLED', 'false')
    expect(retrieveMarketMemory('India MSME', { now })).toEqual([])
  })
})

describe('bounded evidence context', () => {
  const source = (id: number): SearchResult => ({ title: `Evidence ${id}`, url: `https://source${id}.org/article`, source: `source${id}.org`, fetchedAt: '2026-10-31T00:00:00Z', content: ('Market customer evidence with "quoted" material. ').repeat(500) })
  it('keeps valid citations while bounding the complete serialized prompt fragment', () => {
    const context = compactEvidence(Array.from({ length: 40 }, (_, id) => source(id)), 'Market evidence', 'market', 3500)
    const parsed = JSON.parse(context) as SearchResult[]
    expect(context.length).toBeLessThanOrEqual(3500)
    expect(parsed.length).toBeGreaterThan(0)
    expect(parsed.length).toBeLessThanOrEqual(12)
    expect(parsed.every(item => item.url.startsWith('https://') && item.fetchedAt === '2026-10-31T00:00:00Z')).toBe(true)
  })
  it('preserves dated-memory limitations and prefers an actually read page over its snippet', () => {
    const snippet = source(1)
    const page = { ...snippet, content: 'The original page includes the source methodology.', retrievalKind: 'page' as const }
    expect(deduplicateSources([snippet, page])).toEqual([page])
    expect(JSON.parse(compactEvidence([page, snippet], 'source methodology'))[0].content).toBe(page.content)
    const memory = retrieveMarketMemory('India MSME', { now })
    expect(compactEvidence(memory, 'India MSME')).toContain('Data period: June 2026')
  })
  it('omits a memory rather than truncating the limits on a historical statistic', () => {
    const memory = retrieveMarketMemory('India MSME', { now }).find(item => item.title.includes('Udyam'))!
    const size = JSON.stringify([memory]).length
    expect(compactEvidence([memory], 'India MSME', 'market', size - 1)).toBe('[]')
    expect(JSON.parse(compactEvidence([memory], 'India MSME', 'market', size))[0]).toEqual(memory)
  })
})
