import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ customer: vi.fn(), subscriptions: vi.fn(), sessions: vi.fn(), expire: vi.fn(), checkout: vi.fn(), price: vi.fn(), portal: vi.fn(), portalConfig: vi.fn(),
  priceId: 'price_premium' }))
vi.mock('stripe', () => ({ default: class {
  customers = { create: mocks.customer }
  prices = { retrieve: mocks.price }
  subscriptions = { list: mocks.subscriptions }
  checkout = { sessions: { list: mocks.sessions, expire: mocks.expire, create: mocks.checkout } }
  billingPortal = { sessions: { create: mocks.portal }, configurations: { retrieve: mocks.portalConfig } }
} }))
const user = { id: '11111111-1111-4111-8111-111111111111', email: 'founder@example.com', stripeCustomerId: 'cus_validore', subscriptionStatus: null as string | null, isAdmin: false, accountStatus: 'active' }
vi.mock('@/db', () => ({ db: { transaction: async (callback: (tx: unknown) => unknown) => callback({
  select: () => ({ from: () => ({ where: () => ({ for: async () => [user] }) }) }),
  update: () => ({ set: () => ({ where: async () => undefined }) }),
}) } }))
import { createBillingPortal, createSubscriptionCheckout } from './billing'
vi.mock('./plan-catalog', async importOriginal => {
  const actual = await importOriginal<typeof import('./plan-catalog')>()
  return { ...actual, lockPlan: vi.fn(),
    getPlan: async (tier: 'premium' | 'max_premium') => actual.resolvePlan(tier, { stripePriceId: tier === 'premium' ? mocks.priceId : 'price_max' }),
  }
})
const providerPrice = (usd: number, inr?: number) => ({
  active: true, currency: 'usd', unit_amount: usd, billing_scheme: 'per_unit',
  recurring: { interval: 'month', interval_count: 1, usage_type: 'licensed' },
  ...(inr !== undefined ? { currency_options: { inr: { unit_amount: inr } } } : {}),
})
beforeEach(() => {
  user.subscriptionStatus = null; user.isAdmin = false; user.accountStatus = 'active'
  mocks.priceId = 'price_premium'
  vi.clearAllMocks()
  vi.stubEnv('NODE_ENV', 'test'); vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://app.example.com')
  vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_unit'); vi.stubEnv('STRIPE_PREMIUM_PRICE_ID', 'price_premium')
  vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_test'); vi.stubEnv('ENABLE_PAID_CHECKOUT', 'true')
  mocks.subscriptions.mockResolvedValue({ data: [] }); mocks.sessions.mockResolvedValue({ data: [] })
  mocks.checkout.mockImplementation(async ({ currency, line_items }: { currency: string; line_items: { price: string }[] }) => {
    const price = line_items[0].price === 'price_max' ? providerPrice(2000, 199900) : providerPrice(800, 79900)
    return { id: 'cs_new', url: 'https://checkout.stripe.com/new', currency, amount_subtotal: currency === 'inr' ? price.currency_options?.inr.unit_amount : price.unit_amount }
  })
  mocks.portal.mockResolvedValue({ url: 'https://billing.stripe.com/account' })
  mocks.expire.mockResolvedValue(undefined)
  mocks.price.mockImplementation(async (id: string) => id === 'price_max' ? providerPrice(2000, 199900) : providerPrice(800, 79900))
})

describe('Existing subscriber service while checkout is frozen', () => {
  beforeEach(() => {
    vi.stubEnv('ENABLE_PAID_CHECKOUT', 'false')
    vi.stubEnv('STRIPE_SERVICE_PORTAL_CONFIGURATION_ID', 'bpc_service')
    mocks.portalConfig.mockResolvedValue({ active: true, features: { subscription_update: { enabled: false },
      subscription_cancel: { enabled: true }, invoice_history: { enabled: true } } })
  })
  it('uses the verified cancellation and invoice configuration without opening new sales', async () => {
    expect(await createBillingPortal(user.id)).toBe('https://billing.stripe.com/account')
    expect(mocks.portalConfig).toHaveBeenCalledWith('bpc_service')
    expect(mocks.portal).toHaveBeenCalledWith({ customer: 'cus_validore', return_url: 'https://app.example.com/dashboard/settings', configuration: 'bpc_service' })
    expect(mocks.checkout).not.toHaveBeenCalled()
  })
  it('rejects missing service configuration rather than using a default portal that permits paid changes', async () => {
    vi.stubEnv('STRIPE_SERVICE_PORTAL_CONFIGURATION_ID', '')
    await expect(createBillingPortal(user.id)).rejects.toMatchObject({ status: 503 })
    expect(mocks.portal).not.toHaveBeenCalled(); expect(mocks.portalConfig).not.toHaveBeenCalled()
  })
  it.each([
    { active: false, update: false, cancel: true, invoices: true },
    { active: true, update: true, cancel: true, invoices: true },
    { active: true, update: false, cancel: false, invoices: true },
    { active: true, update: false, cancel: true, invoices: false },
  ])('rejects inactive or unsuitable provider portal configuration', async config => {
    mocks.portalConfig.mockResolvedValue({ active: config.active, features: { subscription_update: { enabled: config.update },
      subscription_cancel: { enabled: config.cancel }, invoice_history: { enabled: config.invoices } } })
    await expect(createBillingPortal(user.id)).rejects.toMatchObject({ status: 503 })
    expect(mocks.portal).not.toHaveBeenCalled()
  })
  it.each(['blocked', 'deactivated', 'manual', 'owner'])('rechecks %s access at the service boundary', async state => {
    if (state === 'owner') user.isAdmin = true
    else if (state === 'manual') user.subscriptionStatus = 'manual'
    else user.accountStatus = state
    await expect(createBillingPortal(user.id)).rejects.toThrow()
    expect(mocks.portalConfig).not.toHaveBeenCalled(); expect(mocks.portal).not.toHaveBeenCalled()
  })
})
afterEach(() => vi.unstubAllEnvs())
describe('Subscription checkout lifecycle', () => {
  it('blocks direct checkout while the launch switch is off or the owner manages the entitlement', async () => {
    vi.stubEnv('ENABLE_PAID_CHECKOUT', 'false')
    await expect(createSubscriptionCheckout(user.id, 'premium')).rejects.toThrow('not available')
    vi.stubEnv('ENABLE_PAID_CHECKOUT', 'true'); user.subscriptionStatus = 'manual'
    await expect(createSubscriptionCheckout(user.id, 'premium')).rejects.toThrow('managed by the owner')
    user.subscriptionStatus = null; user.isAdmin = true
    await expect(createSubscriptionCheckout(user.id, 'premium')).rejects.toThrow('does not need')
    expect(mocks.checkout).not.toHaveBeenCalled()
  })
  it.each([
    providerPrice(2900),
    { ...providerPrice(800), currency: 'inr' },
    { ...providerPrice(800), recurring: { interval: 'year', interval_count: 1 } },
    { ...providerPrice(800), active: false },
  ])('blocks checkout when the configured price does not match the advertised plan', async price => {
    mocks.price.mockResolvedValue(price)
    await expect(createSubscriptionCheckout(user.id, 'premium')).rejects.toThrow('does not match')
    expect(mocks.checkout).not.toHaveBeenCalled()
    expect(mocks.sessions).not.toHaveBeenCalled()
  })
  it.each([providerPrice(800), providerPrice(800, 799)])('blocks INR checkout if Stripe lacks the exact rupee price', async price => {
    mocks.price.mockResolvedValue(price)
    await expect(createSubscriptionCheckout(user.id, 'premium', 'INR')).rejects.toThrow('does not match')
    expect(mocks.checkout).not.toHaveBeenCalled()
  })
  it('reuses an open checkout for the selected plan', async () => {
    mocks.sessions.mockResolvedValue({ data: [{ id: 'cs_open', mode: 'subscription', currency: 'usd', amount_subtotal: 800, metadata: { purpose: 'validore_subscription', tier: 'premium', priceId: 'price_premium' }, url: 'https://checkout.stripe.com/open' }] })
    expect(await createSubscriptionCheckout(user.id, 'premium')).toBe('https://checkout.stripe.com/open')
    expect(mocks.checkout).not.toHaveBeenCalled()
  })
  it('uses a database-configured plan price when the legacy environment price ID is empty', async () => {
    vi.stubEnv('STRIPE_PREMIUM_PRICE_ID', '')
    mocks.priceId = 'price_databasepremium'
    expect(await createSubscriptionCheckout(user.id, 'premium')).toBe('https://checkout.stripe.com/new')
    expect(mocks.checkout).toHaveBeenCalledWith(expect.objectContaining({ line_items: [{ price: 'price_databasepremium', quantity: 1 }] }))
  })
  it('replaces an old checkout instead of charging an outdated price for the same tier', async () => {
    mocks.sessions.mockResolvedValue({ data: [{ id: 'cs_old_price', mode: 'subscription', metadata: { purpose: 'validore_subscription', tier: 'premium', priceId: 'price_previous' }, url: 'https://checkout.stripe.com/previous' }] })
    expect(await createSubscriptionCheckout(user.id, 'premium')).toBe('https://checkout.stripe.com/new')
    expect(mocks.expire).toHaveBeenCalledWith('cs_old_price')
    expect(mocks.checkout).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({ tier: 'premium', priceId: 'price_premium' }),
      line_items: [{ price: 'price_premium', quantity: 1 }],
    }))
  })
  it('expires same-plan checkouts with a different currency or amount', async () => {
    const common = { mode: 'subscription', url: 'https://checkout.stripe.com/old', metadata: { purpose: 'validore_subscription', tier: 'premium', priceId: 'price_premium' } }
    mocks.sessions.mockResolvedValue({ data: [{ ...common, id: 'cs_usd', currency: 'usd', amount_subtotal: 800 }, { ...common, id: 'cs_wrong_inr', currency: 'inr', amount_subtotal: 799 }] })
    expect(await createSubscriptionCheckout(user.id, 'premium', 'INR')).toBe('https://checkout.stripe.com/new')
    expect(mocks.expire.mock.calls).toEqual([['cs_usd'], ['cs_wrong_inr']])
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
  it.each([
    ['premium', 'USD', 'price_premium'], ['premium', 'INR', 'price_premium'],
    ['max_premium', 'USD', 'price_max'], ['max_premium', 'INR', 'price_max'],
  ] as const)('uses the server-selected price for %s in %s', async (tier, currency, price) => {
    expect(await createSubscriptionCheckout(user.id, tier, currency)).toBe('https://checkout.stripe.com/new')
    expect(mocks.price).toHaveBeenCalledWith(price, currency === 'INR' ? { expand: ['currency_options'] } : undefined)
    expect(mocks.checkout).toHaveBeenCalledWith(expect.objectContaining({ customer: user.stripeCustomerId,
      mode: 'subscription', currency: currency.toLowerCase(), adaptive_pricing: { enabled: false },
      line_items: [{ price, quantity: 1 }], subscription_data: { metadata: { userId: user.id } },
    }))
  })
  it('withholds and expires a checkout if Stripe returns a different currency or subtotal', async () => {
    mocks.checkout.mockResolvedValueOnce({ id: 'cs_wrong', url: 'https://checkout.stripe.com/wrong', currency: 'usd', amount_subtotal: 800 })
    await expect(createSubscriptionCheckout(user.id, 'premium', 'INR')).rejects.toThrow('requested plan price')
    expect(mocks.expire).toHaveBeenCalledWith('cs_wrong')
  })
})
