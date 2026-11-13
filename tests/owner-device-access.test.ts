import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
const mock = vi.hoisted(() => ({ getUser: vi.fn(), account: { id: 'profile', tier: 'free', isAdmin: true, accountStatus: 'active' },
  limit: vi.fn(), remove: vi.fn(), insert: vi.fn(), transaction: vi.fn(), existing: [] as { id: string }[] }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: mock.getUser } }) }))
vi.mock('@/lib/rate-limit', () => ({ rateLimitCheck: mock.limit }))
vi.mock('@/db', () => ({ db: {
  query: { users: { findFirst: async () => mock.account } }, transaction: mock.transaction,
} }))
import { POST } from '@/app/api/auth/device/route'
const request = () => new NextRequest('http://localhost/api/auth/device', { method: 'POST',
  headers: { origin: 'http://localhost', 'content-type': 'application/json' },
  body: JSON.stringify({ fingerprintHash: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }) })
beforeEach(() => {
  vi.clearAllMocks()
  mock.account.isAdmin = true; mock.account.accountStatus = 'active'; mock.existing = []
  mock.getUser.mockResolvedValue({ data: { user: { id: 'verified-auth' } } })
  mock.limit.mockResolvedValue({ success: true })
  mock.transaction.mockImplementation(async work => work({
    select: () => ({ from: () => ({ where: () => ({
      for: async () => [mock.account], limit: async () => mock.existing,
      orderBy: () => ({ limit: async () => Array.from({ length: 6 }, (_, index) => ({ id: String(index) })) }),
    }) }) }),
    delete: mock.remove.mockReturnValue({ where: async () => undefined }),
    update: () => ({ set: () => ({ where: async () => undefined }) }),
    insert: mock.insert.mockReturnValue({ values: async () => undefined }),
  }))
})
describe('Owner browser activity', () => {
  it('keeps all owner devices while recording activity behind the rate limit', async () => {
    expect((await POST(request())).status).toBe(200)
    expect(mock.limit).toHaveBeenCalledWith('profile', 'device')
    expect(mock.remove).not.toHaveBeenCalled()
    expect(mock.insert).toHaveBeenCalledOnce()
  })
  it('retains ordinary plan device caps', async () => {
    mock.account.isAdmin = false
    expect((await POST(request())).status).toBe(200)
    expect(mock.remove).toHaveBeenCalledTimes(6)
  })
  it('updates an existing device without creating another row', async () => {
    mock.existing = [{ id: 'existing-device' }]
    expect((await POST(request())).status).toBe(200)
    expect(mock.insert).not.toHaveBeenCalled()
  })
  it('continues to rate limit the owner before registering a device', async () => {
    mock.limit.mockResolvedValue({ success: false })
    expect((await POST(request())).status).toBe(429)
    expect(mock.transaction).not.toHaveBeenCalled()
  })
  it('rechecks account state under the registration lock', async () => {
    mock.account.accountStatus = 'blocked'
    expect((await POST(request())).status).toBe(503)
    expect(mock.insert).not.toHaveBeenCalled()
  })
})
