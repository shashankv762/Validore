import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/db'
import { users } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { validAuthOrigin } from '@/lib/auth-form'

export async function POST(request: NextRequest) {
  if (!validAuthOrigin(request)) return NextResponse.json({ error: 'Invalid request origin' }, { status: 403 })
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const dbUser = await db.query.users.findFirst({ where: eq(users.supabaseId, user.id) })
  if (!dbUser) return NextResponse.json({ error: 'User not found' }, { status: 404 })
  if (!dbUser.subscriptionId) return NextResponse.json({ error: 'No active subscription found' }, { status: 400 })
  const secret = process.env.STRIPE_SECRET_KEY
  if (!secret || !dbUser.subscriptionId.startsWith('sub_') || !dbUser.stripeCustomerId) {
    return NextResponse.json({ error: 'Subscription cancellation is unavailable. Contact support.' }, { status: 503 })
  }
  try {
    const stripe = new Stripe(secret)
    const subscription = await stripe.subscriptions.retrieve(dbUser.subscriptionId)
    const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id
    if (customerId !== dbUser.stripeCustomerId) return NextResponse.json({ error: 'Subscription does not belong to this account' }, { status: 403 })
    await stripe.subscriptions.update(subscription.id, { cancel_at_period_end: true })
    await db.update(users).set({ cancelAtPeriodEnd: true }).where(eq(users.id, dbUser.id))
    return NextResponse.json({ cancelAtPeriodEnd: true })
  } catch (error) {
    console.error('[billing/cancel] Cancellation failed:', error)
    return NextResponse.json({ error: 'Unable to cancel subscription. Please try again or contact support.' }, { status: 503 })
  }
}
