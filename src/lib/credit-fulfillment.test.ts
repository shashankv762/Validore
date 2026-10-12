import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fulfillCreditPurchase, PaymentMetadataSchema } from './credit-fulfillment'
const mocks = vi.hoisted(() => ({ transaction: vi.fn(), insert: vi.fn(), update: vi.fn(), values: vi.fn(), set: vi.fn() }))
vi.mock('@/db', () => ({ db: { transaction: mocks.transaction } }))
const payment = { userId: '11111111-1111-4111-8111-111111111111', creditType: 'bundle' as const,
  quantity: 1, provider: 'stripe' as const, paymentId: 'pi_verified', amountMinor: 7900, currency: 'usd' }

describe('Payment fulfillment', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.transaction.mockImplementation(async fn => fn({ insert: mocks.insert, update: mocks.update }))
    mocks.insert.mockReturnValue({ values: mocks.values })
    mocks.values.mockReturnValue({ onConflictDoNothing: () => ({ returning: async () => [{ id: 'purchase' }] }) })
    mocks.update.mockReturnValue({ set: mocks.set })
    mocks.set.mockReturnValue({ where: () => ({ returning: async () => [{ id: payment.userId }] }) })
  })
  it('commits a paid package in one transaction', async () => {
    expect(await fulfillCreditPurchase(payment)).toBe(true)
    expect(mocks.transaction).toHaveBeenCalledTimes(1)
    expect(mocks.values).toHaveBeenCalledWith(expect.objectContaining({ stripePaymentIntentId: 'pi_verified', amountUsd: 79, status: 'completed' }))
    expect(mocks.update).toHaveBeenCalledTimes(1)
  })
  it('does not grant credits again for a duplicate provider reference', async () => {
    mocks.values.mockReturnValue({ onConflictDoNothing: () => ({ returning: async () => [] }) })
    expect(await fulfillCreditPurchase(payment)).toBe(false)
    expect(mocks.update).not.toHaveBeenCalled()
  })
  it('rejects underpayment and wrong currency before a database write', async () => {
    await expect(fulfillCreditPurchase({ ...payment, amountMinor: 1 })).rejects.toThrow('amount or currency')
    await expect(fulfillCreditPurchase({ ...payment, currency: 'INR' })).rejects.toThrow('amount or currency')
    expect(mocks.transaction).not.toHaveBeenCalled()
  })
  it('validates metadata quantities and recipient identities', () => {
    const base = { userId: payment.userId, creditType: 'bundle' }
    for (const quantity of ['0', '-1', '1.5', '10000000000000000', '1abc', '101']) {
      expect(PaymentMetadataSchema.safeParse({ ...base, quantity }).success).toBe(false)
    }
    expect(PaymentMetadataSchema.parse({ ...base, quantity: '2' }).quantity).toBe(2)
    expect(PaymentMetadataSchema.safeParse({ ...base, userId: 'invalid', quantity: '1' }).success).toBe(false)
  })
})
