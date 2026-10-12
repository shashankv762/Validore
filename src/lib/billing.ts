import Stripe from 'stripe'
import { db } from '@/db'
import { users } from '@/db/schema'
import { eq } from 'drizzle-orm'

export function stripeBillingClient() {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key || !/^(sk|rk)_(test|live)_/.test(key)) throw new Error('Billing is not configured')
  return new Stripe(key, { timeout: 10_000, maxNetworkRetries: 1 })
}
export function billingOrigin() {
  const url = new URL(process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000')
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Invalid application origin')
  if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') throw new Error('Public billing requires HTTPS')
  return url.origin
}

/** Serialize checkout creation for a customer and reuse its open subscription checkout. */
export async function createSubscriptionCheckout(userId: string, tier: 'premium' | 'max_premium') {
  const stripe = stripeBillingClient()
  const origin = billingOrigin()
  const price = tier === 'premium' ? process.env.STRIPE_PREMIUM_PRICE_ID : process.env.STRIPE_MAX_PREMIUM_PRICE_ID
  if (!price || !/^price_[A-Za-z0-9]+$/.test(price)) throw new Error('Plan price is not configured')
  return db.transaction(async tx => {
    const [user] = await tx.select().from(users).where(eq(users.id, userId)).for('update')
    if (!user) throw new Error('Billing account not found')
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
      if (session.metadata.tier === tier && session.url) return session.url
      // Only expire this application's abandoned plan checkout; completed sessions reject expiry.
      await stripe.checkout.sessions.expire(session.id)
    }
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription', customer: customerId, client_reference_id: user.id,
      line_items: [{ price, quantity: 1 }],
      metadata: { userId: user.id, tier, purpose: 'validore_subscription' },
      subscription_data: { metadata: { userId: user.id } },
      success_url: origin + '/dashboard/settings?checkout=returned', cancel_url: origin + '/dashboard/settings',
    })
    if (!session.url) throw new Error('Checkout URL unavailable')
    return session.url
  })
}
