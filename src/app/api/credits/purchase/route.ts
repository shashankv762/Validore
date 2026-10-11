import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import Stripe from 'stripe'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/db'
import { users, creditPurchases } from '@/db/schema'
import { eq, desc } from 'drizzle-orm'

export const CREDIT_PACKAGES = {
  crowdfunding: {
    name: 'Crowdfunding Analysis Pack',
    description: '1 Comprehensive Campaign Feasibility Analysis & Synthetic Benchmark Credit',
    amountUsd: 49,
    amountInr: 3999,
    credits: { crowdfunding: 1, pitchDeck: 0 },
  },
  pitch_deck: {
    name: 'Pitch Deck Generator Pack',
    description: '1 Institutional 12-Slide Investor Pitch Deck Credit with PPTX Export',
    amountUsd: 49,
    amountInr: 3999,
    credits: { crowdfunding: 0, pitchDeck: 1 },
  },
  bundle: {
    name: 'Founder Bundle',
    description: '1 Crowdfunding Credit + 1 Pitch Deck Credit (Best Value Kit)',
    amountUsd: 79,
    amountInr: 5999,
    credits: { crowdfunding: 1, pitchDeck: 1 },
  },
  credit_topup: {
    name: 'Credit Top-Up Pack',
    description: '2,000 Universal AI Credits (Never Expire)',
    amountUsd: 49,
    amountInr: 3999,
    credits: { crowdfunding: 0, pitchDeck: 0, universalCredits: 2000 },
  },
} as const

export type CreditPackageType = keyof typeof CREDIT_PACKAGES

const PurchaseSchema = z.object({
  creditType: z.enum(['crowdfunding', 'pitch_deck', 'bundle', 'credit_topup']),
  quantity: z.number().int().positive().default(1),
  provider: z.enum(['stripe', 'razorpay']).default('stripe'),
})

function isStripeConfigured(key?: string): boolean {
  if (!key) return false
  const trimmed = key.trim()
  if (
    trimmed === '' ||
    trimmed === 'your_stripe_secret' ||
    trimmed.startsWith('invalid')
  ) {
    return false
  }
  return trimmed.startsWith('sk_') || trimmed.startsWith('rk_')
}

/**
 * GET /api/credits/purchase
 * Returns the current authenticated user's credit balances and purchase history.
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let dbUser = await db.query.users.findFirst({
      where: eq(users.supabaseId, user.id),
    })

    // Auto-upsert free-tier user if not yet in database
    if (!dbUser && user.email) {
      const [created] = await db
        .insert(users)
        .values({
          supabaseId: user.id,
          email: user.email,
          tier: 'free',
        })
        .returning()
      dbUser = created
    }

    if (!dbUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const purchases = await db
      .select()
      .from(creditPurchases)
      .where(eq(creditPurchases.userId, dbUser.id))
      .orderBy(desc(creditPurchases.createdAt))

    return NextResponse.json({
      user: {
        id: dbUser.id,
        email: dbUser.email,
        tier: dbUser.tier,
        crowdfundingCredits: dbUser.crowdfundingCredits,
        pitchDeckCredits: dbUser.pitchDeckCredits,
        validationsThisMonth: dbUser.validationsThisMonth,
        isFoundingMember: dbUser.isFoundingMember,
      },
      packages: CREDIT_PACKAGES,
      purchases,
    })
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Internal Server Error'
    console.error('Error fetching credit history:', errorMessage)
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}

/**
 * POST /api/credits/purchase
 * Creates a Stripe checkout session for purchasing modular credits,
 * or returns a structured error if the payment provider is unconfigured.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let dbUser = await db.query.users.findFirst({
      where: eq(users.supabaseId, user.id),
    })

    // Auto-upsert free-tier user if not yet in database
    if (!dbUser && user.email) {
      const [created] = await db
        .insert(users)
        .values({
          supabaseId: user.id,
          email: user.email,
          tier: 'free',
        })
        .returning()
      dbUser = created
    }

    if (!dbUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON body' },
        { status: 400 }
      )
    }

    const parsed = PurchaseSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Invalid purchase payload',
          details: parsed.error.issues,
        },
        { status: 400 }
      )
    }

    const { creditType, quantity, provider } = parsed.data
    const selectedPackage = CREDIT_PACKAGES[creditType]

    if (provider === 'razorpay') {
      const rzpKeyId = process.env.RAZORPAY_KEY_ID
      const rzpKeySecret = process.env.RAZORPAY_KEY_SECRET

      if (
        !rzpKeyId ||
        !rzpKeySecret ||
        rzpKeyId === 'your_razorpay_key_id' ||
        rzpKeySecret === 'your_razorpay_key_secret'
      ) {
        return NextResponse.json(
          {
            error: 'Payment provider not configured or temporarily unavailable. Please contact support.',
            configured: false,
          },
          { status: 503 }
        )
      }

      // If Razorpay configured in future, handle order creation here
      return NextResponse.json(
        {
          error: 'Razorpay provider is currently undergoing maintenance. Please select Stripe.',
          configured: false,
        },
        { status: 503 }
      )
    }

    // Default provider: Stripe
    const stripeSecret = process.env.STRIPE_SECRET_KEY
    if (!isStripeConfigured(stripeSecret)) {
      return NextResponse.json(
        {
          error: 'Payment provider not configured or temporarily unavailable. Please contact support.',
          configured: false,
        },
        { status: 503 }
      )
    }

    try {
      const stripe = new Stripe(stripeSecret!, {
        apiVersion: '2023-10-16' as Stripe.LatestApiVersion,
      })

      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
      const successUrl = `${appUrl}/dashboard/credits?success=true&session_id={CHECKOUT_SESSION_ID}`
      const cancelUrl = `${appUrl}/dashboard/credits?canceled=true`

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        mode: 'payment',
        customer_email: user.email,
        client_reference_id: dbUser.id,
        metadata: {
          userId: dbUser.id,
          creditType,
          quantity: String(quantity),
        },
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: {
                name: selectedPackage.name,
                description: selectedPackage.description,
              },
              unit_amount: selectedPackage.amountUsd * 100, // in cents
            },
            quantity,
          },
        ],
        success_url: successUrl,
        cancel_url: cancelUrl,
      })

      if (!session.url) {
        return NextResponse.json(
          {
            error: 'Failed to generate checkout session URL from Stripe.',
            configured: true,
          },
          { status: 500 }
        )
      }

      return NextResponse.json({ url: session.url })
    } catch (stripeErr: unknown) {
      const message =
        stripeErr instanceof Error ? stripeErr.message : 'Unknown payment gateway error'
      console.error('Stripe API checkout error:', message)
      return NextResponse.json(
        {
          error: `Payment provider error: ${message}`,
          configured: false,
        },
        { status: 503 }
      )
    }
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Internal Server Error'
    console.error('Unhandled credit purchase error:', errorMessage)
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}