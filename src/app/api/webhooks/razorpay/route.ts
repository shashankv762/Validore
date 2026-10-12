import { NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import { db } from '@/db'
import { users } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { PaymentMetadataSchema, fulfillCreditPurchase } from '@/lib/credit-fulfillment'
import { TIER_MONTHLY_CREDITS } from '@/lib/credit-costs'

const EventSchema = z.object({
  event: z.string(),
  payload: z.object({
    payment: z.object({ entity: z.object({
      order_id: z.string(), amount: z.number().int().nonnegative(), currency: z.string(),
      notes: z.record(z.string(), z.unknown()).optional(),
    }) }).optional(),
    subscription: z.object({ entity: z.object({
      id: z.string(), plan_id: z.string(), status: z.string(), current_end: z.number().optional(),
      notes: z.record(z.string(), z.unknown()).optional(),
    }) }).optional(),
  }),
})

export async function POST(req: Request) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET
  if (!secret) return NextResponse.json({ error: 'Webhook not configured' }, { status: 503 })
  const signature = req.headers.get('x-razorpay-signature')
  if (!signature || !/^[a-f0-9]{64}$/i.test(signature)) return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  const body = await req.text()
  const expected = createHmac('sha256', secret).update(body).digest()
  if (!timingSafeEqual(expected, Buffer.from(signature, 'hex'))) return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  let event: z.infer<typeof EventSchema>
  try { event = EventSchema.parse(JSON.parse(body)) }
  catch { return NextResponse.json({ error: 'Invalid webhook payload' }, { status: 400 }) }
  try {
    if (event.event === 'payment.captured' && event.payload.payment) {
      const payment = event.payload.payment.entity
      if (payment.notes?.creditType) {
        const metadata = PaymentMetadataSchema.parse({ ...payment.notes, quantity: payment.notes.quantity ?? '1' })
        await fulfillCreditPurchase({ ...metadata, provider: 'razorpay', paymentId: payment.order_id,
          amountMinor: payment.amount, currency: payment.currency })
      }
    } else if (event.event === 'subscription.activated' && event.payload.subscription) {
      const subscription = event.payload.subscription.entity
      const userId = z.string().uuid().parse(subscription.notes?.userId)
      let tier: 'free' | 'premium' | 'max_premium' = 'free'
      if (subscription.plan_id === process.env.RAZORPAY_PREMIUM_PLAN_ID) tier = 'premium'
      if (subscription.plan_id === process.env.RAZORPAY_MAX_PREMIUM_PLAN_ID) tier = 'max_premium'
      if (subscription.status !== 'active' || tier === 'free') return NextResponse.json({ received: true })
      const periodEnd = subscription.current_end ? new Date(subscription.current_end * 1000) : null
      await db.transaction(async (tx) => {
        const [user] = await tx.select().from(users).where(eq(users.id, userId)).for('update')
        if (!user) throw new Error('Subscription recipient not found')
        const newCycle = user.subscriptionId !== subscription.id || user.tier !== tier || (periodEnd && (!user.creditResetAt || periodEnd > user.creditResetAt))
        await tx.update(users).set({ tier, subscriptionId: subscription.id, subscriptionStatus: subscription.status, currentPeriodEnd: periodEnd,
          ...(newCycle ? { creditBalance: TIER_MONTHLY_CREDITS[tier], creditsUsedThisCycle: 0,
            creditResetAt: periodEnd ?? new Date(Date.now() + 30 * 86400000) } : {}),
        }).where(eq(users.id, userId))
      })
    }
  } catch (error) {
    console.error('[razorpay/webhook] Event handling failed:', error)
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
  return NextResponse.json({ received: true })
}
