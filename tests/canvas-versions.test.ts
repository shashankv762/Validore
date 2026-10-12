import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextCanvasVersion } from '../src/lib/canvas-versions'
const mocks = vi.hoisted(() => ({ lock: vi.fn(), versions: vi.fn(), charge: vi.fn(), values: vi.fn() }))
vi.mock('@/lib/credits', () => ({ deductCredits: mocks.charge }))
vi.mock('@/db', () => ({ db: { transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback({
  select: () => ({ from: () => ({ where: () => ({ for: mocks.lock }) }) }),
  query: { leanCanvases: { findMany: mocks.versions } }, insert: () => ({ values: mocks.values }),
}) } }))
import { saveCanvasVersion } from '@/lib/canvas-store'
const owner = '11111111-1111-4111-8111-111111111111'
const idea = '22222222-2222-4222-8222-222222222222'
beforeEach(() => {
  vi.clearAllMocks()
  mocks.lock.mockResolvedValue([{ id: owner }])
  mocks.versions.mockResolvedValue([{ version: 1 }, { version: 2 }])
  mocks.charge.mockResolvedValue(true)
  mocks.values.mockImplementation((data: unknown) => ({ returning: async () => [data] }))
})
describe('canvas version persistence', () => {
  it('rejects completed or legacy version-four histories', () => {
    expect(nextCanvasVersion([{ version: 4 }])).toBeNull()
    expect(nextCanvasVersion([{ version: 1 }, { version: 2 }, { version: 3 }, { version: 4 }])).toBeNull()
    expect(nextCanvasVersion([{ version: 1 }, { version: 3 }])).toBe(4)
  })
  it('rechecks the cap after locking and never charges when another request filled the history', async () => {
    mocks.versions.mockResolvedValue([{ version: 4 }])
    expect((await saveCanvasVersion(owner, idea, {}, 20)).kind).toBe('limit')
    expect(mocks.lock).toHaveBeenCalledWith('update')
    expect(mocks.charge).not.toHaveBeenCalled()
    expect(mocks.values).not.toHaveBeenCalled()
  })
  it('saves founder-written data as a version without charging AI credits', async () => {
    const saved = await saveCanvasVersion(owner, idea, { changeReason: 'Manual draft' })
    expect(saved.kind).toBe('saved')
    expect(mocks.values).toHaveBeenCalledWith(expect.objectContaining({ userId: owner, ideaId: idea, version: 3, changeReason: 'Manual draft' }))
    expect(mocks.charge).not.toHaveBeenCalled()
  })
  it('does not persist AI results when the transactional charge fails', async () => {
    mocks.charge.mockResolvedValue(false)
    expect((await saveCanvasVersion(owner, idea, {}, 20)).kind).toBe('credits')
    expect(mocks.values).not.toHaveBeenCalled()
  })
})
