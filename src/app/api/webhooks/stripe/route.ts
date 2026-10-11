import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { db } from '@/db';
import { users, creditPurchases } from '@/db/schema';
import { eq } from 'drizzle-orm';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '');

export async function POST(req: Request) {
  const body = await req.text();
  const signature = req.headers.get('stripe-signature');

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature!,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return new NextResponse(`Webhook Error: ${message}`, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        // Handle credit purchases
        if (session.metadata?.userId && session.metadata?.creditType) {
          const userId = session.metadata.userId;
          const creditType = session.metadata.creditType;
          const quantity = parseInt(session.metadata.quantity || '1', 10);
          
          await db.insert(creditPurchases).values({
            userId,
            creditType,
            quantity,
            amountUsd: session.amount_total ? session.amount_total / 100 : 0,
            stripePaymentIntentId: session.payment_intent as string,
            status: 'completed'
          });

          const userRecord = await db.query.users.findFirst({ where: eq(users.id, userId) });
          if (userRecord) {
            if (creditType === 'crowdfunding') {
              await db.update(users).set({ crowdfundingCredits: userRecord.crowdfundingCredits + quantity }).where(eq(users.id, userId));
            } else if (creditType === 'pitch_deck') {
              await db.update(users).set({ pitchDeckCredits: userRecord.pitchDeckCredits + quantity }).where(eq(users.id, userId));
            } else if (creditType === 'credit_topup') {
              const { addPurchasedCredits } = await import('@/lib/credits');
              await addPurchasedCredits(userId, 2000 * quantity);
            } else if (creditType === 'bundle') {
              await db.update(users).set({
                crowdfundingCredits: userRecord.crowdfundingCredits + quantity,
                pitchDeckCredits: userRecord.pitchDeckCredits + quantity,
              }).where(eq(users.id, userId));
            }
          }
        }
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        // Map price to tier
        let tier: 'free' | 'premium' | 'max_premium' = 'free';
        const priceId = subscription.items.data[0].price.id;
        if (priceId === process.env.STRIPE_PREMIUM_PRICE_ID) tier = 'premium';
        if (priceId === process.env.STRIPE_MAX_PREMIUM_PRICE_ID) tier = 'max_premium';

        await db.update(users).set({
          tier,
          subscriptionId: subscription.id,
          subscriptionStatus: subscription.status,
          cancelAtPeriodEnd: subscription.cancel_at_period_end,
          currentPeriodEnd: new Date((subscription as unknown as { current_period_end: number }).current_period_end * 1000),
        }).where(eq(users.stripeCustomerId, subscription.customer as string));

        if (tier !== 'free') {
          const { topUpMonthlyCredits } = await import('@/lib/credits')
          const subUser = await db.query.users.findFirst({
            where: eq(users.stripeCustomerId, subscription.customer as string),
          })
          if (subUser) {
            await topUpMonthlyCredits(subUser.id, tier)
          }
        }
        break;
      }
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        await db.update(users).set({
          tier: 'free',
          subscriptionStatus: 'canceled',
          cancelAtPeriodEnd: false,
        }).where(eq(users.stripeCustomerId, subscription.customer as string));
        break;
      }
    }
  } catch (error) {
    console.error('Error handling webhook event', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }

  return NextResponse.json({ received: true });
}