import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'

// An isolated PostgreSQL engine: these tests never connect to DATABASE_URL.
// PGlite serializes transactions; staging must also verify multi-connection locks.
const state = vi.hoisted(() => ({ client: null as unknown as PGlite }))
vi.mock('@/db', async () => {
  const { PGlite } = await import('@electric-sql/pglite')
  const { drizzle } = await import('drizzle-orm/pglite')
  const schema = await import('@/db/schema')
  state.client = new PGlite()
  return { db: drizzle(state.client, { schema }) }
})
import { db } from '@/db'
import { creditLedger, rewardedAdSessions, users } from '@/db/schema'
import { cancelRewardSession, grantAdReward, rewardStatus, startRewardSession } from '@/lib/ads/rewards'
import { deductCredits, refundValidationCredits, topUpMonthlyCredits } from '@/lib/credits'
import type { RewardedAdConfig } from '@/lib/ads/config'

const owner = '11111111-1111-4111-8111-111111111111'
const other = '22222222-2222-4222-8222-222222222222'
const config: RewardedAdConfig = { provider: 'applixir', apiKey: 'test-public-key', gameId: '123', secret: 's'.repeat(32), dailyLimit: 5, globalDailyLimit: 50 }
const claim = (sessionId: string, transactionId: string = randomUUID()) => ({ provider: 'applixir', sessionId, transactionId })
const account = (id = owner) => db.query.users.findFirst({ where: eq(users.id, id) })
let migration: string

beforeAll(async () => {
  await state.client.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE TYPE tier AS ENUM ('free', 'premium', 'max_premium');
    CREATE TABLE users (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text NOT NULL UNIQUE,
      supabase_id text NOT NULL UNIQUE, tier tier NOT NULL DEFAULT 'free',
      stripe_customer_id text, razorpay_customer_id text, subscription_id text, subscription_status text,
      cancel_at_period_end boolean DEFAULT false, current_period_end timestamp,
      is_founding_member boolean DEFAULT false, crowdfunding_credits integer NOT NULL DEFAULT 0,
      pitch_deck_credits integer NOT NULL DEFAULT 0, validations_this_month integer NOT NULL DEFAULT 0,
      validation_reset_at timestamp, credit_balance integer NOT NULL DEFAULT 0,
      purchased_credits integer NOT NULL DEFAULT 0, credits_used_this_cycle integer NOT NULL DEFAULT 0,
      credit_reset_at timestamp, preferred_ai_provider text DEFAULT 'free_models', encrypted_openrouter_key text,
      created_at timestamp DEFAULT now(), updated_at timestamp DEFAULT now()
    );
    CREATE TABLE credit_ledger (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id),
      amount integer NOT NULL, transaction_type text NOT NULL, description text, created_at timestamp DEFAULT now()
    );
  `)
  migration = await readFile(new URL('../drizzle/0004_rewarded_ads.sql', import.meta.url), 'utf8')
  await state.client.exec(migration)
}, 30_000)

beforeEach(async () => {
  await state.client.exec('TRUNCATE credit_ledger, rewarded_ad_sessions, users CASCADE')
  await db.insert(users).values([owner, other].map(id => ({ id, email: id + '@example.test', supabaseId: id,
    creditBalance: 100, purchasedCredits: 25, creditResetAt: new Date(Date.now() + 29 * 86_400_000) })))
})
afterAll(async () => { await state.client.close() })

describe('rewarded credits with PostgreSQL transactions', () => {
  it('awards exactly 10 once when callbacks arrive repeatedly', async () => {
    const { session } = await startRewardSession(owner, config)
    const completion = claim(session.id)
    const results = await Promise.all([grantAdReward(completion, config), grantAdReward(completion, config), grantAdReward(completion, config)])
    expect(results.filter(result => result === 'rewarded')).toHaveLength(1)
    expect(results.filter(result => result === 'duplicate')).toHaveLength(2)
    expect(await account()).toMatchObject({ rewardCredits: 10, creditBalance: 100, purchasedCredits: 25 })
    expect(await db.select().from(creditLedger)).toMatchObject([{ amount: 10, transactionType: 'AD_REWARD', userId: owner }])
  })

  it('rejects a transaction reference replayed for another user', async () => {
    const first = await startRewardSession(owner, config)
    const second = await startRewardSession(other, config)
    expect(await grantAdReward(claim(first.session.id, 'same-provider-reference'), config)).toBe('rewarded')
    expect(await grantAdReward(claim(second.session.id, 'same-provider-reference'), config)).toBe('duplicate')
    expect(await account(other)).toMatchObject({ rewardCredits: 0 })
  })

  it('recovers owned pending sessions and prevents another user reading or cancelling them', async () => {
    const { session } = await startRewardSession(owner, config)
    expect((await rewardStatus(owner, config)).session?.id).toBe(session.id)
    expect((await rewardStatus(other, config)).session).toBeNull()
    await expect(rewardStatus(other, config, session.id)).rejects.toMatchObject({ status: 404 })
    await cancelRewardSession(other, session.id)
    expect((await rewardStatus(owner, config, session.id)).session?.status).toBe('pending')
  })

  it('reserves only one active ad per user and respects the global reservation cap', async () => {
    const settings = { ...config, globalDailyLimit: 1 }
    const starts = await Promise.allSettled([startRewardSession(owner, settings), startRewardSession(owner, settings)])
    expect(starts.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    await expect(startRewardSession(other, settings)).rejects.toMatchObject({ status: 429 })
    const session = (await rewardStatus(owner, settings)).session!
    await cancelRewardSession(owner, session.id)
    await expect(startRewardSession(other, settings)).resolves.toHaveProperty('session')
  })

  it('honors daily grant caps even for a delayed callback from a cancelled session', async () => {
    const settings = { ...config, dailyLimit: 1, globalDailyLimit: 1 }
    const delayed = await startRewardSession(owner, settings)
    await cancelRewardSession(owner, delayed.session.id)
    const active = await startRewardSession(other, settings)
    expect(await grantAdReward(claim(active.session.id), settings)).toBe('rewarded')
    expect(await grantAdReward(claim(delayed.session.id), settings)).toBe('capped')
    expect(await account()).toMatchObject({ rewardCredits: 0 })
    expect((await rewardStatus(other, settings)).remainingToday).toBe(0)
    await expect(startRewardSession(owner, settings)).rejects.toMatchObject({ status: 429 })
  })

  it('enforces the per-user daily cap and cooldown without consuming more credits', async () => {
    const settings = { ...config, dailyLimit: 1 }
    const { session } = await startRewardSession(owner, settings)
    await grantAdReward(claim(session.id), settings)
    await expect(startRewardSession(owner, settings)).rejects.toMatchObject({ status: 429, retryAfter: expect.any(Number) })
    await db.update(rewardedAdSessions).set({ rewardedAt: new Date(Date.now() - 61_000) }).where(eq(rewardedAdSessions.id, session.id))
    await expect(startRewardSession(owner, settings)).rejects.toMatchObject({ status: 429 })
    expect(await account()).toMatchObject({ rewardCredits: 10 })
  })

  it('ignores expired and unknown sessions; accepts a valid late completion after cancellation', async () => {
    expect(await grantAdReward(claim(randomUUID()), config)).toBe('ignored')
    const expired = await startRewardSession(owner, config)
    await db.update(rewardedAdSessions).set({ createdAt: new Date(Date.now() - 3600_000), expiresAt: new Date(Date.now() - 1000) }).where(eq(rewardedAdSessions.id, expired.session.id))
    expect(await grantAdReward(claim(expired.session.id), config)).toBe('expired')
    const late = await startRewardSession(owner, config)
    await cancelRewardSession(owner, late.session.id)
    expect(await grantAdReward(claim(late.session.id), config)).toBe('rewarded')
    expect(await account()).toMatchObject({ rewardCredits: 10 })
  })

  it('rolls back the balance and session when the ledger write fails, then safely retries', async () => {
    const { session } = await startRewardSession(owner, config)
    const completion = claim(session.id)
    await state.client.exec("ALTER TABLE credit_ledger ADD CONSTRAINT simulate_ledger_failure CHECK (transaction_type <> 'AD_REWARD')")
    try {
      await expect(grantAdReward(completion, config)).rejects.toThrow()
      expect(await account()).toMatchObject({ rewardCredits: 0 })
      expect((await rewardStatus(owner, config, session.id)).session?.status).toBe('pending')
      expect(await db.select().from(creditLedger)).toHaveLength(0)
    } finally {
      await state.client.exec('ALTER TABLE credit_ledger DROP CONSTRAINT simulate_ledger_failure')
    }
    expect(await grantAdReward(completion, config)).toBe('rewarded')
  })

  it('funds an extra Free Lite validation only from earned credits and refunds it once', async () => {
    await db.update(users).set({ rewardCredits: 50, validationsThisMonth: 2 }).where(eq(users.id, owner))
    const jobs = [randomUUID(), randomUUID()]
    const deductions = await Promise.all(jobs.map(job => deductCredits(owner, 50, 'VALIDATION', job, 2)))
    expect(deductions.filter(Boolean)).toHaveLength(1)
    expect(await account()).toMatchObject({ rewardCredits: 0, creditBalance: 100, purchasedCredits: 25, validationsThisMonth: 3, creditsUsedThisCycle: 50 })
    const job = jobs[deductions.indexOf(true)]
    await Promise.all([refundValidationCredits(owner, job), refundValidationCredits(owner, job)])
    expect(await account()).toMatchObject({ rewardCredits: 50, creditBalance: 100, purchasedCredits: 25, validationsThisMonth: 2, creditsUsedThisCycle: 0 })
    expect((await db.select().from(creditLedger)).filter(row => row.transactionType === 'VALIDATION_REFUND')).toHaveLength(1)
  })

  it('does not bypass paid validation caps or fund full reports beyond the Free allowance', async () => {
    await db.update(users).set({ rewardCredits: 500, validationsThisMonth: 2 }).where(eq(users.id, owner))
    expect(await deductCredits(owner, 300, 'VALIDATION', randomUUID(), 2)).toBe(false)
    await db.update(users).set({ tier: 'premium', validationsThisMonth: 10 }).where(eq(users.id, owner))
    expect(await deductCredits(owner, 50, 'VALIDATION', randomUUID(), 10)).toBe(false)
    await db.update(users).set({ tier: 'free', rewardCredits: 49 }).where(eq(users.id, owner))
    expect(await deductCredits(owner, 50, 'VALIDATION', randomUUID(), 2)).toBe(false)
    expect(await db.select().from(creditLedger)).toHaveLength(0)
  })

  it('spends plan then earned then purchased credits and preserves earnings on a cycle reset', async () => {
    await db.update(users).set({ creditBalance: 10, rewardCredits: 30 }).where(eq(users.id, owner))
    expect(await deductCredits(owner, 50, 'VALIDATION', randomUUID(), 2)).toBe(true)
    expect(await account()).toMatchObject({ creditBalance: 0, rewardCredits: 0, purchasedCredits: 15 })
    await db.update(users).set({ rewardCredits: 20, creditResetAt: new Date(Date.now() - 1000) }).where(eq(users.id, owner))
    await topUpMonthlyCredits(owner)
    expect(await account()).toMatchObject({ creditBalance: 100, rewardCredits: 20, purchasedCredits: 15 })
  })

  it('keeps migration reruns additive and denies browser roles access to reward data', async () => {
    await db.update(users).set({ rewardCredits: 20 }).where(eq(users.id, owner))
    await state.client.exec(migration)
    expect(await account()).toMatchObject({ rewardCredits: 20, purchasedCredits: 25, creditBalance: 100 })
    await expect(db.update(users).set({ rewardCredits: -1 }).where(eq(users.id, owner))).rejects.toThrow()
    const { rows } = await state.client.query<{ rls: boolean; exposed: boolean }>(`
      SELECT c.relrowsecurity AS rls,
        has_table_privilege('anon', c.oid, 'SELECT') OR has_table_privilege('authenticated', c.oid, 'UPDATE') AS exposed
      FROM pg_class c WHERE c.oid = 'public.rewarded_ad_sessions'::regclass
    `)
    expect(rows).toEqual([{ rls: true, exposed: false }])
  })
})
