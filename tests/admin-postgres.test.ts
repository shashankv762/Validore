import { randomUUID } from 'node:crypto'
import { setTimeout as waitForLock } from 'node:timers/promises'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { eq, sql } from 'drizzle-orm'
import { adminAuditLog, creditLedger, users } from '@/db/schema'
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
let getAdminOverview: typeof import('@/lib/admin-data').getAdminOverview
let actor: AdminActor
let schemaName: string

const grant = (userIds: string[], amount: number, requestId = randomUUID()) => ({
  userIds, amount, requestId, type: 'general' as const, reason: 'Isolated PostgreSQL concurrency fixture',
})
const account = async (id = firstId) => (await database.query.users.findFirst({ where: eq(users.id, id) }))!

describe.skipIf(!target)('Admin operations on real PostgreSQL connections', () => {
  beforeAll(async () => {
    schemaName = scopedAdminPostgresSchema(target!)
    if (process.env.DATABASE_URL !== target) throw new Error('DATABASE_URL must exactly match the scoped TEST_DATABASE_URL')
    if (process.env.DB_MAX_CONNECTIONS !== '4') throw new Error('Run admin PostgreSQL tests through the four-connection isolated runner')
    ;({ db: database } = await import('@/db'))
    ;({ grantAdminCredits, changeAdminAccountStatus } = await import('@/lib/admin-actions'))
    ;({ deductCredits } = await import('@/lib/credits'))
    ;({ syncUserToDatabase } = await import('@/lib/auth-sync'))
    ;({ getAdminOverview } = await import('@/lib/admin-data'))
    const [scope] = await database.execute(sql`select current_schema() as name, current_schemas(false) as schemas`)
    if (scope.name !== schemaName || !Array.isArray(scope.schemas) || scope.schemas.length !== 1 || scope.schemas[0] !== schemaName) {
      throw new Error('The PostgreSQL session must resolve only the validated disposable schema')
    }
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
