import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getOrCreateDbUser } from '@/lib/auth-sync'
import { validAuthOrigin } from '@/lib/auth-form'
import { stripeBillingClient, billingOrigin } from '@/lib/billing'
export async function POST(request: NextRequest) {
  try {
    if (!validAuthOrigin(request)) return NextResponse.json({ error: 'Invalid request origin' }, { status: 403 })
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const profile = await getOrCreateDbUser(user)
    if (!profile?.stripeCustomerId) return NextResponse.json({ error: 'No Stripe billing account is connected yet. Select a plan to begin.' }, { status: 409 })
    const session = await stripeBillingClient().billingPortal.sessions.create({ customer: profile.stripeCustomerId, return_url: billingOrigin() + '/dashboard/settings' })
    return NextResponse.json({ url: session.url })
  } catch {
    return NextResponse.json({ error: 'Billing portal is temporarily unavailable. Please try again later.' }, { status: 503 })
  }
}
