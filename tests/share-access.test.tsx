import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
const mocks = vi.hoisted(() => ({ user: vi.fn(), owner: vi.fn(), report: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: mocks.user } }) }))
vi.mock('@/db', () => ({ db: { query: { users: { findFirst: mocks.owner }, validationReports: { findFirst: mocks.report } } } }))
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NOT_FOUND') } }))
vi.mock('@/app/dashboard/report/ReportView', () => ({ default: () => null }))
import SharePage, { metadata } from '@/app/share/[shareToken]/page'
const token = '11111111-1111-4111-8111-111111111111'
const page = (shareToken = token) => SharePage({ params: Promise.resolve({ shareToken }) })
beforeEach(() => {
  vi.resetAllMocks()
  mocks.user.mockResolvedValue({ data: { user: { id: 'auth-owner' } } })
  mocks.owner.mockResolvedValue({ id: 'app-owner' })
  mocks.report.mockResolvedValue({ id: 'report-id', userId: 'app-owner' })
})
describe('owner-only report links', () => {
  it('rejects malformed references before auth or database work', async () => {
    await expect(page('not-a-uuid')).rejects.toThrow('NOT_FOUND')
    expect(mocks.user).not.toHaveBeenCalled()
    expect(mocks.report).not.toHaveBeenCalled()
  })
  it('does not expose report data to anonymous users or identities without an app profile', async () => {
    mocks.user.mockResolvedValueOnce({ data: { user: null } })
    await expect(page()).rejects.toThrow('NOT_FOUND')
    expect(mocks.owner).not.toHaveBeenCalled()
    mocks.owner.mockResolvedValueOnce(undefined)
    await expect(page()).rejects.toThrow('NOT_FOUND')
    expect(mocks.report).not.toHaveBeenCalled()
  })
  it('constrains the token lookup to the authenticated owner and rejects another owner', async () => {
    await page()
    expect(new PgDialect().sqlToQuery(mocks.owner.mock.calls[0][0].where).params).toEqual(['auth-owner'])
    expect(new PgDialect().sqlToQuery(mocks.report.mock.calls[0][0].where).params).toEqual([token, 'app-owner'])
    mocks.report.mockResolvedValueOnce(undefined)
    await expect(page()).rejects.toThrow('NOT_FOUND')
  })
  it('publishes generic non-indexable metadata without reading private records', () => {
    expect(metadata.title).toBe('Your validation report')
    expect(metadata.robots).toEqual({ index: false, follow: false })
    expect(mocks.report).not.toHaveBeenCalled()
  })
})
