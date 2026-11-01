/** Public capability flags only. Never expose the underlying credentials. */
export function billingAvailability() {
  const checkout = /^(sk|rk)_(test|live)_/.test(process.env.STRIPE_SECRET_KEY || '') && Boolean(process.env.STRIPE_WEBHOOK_SECRET)
  return { credits: checkout, premium: checkout && /^price_[A-Za-z0-9]+$/.test(process.env.STRIPE_PREMIUM_PRICE_ID || ''), maxPremium: checkout && /^price_[A-Za-z0-9]+$/.test(process.env.STRIPE_MAX_PREMIUM_PRICE_ID || '') }
}
