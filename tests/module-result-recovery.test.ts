import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import type { PGlite } from '@electric-sql/pglite'
import { getTableColumns, getTableName, eq } from 'drizzle-orm'
import { NextRequest } from 'next/server'
import JSZip from 'jszip'

// Exercise real owner/reference SQL against an isolated PostgreSQL engine.
const state = vi.hoisted(() => ({ client: null as unknown as PGlite, authenticated: true }))
vi.mock('@/db', async () => {
  const { PGlite } = await import('@electric-sql/pglite')
  const { drizzle } = await import('drizzle-orm/pglite')
  const schema = await import('@/db/schema')
  state.client = new PGlite()
  return { db: drizzle(state.client, { schema }) }
})
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: state.authenticated ? { id: 'auth-owner' } : null } }) } }) }))
vi.mock('@/lib/auth-sync', () => ({ getOrCreateDbUser: async () => db.query.users.findFirst({ where: eq(users.supabaseId, 'auth-owner') }) }))
vi.mock('@/lib/tier-gate', () => ({ getUserWithTierConfig: async () => ({ config: { canExportPptx: true } }), canUserAccess: async () => true }))
vi.mock('@/lib/rate-limit', () => ({ rateLimitCheck: async () => ({ success: true }), checkAndIncrementConcurrency: async () => ({ allowed: true }), decrementConcurrency: vi.fn() }))
vi.mock('@/lib/credits', () => ({ checkCredits: async () => ({ allowed: true }), deductCredits: async () => true }))
vi.mock('@/lib/ai/search', () => ({ webSearch: async () => ({ results: [] }) }))
vi.mock('@/lib/interview/context', () => ({ loadFounderContext: async () => '' }))
vi.mock('@/lib/ai/generate', () => ({ generateWithFallback: async () => ({ data: {
  customerWtpInsights: 'Unverified', customerValueAnalysis: 'Unverified', competitorPrices: [],
  vanWestendorpInsights: { tooExpensive: '', expensive: '', bargain: '', tooCheap: '', acceptableRange: '', label: 'ASSUMPTION' },
  pricingModelRecommendation: 'Test', recommendedPriceToTest: '1000', validationStepsRequired: [], thirtyDayValidationPlan: [], riskRegister: [],
  customerWtpScore: 0, customerValueScore: 0, competitivePositionScore: 0, demandPotentialScore: 0, scalabilityScore: 0, pricingSimplicityScore: 0, integrityNote: 'Unverified assumptions',
} }) }))

import { db } from '@/db'
import { users, ideas, pricingSimulations, crowdfundingAnalyses, pitchDecks, validationReports } from '@/db/schema'
import { moduleHistory } from '@/lib/module-history'
import { loadExportDocument } from '@/lib/exports/load-document'
import { GET as pptx } from '@/app/api/export/pptx/route'
import { GET as portfolio } from '@/app/api/export/portfolio/route'
import { GET as csv } from '@/app/api/export/csv/route'
import { GET as pricingHistory, POST as pricingAnalysis } from '@/app/api/pricing/route'
import { GET as campaignHistory } from '@/app/api/crowdfunding/route'
import { GET as deckHistory } from '@/app/api/pitch-deck/route'

const owner = '11111111-1111-4111-8111-111111111111'
const other = '22222222-2222-4222-8222-222222222222'
let ideaId: string
let pricingId: string
let campaignId: string
let oldDeckId: string
const request = (path: string) => new NextRequest('http://localhost' + path)

beforeAll(async () => {
  const enums = new Map<string, string[]>()
  const tables = [users, ideas, pricingSimulations, crowdfundingAnalyses, pitchDecks, validationReports]
  for (const table of tables) for (const column of Object.values(getTableColumns(table))) {
    if (column.enumValues?.length) enums.set(column.getSQLType(), column.enumValues)
  }
  for (const [name, values] of enums) await state.client.exec(`CREATE TYPE ${name} AS ENUM (${values.map(value => "'" + value + "'").join(',')})`)
  for (const table of tables) {
    const columns = Object.values(getTableColumns(table)).map(column => '"' + column.name + '" ' + column.getSQLType() + (column.name === 'id' ? ' PRIMARY KEY DEFAULT gen_random_uuid()' : ''))
    await state.client.exec('CREATE TABLE "' + getTableName(table) + '" (' + columns.join(',') + ')')
  }
}, 30000)
afterAll(async () => { await state.client.close() })
beforeEach(async () => {
  state.authenticated = true
  await state.client.exec('TRUNCATE users, ideas, pricing_simulations, crowdfunding_analyses, pitch_decks, validation_reports')
  await db.insert(users).values([{ id: owner, supabaseId: 'auth-owner', email: 'owner@example.test', tier: 'free', pitchDeckCredits: 0, crowdfundingCredits: 0 }, { id: other, supabaseId: 'auth-other', email: 'other@example.test' }])
  ideaId = randomUUID(); pricingId = randomUUID(); campaignId = randomUUID(); oldDeckId = randomUUID()
  await db.insert(ideas).values({ id: ideaId, userId: owner, name: 'Validore', industry: 'Software', product: 'Planning', coreProblem: 'Uncertainty', targetCustomer: 'Founders', location: 'India', businessModel: 'Subscription', proposedSolution: 'Guided research' })
  await db.insert(pricingSimulations).values([
    { id: pricingId, ideaId, userId: owner, pricingScore: 55, reportData: { aiAnalysis: { recommendedPriceToTest: 'OLDER SELECTED PRICE', customerValueAnalysis: 'Specific saved pricing' }, computedMetrics: { ltvCacRatio: 2 } }, createdAt: new Date('2026-01-01') },
    { ideaId, userId: owner, pricingScore: 90, reportData: { aiAnalysis: { recommendedPriceToTest: 'NEWER UNSELECTED PRICE' } }, createdAt: new Date('2026-02-01') },
  ])
  await db.insert(crowdfundingAnalyses).values({ id: campaignId, ideaId, userId: owner, performanceScore: 65, reportData: { ai: { keyStrengths: ['SELECTED CAMPAIGN STRENGTH'] }, computedMetrics: { requiredBackers: 50 } }, createdAt: new Date('2026-01-01') })
  await db.insert(pitchDecks).values([
    { id: oldDeckId, ideaId, userId: owner, qualityScore: 51, slides: [{ title: 'Old deck', content: 'SELECTED PITCH CONTENT' }], roadmap: [{ phase: 'SELECTED OLD ROADMAP', milestones: [] }], createdAt: new Date('2026-01-01') },
    { ideaId, userId: owner, qualityScore: 88, slides: [{ title: 'New deck', content: 'UNRELATED PITCH CONTENT' }], roadmap: [{ phase: 'NEWEST ROADMAP', milestones: [] }], createdAt: new Date('2026-02-01') },
  ])
})

describe('saved module recovery and exact exports', () => {
  it.each(['pricing', 'crowdfunding', 'pitch-deck'] as const)('reopens owned %s results with a Free account and exhausted packs', async module => {
    const id = module === 'pricing' ? pricingId : module === 'crowdfunding' ? campaignId : oldDeckId
    const get = module === 'pricing' ? pricingHistory : module === 'crowdfunding' ? campaignHistory : deckHistory
    const response = await get(request('/api/' + module + '?id=' + id))
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect((await response.json()).record.id).toBe(id)
  })
  it('does not return another account record or allow an anonymous history read', async () => {
    const id = randomUUID()
    await db.insert(pricingSimulations).values({ id, ideaId, userId: other, reportData: { private: 'FOREIGN RESULT' } })
    const response = await moduleHistory(request('/api/pricing?id=' + id), 'pricing')
    expect(response.status).toBe(404)
    expect(await response.text()).not.toContain('FOREIGN RESULT')
    const history = await (await moduleHistory(request('/api/pricing'), 'pricing')).json()
    expect(history.records).toHaveLength(2)
    expect(history.records.some((record: { id: string }) => record.id === id)).toBe(false)
    state.authenticated = false
    expect((await moduleHistory(request('/api/pricing'), 'pricing')).status).toBe(401)
  })
  it('paginates summaries without returning private report payloads', async () => {
    await db.insert(pricingSimulations).values(Array.from({ length: 20 }, (_, index) => ({ ideaId, userId: owner, reportData: { private: 'FULL REPORT CONTENT' }, createdAt: new Date(2026, 2, index + 1) })))
    const first = await (await moduleHistory(request('/api/pricing?page=1'), 'pricing')).json()
    const second = await (await moduleHistory(request('/api/pricing?page=2'), 'pricing')).json()
    expect(first.records).toHaveLength(20); expect(first.hasMore).toBe(true)
    expect(second.records).toHaveLength(2); expect(second.hasMore).toBe(false)
    expect(JSON.stringify(first)).not.toContain('FULL REPORT CONTENT')
    expect(first.records.some((entry: { id: string }) => second.records.some((next: { id: string }) => next.id === entry.id))).toBe(false)
  })
  it.each(['id=invalid', 'page=0', 'page=1.5'])('rejects malformed history query %s', async query => {
    expect((await moduleHistory(request('/api/pricing?' + query), 'pricing')).status).toBe(400)
  })
  it('selects an older pricing record for PDF/Word data and CSV instead of the latest version', async () => {
    const loaded = await loadExportDocument(new URLSearchParams({ module: 'pricing', simulationId: pricingId }), 'auth-owner')
    expect('error' in loaded).toBe(false)
    expect(JSON.stringify(loaded)).toContain('OLDER SELECTED PRICE')
    expect(JSON.stringify(loaded)).not.toContain('NEWER UNSELECTED PRICE')
    const response = await csv(request('/api/export/csv?module=pricing&simulationId=' + pricingId))
    expect(response.status).toBe(200)
    expect(await response.text()).toContain('OLDER SELECTED PRICE')
  })
  it.each(['pricing', 'crowdfunding'] as const)('renders %s PowerPoint content despite a conflicting pitch deck', async module => {
    const reference = module === 'pricing' ? 'simulationId=' + pricingId : 'analysisId=' + campaignId
    const response = await pptx(request('/api/export/pptx?deckType=' + module + '&' + reference))
    expect(response.status).toBe(200)
    const zip = await JSZip.loadAsync(await response.arrayBuffer())
    const xml = (await Promise.all(Object.keys(zip.files).filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name)).map(name => zip.file(name)!.async('string')))).join('')
    expect(xml).toContain(module === 'pricing' ? 'OLDER SELECTED PRICE' : 'SELECTED CAMPAIGN STRENGTH')
    expect(xml).not.toContain('UNRELATED PITCH CONTENT')
  })
  it.each(['pricing', 'crowdfunding'] as const)('loads the correct latest module for legacy %s idea-only PPTX links', async module => {
    const response = await pptx(request('/api/export/pptx?deckType=' + module + '&ideaId=' + ideaId))
    expect(response.status).toBe(200)
    const zip = await JSZip.loadAsync(await response.arrayBuffer())
    const xml = (await Promise.all(Object.keys(zip.files).filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name)).map(name => zip.file(name)!.async('string')))).join('')
    expect(xml).toContain(module === 'pricing' ? 'NEWER UNSELECTED PRICE' : 'SELECTED CAMPAIGN STRENGTH')
    expect(xml).not.toContain('UNRELATED PITCH CONTENT')
  })
  it('keeps the selected older deck in a portfolio export', async () => {
    const response = await portfolio(request('/api/export/portfolio?deckId=' + oldDeckId))
    expect(response.status).toBe(200)
    const zip = await JSZip.loadAsync(await response.arrayBuffer())
    const html = await zip.file('index.html')!.async('string')
    expect(html).toContain('SELECTED OLD ROADMAP')
    expect(html).not.toContain('NEWEST ROADMAP')
  })
  it('rejects foreign and conflicting selected export references', async () => {
    const foreignId = randomUUID()
    await db.insert(pricingSimulations).values({ id: foreignId, ideaId, userId: other })
    expect((await pptx(request('/api/export/pptx?deckType=pricing&simulationId=' + foreignId))).status).toBe(404)
    expect((await pptx(request('/api/export/pptx?deckType=pricing&simulationId=' + pricingId + '&deckId=' + oldDeckId))).status).toBe(400)
    expect(await loadExportDocument(new URLSearchParams({ module: 'pricing', simulationId: foreignId }), 'auth-owner')).toMatchObject({ status: 404 })
  })
  it.each([0, 500])('saves a meaningful pricing score when acquisition cost is %s', async estimatedCac => {
    const response = await pricingAnalysis(new NextRequest('http://localhost/api/pricing', {
      method: 'POST', headers: { origin: 'http://localhost', 'content-type': 'application/json' },
      body: JSON.stringify({ ideaId, sellingPrice: 1000, expectedCustomers: 100, variableCostPerUnit: 300, fixedCostMonthly: 0, discountPercent: 0, conversionRatePercent: 3.5, estimatedCac, retentionMonths: 18 }),
    }))
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.result.pricingScore).toBe(estimatedCac === 0 ? 25 : 35)
    expect(body.result.computedMetrics.ltvCacRatio).toBe(estimatedCac === 0 ? null : 25.2)
    expect((await db.query.pricingSimulations.findFirst({ where: eq(pricingSimulations.id, body.simulationId) }))?.pricingScore).toBe(body.result.pricingScore)
  })
  it.each([1000, 1200])('saves an unprofitable scenario when variable cost is %s', async variableCostPerUnit => {
    const response = await pricingAnalysis(new NextRequest('http://localhost/api/pricing', {
      method: 'POST', headers: { origin: 'http://localhost', 'content-type': 'application/json' },
      body: JSON.stringify({ ideaId, sellingPrice: 1000, expectedCustomers: 100, variableCostPerUnit, fixedCostMonthly: 50000, discountPercent: 0, conversionRatePercent: 3.5, estimatedCac: 500, retentionMonths: 18 }),
    }))
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.result.pricingScore).toBe(0)
    expect(Number.isSafeInteger(body.result.pricingScore)).toBe(true)
    expect(body.result.computedMetrics).toMatchObject({ contributionMargin: 1000 - variableCostPerUnit, breakEvenUnits: null, breakEvenRevenue: null, cacPayback: null })
    expect((await db.query.pricingSimulations.findFirst({ where: eq(pricingSimulations.id, body.simulationId) }))?.pricingScore).toBe(0)
  })
})
