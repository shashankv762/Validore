import { randomUUID } from 'node:crypto'
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'

const state = vi.hoisted(() => ({ client: null as unknown as PGlite, auth: vi.fn() }))
vi.mock('@/db', async () => {
  const { PGlite } = await import('@electric-sql/pglite')
  const { drizzle } = await import('drizzle-orm/pglite')
  const schema = await import('@/db/schema')
  state.client = new PGlite()
  return { db: drizzle(state.client, { schema }) }
})
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: state.auth } }) }))
import { db } from '@/db'
import * as schema from '@/db/schema'
import { GET } from '@/app/api/ideas/route'

const ownerId = randomUUID()
const otherId = randomUUID()
const ownerIdeaId = randomUUID()
const idea = { name: 'Saved private brief', industry: 'Software', product: 'Stock planning', targetCustomer: 'Shop owners',
  location: 'India', businessModel: 'Subscription', coreProblem: 'PRIVATE customer problem', proposedSolution: 'PRIVATE solution' }

beforeAll(async () => {
  const { generateDrizzleJson, generateMigration } = await import('drizzle-kit/api')
  for (const statement of await generateMigration(generateDrizzleJson({}), generateDrizzleJson(schema))) await state.client.exec(statement)
  await state.client.exec('CREATE ROLE anon; CREATE ROLE authenticated;')
}, 30_000)
beforeEach(async () => {
  vi.restoreAllMocks()
  await state.client.exec('TRUNCATE users CASCADE')
  await db.insert(schema.users).values([ownerId, otherId].map(id => ({ id, supabaseId: 'auth-' + id, email: id + '@example.test' })))
  await db.insert(schema.ideas).values([
    { ...idea, id: ownerIdeaId, userId: ownerId },
    { ...idea, userId: ownerId, isActive: false, name: 'Archived idea' },
    { ...idea, userId: otherId, name: 'Another owner’s private idea' },
  ])
  state.auth.mockResolvedValue({ data: { user: { id: 'auth-' + ownerId } }, error: null })
})
afterAll(async () => state.client.close())

describe('workspace idea loading against real PostgreSQL-compatible queries', () => {
  it('loads only the authenticated owner’s active ideas and prevents response caching', async () => {
    const response = await GET()
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect((await response.json()).ideas).toEqual([expect.objectContaining({ id: ownerIdeaId, name: idea.name })])
  })

  it('returns a safe, actionable setup error instead of throwing when the deployed schema is behind', async () => {
    await state.client.exec('ALTER TABLE ideas DROP COLUMN public_research_focus')
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const response = await GET()
      expect(response.status).toBe(503)
      expect(response.headers.get('cache-control')).toBe('private, no-store')
      const body = await response.json()
      expect(body.code).toBe('workspace_setup_required')
      expect(body.error).toContain('database update')
      expect(JSON.stringify(body)).not.toMatch(/select |public_research_focus|PRIVATE|auth-/i)
      expect(log).toHaveBeenCalledWith('[ideas] Loading failed', expect.objectContaining({ code: '42703' }))
    } finally {
      await state.client.exec('ALTER TABLE ideas ADD COLUMN public_research_focus text')
    }
  })

  it.each([
    ['account_blocked', 403, 'This account is not active.'],
    ['account_deactivated', 403, 'This account is not active.'],
    ['maintenance_enabled', 503, 'Planned workspace maintenance.'],
    ['account_unavailable', 503, 'Account access is temporarily unavailable.'],
  ])('does not misreport %s as an expired session', async (code, status, message) => {
    state.auth.mockResolvedValue({ data: { user: null }, error: { code, status, message } })
    const response = await GET()
    expect(response.status).toBe(status)
    expect(await response.json()).toMatchObject({ code, error: message })
  })

  it('keeps unauthenticated requests unauthorized', async () => {
    state.auth.mockResolvedValue({ data: { user: null }, error: null })
    expect((await GET()).status).toBe(401)
  })

  it('sends missing application profiles through registration rather than treating their session as expired', async () => {
    state.auth.mockResolvedValue({ data: { user: { id: 'auth-without-profile' } }, error: null })
    const response = await GET()
    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({ code: 'registration_required', next: '/auth/complete-signup' })
  })

  it('rejects a profile that became blocked after provider verification', async () => {
    await db.update(schema.users).set({ accountStatus: 'blocked' }).where(eq(schema.users.id, ownerId))
    expect((await GET()).status).toBe(403)
  })
})
