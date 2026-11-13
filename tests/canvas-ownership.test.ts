import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'
const mocks = vi.hoisted(() => ({ user: vi.fn(), profile: vi.fn(), canvases: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: mocks.user } }) }))
vi.mock('@/db', () => ({ db: { query: { users: { findFirst: mocks.profile }, leanCanvases: { findMany: mocks.canvases } } } }))
import { GET as history } from '@/app/api/lean-canvas/route'
import { GET as report } from '@/app/api/lean-canvas/report/route'
const owner = '11111111-1111-4111-8111-111111111111'
const foreignIdea = '22222222-2222-4222-8222-222222222222'
beforeEach(() => {
  vi.clearAllMocks()
  mocks.user.mockResolvedValue({ data: { user: { id: 'auth-owner' } } })
  mocks.profile.mockResolvedValue({ id: owner })
  mocks.canvases.mockImplementation(async ({ where }: { where: SQL }) => {
    const query = new PgDialect().sqlToQuery(where)
    // Simulate a foreign canvas that would be visible through an idea-only lookup.
    return query.params.includes(owner) && query.sql.toLowerCase().includes(' and ') ? [] : [{ id: 'foreign-canvas' }]
  })
})
describe('Canvas read ownership', () => {
  it('returns the latest hundred versions in UI order and exposes earlier history pagination', async () => {
    mocks.canvases.mockResolvedValueOnce(Array.from({ length: 101 }, (_, index) => ({ id: 'canvas-' + (150 - index), version: 150 - index })))
    const response = await history(new NextRequest('http://localhost/api/lean-canvas?ideaId=' + foreignIdea))
    const body = await response.json()
    expect(body).toMatchObject({ page: 1, hasMore: true })
    expect(body.canvases).toHaveLength(100)
    expect(body.canvases[0].version).toBe(51)
    expect(body.canvases.at(-1).version).toBe(150)
    expect(mocks.canvases.mock.calls[0][0]).toMatchObject({ limit: 101, offset: 0 })
    await history(new NextRequest('http://localhost/api/lean-canvas?ideaId=' + foreignIdea + '&page=2'))
    expect(mocks.canvases.mock.calls[1][0]).toMatchObject({ offset: 100 })
  })
  it.each(['0', '1.5', '100001'])('rejects invalid canvas history page %s', async page => {
    expect((await history(new NextRequest('http://localhost/api/lean-canvas?ideaId=' + foreignIdea + '&page=' + page))).status).toBe(400)
    expect(mocks.canvases).not.toHaveBeenCalled()
  })
  it('does not expose another account canvas through history or narrative APIs', async () => {
    const req = new NextRequest('http://localhost/api/lean-canvas?ideaId=' + foreignIdea)
    const response = await history(req)
    expect(response.status).toBe(200)
    expect((await response.json()).canvases).toEqual([])
    expect((await report(req)).status).toBe(404)
  })
  it('rejects invalid references before querying canvases', async () => {
    const req = new NextRequest('http://localhost/api/lean-canvas?ideaId=invalid')
    expect((await history(req)).status).toBe(400)
    expect((await report(req)).status).toBe(400)
    expect(mocks.canvases).not.toHaveBeenCalled()
  })
  it('requires an authenticated identity', async () => {
    mocks.user.mockResolvedValue({ data: { user: null } })
    expect((await history(new NextRequest('http://localhost/api/lean-canvas?ideaId=' + foreignIdea))).status).toBe(401)
    expect(mocks.canvases).not.toHaveBeenCalled()
  })
})
