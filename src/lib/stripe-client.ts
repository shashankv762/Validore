import Stripe from 'stripe'

export function stripeBillingClient() {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key || !/^(sk|rk)_(test|live)_/.test(key)) throw new Error('Billing is not configured')
  return new Stripe(key, { timeout: 10_000, maxNetworkRetries: 1 })
}
