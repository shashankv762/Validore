import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cacheSource, cachedSource } from '@/lib/ai/source-cache'

beforeEach(() => { vi.stubEnv('UPSTASH_REDIS_REST_URL', ''); vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', ''); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-31T12:00:00Z')) })
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs() })

describe('shared public source cache', () => {
  it('expires a pricing page without extending its original retrieval date', async () => {
    const source = { url: 'https://example.org/pricing', title: 'Pricing', content: 'Public pricing information', source: 'example.org', fetchedAt: new Date().toISOString(), retrievalKind: 'page' as const }
    await cacheSource(source, 3600)
    vi.setSystemTime(new Date('2026-10-31T12:30:00Z'))
    expect(await cachedSource(source.url)).toMatchObject({ fetchedAt: source.fetchedAt, expiresAt: '2026-10-31T13:00:00.000Z' })
    vi.setSystemTime(new Date('2026-10-31T13:00:01Z'))
    expect(await cachedSource(source.url)).toBeNull()
  })
  it('does not cache empty or oversized source text', async () => {
    const source = { url: 'https://example.org/oversized', title: 'Source', content: 'x'.repeat(12_001), source: 'example.org', fetchedAt: new Date().toISOString() }
    await cacheSource(source)
    expect(await cachedSource(source.url)).toBeNull()
  })
})
