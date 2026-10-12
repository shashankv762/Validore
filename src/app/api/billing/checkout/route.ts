import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getOrCreateDbUser } from '@/lib/auth-sync'
import { validAuthOrigin } from '@/lib/auth-form'
import { createSubscriptionCheckout } from '@/lib/billing'
const Input = z.object({ tier: z.enum(['premium', 'max_premium']) })
export async function POST(request: NextRequest) {
  try {
    if (!validAuthOrigin(request)) return NextResponse.json({ error: 'Invalid request origin' }, { status: 403 })
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const parsed = Input.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: 'Select a valid plan' }, { status: 400 })
    const profile = await getOrCreateDbUser(user)
    if (!profile) return NextResponse.json({ error: 'Billing account unavailable' }, { status: 409 })
    return NextResponse.json({ url: await createSubscriptionCheckout(profile.id, parsed.data.tier) })
  } catch {
    return NextResponse.json({ error: 'Billing is temporarily unavailable. Please try again later.' }, { status: 503 })
  }
}
