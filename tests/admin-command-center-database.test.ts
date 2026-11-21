import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { and, eq } from 'drizzle-orm'

const state = vi.hoisted(() => ({ client: null as unknown as PGlite, deleteUser: vi.fn() }))
vi.mock('@/db', async () => {
  const { PGlite } = await import('@electric-sql/pglite')
  const { drizzle } = await import('drizzle-orm/pglite')
  const schema = await import('@/db/schema')
  state.client = new PGlite()
  return { db: drizzle(state.client, { schema }) }
})
vi.mock('@/lib/supabase/admin', () => ({ createAuthAdminClient: () => ({ auth: { admin: { deleteUser: state.deleteUser } } }) }))
vi.mock('@/lib/validation/engine', () => ({ runLiteValidation: vi.fn(), runFullValidation: vi.fn() }))
import { db } from '@/db'
import * as schema from '@/db/schema'
import { grantAdminCredits, changeAdminAccountStatus } from '@/lib/admin-actions'
import { deleteAdminUser } from '@/lib/admin-user-deletion'
import { getAdminOverview, getAdminUserDetail, getAdminUsers } from '@/lib/admin-data'
import { readAdminSettings, updateAdminPlans, updateAdminSettings } from '@/lib/admin-settings'
import { resolvePlan, toAdminPlan } from '@/lib/plan-catalog'
import { deductCredits, topUpMonthlyCredits } from '@/lib/credits'
import type { AdminActor } from '@/lib/admin-requests'

const ownerId = '11111111-1111-4111-8111-111111111111'
const targetId = '22222222-2222-4222-8222-222222222222'
const otherId = '33333333-3333-4333-8333-333333333333'
let actor: AdminActor
const account = (id = targetId) => db.query.users.findFirst({ where: eq(schema.users.id, id) })
const grant = (overrides = {}) => ({ userIds: [targetId], type: 'general', amount: 200, reason: 'Founder support allowance', requestId: randomUUID(), ...overrides })
const action = (name: string) => ({ action: name, reason: 'Account review decision', requestId: randomUUID() })
const ideaValues = { name: 'Fixture idea', industry: 'Software', product: 'A test planning workspace', targetCustomer: 'Founders',
  location: 'India', businessModel: 'Subscription', coreProblem: 'Missing research', proposedSolution: 'Structured evidence' }

beforeAll(async () => {
  const { generateDrizzleJson, generateMigration } = await import('drizzle-kit/api')
  const statements = await generateMigration(generateDrizzleJson({}), generateDrizzleJson(schema))
  for (const statement of statements) await state.client.exec(statement)
  await state.client.exec('CREATE ROLE anon; CREATE ROLE authenticated;')
  await state.client.exec(await readFile(new URL('../drizzle/0006_admin_command_center.sql', import.meta.url), 'utf8'))
  // PGlite serializes transactions. Real multi-connection lock acceptance is separate.
  await state.client.exec("CREATE OR REPLACE FUNCTION pg_advisory_xact_lock(integer) RETURNS void LANGUAGE SQL AS 'SELECT NULL::void'")
}, 30_000)
beforeEach(async () => {
  vi.stubEnv('DATABASE_URL', 'postgres://isolated-admin-fixture')
  vi.stubEnv('STRIPE_SECRET_KEY', '')
  await state.client.exec('TRUNCATE users, tier_config, platform_settings, admin_audit_log CASCADE')
  state.deleteUser.mockReset().mockResolvedValue({ data: { user: null }, error: null })
  const now = new Date()
  const [owner] = await db.insert(schema.users).values({ id: ownerId, email: 'shashankv7623@gmail.com', supabaseId: 'fixture-owner', isAdmin: true, creditBalance: 5 }).returning()
  actor = owner
  await db.insert(schema.users).values([targetId, otherId].map((id, index) => ({ id, email: index ? 'other@example.test' : 'target@example.test', supabaseId: 'fixture-' + id,
    creditBalance: 50, creditCycleAllowance: 100, creditCycleStartedAt: new Date(now.getTime() - 86_400_000),
    creditResetAt: new Date(now.getTime() + 29 * 86_400_000), monthlyCreditsUsedThisCycle: 50, creditsUsedThisCycle: 50,
    validationsThisMonth: 1, validationResetAt: new Date(now.getTime() + 29 * 86_400_000) })))
})
afterEach(() => vi.unstubAllEnvs())
afterAll(() => state.client.close())

describe('Private admin data and atomic credit grants', () => {
  it('denies a regular account and forged owner flag at the data boundary', async () => {
    const regular = (await account())!
    await expect(getAdminOverview(regular)).rejects.toMatchObject({ status: 404 })
    await expect(getAdminUsers({ ...regular, isAdmin: true }, {})).rejects.toMatchObject({ status: 404 })
    await expect(grantAdminCredits({ ...regular, isAdmin: true }, grant())).rejects.toMatchObject({ status: 404 })
    expect(await db.select().from(schema.adminAuditLog)).toHaveLength(0)
    expect((await account())?.purchasedCredits).toBe(0)
  })

  it('keeps one active pinned owner and denies browser Data API table access', async () => {
    await expect(db.insert(schema.users).values({ email: 'second@example.test', supabaseId: 'fixture-second', isAdmin: true })).rejects.toThrow()
    await expect(db.update(schema.users).set({ accountStatus: 'blocked' }).where(eq(schema.users.id, ownerId))).rejects.toThrow()
    for (const role of ['anon', 'authenticated']) {
      await state.client.exec('SET ROLE ' + role)
      try {
        await expect(state.client.query('SELECT * FROM admin_audit_log')).rejects.toThrow()
        await expect(state.client.query('UPDATE platform_settings SET signup_enabled = false')).rejects.toThrow()
      } finally { await state.client.exec('RESET ROLE') }
    }
    expect((await account(ownerId))?.accountStatus).toBe('active')
  })

  it.each([['general', 'purchasedCredits'], ['crowdfunding', 'crowdfundingCredits'], ['pitch_deck', 'pitchDeckCredits']] as const)
    ('grants %s credits with a matching immutable credit and admin record', async (type, field) => {
      const input = grant({ type, amount: 30 })
      expect(await grantAdminCredits(actor, input)).toMatchObject({ recipients: 1, amount: 30, duplicate: false })
      expect((await account())?.[field]).toBe(30)
      expect(await db.select().from(schema.creditLedger)).toMatchObject([{ userId: targetId, amount: 30, transactionType: 'ADMIN_' + type.toUpperCase() + '_GRANT' }])
      expect(await db.select().from(schema.adminAuditLog)).toMatchObject([{ actorId: ownerId, targetUserId: targetId, reason: input.reason, details: { amount: 30, before: 0, after: 30 } }])
    })

  it('preserves general grants across a monthly plan reset', async () => {
    await grantAdminCredits(actor, grant())
    await db.update(schema.users).set({ creditResetAt: new Date(0) }).where(eq(schema.users.id, targetId))
    await topUpMonthlyCredits(targetId)
    expect(await account()).toMatchObject({ creditBalance: 0, purchasedCredits: 200 })
  })

  it('rolls back an entire selection when one recipient is absent or deactivated', async () => {
    await expect(grantAdminCredits(actor, grant({ userIds: [targetId, randomUUID()] }))).rejects.toMatchObject({ status: 404 })
    await db.update(schema.users).set({ accountStatus: 'deactivated' }).where(eq(schema.users.id, otherId))
    await expect(grantAdminCredits(actor, grant({ userIds: [targetId, otherId] }))).rejects.toThrow('Reactivate')
    expect(await db.select().from(schema.creditLedger)).toHaveLength(0)
    expect(await db.select().from(schema.adminAuditLog)).toHaveLength(0)
    expect((await account())?.purchasedCredits).toBe(0)
  })

  it('applies parallel duplicate grant retries once and rejects changed payload references', async () => {
    const input = grant({ userIds: [otherId, targetId] })
    const results = await Promise.all([grantAdminCredits(actor, input), grantAdminCredits(actor, input)])
    expect(results.filter(result => !result.duplicate)).toHaveLength(1)
    expect(await db.select().from(schema.creditLedger)).toHaveLength(2)
    expect(await db.select().from(schema.adminAuditLog)).toHaveLength(2)
    expect((await account())?.purchasedCredits).toBe(200)
    await expect(grantAdminCredits(actor, { ...input, amount: 201 })).rejects.toMatchObject({ code: 'request_id_conflict' })
    expect((await account())?.purchasedCredits).toBe(200)
  })

  it('rejects invalid grants, owner targets, and integer overflow without recording a change', async () => {
    await expect(grantAdminCredits(actor, grant({ amount: -1 }))).rejects.toThrow()
    await expect(grantAdminCredits(actor, grant({ isAdmin: true }))).rejects.toThrow()
    await expect(grantAdminCredits(actor, grant({ userIds: [ownerId] }))).rejects.toThrow('unlimited')
    await db.update(schema.users).set({ purchasedCredits: 2_147_483_640 }).where(eq(schema.users.id, targetId))
    await expect(grantAdminCredits(actor, grant())).rejects.toThrow('exceed')
    expect(await db.select().from(schema.adminAuditLog)).toHaveLength(0)
  })

  it('searches by literal email and account ID and returns only safe account fields', async () => {
    expect((await getAdminUsers(actor, { q: targetId })).users.map(user => user.id)).toEqual([targetId])
    expect((await getAdminUsers(actor, { q: 'target@' })).users).toHaveLength(1)
    expect((await getAdminUsers(actor, { q: '%' })).users).toHaveLength(0)
    const detail = await getAdminUserDetail(actor, targetId)
    expect(JSON.stringify(detail)).not.toContain('supabaseId')
    expect(JSON.stringify(detail)).not.toContain('encryptedOpenrouterKey')
    expect(detail.user.accountStatus).toBe('active')
  })
})

describe('Account lifecycle, cancellation, and permanent cleanup', () => {
  it.each([['block', 'unblock'], ['deactivate', 'reactivate']])('keeps new work after restoring access when an old %s UUID is retried', async (restrict, restore) => {
    const original = action(restrict)
    await changeAdminAccountStatus(actor, targetId, original)
    const [audit] = await db.select().from(schema.adminAuditLog).where(eq(schema.adminAuditLog.requestId, original.requestId))
    expect(audit.details.validationJobIds).toEqual([])
    await changeAdminAccountStatus(actor, targetId, action(restore))
    const [idea] = await db.insert(schema.ideas).values({ userId: targetId, ...ideaValues }).returning()
    const [job] = await db.insert(schema.validationJobs).values({ userId: targetId, ideaId: idea.id, isLite: true }).returning()
    expect(await deductCredits(targetId, 50, 'VALIDATION', job.id, 2)).toBe(true)
    const before = await account()
    expect(await changeAdminAccountStatus(actor, targetId, original)).toMatchObject({ duplicate: true, user: { accountStatus: 'active' } })
    expect(await account()).toEqual(before)
    expect(await db.query.validationJobs.findFirst({ where: eq(schema.validationJobs.id, job.id) })).toMatchObject({ status: 'pending' })
    expect(await db.select().from(schema.creditLedger).where(eq(schema.creditLedger.transactionType, 'VALIDATION_REFUND'))).toHaveLength(0)
    expect(await db.select().from(schema.adminAuditLog).where(eq(schema.adminAuditLog.requestId, original.requestId))).toHaveLength(1)
  })
  it('blocks immediately, cancels and refunds a pending job once, and then unblocks', async () => {
    const [idea] = await db.insert(schema.ideas).values({ userId: targetId, ...ideaValues }).returning()
    const [job] = await db.insert(schema.validationJobs).values({ userId: targetId, ideaId: idea.id, isLite: true }).returning()
    const user = (await account())!
    await db.insert(schema.creditLedger).values({ userId: targetId, amount: -50, transactionType: 'VALIDATION',
      description: JSON.stringify({ entityId: job.id, monthly: 50, purchased: 0, reward: 0, cycleStartedAt: user.creditCycleStartedAt!.toISOString(), cycleSubscriptionId: null }) })
    const input = action('block')
    await changeAdminAccountStatus(actor, targetId, input)
    await changeAdminAccountStatus(actor, targetId, input)
    const [audit] = await db.select().from(schema.adminAuditLog).where(eq(schema.adminAuditLog.requestId, input.requestId))
    expect(audit.details.validationJobIds).toEqual([job.id])
    expect(await account()).toMatchObject({ accountStatus: 'blocked', creditBalance: 100, validationsThisMonth: 0 })
    expect(await db.query.validationJobs.findFirst({ where: eq(schema.validationJobs.id, job.id) })).toMatchObject({ status: 'failed' })
    const refunds = await db.select().from(schema.creditLedger).where(eq(schema.creditLedger.transactionType, 'VALIDATION_REFUND'))
    expect(refunds).toHaveLength(1)
    await changeAdminAccountStatus(actor, targetId, action('unblock'))
    expect((await account())?.accountStatus).toBe('active')
    await expect(changeAdminAccountStatus(actor, ownerId, action('deactivate'))).rejects.toThrow('owner')
  })

  it('requires separate deactivation and exact email confirmation for deletion', async () => {
    const input = { email: 'target@example.test', reason: 'Requested permanent removal', requestId: randomUUID() }
    await expect(deleteAdminUser(actor, targetId, input)).rejects.toThrow('Deactivate')
    await changeAdminAccountStatus(actor, targetId, action('deactivate'))
    await expect(deleteAdminUser(actor, targetId, { ...input, email: 'other@example.test' })).rejects.toMatchObject({ status: 400 })
    await expect(deleteAdminUser(actor, ownerId, { ...input, email: actor.email })).rejects.toThrow('owner')
    expect(state.deleteUser).not.toHaveBeenCalled()
    expect((await account())?.accountStatus).toBe('deactivated')
    await changeAdminAccountStatus(actor, targetId, action('reactivate'))
    expect((await account())?.accountStatus).toBe('active')
  })

  it('removes the selected Auth identity and every dependent table while retaining audits and other users', async () => {
    const [idea] = await db.insert(schema.ideas).values({ userId: targetId, ...ideaValues }).returning()
    await db.insert(schema.ideas).values({ userId: otherId, ...ideaValues })
    const [job] = await db.insert(schema.validationJobs).values({ userId: targetId, ideaId: idea.id, status: 'complete' }).returning()
    await db.insert(schema.validationReports).values({ userId: targetId, ideaId: idea.id, jobId: job.id })
    await db.insert(schema.leanCanvases).values({ userId: targetId, ideaId: idea.id })
    await db.insert(schema.crowdfundingAnalyses).values({ userId: targetId, ideaId: idea.id })
    await db.insert(schema.pricingSimulations).values({ userId: targetId, ideaId: idea.id })
    await db.insert(schema.pitchDecks).values({ userId: targetId, ideaId: idea.id })
    await db.insert(schema.creditPurchases).values({ userId: targetId, creditType: 'bundle', amountUsd: 1 })
    await db.insert(schema.userDevices).values({ userId: targetId, deviceFingerprint: 'fixture-device' })
    await db.insert(schema.rewardedAdSessions).values({ userId: targetId, expiresAt: new Date(Date.now() + 60000) })
    await state.client.query('INSERT INTO founder_interviews(user_id, idea_id, idea_fingerprint, notice_version, state) VALUES ($1,$2,$3,$4,$5)', [targetId, idea.id, 'fixture', 'v1', '{}'])
    await grantAdminCredits(actor, grant())
    await changeAdminAccountStatus(actor, targetId, action('deactivate'))
    const input = { email: 'target@example.test', reason: 'Requested permanent removal', requestId: randomUUID() }
    expect(await deleteAdminUser(actor, targetId, input)).toMatchObject({ deleted: true, duplicate: false })
    expect(await deleteAdminUser(actor, targetId, input)).toMatchObject({ deleted: true, duplicate: true })
    expect(state.deleteUser).toHaveBeenCalledExactlyOnceWith('fixture-' + targetId)
    expect(await account()).toBeUndefined()
    expect(await account(otherId)).toBeDefined()
    for (const table of ['validation_reports', 'founder_interviews', 'lean_canvases', 'crowdfunding_analyses', 'pricing_simulations', 'pitch_decks', 'validation_jobs', 'ideas', 'credit_purchases', 'credit_ledger', 'rewarded_ad_sessions', 'user_devices']) {
      const result = await state.client.query<{ n: number }>('SELECT count(*)::int AS n FROM ' + table + ' WHERE user_id = $1', [targetId])
      expect(result.rows[0].n, table).toBe(0)
    }
    const logs = await db.select().from(schema.adminAuditLog).where(eq(schema.adminAuditLog.targetUserId, targetId))
    expect(logs).toHaveLength(3)
    expect(logs.find(log => log.action === 'user.delete')?.details.state).toBe('complete')
    expect((await getAdminOverview(actor)).activity.creditsGranted).toBe(200)
  })

  it('retains a deactivated account on provider failure and supports the same audited retry', async () => {
    await changeAdminAccountStatus(actor, targetId, action('deactivate'))
    const input = { email: 'target@example.test', reason: 'Requested permanent removal', requestId: randomUUID() }
    state.deleteUser.mockResolvedValueOnce({ data: { user: null }, error: { status: 500, code: 'unexpected_failure' } })
    await expect(deleteAdminUser(actor, targetId, input)).rejects.toMatchObject({ code: 'identity_delete_failed' })
    expect((await account())?.accountStatus).toBe('deactivated')
    const [failed] = await db.select().from(schema.adminAuditLog).where(eq(schema.adminAuditLog.action, 'user.delete'))
    expect(failed.details.state).toBe('failed')
    await deleteAdminUser(actor, targetId, input)
    expect(await account()).toBeUndefined()
    expect(await db.select().from(schema.adminAuditLog).where(eq(schema.adminAuditLog.action, 'user.delete'))).toHaveLength(1)
  })

  it('prevents reactivation while an external identity deletion is pending', async () => {
    await changeAdminAccountStatus(actor, targetId, action('deactivate'))
    let finish!: (value: unknown) => void
    let started!: () => void
    const began = new Promise<void>(resolve => { started = resolve })
    state.deleteUser.mockImplementationOnce(() => { started(); return new Promise(resolve => { finish = resolve }) })
    const deleting = deleteAdminUser(actor, targetId, { email: 'target@example.test', reason: 'Requested permanent removal', requestId: randomUUID() })
    await began
    await expect(changeAdminAccountStatus(actor, targetId, action('reactivate'))).rejects.toThrow('in progress')
    finish({ data: { user: null }, error: null })
    await deleting
    expect(await account()).toBeUndefined()
  })
})

describe('Audited settings and plan updates', () => {
  it('persists settings and records only one change across retries', async () => {
    const input = { settings: { announcement: { enabled: true, message: 'Maintenance on Sunday' }, maintenance: { enabled: false, message: '' }, signupEnabled: false },
      reason: 'Prepare the platform release', requestId: randomUUID() }
    await updateAdminSettings(actor, input)
    expect(await updateAdminSettings(actor, input)).toMatchObject({ duplicate: true })
    expect((await readAdminSettings(actor)).settings).toEqual(input.settings)
    expect(await db.select().from(schema.adminAuditLog)).toHaveLength(1)
    await expect(updateAdminSettings(actor, { ...input, settings: { ...input.settings, signupEnabled: true } })).rejects.toMatchObject({ code: 'request_id_conflict' })
  })

  it('updates the complete plan set atomically and rejects malformed or duplicate tiers', async () => {
    const plans = ['free', 'premium', 'max_premium'].map(tier => toAdminPlan(resolvePlan(tier as 'free' | 'premium' | 'max_premium')))
    plans[1] = { ...plans[1], monthlyCredits: 2000, benefits: ['Custom plan benefit'], canPricingSimulator: false }
    const input = { plans, reason: 'Update plan benefits and included credits', requestId: randomUUID() }
    const result = await updateAdminPlans(actor, input)
    expect(result.plans[1]).toMatchObject(plans[1])
    await updateAdminPlans(actor, input)
    expect(await db.select().from(schema.adminAuditLog)).toHaveLength(1)
    await expect(updateAdminPlans(actor, { ...input, requestId: randomUUID(), plans: [plans[0], plans[0], plans[2]] })).rejects.toThrow()
    await expect(updateAdminPlans(actor, { ...input, requestId: randomUUID(), plans: [plans[0], { ...plans[1], monthlyPriceUsd: 39 }, plans[2]] })).rejects.toThrow('prices are fixed')
    await expect(updateAdminPlans(actor, { ...input, requestId: randomUUID(), plans: [{ ...plans[0], monthlyPriceUsd: 2 }, plans[1], plans[2]] })).rejects.toThrow('free')
    expect(await db.select().from(schema.adminAuditLog).where(and(eq(schema.adminAuditLog.action, 'plans.update')))).toHaveLength(1)
  })
})
