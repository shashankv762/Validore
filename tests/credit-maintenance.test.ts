import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'

const mocks = vi.hoisted(() => ({ findMany: vi.fn(), topUp: vi.fn(), prune: vi.fn(), reap: vi.fn(), execute: vi.fn() }))
vi.mock('@/db', () => ({ db: { query: { users: { findMany: mocks.findMany } }, execute: mocks.execute } }))
vi.mock('@/lib/credits', () => ({ topUpMonthlyCredits: mocks.topUp }))
vi.mock('@/lib/ai/research-store', () => ({ pruneResearchHistory: mocks.prune }))
vi.mock('@/lib/validation/jobs', () => ({ reapStaleValidationJobs: mocks.reap }))

import { maintainCredits } from '@/lib/credit-maintenance'

const uuid = (n: number) => '00000000-0000-4000-8000-' + String(n).padStart(12, '0')
const firstBatch = Array.from({ length: 500 }, (_, index) => ({ id: uuid(index + 1) }))

beforeEach(() => {
  vi.resetAllMocks()
  mocks.findMany.mockResolvedValueOnce(firstBatch).mockResolvedValueOnce([{ id: uuid(501) }])
  mocks.topUp.mockImplementation(async (id: string) => {
    if (id === uuid(1)) throw new Error('Private provider response must not be logged')
    return true
  })
  mocks.prune.mockResolvedValue(undefined)
  mocks.reap.mockResolvedValue(undefined)
})
afterEach(() => vi.restoreAllMocks())

describe('bounded credit maintenance pagination', () => {
  it('scans past a repeatedly failing first account and only selects active non-owner rows', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = await maintainCredits()
    expect(result).toMatchObject({ resetCount: 500, failedResetCount: 1, deferredDueUsers: false, retentionMaintenance: true })
    expect(mocks.findMany).toHaveBeenCalledTimes(2)
    expect(mocks.topUp).toHaveBeenCalledTimes(501)
    expect(mocks.topUp).toHaveBeenLastCalledWith(uuid(501))
    expect(warning).toHaveBeenCalledWith('[credits] Monthly allowance reset failed; account remains eligible for a later maintenance run')
    expect(JSON.stringify(warning.mock.calls)).not.toContain('Private provider response')

    const queries = mocks.findMany.mock.calls.map(([query]) => query as { where: unknown; orderBy: unknown[]; limit: number })
    expect(queries.every(query => query.limit === 500 && query.orderBy.length === 1)).toBe(true)
    const firstWhere = new PgDialect().sqlToQuery(queries[0].where as never)
    const secondWhere = new PgDialect().sqlToQuery(queries[1].where as never)
    expect(firstWhere.params).toContain('active')
    expect(firstWhere.params).toContain(false)
    expect(secondWhere.params).toContain(uuid(500))
  })

  it('caps each run and reports when another due batch is deferred', async () => {
    mocks.findMany.mockReset()
    const batches = Array.from({ length: 6 }, (_, batch) => Array.from({ length: 500 }, (_, index) => ({ id: uuid(batch * 500 + index + 1) })))
    mocks.findMany.mockImplementation(async () => batches.shift() ?? [])
    mocks.topUp.mockResolvedValue(true)
    const result = await maintainCredits()
    expect(result).toMatchObject({ resetCount: 2500, failedResetCount: 0, deferredDueUsers: true })
    expect(mocks.findMany).toHaveBeenCalledTimes(5)
    expect(mocks.topUp).toHaveBeenCalledTimes(2500)
  })
})
