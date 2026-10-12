import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
const mocks = vi.hoisted(() => ({ user: vi.fn(), profile: vi.fn(), idea: vi.fn(), save: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: mocks.user } }) }))
vi.mock('@/db', () => ({ db: { query: { users: { findFirst: mocks.profile }, ideas: { findFirst: mocks.idea } } } }))
vi.mock('@/lib/auth-form', () => ({ validAuthOrigin: () => true }))
vi.mock('@/lib/tier-gate', () => ({ canUserAccess: async () => true }))
vi.mock('@/lib/rate-limit', () => ({ rateLimitCheck: async () => ({ success: true }) }))
vi.mock('@/lib/canvas-store', () => ({ saveCanvasVersion: mocks.save }))
import { POST } from '@/app/api/lean-canvas/manual/route'
const ideaId = '22222222-2222-4222-8222-222222222222'
const blocks = { problem: 'Founders lack clear evidence', customerSegments: '', uvp: '', solution: '', channels: '', revenueStreams: '', costStructure: '', keyMetrics: '', unfairAdvantage: '' }
const request = (body: unknown) => new NextRequest('http://localhost:3000/api/lean-canvas/manual', { method: 'POST', body: JSON.stringify(body) })
beforeEach(() => {
  vi.clearAllMocks()
  mocks.user.mockResolvedValue({ data: { user: { id: 'auth-owner' } } })
  mocks.profile.mockResolvedValue({ id: 'owner' })
  mocks.idea.mockResolvedValue({ id: ideaId })
  mocks.save.mockResolvedValue({ kind: 'saved', canvas: { id: 'saved-canvas' } })
})
describe('manual canvas authoring', () => {
  it('saves a manual assumption without AI generation or charges', async () => {
    const response = await POST(request({ ideaId, blocks }))
    expect(response.status).toBe(200)
    expect(mocks.save).toHaveBeenCalledWith('owner', ideaId, expect.objectContaining({
      problem: { content: blocks.problem, confidenceScore: 0, label: 'ASSUMPTION', keyAssumptions: [] },
    }))
  })
  it('rejects an idea that is absent from the owner lookup', async () => {
    mocks.idea.mockResolvedValue(null)
    expect((await POST(request({ ideaId, blocks }))).status).toBe(404)
    expect(mocks.save).not.toHaveBeenCalled()
  })
  it('rejects empty or oversized blocks before persistence', async () => {
    expect((await POST(request({ ideaId, blocks: { ...blocks, problem: '' } }))).status).toBe(400)
    expect((await POST(request({ ideaId, blocks: { ...blocks, problem: 'x'.repeat(4001) } }))).status).toBe(400)
    expect(mocks.save).not.toHaveBeenCalled()
  })
  it('returns a conflict when four versions already exist', async () => {
    mocks.save.mockResolvedValue({ kind: 'limit' })
    expect((await POST(request({ ideaId, blocks }))).status).toBe(409)
  })
})
