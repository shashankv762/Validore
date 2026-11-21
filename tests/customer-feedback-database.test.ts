import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import type { PGlite } from '@electric-sql/pglite'
import { beforeAll, beforeEach, afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { eq } from 'drizzle-orm'

const state = vi.hoisted(() => ({ client: null as unknown as PGlite, auth: vi.fn(), generate: vi.fn(), rate: vi.fn(), concurrency: vi.fn(), release: vi.fn(), publicReviews: vi.fn() }))
vi.mock('@/db', async () => {
  const { PGlite } = await import('@electric-sql/pglite')
  const { drizzle } = await import('drizzle-orm/pglite')
  const schema = await import('@/db/schema')
  state.client = new PGlite()
  return { db: drizzle(state.client, { schema }) }
})
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: state.auth } }) }))
vi.mock('@/lib/ai/generate', () => ({ generateWithFallback: state.generate }))
vi.mock('@/lib/customer-feedback/public-reviews', () => ({ readPublicReviews: state.publicReviews }))
vi.mock('@/lib/rate-limit', () => ({ rateLimitCheck: state.rate, checkAndIncrementConcurrency: state.concurrency, decrementConcurrency: state.release }))
import { db } from '@/db'
import * as schema from '@/db/schema'
import { GET, POST, PATCH, DELETE } from '@/app/api/ideas/[ideaId]/feedback/route'
import { loadFounderContext } from '@/lib/interview/context'
import { deleteFeedbackRecord, readFeedbackView, saveFeedbackRecords } from '@/lib/customer-feedback/store'
import { loadCustomerFeedbackContext } from '@/lib/customer-feedback/context'
import { LEGAL } from '@/lib/legal'
import { feedbackAnalysis, feedbackRecords } from './fixtures/customer-feedback'
import type { FeedbackAnalysis } from '@/lib/customer-feedback/schema'
import type { z } from 'zod'

const ownerId = 'aaaaaaaa-1111-4111-8111-111111111111'
const otherId = 'bbbbbbbb-2222-4222-8222-222222222222'
const ideaId = 'cccccccc-3333-4333-8333-333333333333'
const otherIdea = 'dddddddd-4444-4444-8444-444444444444'
const origin = 'https://validore.test'
const context = (id = ideaId) => ({ params: Promise.resolve({ ideaId: id }) })
const request = (method: string, body?: unknown, override = {}) => new NextRequest(origin + '/api/ideas/' + ideaId + '/feedback', {
  method, headers: { origin, 'content-type': 'application/json', ...override }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
})
const record = (overrides = {}) => ({ action: 'record', requestId: randomUUID(), kind: 'review', content: 'The stock screen is useful, but monthly pricing is expensive.',
  sourceLabel: 'Synthetic interview', consent: true, noticeVersion: LEGAL.version, ...overrides })
const modelResult = (options: { privateContext: string; schema: z.ZodSchema<FeedbackAnalysis> }) => {
  const records = JSON.parse(options.privateContext).records as { id: string; content: string; sentiment: string | null }[]
  const data = { ...structuredClone(feedbackAnalysis), observations: records.map(item => ({ recordId: item.id, sentiment: item.sentiment ?? 'mixed', quote: item.content.slice(0, 35),
    reason: 'The supplied record contains an observation to verify in a behavioral experiment.', aspects: ['Customer task'] })),
    themes: feedbackAnalysis.themes.map(theme => ({ ...theme, recordIds: [records[0].id] })) }
  return { data: options.schema.parse(data), provider: 'synthetic-provider', tokensUsed: 120 }
}

beforeAll(async () => {
  const { generateDrizzleJson, generateMigration } = await import('drizzle-kit/api')
  for (const statement of await generateMigration(generateDrizzleJson({}), generateDrizzleJson(schema))) await state.client.exec(statement)
  await state.client.exec('CREATE ROLE anon; CREATE ROLE authenticated;')
  const migration = await readFile(new URL('../drizzle/0008_customer_feedback.sql', import.meta.url), 'utf8')
  const executionLeaseMigration = await readFile(new URL('../drizzle/0015_ai_execution_leases.sql', import.meta.url), 'utf8')
  await state.client.exec(migration); await state.client.exec(migration)
  await state.client.exec(executionLeaseMigration); await state.client.exec(executionLeaseMigration)
}, 30_000)
beforeEach(async () => {
  vi.resetAllMocks(); vi.stubEnv('NEXT_PUBLIC_APP_URL', origin); vi.stubEnv('NODE_ENV', 'test')
  await state.client.exec('TRUNCATE users CASCADE')
  const now = new Date()
  await db.insert(schema.users).values([ownerId, otherId].map(id => ({ id, email: id + '@example.test', supabaseId: 'auth-' + id, purchasedCredits: 200,
    creditBalance: 0, rewardCredits: 0, creditCycleStartedAt: now, creditResetAt: new Date(now.getTime() + 30 * 86_400_000), creditCycleAllowance: 0 })))
  await db.insert(schema.ideas).values([ideaId, otherIdea].map((id, index) => ({ id, userId: index ? otherId : ownerId, name: 'Synthetic shop tool', industry: 'Software',
    product: 'Stock planning', targetCustomer: 'Small shop owners', location: 'India', businessModel: 'Subscription', coreProblem: 'Stock checks take too long', proposedSolution: 'Weekly reminders' })))
  state.auth.mockResolvedValue({ data: { user: { id: 'auth-' + ownerId, email_confirmed_at: now.toISOString() } } })
  state.rate.mockResolvedValue({ success: true }); state.concurrency.mockResolvedValue({ allowed: true }); state.release.mockResolvedValue(undefined)
  state.generate.mockImplementation(async options => modelResult(options))
})
afterEach(() => vi.unstubAllEnvs())
afterAll(async () => state.client.close())

describe('owner-scoped customer notebook', () => {
  it('scrubs personal contact details from source labels before storing or sending them to analysis', async () => {
    const added = await (await POST(request('POST', record({ sourceLabel: 'Interview with alice@example.com, call +1 415-555-0198' })), context())).json()
    expect(added.records[0].sourceLabel).toContain('[email removed]')
    expect(added.records[0].sourceLabel).toContain('[phone removed]')
    expect(added.records[0].sourceLabel).not.toContain('alice@example.com')
    expect(added.records[0].sourceLabel).not.toContain('415-555-0198')

    const response = await POST(request('POST', { action: 'analyze', consent: true, noticeVersion: LEGAL.version }), context())
    expect(response.status).toBe(200)
    const modelContext = state.generate.mock.calls[0][0].privateContext
    expect(modelContext).not.toContain('alice@example.com')
    expect(modelContext).not.toContain('415-555-0198')
  })
  it('persists review-feed provenance and individual topic links without changing existing markup compatibility', async () => {
    const feedUrl = 'https://wordpress.org/support/plugin/woocommerce/reviews/feed/'
    const topicUrl = 'https://wordpress.org/support/topic/synthetic-review-fixture/'
    state.publicReviews.mockResolvedValueOnce({ reviews: [{ content: 'The setup is useful but support is slow for this synthetic example.', rating: 5,
      occurredAt: '2026-11-10T12:40:39+00:00', sourceUrl: topicUrl }], provenance: 'public_review_feed', availableReviewCount: 30,
      extractionCapped: false, countIsLowerBound: true, limitations: ['Publisher-limited review feed; this is not a unique-customer count.'],
      source: { url: feedUrl, source: 'wordpress.org', fetchedAt: new Date().toISOString() } })
    const result = await POST(request('POST', { action: 'import', requestId: randomUUID(), url: feedUrl, consent: true, noticeVersion: LEGAL.version }), context())
    expect(result.status).toBe(200)
    const saved = await result.json()
    expect(saved.records[0]).toMatchObject({ provenance: 'public_review_feed', sourceUrl: topicUrl, occurredAt: '2026-11-10T12:40:39+00:00', rating: 5 })
    expect(saved).toMatchObject({ countIsLowerBound: true, creditsCharged: 0 })
    const migration = await readFile(new URL('../drizzle/0008_customer_feedback.sql', import.meta.url), 'utf8')
    await state.client.exec(migration); await state.client.exec(migration)
    expect((await readFeedbackView(ideaId, ownerId)).records[0].provenance).toBe('public_review_feed')
    expect(state.generate).not.toHaveBeenCalled()
  })
  it('stores anonymous records once across retries and exposes them without an interview', async () => {
    const payload = record({ content: 'Contact person@example.test; the stock screen is easy but expensive.' })
    const first = await POST(request('POST', payload), context()); expect(first.status).toBe(200)
    const firstData = await first.json(); expect(firstData.added).toBe(1); expect(firstData.records[0].content).not.toContain('person@example.test')
    const retry = await POST(request('POST', payload), context()); expect((await retry.json()).duplicates).toBe(1)
    expect((await readFeedbackView(ideaId, ownerId)).records).toHaveLength(1)
    expect(JSON.parse(await loadCustomerFeedbackContext(ideaId, ownerId)).records).toHaveLength(1)
    expect(JSON.parse(await loadFounderContext(ideaId, ownerId)).kind).toBe('private_customer_evidence')
    expect(await loadCustomerFeedbackContext(ideaId, otherId)).toBe('')
    expect((await db.query.users.findFirst({ where: eq(schema.users.id, ownerId) }))?.purchasedCredits).toBe(200)
  })
  it('blocks unauthenticated, unverified, cross-account, stale and cross-origin mutations', async () => {
    state.auth.mockResolvedValueOnce({ data: { user: null } }); expect((await GET(request('GET'), context())).status).toBe(401)
    expect((await GET(request('GET'), context(otherIdea))).status).toBe(404)
    expect((await POST(request('POST', record(), { origin: 'https://attacker.example.org' }), context())).status).toBe(403)
    state.auth.mockResolvedValueOnce({ data: { user: { id: 'auth-' + ownerId } } }); expect((await POST(request('POST', record()), context())).status).toBe(403)
    expect((await POST(request('POST', record({ noticeVersion: 'old' })), context())).status).toBe(400)
    expect((await POST(request('POST', record({ sourceUrl: 'http://127.0.0.1/private' })), context())).status).toBe(400)
    expect((await POST(request('POST', record({ occurredAt: '2030-01-01T00:00:00.000Z' })), context())).status).toBe(400)
    expect(state.generate).not.toHaveBeenCalled()
  })
  it('keeps a read-only notebook available to review while rejecting edits', async () => {
    await POST(request('POST', record()), context())
    await db.update(schema.ideas).set({ isReadOnly: true }).where(eq(schema.ideas.id, ideaId))
    const view = await GET(request('GET'), context())
    expect(view.status).toBe(200)
    expect(await view.json()).toMatchObject({ readOnly: true, totalRecords: 1 })
    expect((await POST(request('POST', record()), context())).status).toBe(403)
    expect(state.generate).not.toHaveBeenCalled()
  })
  it('analyzes exact recorded evidence once and charges only one successfully saved snapshot', async () => {
    await POST(request('POST', record()), context())
    const input = { action: 'analyze', consent: true, noticeVersion: LEGAL.version }
    const responses = await Promise.all([POST(request('POST', input), context()), POST(request('POST', input), context())])
    expect(responses.map(response => response.status)).toEqual([200, 200])
    const payloads = await Promise.all(responses.map(response => response.json()))
    expect(payloads.map(value => value.creditsCharged).sort()).toEqual([0, 20])
    expect((await db.query.users.findFirst({ where: eq(schema.users.id, ownerId) }))?.purchasedCredits).toBe(180)
    expect(await db.select().from(schema.customerFeedbackAnalyses)).toHaveLength(1)
    expect(await db.select().from(schema.creditLedger)).toHaveLength(1)
    const count = state.generate.mock.calls.length
    expect((await (await POST(request('POST', input), context())).json()).creditsCharged).toBe(0)
    expect(state.generate).toHaveBeenCalledTimes(count)
    expect(state.generate.mock.calls[0][0]).toMatchObject({ agentRole: 'customer', researchMode: 'reuse', maxResearchRounds: 0, maxModelCalls: 2, privateContextMaxChars: 384_000 })
  })
  it('blocks customer analysis when validation already occupies the shared platform capacity', async () => {
    vi.stubEnv('AI_GLOBAL_ACTIVE_RUNS', '1')
    await POST(request('POST', record()), context())
    await db.insert(schema.validationJobs).values({ userId: ownerId, ideaId, status: 'running', isLite: true })
    const response = await POST(request('POST', { action: 'analyze', consent: true, noticeVersion: LEGAL.version }), context())
    expect(response.status).toBe(429)
    expect(state.generate).not.toHaveBeenCalled()
    expect(await db.select().from(schema.aiExecutionLeases)).toHaveLength(0)
    expect((await db.query.users.findFirst({ where: eq(schema.users.id, ownerId) }))?.purchasedCredits).toBe(200)
  })
  it('sends a late customer complaint intact and saves its grounded quote instead of a prefix-only sentiment', async () => {
    const ending = 'But after renewal the lost invoices made me cancel my subscription.'
    const content = 'The stock screen looked easy. ' + 'I checked stock every week. '.repeat(80) + ending
    const added = await POST(request('POST', record({ content })), context())
    expect(added.status).toBe(200)
    state.generate.mockImplementationOnce(async options => {
      const selected = JSON.parse(options.privateContext).records
      expect(selected[0].content).toBe(content)
      expect(selected[0].excerpted).toBe(false)
      const result = modelResult(options)
      result.data.observations[0].quote = ending
      return { ...result, data: options.schema.parse(result.data) }
    })
    const response = await POST(request('POST', { action: 'analyze', consent: true, noticeVersion: LEGAL.version }), context())
    expect(response.status).toBe(200)
    const saved = await response.json()
    expect(saved.analysis.data.observations[0].quote).toBe(ending)
    expect(saved.analysis.analyzedRecords).toBe(1)
    expect(saved.creditsCharged).toBe(20)
  })
  it('does not spend credits or publish a fabricated/failed analysis', async () => {
    await POST(request('POST', record()), context())
    state.generate.mockResolvedValueOnce({ data: feedbackAnalysis, tokensUsed: 120, provider: 'bad-fixture' })
    const failed = await POST(request('POST', { action: 'analyze', consent: true, noticeVersion: LEGAL.version }), context())
    expect(failed.status).toBe(503); expect(await db.select().from(schema.customerFeedbackAnalyses)).toHaveLength(0)
    expect((await db.query.users.findFirst({ where: eq(schema.users.id, ownerId) }))?.purchasedCredits).toBe(200)
    expect(state.release).toHaveBeenCalledTimes(1)
  })
  it('blocks a late analysis from restoring removed evidence and its derived quotes', async () => {
    const added = await (await POST(request('POST', record()), context())).json()
    state.generate.mockImplementationOnce(async options => {
      const generated = modelResult(options)
      await deleteFeedbackRecord(ideaId, ownerId, added.records[0].id)
      return generated
    })
    expect((await POST(request('POST', { action: 'analyze', consent: true, noticeVersion: LEGAL.version }), context())).status).toBe(409)
    expect((await readFeedbackView(ideaId, ownerId)).records).toEqual([])
    expect(await db.select().from(schema.customerFeedbackAnalyses)).toHaveLength(0)
    expect((await db.query.users.findFirst({ where: eq(schema.users.id, ownerId) }))?.purchasedCredits).toBe(200)
  })
  it('clears previous analyses when a label is reviewed or a record is removed', async () => {
    const added = await (await POST(request('POST', record()), context())).json()
    await POST(request('POST', { action: 'analyze', consent: true, noticeVersion: LEGAL.version }), context())
    expect((await PATCH(request('PATCH', { id: added.records[0].id, sentiment: 'negative' }), context())).status).toBe(200)
    expect(await db.select().from(schema.customerFeedbackAnalyses)).toHaveLength(0)
    expect((await readFeedbackView(ideaId, ownerId)).records[0].sentiment).toBe('negative')
    expect((await DELETE(request('DELETE', { id: added.records[0].id }), context())).status).toBe(200)
    expect((await readFeedbackView(ideaId, ownerId)).records).toHaveLength(0)
  })
  it('imports source-linked public review records without treating a failed page as evidence', async () => {
    state.publicReviews.mockRejectedValueOnce(new Error('Blocked'))
    const input = { action: 'import', url: 'https://reviews.example.org/product', requestId: randomUUID(), consent: true, noticeVersion: LEGAL.version }
    expect((await POST(request('POST', input), context())).status).toBe(422)
    state.publicReviews.mockResolvedValue({ reviews: [{ content: feedbackRecords[0].content, rating: 3, occurredAt: null }], availableReviewCount: 1, limitations: ['One page, selected unique texts.'],
      source: { source: 'reviews.example.org', url: input.url, fetchedAt: new Date().toISOString() } })
    const added = await (await POST(request('POST', input), context())).json()
    expect(added.records[0]).toMatchObject({ provenance: 'public_review_markup', sourceUrl: input.url, occurredAt: null }); expect(added.creditsCharged).toBe(0)
    expect((await (await POST(request('POST', input), context())).json()).duplicates).toBe(1)
    expect(state.generate).not.toHaveBeenCalled()
  })
  it('replays the reviewed migration and denies browser database roles', async () => {
    await POST(request('POST', record()), context())
    await state.client.exec('SET ROLE authenticated')
    try { await expect(state.client.query('SELECT * FROM customer_feedback')).rejects.toThrow() } finally { await state.client.exec('RESET ROLE') }
  })
  it('rejects a changed save reference and applies the notebook cap transactionally', async () => {
    const input = record(); await POST(request('POST', input), context())
    expect((await POST(request('POST', { ...input, content: 'A different complaint using the old save identifier.' }), context())).status).toBe(409)
    const bulk = Array.from({ length: 199 }, (_, index) => ({ ...feedbackRecords[0], content: 'Synthetic customer record number ' + index + ' about repeated stock checks.', requestId: randomUUID() }))
    for (let index = 0; index < bulk.length; index += 20) await saveFeedbackRecords(ideaId, ownerId, bulk.slice(index, index + 20))
    expect((await readFeedbackView(ideaId, ownerId)).records).toHaveLength(200)
    expect((await POST(request('POST', record({ content: 'This new record should exceed the notebook limit.' })), context())).status).toBe(409)
  })
  it('rejects changed rating/sentiment replay and never resurrects a removed request', async () => {
    const input = record({ rating: 5, sentiment: 'positive' })
    const added = await (await POST(request('POST', input), context())).json()
    expect((await POST(request('POST', { ...input, rating: 1, sentiment: 'negative' }), context())).status).toBe(409)
    await DELETE(request('DELETE', { id: added.records[0].id }), context())
    expect((await POST(request('POST', input), context())).status).toBe(409)
    const [tombstone] = await db.select().from(schema.customerFeedback)
    expect(tombstone.content).toBe('[record removed]'); expect(tombstone.sourceUrl).toBeNull()
    expect((await POST(request('POST', { ...input, requestId: randomUUID() }), context())).status).toBe(200)
  })
  it('invalidates a saved analysis after the idea brief changes and rejects a late result for the old brief', async () => {
    await POST(request('POST', record({ occurredAt: '2026-11-01' })), context())
    const input = { action: 'analyze', consent: true, noticeVersion: LEGAL.version }
    await POST(request('POST', input), context())
    await db.update(schema.ideas).set({ coreProblem: 'A changed customer problem requiring a new interpretation.' }).where(eq(schema.ideas.id, ideaId))
    expect((await readFeedbackView(ideaId, ownerId)).staleAnalysis).toBe(true)
    state.generate.mockImplementationOnce(async options => {
      const result = modelResult(options)
      await db.update(schema.ideas).set({ targetCustomer: 'A changed buyer segment.' }).where(eq(schema.ideas.id, ideaId))
      return result
    })
    expect((await POST(request('POST', input), context())).status).toBe(409)
    expect((await db.query.users.findFirst({ where: eq(schema.users.id, ownerId) }))?.purchasedCredits).toBe(180)
    expect((await readFeedbackView(ideaId, ownerId)).records[0].occurredAt).toBe('2026-11-01')
  })
  it.each(['deactivated', 'read-only', 'record-addition', 'sentiment-edit'])('does not charge or save when %s changes during analysis', async change => {
    const added = await (await POST(request('POST', record()), context())).json()
    state.generate.mockImplementationOnce(async options => {
      const result = modelResult(options)
      if (change === 'deactivated') await db.update(schema.users).set({ accountStatus: 'deactivated' }).where(eq(schema.users.id, ownerId))
      if (change === 'read-only') await db.update(schema.ideas).set({ isReadOnly: true }).where(eq(schema.ideas.id, ideaId))
      if (change === 'record-addition') await saveFeedbackRecords(ideaId, ownerId, [{ ...feedbackRecords[0], content: 'A new customer observation arrived while the older report was processing.', requestId: randomUUID() }])
      if (change === 'sentiment-edit') await db.update(schema.customerFeedback).set({ sentiment: 'negative' }).where(eq(schema.customerFeedback.id, added.records[0].id))
      return result
    })
    const response = await POST(request('POST', { action: 'analyze', consent: true, noticeVersion: LEGAL.version }), context())
    expect(response.status).toBe(['deactivated', 'read-only'].includes(change) ? 403 : 409)
    expect((await db.query.users.findFirst({ where: eq(schema.users.id, ownerId) }))?.purchasedCredits).toBe(200)
    expect(await db.select().from(schema.customerFeedbackAnalyses)).toHaveLength(0)
  })
})
