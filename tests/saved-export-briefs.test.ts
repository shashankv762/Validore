import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { PgDialect } from 'drizzle-orm/pg-core'
import JSZip from 'jszip'

const mocks = vi.hoisted(() => ({ report: vi.fn(), canvas: vi.fn(), pricing: vi.fn(), campaign: vi.fn(), pitch: vi.fn(),
  idea: vi.fn(), ideas: vi.fn(), reports: vi.fn(), decks: vi.fn(), pdf: vi.fn() }))
const ownerId = '11111111-1111-4111-8111-111111111111'
const ideaId = '22222222-2222-4222-8222-222222222222'
const resultId = '33333333-3333-4333-8333-333333333333'
const owner = { id: ownerId, email: 'founder@example.test', accountStatus: 'active' }
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'auth-founder' } } }) } }) }))
vi.mock('@/lib/auth-sync', () => ({ getOrCreateDbUser: async () => owner }))
vi.mock('@/lib/tier-gate', () => ({ canUserAccess: async () => true, getUserWithTierConfig: async () => ({ user: owner, config: { canExportPptx: true } }) }))
vi.mock('@/lib/rate-limit', () => ({ rateLimitCheck: async () => ({ success: true }) }))
vi.mock('@/lib/exports/pdf', () => ({ renderReportPdf: mocks.pdf }))
vi.mock('@/db', () => ({ db: { query: {
  users: { findFirst: async () => owner }, ideas: { findFirst: mocks.idea, findMany: mocks.ideas },
  validationReports: { findFirst: mocks.report, findMany: mocks.reports }, leanCanvases: { findFirst: mocks.canvas },
  pricingSimulations: { findFirst: mocks.pricing }, crowdfundingAnalyses: { findFirst: mocks.campaign },
  pitchDecks: { findFirst: mocks.pitch, findMany: mocks.decks },
} } }))
import { loadExportDocument } from '@/lib/exports/load-document'
import { GET as whiteLabel } from '@/app/api/export/pdf/white-label/route'
import { GET as pptx } from '@/app/api/export/pptx/route'
import { GET as portfolio } from '@/app/api/export/portfolio/route'

const original = { name: 'Original clinic concept', industry: 'Healthcare', product: 'Appointment reminders',
  targetCustomer: 'Small clinics', location: 'UK', businessModel: 'Subscription', coreProblem: 'Missed appointments', proposedSolution: 'A reminder pilot' }
const current = { id: ideaId, userId: ownerId, name: 'New restaurant hardware', industry: 'Hospitality', product: 'New inventory device',
  targetCustomer: 'New restaurant owners', location: 'India', businessModel: 'Hardware sales', coreProblem: 'New inventory waste', proposedSolution: 'New inventory sensors' }
const saved = () => ({ id: resultId, userId: ownerId, ideaId, overallScore: 42, decision: 'TEST_FURTHER',
  reportData: { ideaSnapshot: original, tamEstimate: 'Original annual market estimate' }, qualityScore: 43,
  slides: [{ title: 'Original presentation', headline: original.name, content: original.product }],
  roadmap: [{ phase: 'Original pilot', milestones: [{ milestone: 'ORIGINAL-MILESTONE', status: 'PLANNED' }] }] })

beforeEach(() => {
  vi.clearAllMocks()
  for (const query of [mocks.report, mocks.canvas, mocks.pricing, mocks.campaign, mocks.pitch]) query.mockResolvedValue(saved())
  mocks.idea.mockResolvedValue(current); mocks.ideas.mockResolvedValue([current])
  mocks.reports.mockResolvedValue([saved()]); mocks.decks.mockResolvedValue([saved()])
  mocks.pdf.mockResolvedValue(Buffer.from('%PDF-1.7 synthetic'))
})
async function zipText(response: Response, pattern: RegExp) {
  expect(response.status).toBe(200)
  const zip = await JSZip.loadAsync(await response.arrayBuffer())
  return (await Promise.all(Object.entries(zip.files).filter(([name]) => pattern.test(name)).map(([, file]) => file.async('string')))).join('\n')
}

describe('saved module brief boundaries in exports', () => {
  it.each(['canvas', 'pricing', 'crowdfunding', 'pitch'])('loads the captured %s brief after the current idea changes', async kind => {
    const params = new URLSearchParams({ ideaId, module: kind })
    if (kind === 'canvas') {
      params.set('canvasId', resultId)
      mocks.canvas.mockResolvedValue({ ...saved(), analysisData: { ideaSnapshot: original }, reportData: null, problem: { content: '=1+1' } })
    }
    const loaded = await loadExportDocument(params, 'auth-founder')
    expect('error' in loaded).toBe(false)
    if ('error' in loaded) throw new Error(loaded.error)
    expect(loaded.document.title).toBe(original.name)
    expect(JSON.stringify(loaded.document)).toContain(original.coreProblem)
    expect(JSON.stringify(loaded.document)).not.toContain(current.name)
    expect(JSON.stringify(loaded.document)).not.toContain(current.coreProblem)
    const query = new PgDialect().sqlToQuery(mocks.idea.mock.calls.at(-1)![0].where)
    expect(query.params).toEqual(expect.arrayContaining([ownerId, ideaId]))
    if (kind === 'canvas') expect(loaded.canvasFields).toContainEqual({ name: 'Problem', content: '=1+1' })
  })
  it('rejects a conflicting selected idea and saved document reference', async () => {
    expect(await loadExportDocument(new URLSearchParams({ ideaId: '44444444-4444-4444-8444-444444444444', deckId: resultId }), 'auth-founder')).toMatchObject({ status: 404 })
  })
  it.each(['validation', 'pitch'])('renders white-label %s with the captured brief and an owner-scoped idea lookup', async kind => {
    if (kind === 'pitch') mocks.report.mockResolvedValue(null)
    expect((await whiteLabel(new NextRequest('https://validore.test/api/export/pdf/white-label?reportId=' + resultId))).status).toBe(200)
    const [document, options] = mocks.pdf.mock.calls[0]
    expect(document.title).toBe(original.name)
    expect(JSON.stringify(document)).toContain(original.coreProblem)
    expect(JSON.stringify(document)).not.toContain(current.name)
    expect(options).toEqual({ whiteLabel: true })
    const query = new PgDialect().sqlToQuery(mocks.idea.mock.calls[0][0].where)
    expect(query.params).toEqual(expect.arrayContaining([ownerId, ideaId]))
  })
  it.each(['pricing', 'pitch'])('keeps the original %s brief in PPTX metadata and saved sections', async kind => {
    const params = kind === 'pricing' ? 'deckType=pricing&simulationId=' : 'deckType=pitch&deckId='
    const text = await zipText(await pptx(new NextRequest('https://validore.test/api/export/pptx?' + params + resultId)), /^(?:ppt\/slides\/slide\d+\.xml|ppt\/notesSlides\/notesSlide\d+\.xml|docProps\/core\.xml)$/)
    expect(text).toContain(original.name)
    expect(text).toContain(original.coreProblem)
    expect(text).not.toContain(current.name)
    expect(text).not.toContain(current.coreProblem)
  })
})

describe('exact saved portfolio selections', () => {
  it('uses the selected historical report rather than newer same-idea scores and deck milestones', async () => {
    mocks.reports.mockResolvedValue([{ ...saved(), id: 'newer-report', overallScore: 99, reportData: { ideaSnapshot: current, tamEstimate: 'NEWER-MARKET' } }])
    mocks.decks.mockResolvedValue([{ ...saved(), roadmap: [{ phase: 'Newer', milestones: [{ milestone: 'NEWER-MILESTONE' }] }], reportData: { ideaSnapshot: current } }])
    const html = await zipText(await portfolio(new NextRequest('https://validore.test/api/export/portfolio?reportId=' + resultId)), /^index\.html$/)
    expect(html).toContain(original.name); expect(html).toContain(original.coreProblem)
    expect(html).toContain('Original annual market estimate')
    for (const value of [current.name, current.coreProblem, 'NEWER-MARKET', 'NEWER-MILESTONE']) expect(html).not.toContain(value)
  })
  it('uses the exact selected deck without borrowing a newer validation or roadmap', async () => {
    mocks.reports.mockResolvedValue([{ ...saved(), reportData: { ideaSnapshot: current, tamEstimate: 'NEWER-MARKET' } }])
    mocks.decks.mockResolvedValue([{ ...saved(), id: 'newer-deck', reportData: { ideaSnapshot: current }, roadmap: [] }])
    const html = await zipText(await portfolio(new NextRequest('https://validore.test/api/export/portfolio?deckId=' + resultId)), /^index\.html$/)
    expect(html).toContain(original.name); expect(html).toContain('ORIGINAL-MILESTONE')
    expect(html).not.toContain(current.name); expect(html).not.toContain('NEWER-MARKET')
  })
  it('uses each gallery result snapshot and omits a roadmap generated for a different brief', async () => {
    const otherId = '44444444-4444-4444-8444-444444444444'
    mocks.ideas.mockResolvedValue([current, { ...current, id: otherId, name: 'CURRENT-SECOND-IDEA' }])
    mocks.reports.mockResolvedValue([saved(), { ...saved(), ideaId: otherId, reportData: { ideaSnapshot: { ...original, name: 'ORIGINAL-SECOND-IDEA' } } }])
    mocks.decks.mockResolvedValue([{ ...saved(), reportData: { ideaSnapshot: current }, roadmap: [{ phase: 'New', milestones: [{ milestone: 'WRONG-BRIEF-MILESTONE' }] }] }])
    const html = await zipText(await portfolio(new NextRequest('https://validore.test/api/export/portfolio')), /^index\.html$/)
    expect(html).toContain('ORIGINAL-SECOND-IDEA')
    expect(html).not.toContain('CURRENT-SECOND-IDEA'); expect(html).not.toContain('WRONG-BRIEF-MILESTONE')
  })
})
