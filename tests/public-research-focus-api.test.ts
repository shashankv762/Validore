import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
const mocks = vi.hoisted(() => ({ insert: vi.fn(), update: vi.fn() }))
const ownerId = '11111111-1111-4111-8111-111111111111'
const ideaId = '22222222-2222-4222-8222-222222222222'
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'auth-founder' } } }) } }) }))
vi.mock('@/lib/rate-limit', () => ({ rateLimitCheck: async () => ({ success: true }) }))
vi.mock('@/db', () => ({ db: { query: { users: { findFirst: async () => ({ id: ownerId }) } }, transaction: async (work: (tx: unknown) => Promise<unknown>) => work({
  select: () => ({ from: (table: unknown) => ({ where: () => ({ for: async () => table === users ? [{ id: ownerId, isAdmin: true }] : [{ id: ideaId, isActive: true, isReadOnly: false, publicResearchFocus: 'Previously approved topic' }], limit: async () => [] }) }) }),
  insert: () => ({ values: (value: unknown) => { mocks.insert(value); return { returning: async () => [{ id: ideaId }] } } }),
  update: () => ({ set: (value: unknown) => { mocks.update(value); return { where: () => ({ returning: async () => [{ id: ideaId }] }) } } }),
}) } }))
import { users } from '@/db/schema'
import { POST, PATCH } from '@/app/api/ideas/route'
import { PIPELINE_IDEA } from './fixtures/agent-payloads'
const request = (method: string, body: unknown) => new NextRequest('https://validore.test/api/ideas', { method, headers: { 'Content-Type': 'application/json', Origin: 'https://validore.test' }, body: JSON.stringify(body) })
beforeEach(() => vi.clearAllMocks())

describe('public research focus persistence', () => {
  it('keeps legacy creation generic and stores only explicit sanitized topics', async () => {
    expect((await POST(request('POST', PIPELINE_IDEA))).status).toBe(201)
    expect(mocks.insert.mock.calls[0][0].publicResearchFocus).toBeNull()
    expect((await POST(request('POST', { ...PIPELINE_IDEA, publicResearchFocus: 'Stock reconciliation founder@example.org sk-proj-PRIVATE123456' }))).status).toBe(201)
    const stored = mocks.insert.mock.calls[1][0].publicResearchFocus
    expect(stored).toContain('Stock reconciliation'); expect(stored).not.toContain('founder@example.org'); expect(stored).not.toContain('PRIVATE123456')
  })
  it('preserves an omitted topic during a legacy private-brief PATCH and allows explicit clearing', async () => {
    expect((await PATCH(request('PATCH', { ...PIPELINE_IDEA, ideaId, coreProblem: 'A newly edited confidential customer problem' }))).status).toBe(200)
    expect(mocks.update.mock.calls[0][0]).not.toHaveProperty('publicResearchFocus')
    expect((await PATCH(request('PATCH', { ...PIPELINE_IDEA, ideaId, publicResearchFocus: '' }))).status).toBe(200)
    expect(mocks.update.mock.calls[1][0].publicResearchFocus).toBeNull()
  })
  it('replaces the topic only when explicitly supplied and rejects URL input before any write', async () => {
    expect((await PATCH(request('PATCH', { ...PIPELINE_IDEA, ideaId, publicResearchFocus: 'Clinic appointment reminders using spreadsheets' }))).status).toBe(200)
    expect(mocks.update.mock.calls[0][0].publicResearchFocus).toBe('Clinic appointment reminders using spreadsheets')
    vi.clearAllMocks()
    expect((await POST(request('POST', { ...PIPELINE_IDEA, publicResearchFocus: 'https://example.org' }))).status).toBe(400)
    expect((await PATCH(request('PATCH', { ...PIPELINE_IDEA, ideaId, publicResearchFocus: 'https://example.org' }))).status).toBe(400)
    expect(mocks.insert).not.toHaveBeenCalled(); expect(mocks.update).not.toHaveBeenCalled()
  })
})
