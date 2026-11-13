import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ refund: vi.fn(), update: vi.fn(), insert: vi.fn(), accountStatus: 'active',
  findJob: vi.fn(), findAccount: vi.fn(), lite: vi.fn(), full: vi.fn(),
  job: { id: '22222222-2222-4222-8222-222222222222', userId: '11111111-1111-4111-8111-111111111111', status: 'running' }, report: null as null | { id: string } }))
import { users } from '@/db/schema'
const transaction = {
  select: () => ({ from: (table: unknown) => ({ where: () => ({ for: async () => table === users ? [{ accountStatus: mocks.accountStatus }] : [mocks.job], limit: async () => mocks.report ? [mocks.report] : [] }) }) }),
  update: (...args: unknown[]) => { mocks.update(...args); return { set: () => ({ where: async () => undefined }) } },
  insert: mocks.insert,
}
vi.mock('@/db', () => ({ db: { transaction: async (callback: (tx: unknown) => unknown) => callback(transaction),
  query: { validationJobs: { findFirst: mocks.findJob }, users: { findFirst: mocks.findAccount } } } }))
vi.mock('@/lib/credits', () => ({ refundValidationCredits: mocks.refund }))
vi.mock('./engine', () => ({ runLiteValidation: mocks.lite, runFullValidation: mocks.full }))
import { completeValidationJob, failValidationJob, generateValidationReport } from './jobs'
beforeEach(() => {
  vi.clearAllMocks(); mocks.refund.mockReset(); mocks.refund.mockResolvedValue(undefined)
  mocks.job.status = 'running'; mocks.accountStatus = 'active'; mocks.report = null
  mocks.findJob.mockResolvedValue(mocks.job); mocks.findAccount.mockResolvedValue({ accountStatus: 'active' })
})
describe('Validation refund consistency', () => {
  it('passes the failure transaction to the refund before publishing failure status', async () => {
    mocks.refund.mockImplementation(async (_user: string, _job: string, tx: unknown) => {
      expect(tx).toBe(transaction)
      expect(mocks.update).not.toHaveBeenCalled()
    })
    await failValidationJob(mocks.job.id)
    expect(mocks.refund).toHaveBeenCalledWith(mocks.job.userId, mocks.job.id, transaction)
    expect(mocks.update).toHaveBeenCalledOnce()
  })
  it('does not announce returned credits when refunding fails', async () => {
    mocks.refund.mockRejectedValue(new Error('ledger unavailable'))
    await expect(failValidationJob(mocks.job.id)).rejects.toThrow('ledger unavailable')
    expect(mocks.update).not.toHaveBeenCalled()
  })
  it('does not refund a report that was already saved', async () => {
    mocks.report = { id: 'saved-report' }
    await failValidationJob(mocks.job.id)
    expect(mocks.refund).not.toHaveBeenCalled()
    expect(mocks.update).not.toHaveBeenCalled()
  })
  it('cannot publish a new report after the job was refunded', async () => {
    mocks.job.status = 'failed'
    await expect(completeValidationJob(mocks.job.id, {} as Parameters<typeof completeValidationJob>[1])).rejects.toThrow('already refunded')
    expect(mocks.insert).not.toHaveBeenCalled()
  })
  it.each(['blocked', 'deactivated'])('cannot publish a generated report after its account becomes %s', async status => {
    mocks.accountStatus = status
    await expect(completeValidationJob(mocks.job.id, {} as Parameters<typeof completeValidationJob>[1])).rejects.toThrow('account is not active')
    expect(mocks.insert).not.toHaveBeenCalled()
  })
  it('rejects a failed queue replay before a cached preparation step or AI generation', async () => {
    mocks.job.status = 'failed'
    const runStep = vi.fn()
    await expect(generateValidationReport(mocks.job.id, { runStep })).rejects.toThrow('job is no longer active')
    expect(runStep).not.toHaveBeenCalled()
    expect(mocks.lite).not.toHaveBeenCalled()
    expect(mocks.full).not.toHaveBeenCalled()
  })
  it('rejects a revoked queue account before preparation or AI generation', async () => {
    mocks.findAccount.mockResolvedValue({ accountStatus: 'blocked' })
    await expect(generateValidationReport(mocks.job.id)).rejects.toThrow('account is not active')
    expect(mocks.lite).not.toHaveBeenCalled()
    expect(mocks.full).not.toHaveBeenCalled()
  })
})
