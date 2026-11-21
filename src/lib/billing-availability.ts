/** Public capability flags only. Never expose the underlying credentials. */
export function billingAvailability() {
  const stripeConfigured = /^(sk|rk)_(test|live)_/.test(process.env.STRIPE_SECRET_KEY || '')
  const checkout = process.env.ENABLE_PAID_CHECKOUT === 'true' && stripeConfigured && Boolean(process.env.STRIPE_WEBHOOK_SECRET)
  // This is availability to attempt service. The portal service still verifies
  // the provider's current restricted configuration before opening a session.
  const portal = stripeConfigured && (process.env.ENABLE_PAID_CHECKOUT === 'true' || /^bpc_[A-Za-z0-9]+$/.test(process.env.STRIPE_SERVICE_PORTAL_CONFIGURATION_ID || ''))
  return { credits: checkout, premium: checkout && /^price_[A-Za-z0-9]+$/.test(process.env.STRIPE_PREMIUM_PRICE_ID || ''), maxPremium: checkout && /^price_[A-Za-z0-9]+$/.test(process.env.STRIPE_MAX_PREMIUM_PRICE_ID || ''), portal }
}
