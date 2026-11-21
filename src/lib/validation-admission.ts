import { and, eq, inArray } from 'drizzle-orm'
import { db } from '@/db'
import { ideas, users, validationJobs } from '@/db/schema'
import { effectiveTier, isActiveAccount, isOwnerAccount } from './admin-access'
import { FULL_AGENT_COUNT, LITE_AGENT_COUNT } from './ai/roles'
import { CREDIT_COSTS } from './credit-costs'
import { canFundExtraLite, totalCredits } from './credit-allocation'
import { applyDueCycleReset, deductLockedCredits, resetValidationWindow } from './credits'
import { getPlan } from './plan-catalog'
import type { ValidationEntitlementSnapshot } from './validation-entitlement'
import { assertExecutionCapacity, ExecutionCapacityError } from './execution-admission'

export class ValidationAdmissionError extends Error {
  constructor(message: string, readonly status: number) { super(message) }
}

/** Account → idea → job is shared with planning and account administration.
 * Current entitlement, UTC allowance, debit and accepted job commit together. */
export async function admitValidation(input: { userId: string; supabaseId: string; ideaId: string; emailVerified: boolean;
  reserveConcurrency?: (limit: number) => Promise<boolean> }) {
  return db.transaction(async tx => {
    const [locked] = await tx.select().from(users)
      .where(and(eq(users.id, input.userId), eq(users.supabaseId, input.supabaseId))).for('update')
    if (!locked || !isActiveAccount(locked)) throw new ValidationAdmissionError('This account is not active.', 403)
    const [idea] = await tx.select().from(ideas)
      .where(and(eq(ideas.id, input.ideaId), eq(ideas.userId, locked.id))).for('update')
    if (!idea || !idea.isActive || idea.isReadOnly) throw new ValidationAdmissionError('Idea not found or read-only.', 404)
    const [running] = await tx.select().from(validationJobs).where(and(eq(validationJobs.ideaId, idea.id),
      eq(validationJobs.userId, locked.id), inArray(validationJobs.status, ['pending', 'running']))).limit(1)
    if (running) return { job: running, reused: true }

    const now = new Date()
    const owner = isOwnerAccount(locked)
    const account = owner ? locked : await resetValidationWindow(tx, await applyDueCycleReset(tx, locked, now), now)
    const tier = effectiveTier(account)
    const isLite = tier === 'free'
    if (isLite && account.validationsThisMonth === 0 && !input.emailVerified) {
      throw new ValidationAdmissionError('Please verify your email address before running your first validation.', 403)
    }
    const plan = await getPlan(account.tier, tx)
    const cost = isLite ? CREDIT_COSTS.LITE_VALIDATION : CREDIT_COSTS.DEEP_VALIDATION
    if (!owner && account.validationsThisMonth >= plan.monthlyValidationLimit && (!isLite || !canFundExtraLite(account))) {
      throw new ValidationAdmissionError('Monthly validation limit reached.', 429)
    }
    if (!owner && totalCredits(account) < cost) throw new ValidationAdmissionError('Insufficient credits.', 402)
    try { await assertExecutionCapacity(tx) }
    catch (error) { if (error instanceof ExecutionCapacityError) throw new ValidationAdmissionError(error.message, error.status); throw error }
    const safetyCap = { free: 1, premium: 2, max_premium: 3 }[tier]
    const concurrencyLimit = owner ? safetyCap : Math.min(plan.maxConcurrentRequests, safetyCap)
    if (input.reserveConcurrency && !await input.reserveConcurrency(concurrencyLimit)) {
      throw new ValidationAdmissionError('Too many concurrent requests. Wait for your current analysis to complete.', 429)
    }
    const entitlementSnapshot: ValidationEntitlementSnapshot = { version: 1, tier, ownerUnlimited: owner,
      maxTokensPerCall: plan.maxTokensPerCall, maxConcurrentRequests: plan.maxConcurrentRequests,
      monthlyValidationLimit: plan.monthlyValidationLimit, creditCost: owner ? 0 : cost,
      admittedAt: now.toISOString(), validationWindowEndsAt: account.validationResetAt?.toISOString() ?? null }
    const [job] = await tx.insert(validationJobs).values({ ideaId: idea.id, userId: account.id, isLite,
      status: 'pending', totalSections: isLite ? LITE_AGENT_COUNT : FULL_AGENT_COUNT, completedSections: 0, entitlementSnapshot }).returning()
    if (!await deductLockedCredits(tx, account, cost, 'VALIDATION', job.id, plan.monthlyValidationLimit, now)) {
      throw new ValidationAdmissionError('Credits or monthly allowance changed. Refresh and try again.', 409)
    }
    return { job, reused: false }
  })
}
