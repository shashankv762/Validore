import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ customer: vi.fn(), subscriptions: vi.fn(), sessions: vi.fn(), expire: vi.fn(), checkout: vi.fn(), portal: vi.fn() }))
vi.mock('stripe', () => ({ default: class {
  customers = { create: mocks.customer }
  subscriptions = { list: mocks.subscriptions }
  checkout = { sessions: { list: mocks.sessions, expire: mocks.expire, create: mocks.checkout } }
  billingPortal = { sessions: { create: mocks.portal } }
} }))
const user = { id: '11111111-1111-4111-8111-111111111111', email: 'founder@example.com', stripeCustomerId: 'cus_validore' }
vi.mock('@/db', () => ({ db: { transaction: async (callback: (tx: unknown) => unknown) => callback({
  select: () => ({ from: () => ({ where: () => ({ for: async () => [user] }) }) }),
  update: () => ({ set: () => ({ where: async () => undefined }) }),
}) } }))
import { createSubscriptionCheckout } from './billing'
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('NODE_ENV', 'test'); vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://app.example.com')
  vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_unit'); vi.stubEnv('STRIPE_PREMIUM_PRICE_ID', 'price_premium')
  mocks.subscriptions.mockResolvedValue({ data: [] }); mocks.sessions.mockResolvedValue({ data: [] })
  mocks.checkout.mockResolvedValue({ url: 'https://checkout.stripe.com/new' })
  mocks.portal.mockResolvedValue({ url: 'https://billing.stripe.com/account' })
  mocks.expire.mockResolvedValue(undefined)
})
afterEach(() => vi.unstubAllEnvs())
describe('Subscription checkout lifecycle', () => {
  it('reuses an open checkout for the selected plan', async () => {
    mocks.sessions.mockResolvedValue({ data: [{ id: 'cs_open', mode: 'subscription', metadata: { purpose: 'validore_subscription', tier: 'premium' }, url: 'https://checkout.stripe.com/open' }] })
    expect(await createSubscriptionCheckout(user.id, 'premium')).toBe('https://checkout.stripe.com/open')
    expect(mocks.checkout).not.toHaveBeenCalled()
  })
  it('sends an existing subscriber to the portal instead of creating another subscription', async () => {
    mocks.subscriptions.mockResolvedValue({ data: [{ status: 'active' }] })
    expect(await createSubscriptionCheckout(user.id, 'premium')).toBe('https://billing.stripe.com/account')
    expect(mocks.checkout).not.toHaveBeenCalled()
    expect(mocks.portal).toHaveBeenCalledWith({ customer: user.stripeCustomerId, return_url: 'https://app.example.com/dashboard/settings' })
  })
  it('does not create another checkout if expiring the old plan checkout fails', async () => {
    mocks.sessions.mockResolvedValue({ data: [{ id: 'cs_old', mode: 'subscription', metadata: { purpose: 'validore_subscription', tier: 'max_premium' } }] })
    mocks.expire.mockRejectedValueOnce(new Error('already completed'))
    await expect(createSubscriptionCheckout(user.id, 'premium')).rejects.toThrow('already completed')
    expect(mocks.checkout).not.toHaveBeenCalled()
  })
  it('uses server-selected prices and ownership metadata for a new subscription', async () => {
    await createSubscriptionCheckout(user.id, 'premium')
    expect(mocks.checkout).toHaveBeenCalledWith(expect.objectContaining({ customer: user.stripeCustomerId,
      mode: 'subscription', line_items: [{ price: 'price_premium', quantity: 1 }], subscription_data: { metadata: { userId: user.id } },
    }))
  })
})
