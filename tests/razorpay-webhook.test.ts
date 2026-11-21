import { createHmac } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'

const mocks = vi.hoisted(() => ({ lockedUser: vi.fn(), where: vi.fn(), reconcile: vi.fn(), fulfill: vi.fn() }))
vi.mock('@/db', () => ({ db: { transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback({
  select: () => ({ from: () => ({ where: (condition: unknown) => { mocks.where(condition); return { for: mocks.lockedUser } } }) }),
}) } }))
vi.mock('@/lib/razorpay-subscription-credits', () => ({ reconcileRazorpayCredits: mocks.reconcile }))
vi.mock('@/lib/credit-fulfillment', () => ({ PaymentMetadataSchema: {}, fulfillCreditPurchase: mocks.fulfill }))
import { POST } from '@/app/api/webhooks/razorpay/route'

const userId = '11111111-1111-4111-8111-111111111111'
const user = { id: userId, subscriptionStatus: 'manual', tier: 'max_premium' }
const subscription = { id: 'sub_delayed', plan_id: 'plan_premium', status: 'active',
  current_start: 1793491200, current_end: 1796083200, notes: { userId } }
const request = (signature = true) => {
  const body = JSON.stringify({ event: 'subscription.activated', payload: { subscription: { entity: subscription } } })
  return new Request('http://localhost/api/webhooks/razorpay', { method: 'POST', body,
    headers: { 'x-razorpay-signature': signature ? createHmac('sha256', 'synthetic-webhook-secret').update(body).digest('hex') : '0'.repeat(64) } })
}
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv('RAZORPAY_WEBHOOK_SECRET', 'synthetic-webhook-secret')
  vi.stubEnv('RAZORPAY_PREMIUM_PLAN_ID', 'plan_premium'); vi.stubEnv('RAZORPAY_MAX_PREMIUM_PLAN_ID', 'plan_max')
  mocks.lockedUser.mockResolvedValue([user]); mocks.reconcile.mockResolvedValue(user)
})
afterEach(() => vi.unstubAllEnvs())

describe('signed Razorpay activation reconciliation', () => {
  it('passes the locked owner and complete provider period to the consumption-preserving reconciler', async () => {
    expect((await POST(request())).status).toBe(200)
    expect(new PgDialect().sqlToQuery(mocks.where.mock.calls[0][0]).params).toEqual([userId])
    expect(mocks.lockedUser).toHaveBeenCalledWith('update')
    expect(mocks.reconcile).toHaveBeenCalledWith(expect.anything(), user, subscription, 'premium')
    expect(mocks.fulfill).not.toHaveBeenCalled()
  })
  it('rejects invalid signatures before accessing any account', async () => {
    expect((await POST(request(false))).status).toBe(400)
    expect(mocks.lockedUser).not.toHaveBeenCalled(); expect(mocks.reconcile).not.toHaveBeenCalled()
  })
})
