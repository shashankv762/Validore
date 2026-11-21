import { randomUUID } from 'node:crypto'
import { setTimeout as waitForLock } from 'node:timers/promises'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { eq, sql } from 'drizzle-orm'
import { adminAuditLog, creditLedger, users, ideas, customerFeedback, planningModuleRequests, pricingSimulations, tierConfig, validationJobs } from '@/db/schema'
import type { AdminActor } from '@/lib/admin-requests'
import { authenticatedDestination, OWNER_EMAIL } from '@/lib/admin-access'

/** Validate before importing the database or issuing any fixture statement. */
export function scopedAdminPostgresSchema(target: string): string {
  let parsed: URL
  try { parsed = new URL(target) }
  catch { throw new Error('Admin PostgreSQL tests require a valid loopback database URL') }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol) || !['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname) || parsed.hash) {
    throw new Error('Admin PostgreSQL tests require a loopback database URL')
  }
  const options = parsed.searchParams.getAll('options')
  if ([...parsed.searchParams.keys()].some(key => key !== 'options') || options.length !== 1) {
    throw new Error('Admin PostgreSQL tests require only the isolated search_path connection option')
  }
  const match = /^-c search_path=(validore_test_[a-f0-9]{32})$/.exec(options[0])
  if (!match) throw new Error('Admin PostgreSQL tests require a fresh validore_test_<32hex> schema without a public fallback')
  return match[1]
}

const target = process.env.TEST_DATABASE_URL
const ownerId = '11111111-1111-4111-8111-111111111111'
const firstId = '22222222-2222-4222-8222-222222222222'
const secondId = '33333333-3333-4333-8333-333333333333'
let database: typeof import('@/db').db
let grantAdminCredits: typeof import('@/lib/admin-actions').grantAdminCredits
let changeAdminAccountStatus: typeof import('@/lib/admin-actions').changeAdminAccountStatus
let deductCredits: typeof import('@/lib/credits').deductCredits
let syncUserToDatabase: typeof import('@/lib/auth-sync').syncUserToDatabase
let claimDailyCredits: typeof import('@/lib/daily-credits').claimDailyCredits
let assignAdminPlan: typeof import('@/lib/admin-user-plans').assignAdminPlan
let admitValidation: typeof import('@/lib/validation-admission').admitValidation
let getAdminOverview: typeof import('@/lib/admin-data').getAdminOverview
let saveFeedbackRecords: typeof import('@/lib/customer-feedback/store').saveFeedbackRecords
let deleteFeedbackRecord: typeof import('@/lib/customer-feedback/store').deleteFeedbackRecord
let readFeedbackView: typeof import('@/lib/customer-feedback/store').readFeedbackView
let beginPlanningRequest: typeof import('@/lib/planning/requests').beginPlanningRequest
let completePlanningRequest: typeof import('@/lib/planning/requests').completePlanningRequest
let actor: AdminActor
let schemaName: string

const grant = (userIds: string[], amount: number, requestId = randomUUID()) => ({
  userIds, amount, requestId, type: 'general' as const, reason: 'Isolated PostgreSQL concurrency fixture',
})
const account = async (id = firstId) => (await database.query.users.findFirst({ where: eq(users.id, id) }))!
const fixtureIdea = async () => {
  const [idea] = await database.insert(ideas).values({ userId: firstId, name: 'Isolated no-model fixture', industry: 'Software',
    product: 'A weekly stock log', targetCustomer: 'Small shop owners', location: 'India', businessModel: 'Subscription',
    coreProblem: 'Manual reconciliation takes time', proposedSolution: 'Test weekly reminders' }).returning()
  return idea
}
const feedbackInput = (overrides = {}) => ({ kind: 'interview' as const, content: 'I checked the weekly sales report and the totals did not match.',
  sourceLabel: 'Isolated synthetic customer observation', sourceUrl: null, occurredAt: '2026-11-14', rating: null,
  sentiment: 'negative' as const, provenance: 'owner_recorded' as const, fetchedAt: null, requestId: randomUUID(), ...overrides })

describe.skipIf(!target)('Admin operations on real PostgreSQL connections', () => {
  beforeAll(async () => {
    schemaName = scopedAdminPostgresSchema(target!)
    if (process.env.DATABASE_URL !== target) throw new Error('DATABASE_URL must exactly match the scoped TEST_DATABASE_URL')
    if (process.env.DB_MAX_CONNECTIONS !== '4') throw new Error('Run admin PostgreSQL tests through the four-connection isolated runner')
    ;({ db: database } = await import('@/db'))
    ;({ grantAdminCredits, changeAdminAccountStatus } = await import('@/lib/admin-actions'))
    ;({ deductCredits } = await import('@/lib/credits'))
    ;({ syncUserToDatabase } = await import('@/lib/auth-sync'))
    ;({ claimDailyCredits } = await import('@/lib/daily-credits'))
    ;({ assignAdminPlan } = await import('@/lib/admin-user-plans'))
    ;({ admitValidation } = await import('@/lib/validation-admission'))
    ;({ getAdminOverview } = await import('@/lib/admin-data'))
    ;({ saveFeedbackRecords, deleteFeedbackRecord, readFeedbackView } = await import('@/lib/customer-feedback/store'))
    ;({ beginPlanningRequest, completePlanningRequest } = await import('@/lib/planning/requests'))
    const [scope] = await database.execute(sql`select current_schema() as name, current_schemas(false) as schemas`)
    if (scope.name !== schemaName || !Array.isArray(scope.schemas) || scope.schemas.length !== 1 || scope.schemas[0] !== schemaName) {
      throw new Error('The PostgreSQL session must resolve only the validated disposable schema')
    }
    const [clock] = await database.execute(sql`select current_setting('TimeZone') as timezone`)
    expect(clock.timezone).toBe('UTC')
    // Overlapping backend requests demonstrate that this is a real pool,
    // rather than PGlite or a single serialized database connection.
    const backends = await Promise.all(Array.from({ length: 2 }, () => database.transaction(async tx => {
      const [row] = await tx.execute(sql`select pg_backend_pid() as pid, pg_sleep(0.05)`)
      return Number(row.pid)
    })))
    expect(new Set(backends).size).toBe(2)
  }, 30_000)

  beforeEach(async () => {
    // Qualification and the strict URL check prevent any public-schema fixture writes.
    await database.execute(sql.raw(`TRUNCATE "${schemaName}"."users" CASCADE`))
    // Other release suites may leave an edited plan in the same disposable schema.
    await database.delete(tierConfig)
    const now = new Date()
    const cycle = { tier: 'free' as const, creditBalance: 100, purchasedCredits: 0, rewardCredits: 0,
      creditCycleAllowance: 100, creditCycleStartedAt: now, creditResetAt: new Date(now.getTime() + 30 * 86_400_000),
      validationResetAt: new Date(now.getTime() + 30 * 86_400_000), accountStatus: 'active' }
    const [owner] = await database.insert(users).values({ ...cycle, id: ownerId, email: 'shashankv7623@gmail.com',
      supabaseId: 'isolated-admin-owner', isAdmin: true }).returning()
    actor = owner
    await database.insert(users).values([firstId, secondId].map(id => ({ ...cycle, id,
      email: id + '@example.test', supabaseId: 'isolated-admin-' + id })))
  })

  afterAll(async () => { if (database) await database.$client.end({ timeout: 5 }) })

  it('encodes the overview date filter for the PostgreSQL driver and reports numeric counts', async () => {
    await database.update(users).set({ createdAt: new Date(Date.now() - 8 * 86_400_000) }).where(eq(users.id, firstId))
    const overview = await getAdminOverview(actor)
    expect(overview.users).toEqual({ total: 3, active: 3, blocked: 0, deactivated: 0, newThisWeek: 2 })
    expect(overview.activity).toEqual({ ideas: 0, reports: 0, activeJobs: 0, failedJobs: 0, creditsGranted: 0 })
    expect(overview.recentActivity).toEqual([])
  })

  it('preserves exact date-only feedback and prevents a deleted request from resurrecting its content', async () => {
    const idea = await fixtureIdea()
    const input = feedbackInput()
    const saved = await saveFeedbackRecords(idea.id, firstId, [input])
    expect(saved.added).toBe(1)
    expect(saved.saved[0].occurredAt).toBe('2026-11-14')
    const record = (await database.query.customerFeedback.findFirst({ where: eq(customerFeedback.id, saved.saved[0].id) }))!
    expect(record.occurredAt).toBe('2026-11-14')
    expect((await readFeedbackView(idea.id, firstId)).records[0].occurredAt).toBe('2026-11-14')
    expect(await deleteFeedbackRecord(idea.id, firstId, record.id)).toBe(true)
    expect((await readFeedbackView(idea.id, firstId)).records).toEqual([])
    const removed = (await database.query.customerFeedback.findFirst({ where: eq(customerFeedback.id, record.id) }))!
    expect(removed.deletedAt).not.toBeNull()
    expect(removed).toMatchObject({ content: '[record removed]', sourceLabel: 'Removed record', sourceUrl: null, occurredAt: null })
    await expect(saveFeedbackRecords(idea.id, firstId, [input])).rejects.toMatchObject({ status: 409 })
    expect(await database.select().from(customerFeedback)).toHaveLength(1)
    expect(await database.select().from(creditLedger)).toHaveLength(0)
  })

  it('keeps racing identical feedback unique across real connections for both same and distinct request IDs', async () => {
    const idea = await fixtureIdea()
    const input = feedbackInput()
    const sameKey = await Promise.all(Array.from({ length: 4 }, () => saveFeedbackRecords(idea.id, firstId, [input])))
    expect(sameKey.reduce((count, result) => count + result.added, 0)).toBe(1)
    expect(sameKey.reduce((count, result) => count + result.duplicates, 0)).toBe(3)
    expect(new Set(sameKey.map(result => result.saved[0].id)).size).toBe(1)
    const distinctKeys = await Promise.all(Array.from({ length: 4 }, () => saveFeedbackRecords(idea.id, firstId, [{ ...input, requestId: randomUUID() }])))
    expect(distinctKeys.every(result => result.added === 0 && result.duplicates === 1)).toBe(true)
    expect(await database.select().from(customerFeedback)).toHaveLength(1)
    expect(await database.select().from(creditLedger)).toHaveLength(0)
  })

  it('claims a planning key once, fences a replaced completion, and binds replay to the unchanged idea brief without AI', async () => {
    const idea = await fixtureIdea()
    const key = randomUUID()
    const request = () => new Request('https://isolated.validore.test/api/pricing', { method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key }, body: JSON.stringify({ ideaId: idea.id, sellingPrice: 100 }) })
    const claims = await Promise.allSettled([beginPlanningRequest(request(), firstId, 'pricing'), beginPlanningRequest(request(), firstId, 'pricing')])
    expect(claims.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    const rejected = claims.find(result => result.status === 'rejected') as PromiseRejectedResult
    expect(rejected.reason).toMatchObject({ status: 409 })
    const claimed = (claims.find(result => result.status === 'fulfilled') as PromiseFulfilledResult<Awaited<ReturnType<typeof beginPlanningRequest>>>).value
    const lease = claimed.lease!
    const registry = (await database.query.planningModuleRequests.findFirst({ where: eq(planningModuleRequests.id, lease.id) }))!
    expect(registry.ideaFingerprint).toMatch(/^[a-f0-9]{64}$/)
    const replacementToken = randomUUID()
    await database.update(planningModuleRequests).set({ leaseToken: replacementToken }).where(eq(planningModuleRequests.id, lease.id))
    const staleId = randomUUID()
    await expect(database.transaction(async tx => {
      await tx.insert(pricingSimulations).values({ id: staleId, userId: firstId, ideaId: idea.id, pricingScore: 0,
        reportData: { label: 'ASSUMPTION', fixture: 'Isolated synthetic result; no model call' } })
      await completePlanningRequest(tx, lease, staleId)
    })).rejects.toMatchObject({ status: 409 })
    expect(await database.query.pricingSimulations.findFirst({ where: eq(pricingSimulations.id, staleId) })).toBeUndefined()
    const resultId = randomUUID()
    await database.transaction(async tx => {
      await tx.insert(pricingSimulations).values({ id: resultId, userId: firstId, ideaId: idea.id, pricingScore: 0,
        reportData: { label: 'ASSUMPTION', fixture: 'Isolated synthetic result; no model call' } })
      await completePlanningRequest(tx, { ...lease, token: replacementToken }, resultId)
    })
    const replay = await beginPlanningRequest(request(), firstId, 'pricing')
    expect(replay).toMatchObject({ lease: null, replay: { simulationId: resultId, reused: true, creditsCharged: 0 } })
    await database.update(ideas).set({ product: 'A changed idea brief' }).where(eq(ideas.id, idea.id))
    await expect(beginPlanningRequest(request(), firstId, 'pricing')).rejects.toMatchObject({ code: 'planning_inputs_changed' })
    expect(await database.select().from(planningModuleRequests)).toHaveLength(1)
    expect(await database.select().from(creditLedger)).toHaveLength(0)
  })

  it('returns the current owner grant to both first logins when promotion races', async () => {
    await database.update(users).set({ isAdmin: false }).where(eq(users.id, ownerId))
    const identity = { id: actor.supabaseId, email: OWNER_EMAIL, email_confirmed_at: new Date().toISOString() }
    let enterLock!: () => void
    let releaseLock!: () => void
    const entered = new Promise<void>(resolve => { enterLock = resolve })
    const released = new Promise<void>(resolve => { releaseLock = resolve })
    const holder = database.transaction(async tx => {
      await tx.select({ id: users.id }).from(users).where(eq(users.id, ownerId)).for('update')
      enterLock()
      await released
    })
    await entered
    // Reads remain MVCC-visible while this gate blocks both subsequent updates.
    const outcomes = Promise.allSettled([syncUserToDatabase(identity), syncUserToDatabase(identity)])
    let waiting = 0
    try {
      const deadline = Date.now() + 5000
      while (Date.now() < deadline && waiting < 2) {
        const [row] = await database.execute(sql`select count(*)::int as waiting from pg_stat_activity
          where datname = current_database() and wait_event_type = 'Lock'
          and query like ${'update "users" set "is_admin"%'} and pid <> pg_backend_pid()`)
        waiting = Number(row.waiting)
        if (waiting < 2) await waitForLock(20)
      }
    } finally { releaseLock() }
    await holder
    const results = await outcomes
    expect(waiting).toBe(2)
    for (const result of results) {
      expect(result.status).toBe('fulfilled')
      if (result.status === 'fulfilled') {
        expect(result.value).toMatchObject({ id: ownerId, supabaseId: identity.id, isAdmin: true, accountStatus: 'active' })
        expect(authenticatedDestination(identity, result.value!, '/dashboard')).toBe('/admin')
      }
    }
    expect((await account(ownerId)).isAdmin).toBe(true)
  }, 15_000)

  it('adds simultaneous general grants with different request UUIDs exactly once each', async () => {
    const amounts = [31, 47, 59, 83]
    const outcomes = await Promise.all(amounts.map(amount => grantAdminCredits(actor, grant([firstId], amount))))
    expect(outcomes.every(result => !result.duplicate)).toBe(true)
    expect((await account()).purchasedCredits).toBe(amounts.reduce((total, amount) => total + amount, 0))
    const ledger = await database.select().from(creditLedger)
    const audit = await database.select().from(adminAuditLog)
    expect(ledger).toHaveLength(4); expect(audit).toHaveLength(4)
    expect(ledger.map(entry => entry.amount).sort((a, b) => a - b)).toEqual(amounts)
    expect(new Set(audit.map(entry => entry.requestId)).size).toBe(4)
  })

  it('grants the daily allowance once across twelve real concurrent connections and a racing debit', async () => {
    const [claims, spent] = await Promise.all([
      Promise.all(Array.from({ length: 12 }, () => claimDailyCredits(firstId))),
      deductCredits(firstId, 20, 'CUSTOMER_EVIDENCE'),
    ])
    expect(spent).toBe(true)
    expect(claims.filter(claim => claim.granted === 10)).toHaveLength(1)
    const saved = await account()
    expect(saved.creditBalance + saved.purchasedCredits + saved.rewardCredits).toBe(90)
    const ledger = await database.select().from(creditLedger)
    expect(ledger.filter(entry => entry.transactionType === 'DAILY_LOGIN_CLAIM')).toHaveLength(1)
    expect(await claimDailyCredits(firstId)).toMatchObject({ duplicate: true, granted: 0 })
  })

  it('records a single 200-credit signup grant when real concurrent registrations race', async () => {
    const identity = { id: randomUUID(), email: randomUUID() + '@example.test' }
    const registered = await Promise.all(Array.from({ length: 8 }, () => syncUserToDatabase(identity, { createNew: true })))
    expect(new Set(registered.map(user => user?.id)).size).toBe(1)
    const user = registered[0]!
    expect(user).toMatchObject({ creditBalance: 0, purchasedCredits: 200, rewardCredits: 0 })
    const ledger = await database.select().from(creditLedger).where(eq(creditLedger.userId, user.id))
    expect(ledger).toMatchObject([{ amount: 200, transactionType: 'SIGNUP_GRANT' }])
  })

  it('serializes manual plan assignment and prevents refill through a repeated UUID', async () => {
    const input = { userIds: [firstId], tier: 'premium', reason: 'Isolated manual access fixture', requestId: randomUUID() }
    const assigned = await Promise.all(Array.from({ length: 4 }, () => assignAdminPlan(actor, input)))
    expect(assigned.filter(result => !result.duplicate)).toHaveLength(1)
    await deductCredits(firstId, 300, 'POSTGRES_MANUAL_PLAN_SPEND')
    await assignAdminPlan(actor, { ...input, tier: 'max_premium', requestId: randomUUID() })
    await assignAdminPlan(actor, { ...input, requestId: randomUUID() })
    expect(await account()).toMatchObject({ tier: 'premium', creditBalance: 1200, monthlyCreditsUsedThisCycle: 300, subscriptionStatus: 'manual' })
  })

  it('resets an expired UTC validation window and admits exactly two included runs across real connections', async () => {
    await database.update(users).set({ creditBalance: 0, creditCycleAllowance: 0, purchasedCredits: 500,
      validationsThisMonth: 2, validationResetAt: new Date(Date.now() - 1000) }).where(eq(users.id, firstId))
    const ownedIdeas = await Promise.all(Array.from({ length: 5 }, fixtureIdea))
    const attempts = await Promise.allSettled(ownedIdeas.map(idea => admitValidation({ userId: firstId,
      supabaseId: 'isolated-admin-' + firstId, ideaId: idea.id, emailVerified: true })))
    expect(attempts.filter(result => result.status === 'fulfilled')).toHaveLength(2)
    expect(attempts.filter(result => result.status === 'rejected')).toHaveLength(3)
    expect(await account()).toMatchObject({ purchasedCredits: 400, validationsThisMonth: 2 })
    expect(await database.select().from(validationJobs)).toHaveLength(2)
    expect(await database.select().from(creditLedger)).toHaveLength(2)
  })

  it('serializes an owner downgrade with validation and charges the budget that was actually admitted', async () => {
    const input = { userIds: [firstId], tier: 'premium', reason: 'Isolated admission race fixture', requestId: randomUUID() }
    await assignAdminPlan(actor, input)
    await database.update(users).set({ purchasedCredits: 500 }).where(eq(users.id, firstId))
    const idea = await fixtureIdea()
    const [accepted] = await Promise.all([
      admitValidation({ userId: firstId, supabaseId: 'isolated-admin-' + firstId, ideaId: idea.id, emailVerified: true }),
      assignAdminPlan(actor, { ...input, tier: 'free', requestId: randomUUID() }),
    ])
    const snapshot = accepted.job.entitlementSnapshot!
    expect(accepted.job.isLite).toBe(snapshot.tier === 'free')
    expect(snapshot.creditCost).toBe(accepted.job.isLite ? 50 : 300)
    const ledger = await database.select().from(creditLedger).where(eq(creditLedger.transactionType, 'VALIDATION'))
    expect(ledger).toHaveLength(1)
    expect(ledger[0].amount).toBe(-snapshot.creditCost)
    expect((await account()).tier).toBe('free')
  })

  it('reuses one atomically admitted validation across simultaneous retries on real connections', async () => {
    const idea = await fixtureIdea()
    const attempts = await Promise.all(Array.from({ length: 6 }, () => admitValidation({ userId: firstId,
      supabaseId: 'isolated-admin-' + firstId, ideaId: idea.id, emailVerified: true })))
    expect(new Set(attempts.map(result => result.job.id)).size).toBe(1)
    expect(attempts.filter(result => !result.reused)).toHaveLength(1)
    expect(await database.select().from(creditLedger)).toHaveLength(1)
    expect((await account()).validationsThisMonth).toBe(1)
  })

  it('preserves legacy current-cycle consumption across real concurrent manual assignments', async () => {
    const end = new Date(Date.now() + 20 * 86_400_000)
    await database.update(users).set({ tier: 'premium', creditBalance: 1200, creditCycleAllowance: null,
      creditCycleStartedAt: null, creditResetAt: end, monthlyCreditsUsedThisCycle: 300,
      creditsUsedThisCycle: 350, purchasedCredits: 200, rewardCredits: 10,
      subscriptionStatus: 'canceled', subscriptionId: 'sub_legacy' }).where(eq(users.id, firstId))
    const input = { userIds: [firstId], tier: 'max_premium', reason: 'Isolated legacy plan fixture', requestId: randomUUID() }
    const results = await Promise.all(Array.from({ length: 4 }, () => assignAdminPlan(actor, input)))
    expect(results.filter(result => !result.duplicate)).toHaveLength(1)
    expect(await account()).toMatchObject({ tier: 'max_premium', creditBalance: 4200,
      monthlyCreditsUsedThisCycle: 300, creditsUsedThisCycle: 350, purchasedCredits: 200, rewardCredits: 10,
      creditCycleStartedAt: new Date(end.getTime() - 30 * 86_400_000), creditResetAt: end, subscriptionStatus: 'manual' })
    expect(await database.select().from(creditLedger)).toHaveLength(1)
    expect(await database.select().from(adminAuditLog)).toHaveLength(1)
  })

  it('applies a repeated bulk UUID once even when recipient order differs', async () => {
    const requestId = randomUUID()
    const outcomes = await Promise.all(Array.from({ length: 4 }, (_, index) =>
      grantAdminCredits(actor, grant(index % 2 ? [secondId, firstId] : [firstId, secondId], 19, requestId))))
    expect(outcomes.filter(result => !result.duplicate)).toHaveLength(1)
    expect((await account(firstId)).purchasedCredits).toBe(19)
    expect((await account(secondId)).purchasedCredits).toBe(19)
    expect(await database.select().from(creditLedger)).toHaveLength(2)
    const audit = await database.select().from(adminAuditLog)
    expect(audit).toHaveLength(2)
    expect(audit.every(entry => entry.requestId === requestId)).toBe(true)
    expect(new Set(audit.map(entry => entry.targetUserId)).size).toBe(2)
  })

  it('rejects one conflicting disjoint payload racing for the same UUID', async () => {
    const requestId = randomUUID()
    const inputs = [grant([firstId], 11, requestId), grant([secondId], 29, requestId)]
    const outcomes = await Promise.allSettled(inputs.map(input => grantAdminCredits(actor, input)))
    const winner = outcomes.findIndex(result => result.status === 'fulfilled')
    const rejected = outcomes.filter(result => result.status === 'rejected')
    expect(winner).toBeGreaterThanOrEqual(0)
    expect(outcomes.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(rejected).toHaveLength(1)
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({ status: 409, code: 'request_id_conflict' })
    expect((await account(firstId)).purchasedCredits).toBe(winner === 0 ? 11 : 0)
    expect((await account(secondId)).purchasedCredits).toBe(winner === 1 ? 29 : 0)
    expect(await database.select().from(creditLedger)).toHaveLength(1)
    expect(await database.select().from(adminAuditLog)).toHaveLength(1)
  })

  it('denies owner grants and lifecycle mutations without changing balances, state, or audit', async () => {
    const before = await account(ownerId)
    const attempts = await Promise.allSettled([
      grantAdminCredits(actor, grant([ownerId], 21)),
      ...(['block', 'unblock', 'deactivate', 'reactivate'] as const).map(action => changeAdminAccountStatus(actor, ownerId,
        { action, requestId: randomUUID(), reason: 'Owner protection fixture' })),
    ])
    expect(attempts.every(result => result.status === 'rejected')).toBe(true)
    for (const result of attempts) if (result.status === 'rejected') expect(result.reason).toMatchObject({ status: 409 })
    expect(await account(ownerId)).toEqual(before)
    expect(await database.select().from(creditLedger)).toHaveLength(0)
    expect(await database.select().from(adminAuditLog)).toHaveLength(0)
  })

  it('serializes blocking against spending and rejects all subsequent debits', async () => {
    const [blocked, ...spent] = await Promise.all([
      changeAdminAccountStatus(actor, firstId, { action: 'block', requestId: randomUUID(), reason: 'Concurrent block fixture' }),
      ...Array.from({ length: 3 }, () => deductCredits(firstId, 75, 'POSTGRES_ADMIN_SPEND', randomUUID())),
    ])
    expect(blocked).toMatchObject({ user: { accountStatus: 'blocked' } })
    const accepted = spent.filter(Boolean).length
    expect(accepted).toBeLessThanOrEqual(1)
    const saved = await account()
    expect(saved.creditBalance).toBe(100 - accepted * 75)
    expect(saved.creditBalance).toBeGreaterThanOrEqual(0)
    expect(saved.purchasedCredits).toBeGreaterThanOrEqual(0)
    expect(saved.rewardCredits).toBeGreaterThanOrEqual(0)
    expect(saved.accountStatus).toBe('blocked')
    expect(await database.select().from(creditLedger)).toHaveLength(accepted)
    expect(await deductCredits(firstId, 1, 'POSTGRES_ADMIN_AFTER_BLOCK', randomUUID())).toBe(false)
    expect((await account()).creditBalance).toBe(saved.creditBalance)
    expect(await database.select().from(creditLedger)).toHaveLength(accepted)
  })
})
