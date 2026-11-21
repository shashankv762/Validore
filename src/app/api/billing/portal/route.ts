import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getOrCreateDbUser } from '@/lib/auth-sync'
import { validAuthOrigin } from '@/lib/auth-form'
import { createBillingPortal, BillingPortalError } from '@/lib/billing'
export async function POST(request: NextRequest) {
  try {
    if (!validAuthOrigin(request)) return NextResponse.json({ error: 'Invalid request origin' }, { status: 403 })
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const profile = await getOrCreateDbUser(user)
    if (!profile) return NextResponse.json({ error: 'Account not found.' }, { status: 404 })
    return NextResponse.json({ url: await createBillingPortal(profile.id) })
  } catch (error) {
    if (error instanceof BillingPortalError) return NextResponse.json({ error: error.message }, { status: error.status })
    return NextResponse.json({ error: 'Billing portal is temporarily unavailable. Please try again later.' }, { status: 503 })
  }
}
