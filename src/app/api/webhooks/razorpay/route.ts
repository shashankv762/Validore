import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { db } from '@/db';
import { users, creditPurchases } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function POST(req: Request) {
  const body = await req.text();
  const signature = req.headers.get('x-razorpay-signature');
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET!;

  if (!signature) {
    return new NextResponse('Missing signature', { status: 400 });
  }

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('hex');

  if (expectedSignature !== signature) {
    return new NextResponse('Invalid signature', { status: 400 });
  }

  const event = JSON.parse(body);

  try {
    if (event.event === 'payment.captured') {
      const payment = event.payload.payment.entity;
      const notes = payment.notes;
      
      if (notes?.userId && notes?.creditType) {
        const userId = notes.userId;
        const creditType = notes.creditType;
        const quantity = parseInt(notes.quantity || '1', 10);

        await db.insert(creditPurchases).values({
          userId,
          creditType,
          quantity,
          amountUsd: payment.amount ? payment.amount / 100 : 0, // assuming amounts in cents/paise appropriately converted or stored
          razorpayOrderId: payment.order_id,
          status: 'completed'
        });

        const userRecord = await db.query.users.findFirst({ where: eq(users.id, userId) });
        if (userRecord) {
          if (creditType === 'crowdfunding') {
            await db.update(users).set({ crowdfundingCredits: userRecord.crowdfundingCredits + quantity }).where(eq(users.id, userId));
          } else if (creditType === 'pitch_deck') {
            await db.update(users).set({ pitchDeckCredits: userRecord.pitchDeckCredits + quantity }).where(eq(users.id, userId));
          }
        }
      }
    }
  } catch (error) {
    console.error('Error handling Razorpay webhook', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }

  return NextResponse.json({ received: true });
}