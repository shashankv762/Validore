import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type Stripe from 'stripe'
import { randomUUID } from 'node:crypto'
import { and, eq, sql } from 'drizzle-orm'
import { db } from '@/db'
import { users, ideas, validationJobs, validationReports, creditLedger, tierConfig } from '@/db/schema'
import { syncUserToDatabase } from '@/lib/auth-sync'
import { checkCredits, deductCredits, refundValidationCredits, topUpMonthlyCredits } from '@/lib/credits'
import { failValidationJob, completeValidationJob, reapStaleValidationJobs } from '@/lib/validation/jobs'
import { reconcileStripeCredits } from '@/lib/subscription-credits'
import { PIPELINE_LITE_REPLY } from './fixtures/agent-payloads'

const enabled = Boolean(process.env.TEST_DATABASE_URL && process.env.TEST_DATABASE_URL === process.env.DATABASE_URL)
describe.skipIf(!enabled)('Isolated PostgreSQL release checks', () => {
  beforeAll(async () => {
    const [row] = await db.execute(sql`select current_schema() as schema`)
    if (!String(row.schema).startsWith('validore_test_')) throw new Error('Integration tests require an isolated validore_test_ schema')
  })
  beforeEach(async () => { await db.delete(tierConfig) })
  afterAll(async () => { await db.$client.end({ timeout: 2 }) })
  afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs() })

  const profile = async () => {
    const id = randomUUID()
    return (await syncUserToDatabase({ id, email: `${id}@example.com` }, { createNew: true }))!
  }
  const providerPeriod = (customer: string, start: Date, end: Date) => ({
    id: 'sub_test_' + customer, customer, status: 'active', cancel_at_period_end: false,
    items: { data: [{ price: { id: 'price_testpremium' }, current_period_start: start.getTime() / 1000,
      current_period_end: end.getTime() / 1000 }] },
  }) as Stripe.Subscription
  const reconcile = (userId: string, subscription: Stripe.Subscription, now: Date) => db.transaction(async tx => {
    const [user] = await tx.select().from(users).where(eq(users.id, userId)).for('update')
    return reconcileStripeCredits(tx, user, subscription, now)
  })

  it('provisions one profile and initial allowance for simultaneous first logins', async () => {
    const id = randomUUID()
    const results = await Promise.all(Array.from({ length: 4 }, () => syncUserToDatabase({ id, email: `${id}@example.com` }, { createNew: true })))
    expect(new Set(results.map(user => user?.id)).size).toBe(1)
    expect(results.every(user => user?.creditBalance === 0 && user.purchasedCredits === 200)).toBe(true)
  })

  it('never overspends credits or the monthly allowance under concurrent requests', async () => {
    const user = await profile()
    const outcomes = await Promise.all(Array.from({ length: 4 }, () => deductCredits(user.id, 50, 'VALIDATION', randomUUID(), 2)))
    expect(outcomes.filter(Boolean)).toHaveLength(2)
    const saved = await db.query.users.findFirst({ where: eq(users.id, user.id) })
    expect(saved?.creditBalance).toBe(0)
    expect(saved?.validationsThisMonth).toBe(2)
  })

  it('keeps Free carried credits without an automatic monthly refill', async () => {
    const user = await profile()
    await db.update(users).set({ creditBalance: 0, purchasedCredits: 17, creditResetAt: new Date(0) }).where(eq(users.id, user.id))
    expect(await checkCredits(user.id, 50)).toEqual({ allowed: false, balance: 17 })
    expect(await deductCredits(user.id, 50, 'TEST')).toBe(false)
    expect(await topUpMonthlyCredits(user.id)).toBe(false)
    const saved = await db.query.users.findFirst({ where: eq(users.id, user.id) })
    expect(saved?.creditBalance).toBe(0)
    expect(saved?.purchasedCredits).toBe(17)
  })

  it.each([new Date(0), null])('recovers a stale job with updatedAt=%s exactly once and rejects completion after its refund', async (updatedAt) => {
    const user = await profile()
    const [idea] = await db.insert(ideas).values({ userId: user.id, name: 'Isolated release test', industry: 'Software', product: 'Planner', targetCustomer: 'Founders', location: 'India', businessModel: 'SaaS', coreProblem: 'Planning is slow', proposedSolution: 'Guided planning' }).returning()
    const [job] = await db.insert(validationJobs).values({ userId: user.id, ideaId: idea.id, status: 'running', createdAt: new Date(0), updatedAt, isLite: true }).returning()
    await deductCredits(user.id, 50, 'VALIDATION', job.id, 2)
    await Promise.all([reapStaleValidationJobs(job.id), failValidationJob(job.id)])
    const saved = await db.query.users.findFirst({ where: eq(users.id, user.id) })
    expect(saved?.creditBalance).toBe(0)
    expect(saved?.purchasedCredits).toBe(200)
    expect(saved?.validationsThisMonth).toBe(0)
    const refunds = await db.select().from(creditLedger).where(and(eq(creditLedger.userId, user.id), eq(creditLedger.transactionType, 'VALIDATION_REFUND')))
    expect(refunds).toHaveLength(1)
    await expect(completeValidationJob(job.id, {} as Parameters<typeof completeValidationJob>[1])).rejects.toThrow('already refunded')
  })
  it('persists a fractional cached report exactly once through concurrent completion', async () => {
    const user = await profile()
    const [idea] = await db.insert(ideas).values({ userId: user.id, name: 'Fractional score test', industry: 'Software', product: 'Planner',
      targetCustomer: 'Founders', location: 'India', businessModel: 'SaaS', coreProblem: 'Planning is slow', proposedSolution: 'Guided planning' }).returning()
    const [job] = await db.insert(validationJobs).values({ userId: user.id, ideaId: idea.id, status: 'running', isLite: true }).returning()
    const report = { ...PIPELINE_LITE_REPLY, problemScore: 12.5, marketScore: 6.4, financialScore: 9.1,
      overallScore: 999, provider: 'synthetic', tokensUsed: 17 } as Parameters<typeof completeValidationJob>[1]
    const results = await Promise.all(Array.from({ length: 4 }, () => completeValidationJob(job.id, report)))
    expect(new Set(results).size).toBe(1)
    const saved = await db.select().from(validationReports).where(eq(validationReports.jobId, job.id))
    expect(saved).toHaveLength(1)
    expect(saved[0]).toMatchObject({ problemScore: 13, marketScore: 6, financialScore: 5, overallScore: 43,
      reportData: { problemScore: 13, overallScore: 43 } })
  })
  it.each([['2026-02-01', '2026-03-01'], ['2026-04-01', '2026-05-01'], ['2026-10-01', '2026-11-01']])(
    'restores current-period credits on an immediate failure for %s–%s', async (startText, endText) => {
      const user = await profile()
      const start = new Date(startText), end = new Date(endText), now = new Date(start.getTime() + 3600_000)
      const customer = 'cus_' + user.id
      await db.update(users).set({ stripeCustomerId: customer, purchasedCredits: 40, rewardCredits: 30 }).where(eq(users.id, user.id))
      vi.stubEnv('STRIPE_PREMIUM_PRICE_ID', 'price_testpremium')
      await reconcile(user.id, providerPeriod(customer, start, end), now)
      vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(now)
      const job = randomUUID()
      expect(await deductCredits(user.id, 300, 'VALIDATION', job, 10)).toBe(true)
      await Promise.all(Array.from({ length: 4 }, () => refundValidationCredits(user.id, job)))
      const saved = await db.query.users.findFirst({ where: eq(users.id, user.id) })
      expect(saved).toMatchObject({ creditBalance: 1500, creditsUsedThisCycle: 0, purchasedCredits: 40, rewardCredits: 30 })
      const refunds = await db.select().from(creditLedger).where(and(eq(creditLedger.userId, user.id), eq(creditLedger.transactionType, 'VALIDATION_REFUND')))
      expect(refunds).toHaveLength(1)
    })
  it('serializes concurrent renewal replays with spending and preserves each debit', async () => {
    const user = await profile(), customer = 'cus_' + randomUUID()
    const start = new Date('2026-12-01'), end = new Date('2027-01-01'), now = new Date('2026-12-01T01:00:00Z')
    await db.update(users).set({ stripeCustomerId: customer }).where(eq(users.id, user.id))
    vi.stubEnv('STRIPE_PREMIUM_PRICE_ID', 'price_testpremium')
    const subscription = providerPeriod(customer, start, end)
    await reconcile(user.id, subscription, now)
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(now)
    await Promise.all([
      reconcile(user.id, subscription, now), deductCredits(user.id, 300, 'TEST'),
      reconcile(user.id, subscription, now), deductCredits(user.id, 300, 'TEST'),
    ])
    const saved = await db.query.users.findFirst({ where: eq(users.id, user.id) })
    expect(saved).toMatchObject({ creditBalance: 900, creditsUsedThisCycle: 600, creditCycleStartedAt: start, creditResetAt: end })
  })
  it('never renews a paid tier lacking a billing identity', async () => {
    const user = await profile()
    await db.update(users).set({ tier: 'premium', subscriptionId: null, stripeCustomerId: null,
      creditBalance: 0, creditResetAt: new Date(0), purchasedCredits: 40, rewardCredits: 30 }).where(eq(users.id, user.id))
    expect(await checkCredits(user.id, 300)).toEqual({ allowed: false, balance: 70 })
    expect(await deductCredits(user.id, 300, 'TEST')).toBe(false)
    expect((await db.query.users.findFirst({ where: eq(users.id, user.id) }))?.creditBalance).toBe(0)
  })
  it('preserves monthly consumption across same-period tier switches', async () => {
    const user = await profile(), customer = 'cus_' + randomUUID()
    const start = new Date('2026-10-01'), end = new Date('2026-11-01'), now = new Date('2026-10-01T01:00:00Z')
    await db.update(users).set({ stripeCustomerId: customer }).where(eq(users.id, user.id))
    vi.stubEnv('STRIPE_PREMIUM_PRICE_ID', 'price_testpremium'); vi.stubEnv('STRIPE_MAX_PREMIUM_PRICE_ID', 'price_testmax')
    const premium = providerPeriod(customer, start, end)
    const max = { ...premium, items: { data: premium.items.data.map(item => ({ ...item, price: { ...item.price, id: 'price_testmax' } })) } } as Stripe.Subscription
    await reconcile(user.id, max, now)
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(now)
    await deductCredits(user.id, 2000, 'TEST')
    await reconcile(user.id, premium, now); await reconcile(user.id, max, now)
    await reconcile(user.id, premium, now); await reconcile(user.id, max, now)
    expect(await db.query.users.findFirst({ where: eq(users.id, user.id) })).toMatchObject({
      creditBalance: 2500, monthlyCreditsUsedThisCycle: 2000, creditsUsedThisCycle: 2000 })
  })
  it('returns nonexpiring sources across an expired paid period without any Stripe access', async () => {
    const user = await profile(), customer = 'cus_' + randomUUID()
    const start = new Date('2026-10-01'), end = new Date('2026-11-01'), now = new Date('2026-10-31T23:59:00Z')
    await db.update(users).set({ stripeCustomerId: customer, purchasedCredits: 40, rewardCredits: 30 }).where(eq(users.id, user.id))
    vi.stubEnv('STRIPE_PREMIUM_PRICE_ID', 'price_testpremium')
    await reconcile(user.id, providerPeriod(customer, start, end), now)
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(now)
    await db.update(users).set({ creditBalance: 10, monthlyCreditsUsedThisCycle: 1490 }).where(eq(users.id, user.id))
    const job = randomUUID()
    await deductCredits(user.id, 50, 'VALIDATION', job)
    vi.setSystemTime(new Date('2026-11-01T00:01:00Z')); vi.stubEnv('STRIPE_SECRET_KEY', '')
    await Promise.all(Array.from({ length: 4 }, () => refundValidationCredits(user.id, job)))
    expect(await db.query.users.findFirst({ where: eq(users.id, user.id) })).toMatchObject({ creditBalance: 0, purchasedCredits: 40, rewardCredits: 30 })
    const refunds = await db.select().from(creditLedger).where(and(eq(creditLedger.userId, user.id), eq(creditLedger.transactionType, 'VALIDATION_REFUND')))
    expect(refunds).toHaveLength(1); expect(refunds[0].amount).toBe(40)
  })
  it('recognizes a grandfathered paid price after a configured checkout price changes', async () => {
    const user = await profile(), customer = 'cus_' + randomUUID()
    const start = new Date('2026-10-01'), end = new Date('2026-11-01'), now = new Date('2026-10-01T01:00:00Z')
    await db.update(users).set({ stripeCustomerId: customer }).where(eq(users.id, user.id))
    await db.insert(tierConfig).values({ tier: 'premium', stripePriceId: 'price_newpremium', stripePriceHistory: ['price_testpremium'],
      monthlyCredits: 2100, monthlyValidationLimit: 15, maxActiveIdeas: 10, maxConcurrentRequests: 3, maxTokensPerCall: 8000 })
    await reconcile(user.id, providerPeriod(customer, start, end), now)
    expect(await db.query.users.findFirst({ where: eq(users.id, user.id) })).toMatchObject({ tier: 'premium', creditBalance: 2100, creditCycleAllowance: 2100 })
  })
  it('preserves current-cycle allocation across edits and replay, then applies the edited allowance at renewal', async () => {
    const user = await profile(), customer = 'cus_' + randomUUID()
    const start = new Date('2026-10-01'), end = new Date('2026-11-01'), now = new Date('2026-10-01T01:00:00Z')
    await db.update(users).set({ stripeCustomerId: customer }).where(eq(users.id, user.id))
    vi.stubEnv('STRIPE_PREMIUM_PRICE_ID', 'price_testpremium')
    const subscription = providerPeriod(customer, start, end)
    await reconcile(user.id, subscription, now)
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(now)
    const job = randomUUID()
    await deductCredits(user.id, 300, 'VALIDATION', job, 15)
    await db.insert(tierConfig).values({ tier: 'premium', monthlyCredits: 2500, monthlyValidationLimit: 15,
      maxActiveIdeas: 10, maxConcurrentRequests: 3, maxTokensPerCall: 8000 })
    await Promise.all([reconcile(user.id, subscription, now), reconcile(user.id, subscription, now)])
    expect(await db.query.users.findFirst({ where: eq(users.id, user.id) })).toMatchObject({ creditBalance: 1200, creditCycleAllowance: 1500 })
    await refundValidationCredits(user.id, job)
    expect(await db.query.users.findFirst({ where: eq(users.id, user.id) })).toMatchObject({ creditBalance: 1500, creditCycleAllowance: 1500 })
    const renewalStart = new Date('2026-11-01'), renewalEnd = new Date('2026-12-01'), renewalNow = new Date('2026-11-01T01:00:00Z')
    vi.setSystemTime(renewalNow)
    await reconcile(user.id, providerPeriod(customer, renewalStart, renewalEnd), renewalNow)
    expect(await db.query.users.findFirst({ where: eq(users.id, user.id) })).toMatchObject({ creditBalance: 2500, creditCycleAllowance: 2500, monthlyCreditsUsedThisCycle: 0 })
  })
})
