import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const state = vi.hoisted(() => ({ role: 'anonymous' as 'anonymous' | 'user' | 'owner', calls: [] as string[] }))
vi.mock('@/lib/admin-access', async () => {
  const actual = await vi.importActual<typeof import('@/lib/admin-access')>('@/lib/admin-access')
  return { ...actual, requireAdmin: vi.fn(async () => {
    if (state.role === 'anonymous') throw new actual.AdminAccessError('Sign in to continue.', 401, 'unauthorized')
    if (state.role !== 'owner') throw new actual.AdminAccessError('This page is unavailable.', 404, 'not_found')
    return { authUser: { id: 'verified-owner' }, user: { id: '11111111-1111-4111-8111-111111111111', supabaseId: 'verified-owner', email: 'shashankv7623@gmail.com', isAdmin: true, accountStatus: 'active' } }
  }) }
})
vi.mock('@/lib/admin-data', () => ({
  getAdminOverview: vi.fn(async () => { state.calls.push('overview'); return { users: {} } }),
  getAdminUsers: vi.fn(async () => { state.calls.push('users'); return { users: [] } }),
  getAdminUserDetail: vi.fn(async () => { state.calls.push('detail'); return { user: {} } }),
  getAdminAudit: vi.fn(async () => { state.calls.push('audit'); return { entries: [] } }),
}))
vi.mock('@/lib/admin-actions', () => ({
  grantAdminCredits: vi.fn(async () => { state.calls.push('grant'); return { recipients: 1 } }),
  changeAdminAccountStatus: vi.fn(async () => { state.calls.push('status'); return { user: {} } }),
}))
vi.mock('@/lib/admin-user-deletion', () => ({ deleteAdminUser: vi.fn(async () => { state.calls.push('delete'); return { deleted: true } }) }))
vi.mock('@/lib/admin-user-plans', () => ({ assignAdminPlan: vi.fn(async () => { state.calls.push('assignment'); return { recipients: 1 } }) }))
vi.mock('@/lib/admin-settings', () => ({
  readAdminSettings: vi.fn(async () => { state.calls.push('settings'); return { settings: {} } }),
  updateAdminSettings: vi.fn(async () => { state.calls.push('settings-update'); return { settings: {} } }),
  readAdminPlans: vi.fn(async () => { state.calls.push('plans'); return { plans: [] } }),
  updateAdminPlans: vi.fn(async () => { state.calls.push('plans-update'); return { plans: [] } }),
}))
import { GET as overview } from '@/app/api/admin/overview/route'
import { GET as users } from '@/app/api/admin/users/route'
import { GET as detail, PATCH as status, DELETE as remove } from '@/app/api/admin/users/[id]/route'
import { POST as credits } from '@/app/api/admin/credits/route'
import { POST as assignment } from '@/app/api/admin/assign-plan/route'
import { GET as audit } from '@/app/api/admin/audit/route'
import { GET as settings, PATCH as saveSettings } from '@/app/api/admin/settings/route'
import { GET as plans, PUT as savePlans } from '@/app/api/admin/plans/route'
import { grantAdminCredits } from '@/lib/admin-actions'

const origin = 'https://app.validore.test'
const routeContext = { params: Promise.resolve({ id: '22222222-2222-4222-8222-222222222222' }) }
type Handler = (request: NextRequest, context: typeof routeContext) => Promise<Response>
const endpoints: { path: string; method: string; handler: Handler }[] = [
  { path: 'overview', method: 'GET', handler: overview }, { path: 'users', method: 'GET', handler: users },
  { path: 'users/' + '22222222-2222-4222-8222-222222222222', method: 'GET', handler: detail },
  { path: 'users/' + '22222222-2222-4222-8222-222222222222', method: 'PATCH', handler: status },
  { path: 'users/' + '22222222-2222-4222-8222-222222222222', method: 'DELETE', handler: remove },
  { path: 'credits', method: 'POST', handler: credits }, { path: 'audit', method: 'GET', handler: audit },
  { path: 'assign-plan', method: 'POST', handler: assignment },
  { path: 'settings', method: 'GET', handler: settings }, { path: 'settings', method: 'PATCH', handler: saveSettings },
  { path: 'plans', method: 'GET', handler: plans }, { path: 'plans', method: 'PUT', handler: savePlans },
]
const requestFor = (entry: { path: string; method: string }, headers: Record<string, string> = {}, body: unknown = {}) => new NextRequest(origin + '/api/admin/' + entry.path, {
  method: entry.method, headers: { origin, 'content-type': 'application/json', 'sec-fetch-site': 'same-origin', ...headers },
  ...(entry.method === 'GET' ? {} : { body: JSON.stringify(body) }),
})
beforeEach(() => { state.calls = []; state.role = 'anonymous'; vi.stubEnv('NEXT_PUBLIC_APP_URL', origin); vi.clearAllMocks() })
afterEach(() => vi.unstubAllEnvs())

describe('All admin endpoints authorize independently of navigation or proxy execution', () => {
  it.each(endpoints)('rejects anonymous $method $path before reading or changing private data', async entry => {
    const response = await entry.handler(requestFor(entry), routeContext)
    expect(response.status).toBe(401)
    expect(response.headers.get('cache-control')).toContain('no-store')
    expect(state.calls).toHaveLength(0)
  })
  it.each(endpoints)('returns an unavailable response for ordinary-user $method $path', async entry => {
    state.role = 'user'
    const response = await entry.handler(requestFor(entry), routeContext)
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'This page is unavailable.', code: 'not_found' })
    expect(state.calls).toHaveLength(0)
  })
  it.each(endpoints)('allows verified-owner $method $path and keeps responses private', async entry => {
    state.role = 'owner'
    const response = await entry.handler(requestFor(entry), routeContext)
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toContain('no-store')
    expect(state.calls).toHaveLength(1)
  })
  it('rejects a cross-origin owner mutation and unsupported bodies before mutation', async () => {
    state.role = 'owner'
    const crossOrigin = await credits(requestFor({ path: 'credits', method: 'POST' }, { origin: 'https://foreign.test', 'sec-fetch-site': 'cross-site' }))
    const unsupported = await credits(requestFor({ path: 'credits', method: 'POST' }, { 'content-type': 'text/plain' }))
    const oversized = await credits(requestFor({ path: 'credits', method: 'POST' }, { 'content-length': '200000' }))
    expect(crossOrigin.status).toBe(403)
    expect(unsupported.status).toBe(415)
    expect(oversized.status).toBe(413)
    expect(state.calls).toHaveLength(0)
  })
  it('takes actor identity from the verified session rather than a supplied ID or flag', async () => {
    state.role = 'owner'
    const body = { userIds: ['22222222-2222-4222-8222-222222222222'], amount: 10, actorId: 'client-forged', isAdmin: true }
    await credits(requestFor({ path: 'credits', method: 'POST' }, {}, body))
    expect(vi.mocked(grantAdminCredits).mock.calls[0][0]).toMatchObject({ id: '11111111-1111-4111-8111-111111111111', supabaseId: 'verified-owner' })
  })
})
