import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
const mocks = vi.hoisted(() => ({ update: vi.fn(), user: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: mocks.user, updateUser: mocks.update } }) }))
import { POST } from '@/app/api/auth/reset-password/route'
const request = (currentPassword?: string) => new NextRequest('http://localhost:3000/api/auth/reset-password', {
  method: 'POST', headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' },
  body: JSON.stringify({ password: 'NewUniquePassword123!', currentPassword }),
})
beforeEach(() => {
  vi.resetAllMocks()
  mocks.user.mockResolvedValue({ data: { user: { id: 'test-user' } } })
  mocks.update.mockResolvedValue({ error: null })
})
describe('Password updates with provider reauthentication', () => {
  it('allows a recovery session to update without a current password', async () => {
    expect((await POST(request())).status).toBe(200)
    expect(mocks.update).toHaveBeenCalledWith({ password: 'NewUniquePassword123!' })
  })
  it('passes the current password when changing from a normal session', async () => {
    expect((await POST(request('OldPassword123!'))).status).toBe(200)
    expect(mocks.update).toHaveBeenCalledWith({ password: 'NewUniquePassword123!', current_password: 'OldPassword123!' })
  })
  it('explains the provider current-password requirement', async () => {
    mocks.update.mockResolvedValue({ error: { status: 400, code: 'current_password_required' } })
    const response = await POST(request())
    expect(response.status).toBe(400)
    expect((await response.json()).error).toContain('current password')
  })
})
