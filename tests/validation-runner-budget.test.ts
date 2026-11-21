import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RunValidationStep } from '@/lib/validation/steps'
import type { ValidationEntitlementSnapshot } from '@/lib/validation-entitlement'

const mocks = vi.hoisted(() => ({ job: vi.fn(), user: vi.fn(), full: vi.fn(), plan: vi.fn(), inserted: vi.fn(), locks: [] as unknown[] }))
vi.mock('@/lib/validation/engine', () => ({ runLiteValidation: vi.fn(), runFullValidation: mocks.full }))
vi.mock('@/lib/plan-catalog', () => ({ getPlan: mocks.plan }))
vi.mock('@/lib/credits', () => ({ refundValidationCredits: vi.fn() }))
vi.mock('@/db', () => ({ db: { query: { validationJobs: { findFirst: mocks.job }, users: { findFirst: mocks.user } },
  transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback({
    select: () => ({ from: (table: unknown) => ({ where: () => ({
      for: async () => { mocks.locks.push(table); return table === users ? [await mocks.user()] : [await mocks.job()] },
      limit: async () => [],
    }) }) }),
    insert: () => ({ values: (value: unknown) => { mocks.inserted(value); return { returning: async () => [{ id: 'saved' }] } } }),
    update: () => ({ set: () => ({ where: async () => undefined }) }),
  }) } }))
import { users, validationJobs } from '@/db/schema'
import { completeValidationJob, generateValidationReport, validationRetryDeadline, isStaleValidationJob } from '@/lib/validation/jobs'
import { FullReportSchema } from '@/lib/validation/schemas'
import { PIPELINE_IDEA, PIPELINE_REPLIES } from './fixtures/agent-payloads'

const snapshot: ValidationEntitlementSnapshot = { version: 1, tier: 'premium', ownerUnlimited: false,
  maxTokensPerCall: 8000, maxConcurrentRequests: 2, monthlyValidationLimit: 8, creditCost: 300,
  admittedAt: '2026-11-16T00:00:00Z', validationWindowEndsAt: '2026-12-01T00:00:00Z' }
const report = () => ({ ...FullReportSchema.parse(Object.assign({}, ...Object.values(PIPELINE_REPLIES))),
  overallScore: 33, provider: 'synthetic/model', tokensUsed: 1, computedUnitEconomics: {}, financialProjection: [],
  agentTrail: { agents: { market: 'ok', customer: 'ok', synthesis: 'ok' } } })
const replayPreparation: RunValidationStep = async <T>(id: string, work: () => Promise<T>) => id === 'prepare-validation'
  ? { userId: 'user', isLite: false, idea: PIPELINE_IDEA, privateContext: undefined } as T : work()

beforeEach(() => {
  vi.clearAllMocks(); mocks.locks.length = 0
  mocks.job.mockResolvedValue({ id: 'job', userId: 'user', ideaId: 'idea', status: 'running', isLite: false, entitlementSnapshot: snapshot })
  mocks.user.mockResolvedValue({ id: 'user', tier: 'free', role: 'user', accountStatus: 'active' })
  mocks.plan.mockResolvedValue({ maxTokensPerCall: 4000 })
  mocks.full.mockResolvedValue(report())
})

describe('admitted validation budget and persistence', () => {
  it('allows sequential progress beyond the idle window but stops at the absolute run deadline', async () => {
    const now = new Date('2026-11-17T12:00:00Z')
    expect(isStaleValidationJob({ status: 'running', createdAt: new Date(now.getTime() - 40 * 60000), updatedAt: now }, now)).toBe(false)
    const expired = { status: 'running' as const, createdAt: new Date(now.getTime() - 91 * 60000), updatedAt: now }
    expect(isStaleValidationJob(expired, now)).toBe(true)
    mocks.job.mockResolvedValue(expired)
    expect(await validationRetryDeadline('job')).toBe(expired.createdAt.getTime() + 90 * 60000)
  })
  it('uses the existing running heartbeat window as the durable retry deadline', async () => {
    const updatedAt = new Date('2026-11-16T00:00:00Z')
    mocks.job.mockResolvedValue({ status: 'running', updatedAt, createdAt: new Date(updatedAt.getTime() - 30 * 60000) })
    expect(await validationRetryDeadline('job')).toBe(updatedAt.getTime() + 15 * 60000)
    mocks.job.mockResolvedValue({ status: 'failed', updatedAt })
    expect(await validationRetryDeadline('job')).toBeNull()
    mocks.job.mockResolvedValue({ status: 'running', updatedAt: null, createdAt: new Date('invalid') })
    expect(await validationRetryDeadline('job')).toBeNull()
  })
  it('captures the actual durable public topic in the saved report and never substitutes a current topic on legacy replay', async () => {
    const actualIdea = { ...PIPELINE_IDEA, publicResearchFocus: 'Inventory reconciliation using spreadsheets' }
    const runStep: RunValidationStep = async <T>(id: string, work: () => Promise<T>) => id === 'prepare-validation'
      ? { userId: 'user', isLite: false, idea: actualIdea, preparedAt: '2026-11-16T00:00:00Z' } as T : work()
    const generated = await generateValidationReport('job', { runStep })
    expect(mocks.full.mock.calls[0][0]).toEqual(actualIdea)
    expect(generated.ideaSnapshot).toMatchObject({ ...actualIdea, capturedAt: '2026-11-16T00:00:00Z' })
    expect(generated.ideaSnapshot?.briefFingerprint).toMatch(/^[0-9a-f]{64}$/)
    await completeValidationJob('job', generated)
    expect(mocks.inserted.mock.calls[0][0].reportData.ideaSnapshot).toEqual(generated.ideaSnapshot)
    const legacy = await generateValidationReport('job', { runStep: replayPreparation })
    expect(legacy.ideaSnapshot).not.toHaveProperty('publicResearchFocus')
  })
  it('preserves the admitted ceiling across an ordinary tier downgrade and durable preparation replay', async () => {
    await generateValidationReport('job', { runStep: replayPreparation })
    expect(mocks.full.mock.calls[0][2]).toMatchObject({ maxTokensPerCall: 8000, retryTransientFailures: true })
    expect(mocks.plan).not.toHaveBeenCalled()
  })
  it('retains current-plan behavior for legacy jobs without an entitlement snapshot', async () => {
    mocks.job.mockResolvedValue({ id: 'job', userId: 'user', status: 'running', entitlementSnapshot: null })
    await generateValidationReport('job', { runStep: replayPreparation })
    expect(mocks.full.mock.calls[0][2].maxTokensPerCall).toBe(4000)
    expect(mocks.plan).toHaveBeenCalledWith('free')
  })
  it('still rejects a blocked admitted account before cached preparation or model work', async () => {
    mocks.user.mockResolvedValue({ id: 'user', tier: 'premium', accountStatus: 'blocked' })
    await expect(generateValidationReport('job', { runStep: replayPreparation })).rejects.toThrow('account is not active')
    expect(mocks.full).not.toHaveBeenCalled()
  })
  it('checks useful content again at persistence before any report insertion', async () => {
    await expect(completeValidationJob('job', { ...report(), actionPlan: [] })).rejects.toThrow('content is incomplete')
    expect(mocks.inserted).not.toHaveBeenCalled()
    expect(mocks.locks).toEqual([users, validationJobs])
  })
  it('locks the account before the job and saves useful completed output', async () => {
    expect(await completeValidationJob('job', report())).toBe('saved')
    expect(mocks.inserted).toHaveBeenCalledOnce()
    expect(mocks.locks).toEqual([users, validationJobs])
  })
})
