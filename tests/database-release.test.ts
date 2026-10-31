import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { and, eq, sql } from 'drizzle-orm'
import { db } from '@/db'
import { users, ideas, validationJobs, creditLedger } from '@/db/schema'
import { syncUserToDatabase } from '@/lib/auth-sync'
import { checkCredits, deductCredits, topUpMonthlyCredits } from '@/lib/credits'
import { failValidationJob, completeValidationJob, reapStaleValidationJobs } from '@/lib/validation/jobs'

const enabled = Boolean(process.env.TEST_DATABASE_URL && process.env.TEST_DATABASE_URL === process.env.DATABASE_URL)
describe.skipIf(!enabled)('Isolated PostgreSQL release checks', () => {
  beforeAll(async () => {
    const [row] = await db.execute(sql`select current_schema() as schema`)
    if (!String(row.schema).startsWith('validore_test_')) throw new Error('Integration tests require an isolated validore_test_ schema')
  })
  afterAll(async () => { await db.$client.end({ timeout: 2 }) })

  const profile = async () => {
    const id = randomUUID()
    return (await syncUserToDatabase({ id, email: `${id}@example.com` }))!
  }

  it('provisions one profile and initial allowance for simultaneous first logins', async () => {
    const id = randomUUID()
    const results = await Promise.all(Array.from({ length: 4 }, () => syncUserToDatabase({ id, email: `${id}@example.com` })))
    expect(new Set(results.map(user => user?.id)).size).toBe(1)
    expect(results.every(user => user?.creditBalance === 100)).toBe(true)
  })

  it('never overspends credits or the monthly allowance under concurrent requests', async () => {
    const user = await profile()
    const outcomes = await Promise.all(Array.from({ length: 4 }, () => deductCredits(user.id, 50, 'VALIDATION', randomUUID(), 2)))
    expect(outcomes.filter(Boolean)).toHaveLength(2)
    const saved = await db.query.users.findFirst({ where: eq(users.id, user.id) })
    expect(saved?.creditBalance).toBe(0)
    expect(saved?.validationsThisMonth).toBe(2)
  })

  it('renews a due allowance without cron and does not overwrite purchased credits', async () => {
    const user = await profile()
    await db.update(users).set({ creditBalance: 0, purchasedCredits: 17, creditResetAt: new Date(0) }).where(eq(users.id, user.id))
    expect(await checkCredits(user.id, 50)).toEqual({ allowed: true, balance: 117 })
    expect(await deductCredits(user.id, 50, 'TEST')).toBe(true)
    expect(await topUpMonthlyCredits(user.id)).toBe(false)
    const saved = await db.query.users.findFirst({ where: eq(users.id, user.id) })
    expect(saved?.creditBalance).toBe(50)
    expect(saved?.purchasedCredits).toBe(17)
  })

  it.each([new Date(0), null])('recovers a stale job with updatedAt=%s exactly once and rejects completion after its refund', async (updatedAt) => {
    const user = await profile()
    const [idea] = await db.insert(ideas).values({ userId: user.id, name: 'Isolated release test', industry: 'Software', product: 'Planner', targetCustomer: 'Founders', location: 'India', businessModel: 'SaaS', coreProblem: 'Planning is slow', proposedSolution: 'Guided planning' }).returning()
    const [job] = await db.insert(validationJobs).values({ userId: user.id, ideaId: idea.id, status: 'running', createdAt: new Date(0), updatedAt, isLite: true }).returning()
    await deductCredits(user.id, 50, 'VALIDATION', job.id, 2)
    await Promise.all([reapStaleValidationJobs(job.id), failValidationJob(job.id)])
    const saved = await db.query.users.findFirst({ where: eq(users.id, user.id) })
    expect(saved?.creditBalance).toBe(100)
    expect(saved?.validationsThisMonth).toBe(0)
    const refunds = await db.select().from(creditLedger).where(and(eq(creditLedger.userId, user.id), eq(creditLedger.transactionType, 'VALIDATION_REFUND')))
    expect(refunds).toHaveLength(1)
    await expect(completeValidationJob(job.id, {} as Parameters<typeof completeValidationJob>[1])).rejects.toThrow('already refunded')
  })
})
