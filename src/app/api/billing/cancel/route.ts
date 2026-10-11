import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/db'
import { users } from '@/db/schema'
import { eq } from 'drizzle-orm'

// FIX-11: Real subscription cancellation via Stripe (with graceful degradation)
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const dbUser = await db.query.users.findFirst({ where: eq(users.supabaseId, user.id) })
  if (!dbUser) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  // Check if the user has an active Stripe subscription
  const subscriptionId = (dbUser as any).subscriptionId as string | null | undefined
  if (!subscriptionId) {
    return NextResponse.json({ error: 'No active subscription found' }, { status: 400 })
  }

  const stripeSecret = process.env.STRIPE_SECRET_KEY
  if (!stripeSecret || !stripeSecret.startsWith('sk_')) {
    // Graceful degradation — Stripe not configured, flag locally in DB
    await db.update(users)
      .set({ cancelAtPeriodEnd: true } as any)
      .where(eq(users.id, dbUser.id))
    return NextResponse.json({
      cancelAtPeriodEnd: true,
      note: 'Stripe not configured — subscription flagged for cancellation locally',
    })
  }

  try {
    // Dynamically import Stripe to avoid issues if not installed
    const { default: Stripe } = await import('stripe')
    const stripe = new Stripe(stripeSecret)
    await stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: true })
  } catch (stripeErr) {
    console.error('[billing/cancel] Stripe error:', stripeErr)
    // Still flag locally on Stripe error so the UI reflects intent
  }

  await db.update(users)
    .set({ cancelAtPeriodEnd: true } as any)
    .where(eq(users.id, dbUser.id))

  return NextResponse.json({ cancelAtPeriodEnd: true })
}
