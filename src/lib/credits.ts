import { db } from '@/db'
import { users, creditLedger } from '@/db/schema'
import { eq, sql } from 'drizzle-orm'
import { TIER_MONTHLY_CREDITS } from './credit-costs'

export async function checkCredits(userId: string, cost: number): Promise<{ allowed: boolean; balance: number }> {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: {
      creditBalance: true,
      purchasedCredits: true,
    }
  })
  
  if (!user) return { allowed: false, balance: 0 }
  
  const balance = user.creditBalance + user.purchasedCredits
  return {
    allowed: balance >= cost,
    balance
  }
}

export async function deductCredits(userId: string, cost: number, action: string, entityId?: string): Promise<boolean> {
  const { allowed, balance: initialBalance } = await checkCredits(userId, cost)
  if (!allowed) return false

  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  })
  if (!user) return false

  const deductionFromBalance = Math.min(user.creditBalance, cost)
  const deductionFromPurchased = cost - deductionFromBalance

  await db.transaction(async (tx) => {
    await tx.update(users)
      .set({
        creditBalance: sql`${users.creditBalance} - ${deductionFromBalance}`,
        purchasedCredits: sql`${users.purchasedCredits} - ${deductionFromPurchased}`,
        creditsUsedThisCycle: sql`${users.creditsUsedThisCycle} + ${cost}`
      })
      .where(eq(users.id, userId))
      
    await tx.insert(creditLedger).values({
      userId,
      amount: -cost,
      transactionType: action,
      description: `Source: usage, Entity: ${entityId || 'none'}`
    })
  })

  return true
}

export async function topUpMonthlyCredits(userId: string, tier: 'free' | 'premium' | 'max_premium'): Promise<void> {
  const amount = TIER_MONTHLY_CREDITS[tier]
  
  await db.update(users)
    .set({
      creditBalance: amount,
      creditsUsedThisCycle: 0,
      creditResetAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    })
    .where(eq(users.id, userId))
}

export async function addPurchasedCredits(userId: string, amount: number): Promise<void> {
  const { balance: initialBalance } = await checkCredits(userId, 0)
  
  await db.transaction(async (tx) => {
    await tx.update(users)
      .set({
        purchasedCredits: sql`${users.purchasedCredits} + ${amount}`
      })
      .where(eq(users.id, userId))
      
    await tx.insert(creditLedger).values({
      userId,
      amount,
      transactionType: 'PURCHASED_TOPUP',
      description: 'Source: purchase'
    })
  })
}
