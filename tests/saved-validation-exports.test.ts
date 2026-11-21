import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { PgDialect } from 'drizzle-orm/pg-core'
import JSZip from 'jszip'
import { buildReportDocument, documentLines } from '@/lib/exports/document'
import { renderReportWord } from '@/lib/exports/word'

const mocks = vi.hoisted(() => ({ report: vi.fn(), idea: vi.fn() }))
const ownerId = '11111111-1111-4111-8111-111111111111'
const ideaId = '22222222-2222-4222-8222-222222222222'
const reportId = '33333333-3333-4333-8333-333333333333'
const owner = { id: ownerId, supabaseId: 'auth-founder', email: 'founder@example.test', isAdmin: false, accountStatus: 'active' }
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'auth-founder' } } }) } }) }))
vi.mock('@/lib/auth-sync', () => ({ getOrCreateDbUser: async () => owner }))
vi.mock('@/lib/tier-gate', () => ({ canUserAccess: async () => true, getUserWithTierConfig: async () => ({ user: owner, config: { canExportPptx: true } }) }))
vi.mock('@/lib/rate-limit', () => ({ rateLimitCheck: async () => ({ success: true }) }))
vi.mock('@/db', () => ({ db: { query: { users: { findFirst: async () => owner },
  validationReports: { findFirst: mocks.report }, crowdfundingAnalyses: { findFirst: mocks.report },
  pricingSimulations: { findFirst: mocks.report }, ideas: { findFirst: mocks.idea } } } }))
import { GET as csv } from '@/app/api/export/csv/route'
import { GET as pptx } from '@/app/api/export/pptx/route'
const saved = {
  id: reportId, userId: ownerId, ideaId, status: 'complete', overallScore: 42, decision: 'TEST_FURTHER',
  keyRisks: ['The observed sample is small.'], decisionReasons: ['Interview more buyers before building.'],
  actionPlan: [{ week: 'Week 1', action: 'Offer a paid pilot.', owner: 'Founder', kpi: '5 deposits',
    hypothesis: 'Buyers will pay for weekly reconciliation.', participantUnit: 'Independent shop owner',
    denominator: '20 eligible owners approached', passCriterion: '5 pay the pilot deposit', decisionOnFailure: 'Revisit the buyer segment.' }],
  reportData: {
    customerSignals: { summary: 'Recorded buyers need to reconcile weekly stock totals.', observations: [{ theme: 'Weekly reconciliation', count: 2, sampleSize: 5, limitation: 'One small convenience sample.' }] },
    evidenceReview: { summary: 'The background source supports the industry context only.', checks: [{ url: 'https://example.test/original', assessment: 'inconclusive' }] },
    researchSources: [{ title: 'Original source', url: 'https://example.test/original', content: 'Exact source excerpt with the observed count 517.', fetchedAt: '2026-11-15' }],
    scoreCoverage: { evaluatedMaximum: 65, evaluatedScore: 42, missingCategories: ['Customer', 'Willingness to pay'] },
    finalFinding: 'FINAL SAVED FINDING: do not scale before the paid pilot.',
    provider: 'private-provider', tokensUsed: 9134, requestId: 'private-request-reference',
    customOpenRouterKey: 'private-provider-key', shareToken: 'private-share-reference',
    financialReview: { sensitivity: [{ name: 'Lower conversion', finding: 'A narrower paid pilot has a smaller loss.' }] },
  },
}
beforeEach(() => {
  vi.clearAllMocks(); mocks.report.mockResolvedValue(saved)
  mocks.idea.mockResolvedValue({ id: ideaId, userId: ownerId, name: 'Saved experiment fixture', industry: 'Retail', coreProblem: 'Stock totals take too long to reconcile.' })
})
const expectRetained = (text: string) => {
  for (const value of ['20 eligible owners approached', '5 pay the pilot deposit', 'Revisit the buyer segment.',
    'Recorded buyers need to reconcile weekly stock totals.', 'Exact source excerpt with the observed count 517.',
    'FINAL SAVED FINDING', 'A narrower paid pilot has a smaller loss.', 'https://example.test/original']) expect(text).toContain(value)
  for (const value of ['private-provider', 'private-request-reference', 'private-provider-key', 'private-share-reference', ownerId]) expect(text).not.toContain(value)
}
async function visibleSlides(response: Response) {
  expect(response.status).toBe(200)
  const zip = await JSZip.loadAsync(await response.arrayBuffer())
  return (await Promise.all(Object.entries(zip.files).filter(([name]) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .map(([, file]) => file.async('string')))).join('\n')
}
describe('complete exact saved-version validation exports', () => {
  it('uses the original captured brief in CSV and PPTX after the idea changes', async () => {
    mocks.report.mockResolvedValue({ ...saved, reportData: { ...saved.reportData,
      ideaSnapshot: { name: 'Original clinic concept', coreProblem: 'Missed appointments', industry: 'Healthcare', location: 'UK' },
    } })
    mocks.idea.mockResolvedValue({ id: ideaId, userId: ownerId, name: 'New restaurant hardware', coreProblem: 'Inventory waste', industry: 'Hospitality' })
    const csvResponse = await csv(new NextRequest('https://validore.example/api/export/csv?reportId=' + reportId))
    expect(csvResponse.status).toBe(200)
    const csvText = await csvResponse.text()
    expect(csvText).toContain('Original clinic concept'); expect(csvText).toContain('Missed appointments')
    expect(csvText).not.toContain('New restaurant hardware'); expect(csvText).not.toContain('Inventory waste')
    const slides = await visibleSlides(await pptx(new NextRequest('https://validore.example/api/export/pptx?deckType=validation&reportId=' + reportId)))
    expect(slides).toContain('Original clinic concept'); expect(slides).toContain('Missed appointments')
    expect(slides).not.toContain('New restaurant hardware')
  })
  it('retains source excerpts, customer summaries and experiment criteria in comparison CSV while marking the incomplete score', async () => {
    const response = await csv(new NextRequest('https://validore.example/api/export/csv?reportId=' + reportId))
    expect(response.status).toBe(200)
    const text = await response.text(); expectRetained(text)
    expect(text).toContain('Partial analysis'); expect(text).toContain('Score coverage and unreviewed criteria')
    const query = new PgDialect().sqlToQuery(mocks.report.mock.calls[0][0].where)
    expect(query.params).toEqual(expect.arrayContaining([ownerId, reportId]))
    expect(response.headers.get('cache-control')).toBe('private, no-store')
  })
  it('retains all saved analysis in an explicitly labeled PowerPoint notes appendix and flags partial coverage on its cover', async () => {
    const response = await pptx(new NextRequest('https://validore.example/api/export/pptx?deckType=validation&reportId=' + reportId))
    expect(response.status).toBe(200)
    const zip = await JSZip.loadAsync(await response.arrayBuffer())
    const notes = (await Promise.all(Object.entries(zip.files).filter(([name]) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(name)).map(([, file]) => file.async('string')))).join('\n')
    expectRetained(notes); expect(notes).toContain('Partial analysis')
    const slides = (await Promise.all(Object.entries(zip.files).filter(([name]) => /^ppt\/slides\/slide\d+\.xml$/.test(name)).map(([, file]) => file.async('string')))).join('\n')
    expect(slides).toContain('PARTIAL ANALYSIS'); expect(slides).toContain('COMPLETE SAVED ANALYSIS'); expect(slides).toContain('speaker notes')
    const query = new PgDialect().sqlToQuery(mocks.report.mock.calls[0][0].where)
    expect(query.params).toEqual(expect.arrayContaining([ownerId, reportId]))
  })
  it('keeps the same retained fields and partial disclosure in editable Word, even when legacy status says complete', async () => {
    const document = buildReportDocument(saved, { name: 'Saved experiment fixture' }, 'validation')
    expect(document.partial).toBe(true)
    const zip = await JSZip.loadAsync(await renderReportWord(document))
    const xml = await zip.file('word/document.xml')!.async('string')
    expectRetained(xml); expect(xml).toContain('Partial analysis')
  })
  it('does not turn an absent legacy validation score into a zero-score business verdict', async () => {
    mocks.report.mockResolvedValue({ ...saved, overallScore: null })
    const response = await pptx(new NextRequest('https://validore.example/api/export/pptx?deckType=validation&reportId=' + reportId))
    expect(response.status).toBe(200)
    const zip = await JSZip.loadAsync(await response.arrayBuffer())
    const cover = await zip.file('ppt/slides/slide1.xml')!.async('string')
    expect(cover).toContain('Validation Score: Not established'); expect(cover).not.toContain('Validation Score: 0/100')
  })
  it('retains saved campaign currency, collected funds and calculator scenarios instead of model guesses', async () => {
    mocks.report.mockResolvedValue({ ...saved, performanceScore: 0, recommendation: 'TEST_FURTHER', reportData: {
      inputs: { currency: 'INR' }, calculationAssumptions: { currency: 'INR' }, computedMetrics: { requiredBackers: 500 },
      scenarios: { base: { fundingPercent: 70, amountRaised: 35000, collected: 0 } },
      ai: { firstWeekTarget: 0, scenarios: { base: { fundingPercent: 999 } },
        rewardEconomics: [{ tier: 'Average reward', cost: 40, revenue: 100, roi: 150 }],
        campaignStoryScorecard: { problemClarity: 0 } },
    } })
    const slides = await visibleSlides(await pptx(new NextRequest('https://validore.example/api/export/pptx?deckType=crowdfunding&analysisId=' + reportId)))
    for (const text of ['Readiness: 0/100', 'First 24h target: Not established', 'First week target: INR 0',
      'cost INR 40', 'pledge INR 100', 'Base scenario: 70% of goal', 'Base pledges: INR 35,000', 'Base collected: INR 0',
      'Required backers: 500', 'Problem clarity: 0/10', 'Solution clarity: Not established']) expect(slides).toContain(text)
    expect(slides).not.toContain('999%'); expect(slides).not.toContain('$35,000'); expect(slides).not.toContain('$40')
  })
  it('keeps unavailable pricing metrics distinct from genuine zeros in presentation summaries', async () => {
    const record = { ...saved, pricingScore: null, reportData: { aiAnalysis: {}, computedMetrics: { ltvCacRatio: null, breakEvenUnits: null } } }
    mocks.report.mockResolvedValue(record)
    const missing = await visibleSlides(await pptx(new NextRequest('https://validore.example/api/export/pptx?deckType=pricing&simulationId=' + reportId)))
    expect(missing).toContain('Score: Not established'); expect(missing).toContain('LTV/CAC: Not established'); expect(missing).toContain('Break-even: Not established')
    mocks.report.mockResolvedValue({ ...record, pricingScore: 0, reportData: { aiAnalysis: {}, computedMetrics: { ltvCacRatio: 0, breakEvenUnits: 0 } } })
    const zero = await visibleSlides(await pptx(new NextRequest('https://validore.example/api/export/pptx?deckType=pricing&simulationId=' + reportId)))
    expect(zero).toContain('Score: 0/100'); expect(zero).toContain('LTV/CAC: 0'); expect(zero).toContain('Break-even: 0 units')
  })
  it('explains empty presentation sections and does not label a six-week plan as thirty days', async () => {
    mocks.report.mockResolvedValue({ ...saved, reportData: { competitorPositioning: [], riskRegister: [],
      actionPlan: [{ week: 'Week 6', action: 'Review actual renewals.' }] } })
    const slides = await visibleSlides(await pptx(new NextRequest('https://validore.example/api/export/pptx?reportId=' + reportId)))
    expect(slides).toContain('This section is not available in the saved report.')
    expect(slides).toContain('The observed sample is small.'); expect(slides).toContain('Week 6: Review actual renewals.')
    expect(slides).not.toContain('Next 30 Days'); expect(slides).not.toContain('Positioning Map')
  })
  it('labels acquisition cost per customer and direct validation without changing numeric inputs', () => {
    const lines = documentLines({ estimatedCACMonthly: 200, estimatedChurnRate: 0.02, validated: false }).map(line => line.text)
    expect(lines).toEqual(expect.arrayContaining(['Acquisition cost per new customer: 200', 'Monthly customer churn fraction: 0.02', 'Validated through direct testing: No']))
  })
  it('retains planned and achieved milestone states in Word while filtering private record and nested metadata', async () => {
    const document = buildReportDocument({ status: 'private-record-status', userId: 'private-owner', reportData: {
      roadmap: [{ phase: 'Pilot', timeframe: 'Next quarter', milestones: [
        { milestone: 'Build prototype', status: 'ACHIEVED', id: 'private-milestone-id', apiKey: 'private-api-key' },
        { milestone: 'Measure paid demand', status: 'PLANNED', jobId: 'private-job-id' },
      ] }], metadata: { status: 'private-nested-status', requestId: 'private-request-id' },
    } }, null, 'pitch')
    const zip = await JSZip.loadAsync(await renderReportWord(document))
    const xml = await zip.file('word/document.xml')!.async('string')
    expect(xml).toContain('Status: ACHIEVED'); expect(xml).toContain('Status: PLANNED')
    expect(xml).not.toContain('private-')
    expect(documentLines({ milestone: 'Pilot', status: 'complete' }).map(line => line.text)).toEqual(['Milestone: Pilot'])
  })
})
