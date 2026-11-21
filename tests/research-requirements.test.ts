import { afterEach, describe, expect, it, vi } from 'vitest'
import { annualEvidenceRequirement, evaluateEvidenceCoverage, evidenceContentHash, type EvidenceRequirement } from '@/lib/ai/evidence-requirements'
import { localObservationEvidence, localEvidenceManifest } from '@/lib/ai/local-evidence'
import { createResearchCoalescer } from '@/lib/ai/research-coalescing'
import bundle from '@/data/market/bundle.json'
import type { SearchResult } from '@/lib/ai/search'
import { validateSourceClaim } from '@/lib/ai/claim-grounding'

const now = Date.parse(bundle.manifest.retrievedThrough) + 1000
afterEach(() => vi.unstubAllEnvs())

describe('requirement-driven source coverage', () => {
  it('uses an exact historical observation without inventing missing years or changing retrieval provenance', () => {
    vi.stubEnv('RESEARCH_STORE_ENABLED', 'true')
    const series = bundle.trends.find(value => value.country === 'IN' && value.indicator === 'SP.POP.TOTL')!
    const point = series.observations[0]
    const requirement = { country: 'IN', indicator: series.indicator, period: point.year }
    const sources = localObservationEvidence(requirement, now)
    expect(sources).toHaveLength(1)
    expect(sources[0]).toMatchObject({ value: point.value, observationYear: point.year, fetchedAt: series.fetchedAt, metadataUpdatedAt: series.metadataUpdatedAt, retrievalUrl: series.sourceUrl })
    expect(evaluateEvidenceCoverage([annualEvidenceRequirement(requirement)], sources, now)[0].status).toBe('covered')
    expect(localEvidenceManifest().historicalRecordCount).toBe(379)
    const incomplete = bundle.trends.find(value => value.observations.length < 8)!
    const missingYear = Array.from({ length: 8 }, (_, index) => 2018 + index).find(year => !incomplete.observations.some(point => point.year === year))!
    expect(localObservationEvidence({ country: incomplete.country, indicator: incomplete.indicator, period: missingYear }, now)).toEqual([])
  })

  const requirement: EvidenceRequirement = { id: 'price-1', claimType: 'price', subject: 'Example Product / Pro', geography: 'IN', segment: 'small retailers', unit: 'INR per month', denominator: 'one workspace', requestedPeriod: '2026-11-15', freshnessClass: 'current-price', independentSources: 1 }
  const source = (): SearchResult => {
    const content = 'Example Product Pro is INR 500 per month for one workspace. India small retailers offer observed 2026-11-15.'
    return { title: 'Original product offer', url: 'https://example.org/pricing', source: 'example.org', content, contentHash: evidenceContentHash(content),
      retrievalKind: 'page', fetchedAt: new Date(now - 1000).toISOString(), expiresAt: new Date(now + 3_600_000).toISOString(),
      observations: [{ claimType: 'price', subject: requirement.subject, geography: 'IN', segment: requirement.segment, unit: requirement.unit!, denominator: requirement.denominator,
        period: requirement.requestedPeriod, quote: content, originId: 'example-product-original', reviewedAt: new Date(now - 500).toISOString(), reviewedBy: 'synthetic-test-reviewer' }] }
  }
  it('qualifies a reviewed exact passage and rejects wrong product, geography, units, segment and period', () => {
    expect(evaluateEvidenceCoverage([requirement], [source()], now)[0].status).toBe('covered')
    for (const patch of [{ subject: 'Example Product / Basic' }, { geography: 'US' }, { segment: null }, { unit: 'USD per year' }, { requestedPeriod: '2025' }, { denominator: 'one user' }]) {
      expect(evaluateEvidenceCoverage([{ ...requirement, ...patch }], [source()], now)[0].status).toBe('gap')
    }
  })
  it('binds claim passages to their exact source revision and observation dimensions', () => {
    const original = source()
    const claim = { id: 'offer-claim', sourceUrl: original.url, sourceContentHash: original.contentHash!, quote: original.content,
      quoteStart: 0, quoteEnd: original.content.length, requirement }
    expect(validateSourceClaim(claim, [original], now).valid).toBe(true)
    expect(validateSourceClaim({ ...claim, quoteStart: 1 }, [original], now).valid).toBe(false)
    expect(validateSourceClaim(claim, [{ ...original, content: original.content + ' Revised offer.' }], now).valid).toBe(false)
    expect(validateSourceClaim({ ...claim, requirement: { ...requirement, geography: 'US' } }, [original], now).valid).toBe(false)
  })
  it('rejects search leads, absent provenance, stale prices, changed passages and superseded sources', () => {
    for (const patch of [ { retrievalKind: 'snippet' as const }, { contentHash: undefined }, { fetchedAt: new Date(now - 7 * 3_600_000).toISOString() },
      { content: 'A changed unreviewed passage' }, { observations: [] }, { supersededBy: 'new-source' }, { fetchedAt: new Date(now + 1).toISOString() } ]) {
      expect(evaluateEvidenceCoverage([requirement], [{ ...source(), ...patch }], now)[0].status).toBe('gap')
    }
  })
  it('does not mistake duplicate publications or macro context for independent support or demand', () => {
    const original = source()
    const copy = { ...original, url: 'https://another.example/press', source: 'another.example' }
    expect(evaluateEvidenceCoverage([{ ...requirement, independentSources: 2 }], [original, copy], now)[0].status).toBe('gap')
    const annual = localObservationEvidence({ country: 'IN', indicator: 'SP.POP.TOTL', period: 'latest-available' }, now)
    expect(evaluateEvidenceCoverage([{ ...requirement, claimType: 'demand' }], annual, now)[0].status).toBe('gap')
    expect(evaluateEvidenceCoverage([requirement], [], now)[0].reasons[0]).toContain('not negative evidence')
  })
})

describe('shared research cancellation', () => {
  it('keeps a shared read alive for the remaining caller and cancels each waiter independently', async () => {
    const coalesce = createResearchCoalescer<string>()
    let complete!: (value: string) => void
    let shared!: AbortSignal
    const run = vi.fn((signal: AbortSignal) => { shared = signal; return new Promise<string>(resolve => { complete = resolve }) })
    const first = new AbortController(), second = new AbortController()
    const a = coalesce('same-run/source', first.signal, run)
    const b = coalesce('same-run/source', second.signal, run)
    const rejected = expect(a).rejects.toThrow()
    first.abort(); await rejected
    expect(shared.aborted).toBe(false)
    complete('original page')
    expect(await b).toBe('original page')
    expect(run).toHaveBeenCalledTimes(1)
  })
  it('aborts abandoned transport and lets a later caller start cleanly', async () => {
    const coalesce = createResearchCoalescer<string>()
    let shared!: AbortSignal
    const controller = new AbortController()
    const pending = coalesce('source', controller.signal, signal => { shared = signal; return new Promise(() => {}) })
    const rejected = expect(pending).rejects.toThrow()
    controller.abort(); await rejected
    expect(shared.aborted).toBe(true)
    expect(await coalesce('source', undefined, async () => 'new read')).toBe('new read')
  })
})
