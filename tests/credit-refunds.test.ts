import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'

const mocks = vi.hoisted(() => ({ user: {} as Record<string, unknown>, results: [] as unknown[][], changes: [] as Record<string, SQL>[], insert: vi.fn() }))
vi.mock('@/db', () => ({ db: { transaction: async (run: (tx: unknown) => unknown) => run({
  select: () => ({ from: () => ({ where: () => ({ for: async () => [mocks.user], limit: async () => mocks.results.shift() ?? [] }) }) }),
  update: () => ({ set: (values: Record<string, SQL>) => { mocks.changes.push(values); return { where: async () => undefined } } }),
  insert: () => ({ values: mocks.insert }),
}) } }))
import { refundValidationCredits } from '@/lib/credits'

const job = '22222222-2222-4222-8222-222222222222'
const spend = (createdAt: string) => ({ amount: -50, description: JSON.stringify({ entityId: job, monthly: 30, purchased: 20 }), createdAt: new Date(createdAt) })
const params = (field: string) => new PgDialect().sqlToQuery(mocks.changes.at(-1)![field]).params
beforeEach(() => {
  vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-31T12:00:00Z'))
  mocks.user = { id: 'owner', tier: 'free', creditResetAt: new Date('2026-11-20T12:00:00Z'), creditBalance: 70, purchasedCredits: 10, creditsUsedThisCycle: 80, validationsThisMonth: 2 }
  mocks.results = [[], [spend('2026-10-25T12:00:00Z')]]
  mocks.changes = []
})
afterEach(() => vi.useRealTimers())

describe('cycle-aware validation refunds', () => {
  it('restores the original credit pools and cycle spend for a current-cycle failure', async () => {
    await refundValidationCredits('owner', job)
    expect(params('creditBalance')).toEqual([100, 30])
    expect(params('purchasedCredits')).toEqual([20])
    expect(params('creditsUsedThisCycle')).toEqual([50])
    expect(params('validationsThisMonth')).toEqual([1])
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ amount: 50, transactionType: 'VALIDATION_REFUND' }))
  })
  it('does not use an expired debit to refill the new cycle or reduce its counters', async () => {
    mocks.results = [[], [spend('2026-09-20T12:00:00Z')]]
    await refundValidationCredits('owner', job)
    expect(params('creditBalance')).toEqual([100, 0])
    expect(params('purchasedCredits')).toEqual([20])
    expect(params('creditsUsedThisCycle')).toEqual([0])
    expect(params('validationsThisMonth')).toEqual([0])
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ amount: 20, transactionType: 'VALIDATION_REFUND' }))
  })
  it('renews a due cycle first and records only the purchased credits actually restored', async () => {
    mocks.user.creditResetAt = new Date('2026-10-20T12:00:00Z')
    mocks.results = [[], [spend('2026-10-01T12:00:00Z')]]
    await refundValidationCredits('owner', job)
    expect(mocks.changes[0]).toMatchObject({ creditBalance: 100, creditsUsedThisCycle: 0, creditResetAt: new Date('2026-11-30T12:00:00Z') })
    expect(params('creditBalance')).toEqual([100, 0])
    expect(params('purchasedCredits')).toEqual([20])
    expect(params('creditsUsedThisCycle')).toEqual([0])
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ amount: 20 }))
  })
  it('records a zero-credit refund once when all of the original plan credits expired', async () => {
    mocks.results = [[], [{ amount: -50, description: JSON.stringify({ entityId: job, monthly: 50, purchased: 0 }), createdAt: new Date('2026-09-20T12:00:00Z') }]]
    await refundValidationCredits('owner', job)
    expect(params('creditBalance')).toEqual([100, 0])
    expect(params('purchasedCredits')).toEqual([0])
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ amount: 0, transactionType: 'VALIDATION_REFUND', description: 'Job: ' + job }))
  })
  it('does not refund the same job twice', async () => {
    mocks.results = [[{ id: 'existing-refund' }]]
    await refundValidationCredits('owner', job)
    expect(mocks.changes).toEqual([])
    expect(mocks.insert).not.toHaveBeenCalled()
  })
  it('keeps the ledger and cycle spend consistent when the current plan caps the refund', async () => {
    mocks.user.creditBalance = 95
    await refundValidationCredits('owner', job)
    expect(params('creditBalance')).toEqual([100, 5])
    expect(params('creditsUsedThisCycle')).toEqual([25])
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ amount: 25 }))
  })
})
