import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { db } from '@/db'
import { users } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { PaymentMetadataSchema, fulfillCreditPurchase } from '@/lib/credit-fulfillment'
import { reconcileStripeCredits } from '@/lib/subscription-credits'

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
      const customer = event.data.object.customer
      const customerId = typeof customer === 'string' ? customer : customer.id
      await db.transaction(async (tx) => {
        const [user] = await tx.select().from(users).where(eq(users.stripeCustomerId, customerId)).for('update')
        if (!user) return
        const subscription = await stripe.subscriptions.retrieve(event.data.object.id)
        await reconcileStripeCredits(tx, user, subscription)
      })
    }
  } catch (error) {
    console.error('[stripe/webhook] Event handling failed:', error)
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
  return NextResponse.json({ received: true })
}
