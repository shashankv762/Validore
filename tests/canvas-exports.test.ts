import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { PgDialect } from 'drizzle-orm/pg-core'
const mocks = vi.hoisted(() => ({ report: vi.fn(), canvas: vi.fn(), crowdfunding: vi.fn(), pricing: vi.fn(), idea: vi.fn() }))
const owner = '11111111-1111-4111-8111-111111111111'
const ideaId = '22222222-2222-4222-8222-222222222222'
const canvasId = '33333333-3333-4333-8333-333333333333'
const reportId = '44444444-4444-4444-8444-444444444444'
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'auth-user' } } }) } }) }))
vi.mock('@/lib/tier-gate', () => ({ canUserAccess: async () => true }))
vi.mock('@/db', () => ({ db: { query: {
  users: { findFirst: async () => ({ id: '11111111-1111-4111-8111-111111111111' }) },
  validationReports: { findFirst: mocks.report }, leanCanvases: { findFirst: mocks.canvas },
  crowdfundingAnalyses: { findFirst: mocks.crowdfunding }, pricingSimulations: { findFirst: mocks.pricing },
  ideas: { findFirst: mocks.idea },
} } }))
vi.mock('@react-pdf/renderer', () => ({
  renderToBuffer: async () => Buffer.from('%PDF-1.4 test'), Document: 'div', Page: 'div', Text: 'span', View: 'div', StyleSheet: { create: (styles: unknown) => styles },
}))
import { GET as csv } from '@/app/api/export/csv/route'
import { GET as pdf } from '@/app/api/export/pdf/route'
beforeEach(() => {
  vi.clearAllMocks()
  mocks.report.mockResolvedValue({ id: reportId, ideaId, userId: owner, reportData: {}, decisionReasons: [], keyRisks: [], actionPlan: [] })
  mocks.canvas.mockResolvedValue({ id: canvasId, userId: owner, ideaId, version: 2, problem: { content: '=1+1' }, validationScore: 0 })
  mocks.idea.mockResolvedValue({ name: 'An example' })
})
describe('selected canvas export', () => {
  it('exports the chosen canvas even when other module data exists, with an owner-scoped lookup', async () => {
    for (const handler of [csv, pdf]) {
      const response = await handler(new NextRequest('http://localhost:3000/api/export?ideaId=' + ideaId + '&canvasId=' + canvasId))
      expect(response.status).toBe(200)
      const query = new PgDialect().sqlToQuery(mocks.canvas.mock.calls.at(-1)![0].where)
      expect(query.params).toEqual(expect.arrayContaining([owner, ideaId, canvasId]))
      expect(response.headers.get('content-disposition')).toContain('lean-canvas-' + canvasId)
    }
    expect(mocks.report).not.toHaveBeenCalled()
    expect(mocks.crowdfunding).not.toHaveBeenCalled()
    expect(mocks.pricing).not.toHaveBeenCalled()
  })
  it('does not fall back to another report when the selected canvas is unavailable', async () => {
    mocks.canvas.mockResolvedValue(null)
    for (const handler of [csv, pdf]) expect((await handler(new NextRequest('http://localhost:3000/api/export?ideaId=' + ideaId + '&canvasId=' + canvasId))).status).toBe(404)
    expect(mocks.report).not.toHaveBeenCalled()
  })
  it('neutralizes founder-provided spreadsheet formulas', async () => {
    const response = await csv(new NextRequest('http://localhost:3000/api/export?ideaId=' + ideaId + '&canvasId=' + canvasId))
    expect(await response.text()).toContain("'=1+1")
    expect(response.headers.get('cache-control')).toBe('private, no-store')
  })
  it('marks missing financial and competitive data without fabricated figures', async () => {
    const response = await csv(new NextRequest('http://localhost:3000/api/export?reportId=' + reportId))
    const body = await response.text()
    expect(body).toContain('"Financial","TAM","Not available"')
    expect(body).toContain('"Financial","CAC","Not available"')
    expect(body).toContain('"Strategic","Competitors","Not available"')
    expect(body).not.toContain('$10,000,000,000')
    expect(body).not.toContain('Manual Consulting & Spreadsheets')
  })
})
