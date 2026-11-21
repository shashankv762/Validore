import { db } from '@/db'
import { users } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { getPlan, lockPlan, assertMonthlyStripePrice, planPriceMinor } from './plan-catalog'
import { billingAvailability } from './billing-availability'
import type { PaidPlanTier, SubscriptionCurrency } from './plans'
import { stripeBillingClient } from './stripe-client'
import { isActiveAccount, isOwnerAccount } from './admin-access'
export { stripeBillingClient } from './stripe-client'

export function billingOrigin() {
  const url = new URL(process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000')
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Invalid application origin')
  if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') throw new Error('Public billing requires HTTPS')
  return url.origin
}

export class BillingPortalError extends Error {
  constructor(message: string, readonly status = 503) { super(message) }
}

/** Existing subscribers retain invoices and cancellation while new sales are
 * frozen. Inspect the provider configuration; never create or alter it here. */
export async function createBillingPortal(userId: string) {
  return db.transaction(async tx => {
    const [user] = await tx.select().from(users).where(eq(users.id, userId)).for('update')
    if (!user || !isActiveAccount(user) || isOwnerAccount(user)) throw new BillingPortalError('This account cannot open billing.', 403)
    if (user.subscriptionStatus === 'manual') throw new BillingPortalError('Your plan is assigned by the owner and has no automatic payment. Contact the owner to change it.', 409)
    if (!user.stripeCustomerId) throw new BillingPortalError('No Stripe billing account is connected.', 409)
    const stripe = stripeBillingClient()
    let configuration: string | undefined
    if (process.env.ENABLE_PAID_CHECKOUT !== 'true') {
      configuration = process.env.STRIPE_SERVICE_PORTAL_CONFIGURATION_ID
      if (!configuration || !/^bpc_[A-Za-z0-9]+$/.test(configuration)) {
        throw new BillingPortalError('Billing support is temporarily unavailable. Contact support for cancellation or invoices.')
      }
      const config = await stripe.billingPortal.configurations.retrieve(configuration)
      if (!config.active || config.features.subscription_update.enabled || !config.features.subscription_cancel.enabled || !config.features.invoice_history.enabled) {
        throw new BillingPortalError('Billing support is temporarily unavailable. Contact support for cancellation or invoices.')
      }
    }
    const session = await stripe.billingPortal.sessions.create({ customer: user.stripeCustomerId,
      return_url: billingOrigin() + '/dashboard/settings', ...(configuration ? { configuration } : {}) })
    return session.url
  })
}

/** Serialize checkout creation for a customer and reuse its open subscription checkout. */
export async function createSubscriptionCheckout(userId: string, tier: PaidPlanTier, currency: SubscriptionCurrency = 'USD') {
  if (!billingAvailability().credits) throw new Error('Paid plans are not available yet')
  const stripe = stripeBillingClient()
  const origin = billingOrigin()
  const stripeCurrency = currency.toLowerCase()
  return db.transaction(async tx => {
    await lockPlan(tx, tier)
    const plan = await getPlan(tier, tx)
    const price = plan.stripePriceId
    if (!plan.advertised) throw new Error('New purchases of this plan are paused')
    if (!price || !/^price_[A-Za-z0-9]+$/.test(price)) throw new Error('Plan price is not configured')
    const [user] = await tx.select().from(users).where(eq(users.id, userId)).for('update')
    if (!user) throw new Error('Billing account not found')
    if (!isActiveAccount(user) || isOwnerAccount(user)) throw new Error('This account does not need a payment subscription')
    if (user.subscriptionStatus === 'manual') throw new Error('This plan is managed by the owner. Contact the owner before changing billing')
    const expectedAmount = planPriceMinor(plan, currency)
    const configuredPrice = await stripe.prices.retrieve(price, currency === 'INR' ? { expand: ['currency_options'] } : undefined)
    assertMonthlyStripePrice(configuredPrice, expectedAmount, currency)
    let customerId = user.stripeCustomerId
    if (!customerId) {
      const customer = await stripe.customers.create({ email: user.email, metadata: { userId: user.id } }, { idempotencyKey: 'validore-customer-' + user.id })
      customerId = customer.id
      await tx.update(users).set({ stripeCustomerId: customerId }).where(eq(users.id, user.id))
    }
    const subscriptions = await stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 100 })
    if (subscriptions.data.some(sub => !['canceled', 'incomplete_expired'].includes(sub.status))) {
      const portal = await stripe.billingPortal.sessions.create({ customer: customerId, return_url: origin + '/dashboard/settings' })
      return portal.url
    }
    const sessions = await stripe.checkout.sessions.list({ customer: customerId, status: 'open', limit: 100 })
    for (const session of sessions.data) {
      if (session.mode !== 'subscription' || session.metadata?.purpose !== 'validore_subscription') continue
      if (session.metadata.tier === tier && session.metadata.priceId === price &&
          session.currency === stripeCurrency && session.amount_subtotal === expectedAmount && !session.adaptive_pricing?.enabled && session.url) return session.url
      // Only expire this application's abandoned plan checkout; completed sessions reject expiry.
      await stripe.checkout.sessions.expire(session.id)
    }
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription', customer: customerId, client_reference_id: user.id,
      currency: stripeCurrency, adaptive_pricing: { enabled: false },
      line_items: [{ price, quantity: 1 }],
      metadata: { userId: user.id, tier, priceId: price, purpose: 'validore_subscription' },
      subscription_data: { metadata: { userId: user.id } },
      success_url: origin + '/dashboard/settings?checkout=returned', cancel_url: origin + '/dashboard/settings',
    })
    if (!session.url || session.currency !== stripeCurrency || session.amount_subtotal !== expectedAmount || session.adaptive_pricing?.enabled) {
      await stripe.checkout.sessions.expire(session.id)
      throw new Error('Stripe did not return a checkout with the requested plan price')
    }
    return session.url
  })
}
