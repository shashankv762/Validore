import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ refund: vi.fn(), update: vi.fn(), insert: vi.fn(), job: { id: '22222222-2222-4222-8222-222222222222', userId: '11111111-1111-4111-8111-111111111111', status: 'running' }, report: null as null | { id: string } }))
const transaction = {
  select: () => ({ from: () => ({ where: () => ({ for: async () => [mocks.job], limit: async () => mocks.report ? [mocks.report] : [] }) }) }),
  update: (...args: unknown[]) => { mocks.update(...args); return { set: () => ({ where: async () => undefined }) } },
  insert: mocks.insert,
}
vi.mock('@/db', () => ({ db: { transaction: async (callback: (tx: unknown) => unknown) => callback(transaction) } }))
vi.mock('@/lib/credits', () => ({ refundValidationCredits: mocks.refund }))
vi.mock('./engine', () => ({ runLiteValidation: vi.fn(), runFullValidation: vi.fn() }))
import { completeValidationJob, failValidationJob } from './jobs'
beforeEach(() => { vi.clearAllMocks(); mocks.refund.mockReset(); mocks.refund.mockResolvedValue(undefined); mocks.job.status = 'running'; mocks.report = null })
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
})
