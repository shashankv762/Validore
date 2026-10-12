import { z } from 'zod'
import { db } from '@/db'
import { users, creditPurchases, creditLedger } from '@/db/schema'
import { eq, sql } from 'drizzle-orm'
import { CREDIT_PACKAGES } from './credit-packages'

export const PaymentMetadataSchema = z.object({
  userId: z.string().uuid(),
  creditType: z.enum(['crowdfunding', 'pitch_deck', 'bundle', 'credit_topup']),
  quantity: z.string().regex(/^[1-9][0-9]*$/).transform(Number).pipe(z.number().int().min(1).max(100)),
})

type Fulfillment = z.infer<typeof PaymentMetadataSchema> & {
  provider: 'stripe' | 'razorpay'
  paymentId: string
  amountMinor: number
  currency: string
}

export async function fulfillCreditPurchase(payment: Fulfillment): Promise<boolean> {
  const pack = CREDIT_PACKAGES[payment.creditType]
  const expectedCurrency = payment.provider === 'stripe' ? 'USD' : 'INR'
  const expectedAmount = (payment.provider === 'stripe' ? pack.amountUsd : pack.amountInr) * 100 * payment.quantity
  if (!payment.paymentId || payment.currency.toUpperCase() !== expectedCurrency || payment.amountMinor !== expectedAmount) {
    throw new Error('Payment amount or currency does not match the purchased package')
  }
  return db.transaction(async (tx) => {
    // A unique provider payment reference makes webhook retries a no-op.
    const [purchase] = await tx.insert(creditPurchases).values({
      userId: payment.userId,
      creditType: payment.creditType,
      quantity: payment.quantity,
      amountUsd: pack.amountUsd * payment.quantity,
      stripePaymentIntentId: payment.provider === 'stripe' ? payment.paymentId : null,
      razorpayOrderId: payment.provider === 'razorpay' ? payment.paymentId : null,
      status: 'completed',
    }).onConflictDoNothing().returning({ id: creditPurchases.id })
    if (!purchase) return false
    const universal = payment.creditType === 'credit_topup' ? 2000 * payment.quantity : 0
    const [recipient] = await tx.update(users).set({
      crowdfundingCredits: sql`${users.crowdfundingCredits} + ${pack.credits.crowdfunding * payment.quantity}`,
      pitchDeckCredits: sql`${users.pitchDeckCredits} + ${pack.credits.pitchDeck * payment.quantity}`,
      purchasedCredits: sql`${users.purchasedCredits} + ${universal}`,
    }).where(eq(users.id, payment.userId)).returning({ id: users.id })
    if (!recipient) throw new Error('Payment recipient not found')
    if (universal > 0) await tx.insert(creditLedger).values({
      userId: payment.userId, amount: universal, transactionType: 'PURCHASED_TOPUP',
      description: 'Payment: ' + payment.provider + '/' + payment.paymentId,
    })
    return true
  })
}
