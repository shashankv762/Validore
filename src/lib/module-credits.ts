import { users, creditLedger } from '@/db/schema'
import { and, eq, gt, sql } from 'drizzle-orm'
import type { CreditTransaction } from '@/lib/credits'

/** Pack credits pay for one module run, with no additional universal credit debit. */
export async function consumeModulePack(tx: CreditTransaction, userId: string, type: 'crowdfundingCredits' | 'pitchDeckCredits', ideaId: string) {
  const [updated] = await tx.update(users).set({ [type]: sql`${users[type]} - 1` })
    .where(and(eq(users.id, userId), gt(users[type], 0))).returning({ id: users.id })
  if (!updated) return false
  await tx.insert(creditLedger).values({ userId, amount: -1,
    transactionType: type === 'crowdfundingCredits' ? 'CROWDFUNDING_PACK' : 'PITCH_DECK_PACK', description: 'Idea: ' + ideaId })
  return true
}
