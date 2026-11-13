import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import type { PGlite } from '@electric-sql/pglite'
import type Stripe from 'stripe'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'

const state = vi.hoisted(() => ({ client: null as unknown as PGlite, retrieve: vi.fn() }))
vi.mock('@/db', async () => {
  const { PGlite } = await import('@electric-sql/pglite')
  const { drizzle } = await import('drizzle-orm/pglite')
  const schema = await import('@/db/schema')
  state.client = new PGlite()
  return { db: drizzle(state.client, { schema }) }
})
vi.mock('@/lib/billing', () => ({ stripeBillingClient: () => ({ subscriptions: { retrieve: state.retrieve } }) }))
import { db } from '@/db'
import { creditLedger, users } from '@/db/schema'
import { checkCredits, deductCredits, refundValidationCredits, topUpMonthlyCredits } from '@/lib/credits'
import { reconcileStripeCredits } from '@/lib/subscription-credits'

const owner = '11111111-1111-4111-8111-111111111111'
const account = async () => (await db.query.users.findFirst({ where: eq(users.id, owner) }))!
const period = (start: string, end: string, status = 'active') => ({
  id: 'sub_test', customer: 'cus_test', status, cancel_at_period_end: false,
  items: { data: [{ price: { id: 'price_premium' }, current_period_start: new Date(start).getTime() / 1000,
    current_period_end: new Date(end).getTime() / 1000 }] },
}) as Stripe.Subscription
const apply = (subscription: Stripe.Subscription) => db.transaction(async tx => {
  const [user] = await tx.select().from(users).where(eq(users.id, owner)).for('update')
  return reconcileStripeCredits(tx, user, subscription)
})
beforeAll(async () => {
  await state.client.exec(`CREATE TYPE tier AS ENUM ('free', 'premium', 'max_premium');
    CREATE TABLE users (
      id uuid PRIMARY KEY, email text NOT NULL UNIQUE, supabase_id text NOT NULL UNIQUE,
      tier tier NOT NULL DEFAULT 'free', stripe_customer_id text, razorpay_customer_id text,
      subscription_id text, subscription_status text, cancel_at_period_end boolean DEFAULT false,
      current_period_end timestamp, is_founding_member boolean DEFAULT false,
      crowdfunding_credits integer NOT NULL DEFAULT 0, pitch_deck_credits integer NOT NULL DEFAULT 0,
      validations_this_month integer NOT NULL DEFAULT 0, validation_reset_at timestamp,
      credit_balance integer NOT NULL DEFAULT 0, purchased_credits integer NOT NULL DEFAULT 0,
      reward_credits integer NOT NULL DEFAULT 0, credits_used_this_cycle integer NOT NULL DEFAULT 0,
      credit_reset_at timestamp, preferred_ai_provider text DEFAULT 'free_models', encrypted_openrouter_key text,
      created_at timestamp DEFAULT now(), updated_at timestamp DEFAULT now());
    CREATE TABLE credit_ledger (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id),
      amount integer NOT NULL, transaction_type text NOT NULL, description text, created_at timestamp DEFAULT now());`)
  await state.client.exec(await readFile(new URL('../drizzle/0005_credit_cycle_start.sql', import.meta.url), 'utf8'))
}, 30_000)
beforeEach(async () => {
  vi.stubEnv('STRIPE_PREMIUM_PRICE_ID', 'price_premium')
  state.retrieve.mockReset()
  await state.client.exec('TRUNCATE users, credit_ledger CASCADE')
  await db.insert(users).values({ id: owner, email: 'cycle@example.test', supabaseId: owner, stripeCustomerId: 'cus_test',
    creditBalance: 100, purchasedCredits: 40, rewardCredits: 30 })
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs() })
afterAll(() => state.client.close())

describe('Exact billing cycles with PostgreSQL transactions', () => {
  it.each([
    ['2026-02-01', '2026-03-01'], ['2026-04-01', '2026-05-01'], ['2026-10-01', '2026-11-01'],
  ])('refunds an immediate failure at the beginning of %s–%s', async (start, end) => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(start + 'T01:00:00Z'))
    await apply(period(start, end))
    const job = randomUUID()
    expect(await deductCredits(owner, 300, 'VALIDATION', job, 10)).toBe(true)
    const [debit] = await db.select().from(creditLedger)
    expect(JSON.parse(debit.description!).cycleStartedAt).toBe(new Date(start).toISOString())
    await Promise.all([refundValidationCredits(owner, job), refundValidationCredits(owner, job)])
    expect(await account()).toMatchObject({ creditBalance: 1500, purchasedCredits: 40, rewardCredits: 30, creditsUsedThisCycle: 0 })
    expect((await db.select().from(creditLedger)).filter(row => row.transactionType === 'VALIDATION_REFUND')).toHaveLength(1)
  })
  it('hydrates a legacy paid cycle without overwriting prior spending', async () => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-01T01:00:00Z'))
    await db.update(users).set({ tier: 'premium', stripeCustomerId: 'cus_test', subscriptionId: 'sub_test',
      creditBalance: 1200, creditsUsedThisCycle: 300, creditResetAt: new Date('2026-11-01') }).where(eq(users.id, owner))
    state.retrieve.mockResolvedValue(period('2026-10-01', '2026-11-01'))
    expect(await checkCredits(owner, 300)).toMatchObject({ allowed: true })
    expect(await account()).toMatchObject({ creditBalance: 1200, creditsUsedThisCycle: 300, creditCycleStartedAt: new Date('2026-10-01') })
  })
  it('preserves spending when a renewal webhook follows a lazy renewal and is replayed', async () => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-12-01T00:01:00Z'))
    await db.update(users).set({ tier: 'premium', stripeCustomerId: 'cus_test', subscriptionId: 'sub_test',
      creditBalance: 5, creditsUsedThisCycle: 1495, creditCycleStartedAt: new Date('2026-11-01'), creditResetAt: new Date('2026-12-01') }).where(eq(users.id, owner))
    const renewal = period('2026-12-01', '2027-01-01')
    state.retrieve.mockResolvedValue(renewal)
    expect(await deductCredits(owner, 300, 'VALIDATION', randomUUID(), 10)).toBe(true)
    await apply(renewal); await apply(renewal)
    expect(await account()).toMatchObject({ creditBalance: 1200, creditsUsedThisCycle: 300,
      creditCycleStartedAt: new Date('2026-12-01'), creditResetAt: new Date('2027-01-01') })
  })
  it('ignores an older cycle and does not grant another allocation when its end changes', async () => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-12-01T01:00:00Z'))
    await apply(period('2026-12-01', '2027-01-01'))
    await deductCredits(owner, 300, 'OTHER')
    await apply(period('2026-11-01', '2026-12-01'))
    await apply(period('2026-12-01', '2027-01-02'))
    expect(await account()).toMatchObject({ creditBalance: 1200, creditsUsedThisCycle: 300,
      creditCycleStartedAt: new Date('2026-12-01'), creditResetAt: new Date('2027-01-02') })
  })
  it('starts a Free cycle on cancellation while preserving purchased and earned credits', async () => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-01T01:00:00Z'))
    await apply(period('2026-10-01', '2026-11-01'))
    await apply(period('2026-10-01', '2026-11-01', 'canceled'))
    const cancelled = await account()
    expect(cancelled).toMatchObject({ tier: 'free', creditBalance: 100, purchasedCredits: 40, rewardCredits: 30,
      creditCycleStartedAt: new Date('2026-10-01T01:00:00Z') })
    await apply(period('2026-10-01', '2026-11-01', 'canceled'))
    expect((await account()).creditResetAt).toEqual(cancelled.creditResetAt)
  })
  it('does not refill from expired provider state while a payment renewal is unresolved', async () => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-12-01T00:01:00Z'))
    await db.update(users).set({ tier: 'premium', stripeCustomerId: 'cus_test', subscriptionId: 'sub_test',
      creditBalance: 500, creditCycleStartedAt: new Date('2026-11-01'), creditResetAt: new Date('2026-12-01') }).where(eq(users.id, owner))
    state.retrieve.mockResolvedValue(period('2026-11-01', '2026-12-01'))
    expect(await checkCredits(owner, 300)).toEqual({ allowed: false, balance: 70 })
    expect(await account()).toMatchObject({ creditBalance: 0, purchasedCredits: 40, rewardCredits: 30 })
  })
  it('does not restore expired monthly credits while the provider still reports the old period', async () => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-30T23:59:00Z'))
    const prior = period('2026-11-01', '2026-12-01')
    await apply(prior)
    const job = randomUUID()
    await deductCredits(owner, 300, 'VALIDATION', job, 10)
    vi.setSystemTime(new Date('2026-12-01T00:01:00Z'))
    state.retrieve.mockResolvedValue(prior)
    await refundValidationCredits(owner, job)
    expect(await account()).toMatchObject({ creditBalance: 1200, purchasedCredits: 40, rewardCredits: 30 })
    expect((await db.select().from(creditLedger)).find(row => row.transactionType === 'VALIDATION_REFUND')?.amount).toBe(0)
    expect(state.retrieve).not.toHaveBeenCalled()
  })
  it('refunds nonexpiring sources across a cycle without refilling the new monthly pool', async () => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-31T23:59:00Z'))
    await apply(period('2026-10-01', '2026-11-01'))
    await db.update(users).set({ creditBalance: 10 }).where(eq(users.id, owner))
    const job = randomUUID()
    expect(await deductCredits(owner, 50, 'VALIDATION', job, 10)).toBe(true)
    vi.setSystemTime(new Date('2026-11-01T00:01:00Z'))
    state.retrieve.mockResolvedValue(period('2026-11-01', '2026-12-01'))
    await topUpMonthlyCredits(owner)
    await deductCredits(owner, 300, 'OTHER')
    await refundValidationCredits(owner, job)
    expect(await account()).toMatchObject({ creditBalance: 1200, purchasedCredits: 40, rewardCredits: 30, creditsUsedThisCycle: 300 })
    expect((await db.select().from(creditLedger)).find(row => row.transactionType === 'VALIDATION_REFUND')?.amount).toBe(40)
  })
  it('uses legacy debit timestamps against the exact provider start', async () => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-01T01:00:00Z'))
    await apply(period('2026-10-01', '2026-11-01'))
    await db.update(users).set({ creditBalance: 1200, creditsUsedThisCycle: 300 }).where(eq(users.id, owner))
    const job = randomUUID()
    await db.insert(creditLedger).values({ userId: owner, amount: -300, transactionType: 'VALIDATION',
      description: JSON.stringify({ entityId: job, monthly: 300, purchased: 0 }), createdAt: new Date('2026-10-01T00:30:00Z') })
    await refundValidationCredits(owner, job)
    expect(await account()).toMatchObject({ creditBalance: 1500, creditsUsedThisCycle: 0 })
  })
  it('keeps migration reruns additive without altering customer balances', async () => {
    await db.update(users).set({ creditBalance: 57, purchasedCredits: 23, creditResetAt: new Date('2026-12-01') }).where(eq(users.id, owner))
    const migration = await readFile(new URL('../drizzle/0005_credit_cycle_start.sql', import.meta.url), 'utf8')
    await state.client.exec(migration); await state.client.exec(migration)
    expect(await account()).toMatchObject({ creditBalance: 57, purchasedCredits: 23, rewardCredits: 30, creditCycleStartedAt: new Date('2026-11-01') })
  })
  it('never grants an expired paid-tier allowance without a provider subscription', async () => {
    await db.update(users).set({ tier: 'premium', subscriptionId: null, creditResetAt: new Date(0),
      creditCycleStartedAt: null, creditBalance: 0 }).where(eq(users.id, owner))
    expect(await checkCredits(owner, 300)).toEqual({ allowed: false, balance: 70 })
    expect(await deductCredits(owner, 300, 'TEST')).toBe(false)
    expect(await account()).toMatchObject({ tier: 'premium', creditBalance: 0, purchasedCredits: 40, rewardCredits: 30 })
    expect(state.retrieve).not.toHaveBeenCalled()
  })
  it('returns purchased and earned sources once when paid-period provider lookup fails', async () => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-31T23:59:00Z'))
    await apply(period('2026-10-01', '2026-11-01'))
    await db.update(users).set({ creditBalance: 10, monthlyCreditsUsedThisCycle: 1490 }).where(eq(users.id, owner))
    const job = randomUUID()
    await deductCredits(owner, 50, 'VALIDATION', job, 10)
    vi.setSystemTime(new Date('2026-11-01T00:01:00Z'))
    state.retrieve.mockRejectedValue(new Error('Stripe unavailable'))
    await Promise.all([refundValidationCredits(owner, job), refundValidationCredits(owner, job)])
    expect(await account()).toMatchObject({ creditBalance: 0, purchasedCredits: 40, rewardCredits: 30 })
    expect(state.retrieve).not.toHaveBeenCalled()
    const refunds = (await db.select().from(creditLedger)).filter(row => row.transactionType === 'VALIDATION_REFUND')
    expect(refunds).toHaveLength(1); expect(refunds[0].amount).toBe(40)
  })
  it('preserves monthly consumption through repeated same-period plan switches and a refund', async () => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-01T01:00:00Z'))
    vi.stubEnv('STRIPE_MAX_PREMIUM_PRICE_ID', 'price_max')
    const premium = period('2026-10-01', '2026-11-01')
    const max = { ...premium, items: { data: premium.items.data.map(item => ({ ...item, price: { ...item.price, id: 'price_max' } })) } } as Stripe.Subscription
    await apply(max)
    const job = randomUUID()
    await deductCredits(owner, 2000, 'VALIDATION', job)
    await apply(premium); await apply(max); await apply(premium); await apply(max)
    expect(await account()).toMatchObject({ creditBalance: 2500, monthlyCreditsUsedThisCycle: 2000, creditsUsedThisCycle: 2000 })
    await apply(premium)
    expect((await account()).creditBalance).toBe(0)
    await refundValidationCredits(owner, job)
    expect(await account()).toMatchObject({ creditBalance: 1500, monthlyCreditsUsedThisCycle: 0, creditsUsedThisCycle: 0 })
    await apply(max)
    expect((await account()).creditBalance).toBe(4500)
    expect((await db.select().from(creditLedger)).find(row => row.transactionType === 'VALIDATION_REFUND')?.amount).toBe(1500)
  })
  it('settles a legacy monthly refund after exact billing hydration without delaying purchased credits', async () => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-01T01:00:00Z'))
    await db.update(users).set({ tier: 'premium', subscriptionId: 'sub_test', creditCycleStartedAt: null,
      creditResetAt: new Date('2026-11-01'), creditBalance: 1200, purchasedCredits: 20, rewardCredits: 0,
      monthlyCreditsUsedThisCycle: 300, creditsUsedThisCycle: 320 }).where(eq(users.id, owner))
    const job = randomUUID()
    await db.insert(creditLedger).values({ userId: owner, transactionType: 'VALIDATION', amount: -320,
      description: JSON.stringify({ entityId: job, monthly: 300, purchased: 20 }), createdAt: new Date('2026-10-01T00:30:00Z') })
    state.retrieve.mockRejectedValue(new Error('Stripe unavailable'))
    await refundValidationCredits(owner, job)
    expect(await account()).toMatchObject({ creditBalance: 1200, purchasedCredits: 40 })
    expect(state.retrieve).not.toHaveBeenCalled()
    state.retrieve.mockResolvedValue(period('2026-10-01', '2026-11-01'))
    await checkCredits(owner, 300); await checkCredits(owner, 300)
    expect(await account()).toMatchObject({ creditBalance: 1500, purchasedCredits: 40, monthlyCreditsUsedThisCycle: 0, creditsUsedThisCycle: 0 })
    const entries = await db.select().from(creditLedger)
    expect(entries.filter(entry => entry.transactionType === 'VALIDATION_MONTHLY_REFUND_PENDING')).toHaveLength(0)
    expect(entries.filter(entry => entry.transactionType === 'VALIDATION_MONTHLY_REFUND_SETTLED')).toMatchObject([{ amount: 300 }])
  })
  it('backfills monthly consumption from legacy debits and refunds while ignoring ordinary descriptions', async () => {
    await db.update(users).set({ creditBalance: 57, creditCycleStartedAt: new Date('2026-10-01'),
      creditResetAt: new Date('2026-10-31') }).where(eq(users.id, owner))
    const job = randomUUID()
    await db.insert(creditLedger).values([
      { userId: owner, amount: -70, transactionType: 'VALIDATION', description: JSON.stringify({ entityId: job, monthly: 60, purchased: 10 }), createdAt: new Date('2026-10-02') },
      { userId: owner, amount: 20, transactionType: 'VALIDATION_REFUND', description: 'Job: ' + job },
      { userId: owner, amount: -1, transactionType: 'PITCH_DECK_PACK', description: 'Idea: plain-text reference' },
    ])
    await state.client.exec('ALTER TABLE users DROP COLUMN monthly_credits_used_this_cycle')
    const migration = await readFile(new URL('../drizzle/0005_credit_cycle_start.sql', import.meta.url), 'utf8')
    await state.client.exec(migration)
    expect(await account()).toMatchObject({ creditBalance: 57, monthlyCreditsUsedThisCycle: 50 })
    await state.client.exec(migration)
    expect((await account()).monthlyCreditsUsedThisCycle).toBe(50)
  })
  it('cannot apply a pending legacy refund to a replacement subscription with matching dates', async () => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-01T01:00:00Z'))
    await db.update(users).set({ tier: 'premium', subscriptionId: 'sub_old', creditCycleStartedAt: null,
      creditResetAt: new Date('2026-11-01'), creditBalance: 1200, monthlyCreditsUsedThisCycle: 300, creditsUsedThisCycle: 300 }).where(eq(users.id, owner))
    const job = randomUUID()
    await db.insert(creditLedger).values({ userId: owner, transactionType: 'VALIDATION', amount: -300,
      description: JSON.stringify({ entityId: job, monthly: 300, purchased: 0 }), createdAt: new Date('2026-10-01T00:30:00Z') })
    await refundValidationCredits(owner, job)
    await db.update(users).set({ subscriptionId: 'sub_new', creditCycleStartedAt: new Date('2026-10-01'),
      creditBalance: 1500, monthlyCreditsUsedThisCycle: 0, creditsUsedThisCycle: 0 }).where(eq(users.id, owner))
    await deductCredits(owner, 300, 'TEST')
    expect(await account()).toMatchObject({ creditBalance: 1200, monthlyCreditsUsedThisCycle: 300, creditsUsedThisCycle: 300 })
    expect((await db.select().from(creditLedger)).filter(entry => entry.transactionType === 'VALIDATION_MONTHLY_REFUND_SETTLED')).toMatchObject([{ amount: 0 }])
  })
})
