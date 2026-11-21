import { describe, expect, it } from 'vitest'
import { CompetitorAgentSchema, type IdeaInput } from '@/lib/validation/schemas'
import { auditCompetitorSources, buildCompetitorPrompt } from '@/lib/validation/agents/competitor'
import type { SearchResult } from '@/lib/ai/search'

const idea: IdeaInput = { name: 'Stock note', industry: 'Retail software', product: 'Weekly stock reminders',
  targetCustomer: 'Independent shop owners', location: 'India', businessModel: 'Subscription',
  coreProblem: 'Stock reconciliation is manual', proposedSolution: 'Send weekly reminders' }
const force = { level: 'MEDIUM' as const, reasoning: 'Evidence remains limited.' }
const result = (overrides: Partial<SearchResult> = {}): SearchResult => ({ title: 'Published product review',
  url: 'https://example.org/competitor', source: 'example.org', fetchedAt: '2026-11-14T09:30:00.000Z',
  retrievalKind: 'page', content: 'The article compares StockPilot and its stock tracking features.', ...overrides })

describe('Evidence-gated competitor findings', () => {
  it('retains only competitors named in a successfully read source and binds its real retrieval date', () => {
    const data = CompetitorAgentSchema.parse({ competitiveScore: 4, competitors: [
      { name: 'StockPilot', targetCustomer: 'Small shops', product: 'Inventory tracking', pricing: 'Unknown', pricingModel: 'Unknown',
        strengths: [], weaknesses: [], marketGap: 'Not established', dateChecked: '2099-01-01' },
      { name: 'FictionalStore AI', targetCustomer: 'Small shops', product: 'Forecasting', pricing: 'Free', pricingModel: 'Subscription',
        strengths: [], weaknesses: [], marketGap: 'Unknown', dateChecked: '2026-11-20' },
    ], competitorPositioning: [
      { name: 'StockPilot', x: 40, y: 50, isOurStartup: false },
      { name: 'FictionalStore AI', x: 60, y: 70, isOurStartup: false },
      { name: idea.name, x: 55, y: 60, isOurStartup: true },
    ], portersFiveForces: { competitiveRivalry: force, threatOfNewEntrants: force, supplierPower: force, buyerPower: force, threatOfSubstitutes: force } })

    const audited = auditCompetitorSources(data, [result(), result({ retrievalKind: 'snippet', url: 'https://example.org/snippet' })])

    expect(audited.competitors).toMatchObject([{ name: 'StockPilot', sourceUrl: 'https://example.org/competitor', dateChecked: '2026-11-14' }])
    expect(audited.competitorPositioning.map(item => item.name)).toEqual(['StockPilot', idea.name])
  })

  it('does not invite memory-based competitor invention when search has no evidence', () => {
    const prompt = buildCompetitorPrompt(idea, { results: [], degraded: true }, '2026-11-20')
    expect(prompt).toContain('Leave competitors and competitorPositioning empty')
    expect(prompt).not.toContain('Build the competitor set from your knowledge')
  })
})
