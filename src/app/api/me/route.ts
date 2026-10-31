import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/db'
import { users } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { syncUserToDatabase } from '@/lib/auth-sync'
import { topUpMonthlyCredits } from '@/lib/credits'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const foundUser = await db.query.users.findFirst({ where: eq(users.supabaseId, user.id) })
  let dbUser = foundUser ?? (await syncUserToDatabase({ id: user.id, email: user.email }))
  if (!dbUser) return NextResponse.json({ error: 'User not found' }, { status: 404 })
  if (!dbUser.creditResetAt || dbUser.creditResetAt <= new Date()) {
    await topUpMonthlyCredits(dbUser.id)
    dbUser = (await db.query.users.findFirst({ where: eq(users.id, dbUser.id) })) ?? dbUser
  }

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
      cancelAtPeriodEnd: dbUser.cancelAtPeriodEnd,
      createdAt: dbUser.createdAt,
      emailVerified: Boolean(user.email_confirmed_at),
      creditBalance: dbUser.creditBalance,
      purchasedCredits: dbUser.purchasedCredits,
      creditsUsedThisCycle: dbUser.creditsUsedThisCycle,
      creditResetAt: dbUser.creditResetAt,
      preferredAiProvider: dbUser.preferredAiProvider,
      hasCustomApiKey: Boolean(dbUser.encryptedOpenrouterKey),
    },
  }, { headers: { 'Cache-Control': 'private, no-store' } })
}
