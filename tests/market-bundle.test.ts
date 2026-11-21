import { mkdtemp, readFile, readdir, unlink, rmdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import bundle from '@/data/market/bundle.json'
import { createMarketBundle, marketDataHash, validMarketBundle } from '@/lib/ai/market-bundle.mjs'
import { publishMarketBundle } from '../scripts/refresh-market-snapshot.mjs'
import { bundledObservations, bundledTrends, MARKET_BUNDLE_VERSION } from '@/lib/ai/bundled-market'
import { seededResearch, readStoredMarketIndicator } from '@/lib/ai/research-store'
import { readMarketTrend } from '@/lib/ai/market-trends'

afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs() })

describe('Coherent market data publication', () => {
  it('binds every consumed observation and trend to one validated content revision', () => {
    expect(validMarketBundle(bundle)).toBe(true)
    expect(MARKET_BUNDLE_VERSION).toBe(bundle.manifest.id)
    expect(bundledObservations).toEqual(bundle.observations)
    expect(bundledTrends).toEqual(bundle.trends)
    expect(bundle.manifest.counts).toMatchObject({ observations: 48, trends: 48, trendValues: 379, metadata: 8, catalog: 10 })
    const repacked = createMarketBundle(bundle, '2026-11-17T00:00:00Z')
    expect(repacked.manifest.id).toBe(bundle.manifest.id)
    expect(repacked.manifest.retrievedThrough).toBe(bundle.manifest.retrievedThrough)
  })

  it.each(['missing', 'duplicate', 'latest-value', 'unit', 'revision', 'hash'])('rejects a %s mixed or corrupted bundle before it can be consumed', kind => {
    const changed = structuredClone(bundle)
    if (kind === 'missing') changed.observations.pop()
    if (kind === 'duplicate') changed.trends[1] = structuredClone(changed.trends[0])
    if (kind === 'latest-value') changed.observations[0].value += 1
    if (kind === 'unit') changed.trends[0].unit = 'customers'
    if (kind === 'revision') changed.trends[0].metadataUpdatedAt = '2020-01-01'
    if (kind === 'hash') changed.manifest.id = '0'.repeat(64)
    expect(validMarketBundle(changed)).toBe(false)
    if (kind !== 'hash') expect(() => createMarketBundle(changed)).toThrow()
  })

  it('preserves the previous complete file when a replacement fails validation, then publishes the complete new version', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'validore-market-bundle-'))
    const path = join(directory, 'bundle.json')
    try {
      await publishMarketBundle(path, bundle, bundle.manifest.createdAt)
      const before = await readFile(path, 'utf8')
      const invalid = structuredClone(bundle); invalid.observations.pop()
      await expect(publishMarketBundle(path, invalid)).rejects.toThrow('coverage')
      expect(await readFile(path, 'utf8')).toBe(before)
      const next = structuredClone(bundle); next.catalog[0].limitations += ' Reviewed publisher terms remain applicable.'
      await publishMarketBundle(path, next)
      const saved = JSON.parse(await readFile(path, 'utf8'))
      expect(validMarketBundle(saved)).toBe(true)
      expect(saved.manifest.id).not.toBe(bundle.manifest.id)
      expect(saved.manifest.checksums.observations).toBe(marketDataHash(bundle.observations))
      expect(JSON.parse(await readFile(path + '.previous.json', 'utf8')).manifest.id).toBe(bundle.manifest.id)
      expect((await readdir(directory)).sort()).toEqual(['bundle.json', 'bundle.json.previous.json'])
    } finally { for (const name of await readdir(directory)) await unlink(join(directory, name)); await rmdir(directory) }
  })

  it('retains the same bundle identity in actual bundled research and trend tools', async () => {
    const now = Date.parse(bundle.manifest.retrievedThrough) + 60_000
    vi.useFakeTimers(); vi.setSystemTime(now)
    vi.stubEnv('DATABASE_URL', ''); vi.stubEnv('RESEARCH_STORE_ENABLED', 'true')
    const seeds = seededResearch('India population', 6, now)
    expect(seeds.length).toBeGreaterThan(0)
    expect(seeds.every(source => source.dataBundleVersion === MARKET_BUNDLE_VERSION)).toBe(true)
    // No live request is needed while the checked-in bundle is unexpired.
    const source = await readStoredMarketIndicator('IN', 'SP.POP.TOTL')
    expect(source?.dataBundleVersion).toBe(MARKET_BUNDLE_VERSION)
    const trend = await readMarketTrend('IN', 'population')
    expect(trend.source.dataBundleVersion).toBe(MARKET_BUNDLE_VERSION)
  })
})
