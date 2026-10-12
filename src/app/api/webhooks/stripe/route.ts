import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { db } from '@/db'
import { users } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { PaymentMetadataSchema, fulfillCreditPurchase } from '@/lib/credit-fulfillment'
import { TIER_MONTHLY_CREDITS } from '@/lib/credit-costs'

export async function POST(req: Request) {
  const secret = process.env.STRIPE_SECRET_KEY
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret || !webhookSecret) return NextResponse.json({ error: 'Webhook not configured' }, { status: 503 })
  const signature = req.headers.get('stripe-signature')
  if (!signature) return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
  const stripe = new Stripe(secret)
  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(await req.text(), signature, webhookSecret)
  } catch {
    return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 400 })
  }
  try {
    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
      const session = event.data.object
      if (session.mode === 'payment' && session.payment_status === 'paid' && session.metadata?.creditType) {
        const metadata = PaymentMetadataSchema.parse({ ...session.metadata, quantity: session.metadata.quantity ?? '1' })
        const paymentId = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id
        await fulfillCreditPurchase({ ...metadata, provider: 'stripe', paymentId: paymentId ?? '',
          amountMinor: session.amount_total ?? 0, currency: session.currency ?? '' })
      }
    } else if (event.type === 'customer.subscription.created' || event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
      // Retrieve current provider state so delayed, out-of-order events cannot restore an old plan.
      const subscription = await stripe.subscriptions.retrieve(event.data.object.id)
      const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id
      const item = subscription.items.data[0]
      const priceId = item?.price.id
      const active = subscription.status === 'active' || subscription.status === 'trialing'
      let tier: 'free' | 'premium' | 'max_premium' = 'free'
      if (active && priceId && priceId === process.env.STRIPE_PREMIUM_PRICE_ID) tier = 'premium'
      if (active && priceId && priceId === process.env.STRIPE_MAX_PREMIUM_PRICE_ID) tier = 'max_premium'
      const periodEnd = item?.current_period_end ? new Date(item.current_period_end * 1000) : null
      await db.transaction(async (tx) => {
        const [user] = await tx.select().from(users).where(eq(users.stripeCustomerId, customerId)).for('update')
        if (!user) return
        if (user.subscriptionId && user.subscriptionId !== subscription.id) {
          if (!active) return // An old cancellation must not cancel the replacement plan.
          const previous = await stripe.subscriptions.retrieve(user.subscriptionId)
          if (previous.status === 'active' || previous.status === 'trialing') return
        }
        const newCycle = active && periodEnd && (user.subscriptionId !== subscription.id || user.tier !== tier || !user.creditResetAt || periodEnd > user.creditResetAt)
        await tx.update(users).set({
          tier, subscriptionId: subscription.id, subscriptionStatus: subscription.status,
          cancelAtPeriodEnd: subscription.cancel_at_period_end, currentPeriodEnd: periodEnd,
          ...(tier === 'free' && user.tier !== 'free' ? { creditBalance: Math.min(user.creditBalance, TIER_MONTHLY_CREDITS.free) } : {}),
          ...(newCycle ? { creditBalance: TIER_MONTHLY_CREDITS[tier], creditsUsedThisCycle: 0, creditResetAt: periodEnd } : {}),
        }).where(eq(users.id, user.id))
      })
    }
  } catch (error) {
    console.error('[stripe/webhook] Event handling failed:', error)
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
  return NextResponse.json({ received: true })
}
