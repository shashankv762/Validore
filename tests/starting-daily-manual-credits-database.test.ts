import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import type { PGlite } from '@electric-sql/pglite'
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
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: {
  getUser: async () => ({ data: { user: { id: '22222222-2222-4222-8222-222222222222' } } }),
} }) }))
import { db } from '@/db'
import * as schema from '@/db/schema'
import { syncUserToDatabase } from '@/lib/auth-sync'
import { claimDailyCredits, dailyCreditStatus } from '@/lib/daily-credits'
import { assignAdminPlan } from '@/lib/admin-user-plans'
import { deductCredits, topUpMonthlyCredits } from '@/lib/credits'
import { reconcileStripeCredits } from '@/lib/subscription-credits'
import { billingAvailability } from '@/lib/billing-availability'
import { admitValidation } from '@/lib/validation-admission'
import { getPlan } from '@/lib/plan-catalog'
import { GET as usage } from '@/app/api/usage/route'
import type { AdminActor } from '@/lib/admin-requests'
import type Stripe from 'stripe'

const ownerId = '11111111-1111-4111-8111-111111111111'
const userId = '22222222-2222-4222-8222-222222222222'
const otherId = '33333333-3333-4333-8333-333333333333'
const now = new Date('2026-11-14T11:00:00Z')
let actor: AdminActor
const account = (id = userId) => db.query.users.findFirst({ where: eq(schema.users.id, id) })
const assign = (tier = 'premium', overrides = {}) => ({ userIds: [userId], tier, reason: 'Owner trial access', requestId: randomUUID(), ...overrides })
const fixtureIdea = async () => {
  const [idea] = await db.insert(schema.ideas).values({ userId, name: 'Atomic admission fixture', industry: 'Software',
    product: 'A stock log', targetCustomer: 'Shop owners', location: 'India', businessModel: 'Subscription',
    coreProblem: 'Manual reconciliation takes time', proposedSolution: 'Weekly reminders' }).returning()
  return idea.id
}
const admit = (ideaId: string) => admitValidation({ userId, supabaseId: userId, ideaId, emailVerified: true })

beforeAll(async () => {
  const { generateDrizzleJson, generateMigration } = await import('drizzle-kit/api')
  const statements = await generateMigration(generateDrizzleJson({}), generateDrizzleJson(schema))
  for (const statement of statements) await state.client.exec(statement)
  await state.client.exec("CREATE OR REPLACE FUNCTION pg_advisory_xact_lock(integer) RETURNS void LANGUAGE SQL AS 'SELECT NULL::void'")
}, 30_000)
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(now)
  vi.stubEnv('DATABASE_URL', 'postgres://isolated-credit-fixture')
  vi.stubEnv('ENABLE_PAID_CHECKOUT', '')
  state.retrieve.mockReset()
  await state.client.exec('TRUNCATE users, tier_config, platform_settings, admin_audit_log CASCADE')
  const [owner] = await db.insert(schema.users).values({ id: ownerId, email: 'shashankv7623@gmail.com', supabaseId: 'test-owner', isAdmin: true }).returning()
  actor = owner
  await db.insert(schema.users).values([userId, otherId].map(id => ({ id, email: id + '@example.test', supabaseId: id,
    purchasedCredits: 200, rewardCredits: 3, creditCycleAllowance: 0, creditCycleStartedAt: now,
    creditResetAt: new Date(now.getTime() + 30 * 86_400_000) })))
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs() })
afterAll(() => state.client.close())

describe('Starting and explicitly claimed daily credits', () => {
  it('creates one 200-credit nonexpiring signup allowance and ledger record under concurrent registration retries', async () => {
    const identity = { id: randomUUID(), email: 'new-founder@example.test' }
    expect(await syncUserToDatabase(identity)).toBeNull()
    const accounts = await Promise.all(Array.from({ length: 8 }, () => syncUserToDatabase(identity, { createNew: true })))
    expect(new Set(accounts.map(user => user?.id)).size).toBe(1)
    expect(accounts[0]).toMatchObject({ tier: 'free', creditBalance: 0, purchasedCredits: 200, rewardCredits: 0 })
    const ledger = await db.select().from(schema.creditLedger).where(eq(schema.creditLedger.userId, accounts[0]!.id))
    expect(ledger).toMatchObject([{ amount: 200, transactionType: 'SIGNUP_GRANT' }])
    vi.setSystemTime(new Date(now.getTime() + 31 * 86_400_000))
    await topUpMonthlyCredits(accounts[0]!.id)
    expect(await account(accounts[0]!.id)).toMatchObject({ purchasedCredits: 200, creditBalance: 0 })
  })
  it('awards 10 once across simultaneous claims, and accepts the next UTC day without catching up missed days', async () => {
    expect(await dailyCreditStatus(userId)).toMatchObject({ available: true, claimedToday: false })
    const results = await Promise.all(Array.from({ length: 12 }, () => claimDailyCredits(userId)))
    expect(results.filter(result => result.granted === 10)).toHaveLength(1)
    expect(results.filter(result => result.duplicate)).toHaveLength(11)
    expect(await account()).toMatchObject({ purchasedCredits: 200, rewardCredits: 13 })
    vi.setSystemTime(new Date('2026-11-15T00:00:00Z'))
    expect(await claimDailyCredits(userId)).toMatchObject({ granted: 10, day: '2026-11-15' })
    vi.setSystemTime(new Date('2026-11-20T00:00:00Z'))
    expect(await claimDailyCredits(userId)).toMatchObject({ granted: 10 })
    expect((await account())?.rewardCredits).toBe(33)
    expect(await db.select().from(schema.creditLedger).where(eq(schema.creditLedger.userId, userId))).toHaveLength(3)
  })
  it('shares the spending lock so a simultaneous claim and debit cannot lose credits', async () => {
    await Promise.all([claimDailyCredits(userId), deductCredits(userId, 20, 'CUSTOMER_EVIDENCE')])
    const user = (await account())!
    expect(user.purchasedCredits + user.rewardCredits + user.creditBalance).toBe(193)
    expect(await db.select().from(schema.creditLedger)).toHaveLength(2)
  })
  it('rejects blocked accounts, the owner, and overflowing balances without recording a claim', async () => {
    await db.update(schema.users).set({ accountStatus: 'blocked' }).where(eq(schema.users.id, userId))
    await expect(claimDailyCredits(userId)).rejects.toMatchObject({ status: 403 })
    await expect(claimDailyCredits(ownerId)).rejects.toMatchObject({ status: 409 })
    await db.update(schema.users).set({ rewardCredits: 2_147_483_647 }).where(eq(schema.users.id, otherId))
    await expect(claimDailyCredits(otherId)).rejects.toMatchObject({ status: 409 })
    expect(await db.select().from(schema.creditLedger)).toHaveLength(0)
  })
  it('rolls back the claim ledger when the balance update fails', async () => {
    await state.client.exec(`CREATE FUNCTION reject_daily_balance() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture failure'; END $$;
      CREATE TRIGGER reject_daily_balance BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION reject_daily_balance();`)
    try {
      await expect(claimDailyCredits(userId)).rejects.toThrow()
      expect(await db.select().from(schema.creditLedger)).toHaveLength(0)
      expect((await account())?.rewardCredits).toBe(3)
    } finally { await state.client.exec('DROP TRIGGER reject_daily_balance ON users; DROP FUNCTION reject_daily_balance()') }
  })
})

describe('Owner-assigned plans without automatic payments', () => {
  it.each(['razorpay-subscription', 'sub_razorpay'])('protects an unresolved paid subscription %s before manual assignment', async subscriptionId => {
    await db.update(schema.users).set({ subscriptionId, subscriptionStatus: 'active' }).where(eq(schema.users.id, userId))
    await expect(assignAdminPlan(actor, assign())).rejects.toThrow('payment subscription')
    expect((await account())?.tier).toBe('free')
    expect(await db.select().from(schema.adminAuditLog)).toHaveLength(0)
    await db.update(schema.users).set({ subscriptionStatus: 'cancelled' }).where(eq(schema.users.id, userId))
    await assignAdminPlan(actor, assign())
    expect((await account())?.subscriptionStatus).toBe('manual')
  })
  it('preserves a legacy current cycle when assigning a manual plan before its start is hydrated', async () => {
    const end = new Date(now.getTime() + 20 * 86_400_000)
    await db.update(schema.users).set({ tier: 'premium', creditBalance: 1200, creditCycleAllowance: null,
      creditCycleStartedAt: null, creditResetAt: end, monthlyCreditsUsedThisCycle: 300,
      creditsUsedThisCycle: 350, subscriptionStatus: 'canceled', subscriptionId: 'sub_legacy' }).where(eq(schema.users.id, userId))
    await assignAdminPlan(actor, assign('max_premium'))
    expect(await account()).toMatchObject({ tier: 'max_premium', creditBalance: 4200,
      monthlyCreditsUsedThisCycle: 300, creditsUsedThisCycle: 350, creditResetAt: end,
      creditCycleStartedAt: new Date(end.getTime() - 30 * 86_400_000), subscriptionStatus: 'manual' })
    await assignAdminPlan(actor, assign('free'))
    await assignAdminPlan(actor, assign('premium'))
    expect(await account()).toMatchObject({ creditBalance: 1200, monthlyCreditsUsedThisCycle: 300,
      purchasedCredits: 200, rewardCredits: 3, creditResetAt: end })
    expect(state.retrieve).not.toHaveBeenCalled()
  })

  it('starts a full paid cycle when a regular Free account is assigned a plan near reset', async () => {
    const freeReset = new Date(now.getTime() + 86_400_000)
    await db.update(schema.users).set({ creditResetAt: freeReset, creditCycleStartedAt: now,
      creditCycleAllowance: 0, creditBalance: 0, monthlyCreditsUsedThisCycle: 0, subscriptionStatus: 'manual' }).where(eq(schema.users.id, userId))

    await assignAdminPlan(actor, assign('premium'))

    expect(await account()).toMatchObject({ tier: 'premium', subscriptionStatus: 'manual', creditBalance: 1500,
      creditCycleAllowance: 1500, creditCycleStartedAt: now,
      creditResetAt: new Date(now.getTime() + 30 * 86_400_000), monthlyCreditsUsedThisCycle: 0 })
  })

  it('audits a replay-safe assignment and preserves consumption through plan switches', async () => {
    const input = assign()
    const responses = await Promise.all([assignAdminPlan(actor, input), assignAdminPlan(actor, input)])
    expect(responses.filter(result => result.duplicate)).toHaveLength(1)
    await deductCredits(userId, 300, 'OTHER')
    await assignAdminPlan(actor, assign('max_premium'))
    expect(await account()).toMatchObject({ tier: 'max_premium', creditBalance: 4200, monthlyCreditsUsedThisCycle: 300 })
    await assignAdminPlan(actor, assign('free'))
    await assignAdminPlan(actor, assign('premium'))
    expect(await account()).toMatchObject({ tier: 'premium', creditBalance: 1200, monthlyCreditsUsedThisCycle: 300,
      purchasedCredits: 200, rewardCredits: 3, subscriptionStatus: 'manual', subscriptionId: null })
    expect(await db.select().from(schema.adminAuditLog)).toHaveLength(4)
    expect(state.retrieve).not.toHaveBeenCalled()
  })
  it('renews a manual paid allowance exactly once after a boundary, retaining starting and daily balances', async () => {
    await assignAdminPlan(actor, assign())
    await claimDailyCredits(userId)
    await deductCredits(userId, 300, 'OTHER')
    vi.setSystemTime(new Date(now.getTime() + 31 * 86_400_000))
    await Promise.all([topUpMonthlyCredits(userId), topUpMonthlyCredits(userId)])
    expect(await account()).toMatchObject({ creditBalance: 1500, purchasedCredits: 200, rewardCredits: 13, monthlyCreditsUsedThisCycle: 0 })
    const ledger = await db.select().from(schema.creditLedger)
    expect(ledger.filter(entry => entry.transactionType === 'MANUAL_PLAN_RENEWAL')).toHaveLength(1)
    expect(state.retrieve).not.toHaveBeenCalled()
  })
  it('rejects forged owner access, protected/deactivated recipients, and a reused payload reference atomically', async () => {
    const regular = (await account())!
    await expect(assignAdminPlan({ ...regular, isAdmin: true }, assign())).rejects.toMatchObject({ status: 404 })
    await expect(assignAdminPlan(actor, assign('premium', { userIds: [userId, ownerId] }))).rejects.toThrow()
    await db.update(schema.users).set({ accountStatus: 'deactivated' }).where(eq(schema.users.id, otherId))
    await expect(assignAdminPlan(actor, assign('premium', { userIds: [userId, otherId] }))).rejects.toThrow()
    expect((await account())?.tier).toBe('free')
    const input = assign()
    await assignAdminPlan(actor, input)
    await expect(assignAdminPlan(actor, { ...input, tier: 'max_premium' })).rejects.toMatchObject({ code: 'request_id_conflict' })
  })
  it('rejects accounts with a live payment subscription and ignores late provider events after manual assignment', async () => {
    await db.update(schema.users).set({ stripeCustomerId: 'cus_test', subscriptionId: 'sub_live', subscriptionStatus: 'active' }).where(eq(schema.users.id, userId))
    await expect(assignAdminPlan(actor, assign())).rejects.toThrow('payment subscription')
    await db.update(schema.users).set({ subscriptionStatus: 'canceled' }).where(eq(schema.users.id, userId))
    await assignAdminPlan(actor, assign())
    await db.transaction(async tx => {
      const [user] = await tx.select().from(schema.users).where(eq(schema.users.id, userId)).for('update')
      await reconcileStripeCredits(tx, user, { id: 'sub_live', customer: 'cus_test' } as Stripe.Subscription)
    })
    expect(await account()).toMatchObject({ tier: 'premium', subscriptionStatus: 'manual', subscriptionId: null, creditBalance: 1500 })
  })
  it('keeps checkout disabled despite credentials until an explicit future launch switch is enabled', () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_valid'); vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_test')
    vi.stubEnv('STRIPE_PREMIUM_PRICE_ID', 'price_premium'); vi.stubEnv('STRIPE_MAX_PREMIUM_PRICE_ID', 'price_max')
    vi.stubEnv('STRIPE_SERVICE_PORTAL_CONFIGURATION_ID', '')
    expect(billingAvailability()).toEqual({ credits: false, premium: false, maxPremium: false, portal: false })
    vi.stubEnv('STRIPE_SERVICE_PORTAL_CONFIGURATION_ID', 'bpc_service')
    expect(billingAvailability()).toEqual({ credits: false, premium: false, maxPremium: false, portal: true })
    vi.stubEnv('ENABLE_PAID_CHECKOUT', 'true')
    expect(billingAvailability()).toEqual({ credits: true, premium: true, maxPremium: true, portal: true })
  })
  it('can replay the reviewed migration without changing user balances or owner-edited Free allocations', async () => {
    await db.insert(schema.tierConfig).values({ tier: 'free', monthlyPriceCents: 0, monthlyCredits: 100, monthlyValidationLimit: 2,
      maxActiveIdeas: 1, maxConcurrentRequests: 1, maxTokensPerCall: 4000 })
    const migration = await readFile(new URL('../drizzle/0007_starting_daily_manual_plans.sql', import.meta.url), 'utf8')
    await state.client.exec(migration); await state.client.exec(migration)
    expect((await account())?.purchasedCredits).toBe(200)
    expect((await db.select().from(schema.tierConfig))[0].monthlyCredits).toBe(100)
  })
})

describe('Atomic current-entitlement validation admission', () => {
  it('reports research debits without counting expired or reduced plan allocations as research spending', async () => {
    await db.update(schema.users).set({ creditCycleStartedAt: new Date(now.getTime() - 60_000) }).where(eq(schema.users.id, userId))
    await db.insert(schema.creditLedger).values([
      { userId, amount: -50, transactionType: 'VALIDATION' },
      { userId, amount: -1500, transactionType: 'ADMIN_PLAN_ASSIGNMENT' },
      { userId, amount: -100, transactionType: 'MANUAL_PLAN_RENEWAL' },
      { userId, amount: -1, transactionType: 'CROWDFUNDING_PACK' },
    ].map(entry => ({ ...entry, createdAt: new Date(now.getTime() - 1000) })))
    const response = await usage()
    expect(response.status).toBe(200)
    expect((await response.json()).activity).toEqual([{ action: 'VALIDATION', credits: 50, transactions: 1 }])
  })
  it('uses the current Free entitlement after a paid preflight is downgraded and pins the accepted budget', async () => {
    await assignAdminPlan(actor, assign())
    expect((await account())?.tier).toBe('premium') // The former route preflight.
    await assignAdminPlan(actor, assign('free'))
    const result = await admit(await fixtureIdea())
    expect(result.job).toMatchObject({ isLite: true, totalSections: 3,
      entitlementSnapshot: { version: 1, tier: 'free', creditCost: 50, maxTokensPerCall: (await getPlan('free')).maxTokensPerCall, monthlyValidationLimit: 2 } })
    expect(await account()).toMatchObject({ purchasedCredits: 153, rewardCredits: 0, validationsThisMonth: 1 })
    await assignAdminPlan(actor, assign('max_premium'))
    expect((await db.query.validationJobs.findFirst({ where: eq(schema.validationJobs.id, result.job.id) }))?.entitlementSnapshot?.tier).toBe('free')
  })
  it('resets the UTC month with its debit and admits exactly two included runs during a midnight burst', async () => {
    await db.update(schema.users).set({ validationsThisMonth: 2, validationResetAt: new Date('2026-12-01T00:00:00Z') }).where(eq(schema.users.id, userId))
    const ideaIds = await Promise.all(Array.from({ length: 5 }, fixtureIdea))
    vi.setSystemTime(new Date('2026-12-01T00:00:00Z'))
    const attempts = await Promise.allSettled(ideaIds.map(admit))
    expect(attempts.filter(result => result.status === 'fulfilled')).toHaveLength(2)
    expect(attempts.filter(result => result.status === 'rejected')).toHaveLength(3)
    expect(await account()).toMatchObject({ validationsThisMonth: 2, validationResetAt: new Date('2027-01-01T00:00:00Z'),
      purchasedCredits: 103, rewardCredits: 0 })
    const ledger = (await db.select().from(schema.creditLedger)).filter(entry => entry.transactionType === 'VALIDATION')
    expect(ledger).toHaveLength(2)
    expect(ledger.every(entry => JSON.parse(entry.description!).validationWindowEndsAt === '2027-01-01T00:00:00.000Z')).toBe(true)
    expect(await db.select().from(schema.validationJobs)).toHaveLength(2)
  })
  it('reuses one accepted job and debit under retries, and rejects changed stored access', async () => {
    const ideaId = await fixtureIdea()
    const attempts = await Promise.all(Array.from({ length: 5 }, () => admit(ideaId)))
    expect(new Set(attempts.map(result => result.job.id)).size).toBe(1)
    expect(attempts.filter(result => !result.reused)).toHaveLength(1)
    expect(await db.select().from(schema.creditLedger)).toHaveLength(1)
    await db.update(schema.users).set({ accountStatus: 'blocked' }).where(eq(schema.users.id, userId))
    await expect(admit(ideaId)).rejects.toMatchObject({ status: 403 })
  })
  it('rolls back the job, monthly reset and balance when the debit ledger cannot commit', async () => {
    const ideaId = await fixtureIdea()
    await state.client.exec(`CREATE FUNCTION reject_admission_debit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture failure'; END $$;
      CREATE TRIGGER reject_admission_debit BEFORE INSERT ON credit_ledger FOR EACH ROW EXECUTE FUNCTION reject_admission_debit();`)
    try {
      await expect(admit(ideaId)).rejects.toThrow()
      expect(await db.select().from(schema.validationJobs)).toHaveLength(0)
      expect(await account()).toMatchObject({ purchasedCredits: 200, rewardCredits: 3, validationsThisMonth: 0, validationResetAt: null })
    } finally { await state.client.exec('DROP TRIGGER reject_admission_debit ON credit_ledger; DROP FUNCTION reject_admission_debit()') }
  })
})
