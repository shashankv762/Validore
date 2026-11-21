import { eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/db'
import { users, creditLedger } from '@/db/schema'
import { AdminReason, AdminRequestId, AdminOperationError, beginAdminRequest, recordAdminAction, type AdminActor } from './admin-requests'
import { creditCycleAllowance, getPlan, lockPlan, PLAN_TIERS } from './plan-catalog'

export const AdminPlanAssignmentSchema = z.strictObject({
  userIds: z.array(z.string().uuid()).min(1).max(100), tier: z.enum(PLAN_TIERS),
  reason: AdminReason, requestId: AdminRequestId,
}).refine(value => new Set(value.userIds).size === value.userIds.length, 'Select each user only once.')

/** A manual entitlement never starts checkout or creates a provider subscription.
 * Switching repeatedly in a cycle preserves consumption instead of refilling. */
export async function assignAdminPlan(actor: AdminActor, input: unknown) {
  const value = AdminPlanAssignmentSchema.parse(input)
  value.userIds.sort()
  return db.transaction(async tx => {
    const request = await beginAdminRequest(tx, actor, value.requestId, 'user.plan.assign', value)
    if (request.entries.length) return { duplicate: true, recipients: value.userIds.length, tier: value.tier, requestId: value.requestId }
    await lockPlan(tx, value.tier)
    const plan = await getPlan(value.tier, tx)
    const recipients = await tx.select().from(users).where(inArray(users.id, value.userIds)).orderBy(users.id).for('update')
    if (recipients.length !== value.userIds.length) throw new AdminOperationError('A selected user no longer exists. Refresh the user list.', 404)
    const now = new Date()
    for (const user of recipients) {
      if (user.isAdmin || user.id === actor.id) throw new AdminOperationError('The owner already has unlimited access. Select other accounts.')
      if (user.accountStatus === 'deactivated') throw new AdminOperationError('Reactivate deactivated accounts before assigning a plan.')
      if ((user.subscriptionId || user.subscriptionStatus) && !['canceled', 'cancelled', 'incomplete_expired', 'completed', 'expired', 'manual'].includes(user.subscriptionStatus ?? '')) {
        throw new AdminOperationError('This account has a payment subscription. Cancel it with the payment provider before assigning a manual plan.')
      }
      // Older paid rows can have an authoritative cycle end without a start.
      // Converting them to a manual plan must retain their recorded spending.
      const sameCycle = Boolean(user.creditResetAt && user.creditResetAt > now)
      // A first assignment to a regular Free account must give the paid
      // entitlement a full fresh cycle. Preserve consumption only when the
      // account already carries a paid or manually assigned entitlement.
      const preserveCycle = sameCycle && (user.tier !== 'free' || user.monthlyCreditsUsedThisCycle > 0)
      const cycleStartedAt = preserveCycle ? user.creditCycleStartedAt ??
        new Date(Math.min(now.getTime(), user.creditResetAt!.getTime() - 30 * 86_400_000)) : now
      const consumed = preserveCycle ? Math.max(user.monthlyCreditsUsedThisCycle, creditCycleAllowance(user) - user.creditBalance, 0) : 0
      const balance = Math.max(0, plan.monthlyCredits - consumed)
      const values = { tier: value.tier, subscriptionStatus: 'manual', subscriptionId: null, cancelAtPeriodEnd: false,
        currentPeriodEnd: null, creditBalance: balance, creditCycleAllowance: plan.monthlyCredits,
        monthlyCreditsUsedThisCycle: consumed,
        creditCycleStartedAt: cycleStartedAt,
        ...(!preserveCycle ? { creditResetAt: new Date(now.getTime() + 30 * 86_400_000), creditsUsedThisCycle: 0 } : {}),
        updatedAt: now }
      await tx.update(users).set(values).where(eq(users.id, user.id))
      await tx.insert(creditLedger).values({ userId: user.id, amount: balance - user.creditBalance,
        transactionType: 'ADMIN_PLAN_ASSIGNMENT', description: `Plan ${user.tier} → ${value.tier}: ${value.reason}` })
      await recordAdminAction(tx, actor, { requestId: value.requestId, requestHash: request.requestHash,
        action: 'user.plan.assign', targetUserId: user.id, targetEmail: user.email, reason: value.reason,
        details: { before: user.tier, after: value.tier, beforeBalance: user.creditBalance, afterBalance: balance,
          monthlyConsumed: consumed, allocation: plan.monthlyCredits, manual: true, duration: 'until_owner_changes', recipients: recipients.length } })
    }
    return { duplicate: false, recipients: recipients.length, tier: value.tier, requestId: value.requestId }
  })
}
