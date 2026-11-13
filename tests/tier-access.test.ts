import { beforeEach, describe, expect, it, vi } from 'vitest'
const mock = vi.hoisted(() => ({ findUser: vi.fn(), getPlan: vi.fn(), update: vi.fn(), account: {} as Record<string, unknown> }))
vi.mock('@/db', () => ({ db: { query: { users: { findFirst: mock.findUser } }, transaction: async (work: (tx: unknown) => unknown) => work({
  select: () => ({ from: () => ({ where: () => ({ for: async () => [mock.account] }) }) }),
  update: () => ({ set: mock.update }),
}) } }))
vi.mock('@/lib/plan-catalog', () => ({ getPlan: mock.getPlan }))
import { canUserAccess, canUserAccessWithCredits, checkValidationLimit, getUserWithTierConfig } from '@/lib/tier-gate'
beforeEach(() => {
  vi.resetAllMocks()
  mock.account = { id: 'profile', tier: 'free', accountStatus: 'active', isAdmin: false, validationsThisMonth: 0, rewardCredits: 0 }
  mock.findUser.mockImplementation(async () => mock.account)
  mock.getPlan.mockResolvedValue({ tier: 'free', monthlyValidationLimit: 0, maxConcurrentRequests: 1, canPitchDeck: false, canExportPptx: false })
  mock.update.mockReturnValue({ where: async () => undefined })
})
describe('Runtime feature entitlements', () => {
  it('grants the active owner every feature without changing their billing plan or service concurrency', async () => {
    mock.account.isAdmin = true
    const result = await getUserWithTierConfig('auth-id')
    expect(result?.user.tier).toBe('free')
    expect(result?.config).toMatchObject({ tier: 'free', canPitchDeck: true, canExportPptx: true, maxConcurrentRequests: 1 })
    expect(await canUserAccess('auth-id', 'canExportPptx')).toBe(true)
    expect(await canUserAccessWithCredits('auth-id', 'pitch_deck')).toEqual({ allowed: true, reason: 'tier' })
    expect((await checkValidationLimit('auth-id')).allowed).toBe(true)
    expect(mock.update).not.toHaveBeenCalled()
  })
  it.each(['blocked', 'deactivated'])('denies %s rows before resolving entitlements', async accountStatus => {
    mock.account.accountStatus = accountStatus
    expect(await canUserAccess('auth-id', 'canExportPptx')).toBe(false)
    expect(await canUserAccessWithCredits('auth-id', 'pitch_deck')).toMatchObject({ allowed: false })
    expect(mock.getPlan).not.toHaveBeenCalled()
  })
  it('applies current feature edits without requiring a tier change', async () => {
    expect(await canUserAccess('auth-id', 'canExportPptx')).toBe(false)
    mock.getPlan.mockResolvedValue({ canExportPptx: true })
    expect(await canUserAccess('auth-id', 'canExportPptx')).toBe(true)
  })
  it('honors a zero monthly validation limit on a new month and retains earned Lite runs', async () => {
    expect(await checkValidationLimit('auth-id')).toEqual({ allowed: false, remaining: 0 })
    mock.account.rewardCredits = 50
    expect(await checkValidationLimit('auth-id')).toEqual({ allowed: true, remaining: 0 })
  })
})
