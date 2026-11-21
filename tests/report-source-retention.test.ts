import { describe, expect, it } from 'vitest'
import { retainReportSources } from '@/lib/ai/evidence-context'
import type { SearchResult } from '@/lib/ai/search'

describe('delivered report source retention', () => {
  it('retains late cited observations and exact supporting text beyond the background excerpt limit', () => {
    const sources: SearchResult[] = Array.from({ length: 44 }, (_, index) => ({
      url: 'https://example.org/observation-' + index, title: 'Observation ' + index, source: 'example.org',
      content: 'Background '.repeat(200) + 'Exact original passage with the observed count 517.',
      fetchedAt: '2026-11-15T00:00:00Z', retrievalKind: 'page',
    }))
    const saved = retainReportSources(sources, {
      keyEvidence: [{ link: sources[42].url }],
      tamSamSom: { tam: { inputs: { customerCount: { source: sources[41].url, evidenceExcerpt: 'Exact original passage with the observed count 517.' } } } },
      evidenceReview: { checks: [{ url: sources[3].url }] },
    })
    expect(saved.map(source => source.url)).toEqual([...sources.slice(0, 40), sources[41], sources[42]].map(source => source.url))
    for (const index of [3, 41, 42]) expect(saved.find(source => source.url === sources[index].url)?.content).toBe(sources[index].content)
    expect(saved[0].content).toHaveLength(1600)
    expect(sources[0].content.length).toBeGreaterThan(1600)
    expect(saved.some(source => source.url === sources[43].url)).toBe(false)
  })
})
