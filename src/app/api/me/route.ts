import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/db'
import { users } from '@/db/schema'
import { eq } from 'drizzle-orm'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const dbUser = await db.query.users.findFirst({ where: eq(users.supabaseId, user.id) })
  if (!dbUser) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  return NextResponse.json({
    user: {
      id: dbUser.id,
      email: dbUser.email,
      tier: dbUser.tier,
      isFoundingMember: dbUser.isFoundingMember,
      crowdfundingCredits: dbUser.crowdfundingCredits,
      pitchDeckCredits: dbUser.pitchDeckCredits,
      validationsThisMonth: dbUser.validationsThisMonth,
      currentPeriodEnd: dbUser.currentPeriodEnd,
      subscriptionStatus: dbUser.subscriptionStatus,
    },
  })
}
