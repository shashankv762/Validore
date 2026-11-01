import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'

const mocks = vi.hoisted(() => ({ auth: vi.fn(), account: vi.fn(), topUp: vi.fn(), select: vi.fn(), where: [] as unknown[], rows: [] as unknown[][] }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: mocks.auth } }) }))
vi.mock('@/lib/credits', () => ({ topUpMonthlyCredits: mocks.topUp }))
vi.mock('@/db', () => ({ db: { query: { users: { findFirst: mocks.account } }, select: mocks.select } }))
import { GET } from '@/app/api/usage/route'

const ownerId = '11111111-1111-4111-8111-111111111111'
beforeEach(() => {
  vi.resetAllMocks()
  mocks.where = []
  mocks.auth.mockResolvedValue({ data: { user: { id: 'auth-owner' } } })
  mocks.account.mockResolvedValue({ id: ownerId, creditResetAt: new Date(Date.now() + 86_400_000) })
  mocks.rows = [[{ total: 2, complete: 1, partial: 0, failed: 1, active: 0, tokens: 400 }], [{ action: 'VALIDATION', credits: 100, transactions: 2 }], []]
  mocks.select.mockImplementation(() => {
    const rows = mocks.rows.shift()
    const builder = {
      from: () => builder, innerJoin: () => builder,
      where: (condition: unknown) => { mocks.where.push(condition); return builder },
      groupBy: () => builder, orderBy: () => builder, limit: () => builder,
      then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(rows).then(resolve, reject),
    }
    return builder
  })
})

describe('private usage API', () => {
  it('rejects anonymous requests before accessing account activity', async () => {
    mocks.auth.mockResolvedValue({ data: { user: null } })
    const response = await GET()
    expect(response.status).toBe(401)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(mocks.account).not.toHaveBeenCalled()
    expect(mocks.select).not.toHaveBeenCalled()
  })
  it('scopes every aggregate and recent-run query to the authenticated owner', async () => {
    const response = await GET()
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.validations.tokens).toBe(400)
    expect(body.activity).toEqual([{ action: 'VALIDATION', credits: 100, transactions: 2 }])
    expect(mocks.where).toHaveLength(3)
    const dialect = new PgDialect()
    for (const condition of mocks.where) expect(dialect.sqlToQuery(condition as SQL).params).toContain(ownerId)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
  })
  it('returns a recoverable response rather than invented zero usage when storage is unavailable', async () => {
    mocks.account.mockRejectedValue(new Error('Database unavailable'))
    const response = await GET()
    expect(response.status).toBe(503)
    expect(await response.json()).not.toHaveProperty('validations')
  })
})
