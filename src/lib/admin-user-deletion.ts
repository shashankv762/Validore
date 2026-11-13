import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/db'
import {
  adminAuditLog, creditLedger, creditPurchases, crowdfundingAnalyses, founderInterviews, ideas, leanCanvases,
  pitchDecks, pricingSimulations, rewardedAdSessions, userDevices, users, validationJobs, validationReports,
} from '@/db/schema'
import { cancelUserJobs } from './admin-actions'
import { AdminOperationError, AdminReason, AdminRequestId, beginAdminRequest, recordAdminAction, type AdminActor } from './admin-requests'
import { createAuthAdminClient } from './supabase/admin'
import { stripeBillingClient } from './stripe-client'

export const AdminDeleteSchema = z.strictObject({ email: z.string().trim().email().max(320), reason: AdminReason, requestId: AdminRequestId })

async function stopAccountBilling(user: typeof users.$inferSelect, requestId: string) {
  if (!user.stripeCustomerId && !user.subscriptionId) return
  if (!/^(sk|rk)_(test|live)_/.test(process.env.STRIPE_SECRET_KEY || '')) {
    if (!user.subscriptionId || ['canceled', 'incomplete_expired'].includes(user.subscriptionStatus ?? '')) return
    throw new AdminOperationError('Cancel this account’s subscription or configure billing before permanently deleting it.', 503, 'billing_admin_unavailable')
  }
  if (user.subscriptionId && !user.subscriptionId.startsWith('sub_')) {
    throw new AdminOperationError('Cancel this account’s legacy subscription before permanently deleting it.')
  }
  const stripe = stripeBillingClient()
  // Expire this app's open checkouts before cancelling its subscriptions.
  if (user.stripeCustomerId) {
    const sessions = await stripe.checkout.sessions.list({ customer: user.stripeCustomerId, status: 'open', limit: 100 })
    if (sessions.has_more) throw new AdminOperationError('This account has too many open checkouts. Close them in billing before deleting it.')
    for (const session of sessions.data) {
      if (session.client_reference_id === user.id || session.metadata?.userId === user.id) await stripe.checkout.sessions.expire(session.id)
    }
    let after: string | undefined
    for (let page = 0; page < 10; page++) {
      const subscriptions = await stripe.subscriptions.list({ customer: user.stripeCustomerId, status: 'all', limit: 100, ...(after ? { starting_after: after } : {}) })
      for (const subscription of subscriptions.data) {
        if (subscription.id !== user.subscriptionId && subscription.metadata.userId !== user.id) continue
        if (!['canceled', 'incomplete_expired'].includes(subscription.status)) {
          await stripe.subscriptions.cancel(subscription.id, { invoice_now: false, prorate: false },
            { idempotencyKey: 'validore-delete-' + requestId + '-' + subscription.id })
        }
      }
      if (!subscriptions.has_more) return
      after = subscriptions.data.at(-1)?.id
      if (!after) break
    }
    throw new AdminOperationError('This account has too much billing history. Cancel its subscription before deleting it.')
  }
  if (user.subscriptionId) {
    const subscription = await stripe.subscriptions.retrieve(user.subscriptionId)
    if (subscription.metadata.userId !== user.id) throw new AdminOperationError('This subscription could not be verified as belonging to the selected account.')
    if (!['canceled', 'incomplete_expired'].includes(subscription.status)) {
      await stripe.subscriptions.cancel(subscription.id, { invoice_now: false, prorate: false },
        { idempotencyKey: 'validore-delete-' + requestId + '-' + subscription.id })
    }
  }
}

/** Deactivation is required first. Failures retain that state and an auditable retry. */
export async function deleteAdminUser(actor: AdminActor, userId: string, input: unknown) {
  z.string().uuid().parse(userId)
  const value = AdminDeleteSchema.parse(input)
  value.email = value.email.toLowerCase()
  const payload = { userId, ...value }
  const prepared = await db.transaction(async tx => {
    const request = await beginAdminRequest(tx, actor, value.requestId, 'user.delete', payload)
    const previous = request.entries[0]
    if (previous?.details.state === 'complete') return { complete: true as const, auditId: previous.id, user: null }
    const [user] = await tx.select().from(users).where(eq(users.id, userId)).for('update')
    if (!user) throw new AdminOperationError('This user no longer exists.', 404, 'user_not_found')
    if (user.isAdmin || user.id === actor.id) throw new AdminOperationError('The owner account cannot be deleted.')
    if (user.email.trim().toLowerCase() !== value.email) throw new AdminOperationError('Type the selected user’s full email to confirm deletion.', 400, 'email_confirmation_mismatch')
    if (user.accountStatus !== 'deactivated') throw new AdminOperationError('Deactivate this user before permanently deleting the account.')
    const otherRequests = await tx.select().from(adminAuditLog)
      .where(and(eq(adminAuditLog.targetUserId, userId), eq(adminAuditLog.action, 'user.delete')))
    if (otherRequests.some(entry => entry.requestId !== value.requestId && entry.details.state === 'pending')) {
      throw new AdminOperationError('Deletion is already in progress. Retry it using the original request reference.', 409, 'deletion_in_progress')
    }
    const details = { state: 'pending', requestId: value.requestId, requestHash: request.requestHash }
    if (previous) {
      await tx.update(adminAuditLog).set({ details }).where(eq(adminAuditLog.id, previous.id))
      return { complete: false as const, auditId: previous.id, user }
    }
    const audit = await recordAdminAction(tx, actor, { requestId: value.requestId, requestHash: request.requestHash,
      action: 'user.delete', targetUserId: user.id, targetEmail: user.email, reason: value.reason, details })
    return { complete: false as const, auditId: audit.id, user }
  })
  if (prepared.complete) return { deleted: true, duplicate: true, requestId: value.requestId }
  try {
    const auth = createAuthAdminClient()
    await cancelUserJobs(userId)
    await stopAccountBilling(prepared.user, value.requestId)
    const result = await auth.auth.admin.deleteUser(prepared.user.supabaseId)
    if (result.error && result.error.status !== 404 && result.error.code !== 'user_not_found') {
      throw new AdminOperationError('Authentication could not delete this account. It remains deactivated; retry the deletion.', 503, 'identity_delete_failed')
    }
    await db.transaction(async tx => {
      const request = await beginAdminRequest(tx, actor, value.requestId, 'user.delete', payload)
      if (request.entries[0]?.details.state === 'complete') return
      const [user] = await tx.select().from(users).where(eq(users.id, userId)).for('update')
      if (user && (user.isAdmin || user.accountStatus !== 'deactivated')) throw new AdminOperationError('The account state changed during deletion.')
      // Child records have deliberate foreign keys rather than broad cascades.
      await tx.delete(validationReports).where(eq(validationReports.userId, userId))
      await tx.delete(founderInterviews).where(eq(founderInterviews.userId, userId))
      await tx.delete(leanCanvases).where(eq(leanCanvases.userId, userId))
      await tx.delete(crowdfundingAnalyses).where(eq(crowdfundingAnalyses.userId, userId))
      await tx.delete(pricingSimulations).where(eq(pricingSimulations.userId, userId))
      await tx.delete(pitchDecks).where(eq(pitchDecks.userId, userId))
      await tx.delete(validationJobs).where(eq(validationJobs.userId, userId))
      await tx.delete(ideas).where(eq(ideas.userId, userId))
      await tx.delete(creditPurchases).where(eq(creditPurchases.userId, userId))
      await tx.delete(creditLedger).where(eq(creditLedger.userId, userId))
      await tx.delete(rewardedAdSessions).where(eq(rewardedAdSessions.userId, userId))
      await tx.delete(userDevices).where(eq(userDevices.userId, userId))
      await tx.delete(users).where(eq(users.id, userId))
      await tx.update(adminAuditLog).set({ details: { state: 'complete', requestId: value.requestId, requestHash: request.requestHash } })
        .where(eq(adminAuditLog.id, prepared.auditId))
    })
    return { deleted: true, duplicate: false, requestId: value.requestId }
  } catch (error) {
    await db.transaction(async tx => {
      const request = await beginAdminRequest(tx, actor, value.requestId, 'user.delete', payload)
      if (request.entries[0]?.details.state !== 'complete') await tx.update(adminAuditLog)
        .set({ details: { state: 'failed', requestId: value.requestId, requestHash: request.requestHash,
          failure: error instanceof AdminOperationError ? error.code : 'delete_unavailable' } }).where(eq(adminAuditLog.id, prepared.auditId))
    })
    throw error
  }
}
