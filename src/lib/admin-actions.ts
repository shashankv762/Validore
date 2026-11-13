import { and, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/db'
import { adminAuditLog, creditLedger, users, validationJobs } from '@/db/schema'
import { isOwnerAccount } from './admin-access'
import { AdminOperationError, AdminReason, AdminRequestId, beginAdminRequest, recordAdminAction, type AdminActor } from './admin-requests'
import { getAdminUserDetail } from './admin-data'
import { failValidationJob } from './validation/jobs'

export const AdminGrantSchema = z.strictObject({
  userIds: z.array(z.string().uuid()).min(1, 'Select at least one user.').max(100, 'Select up to 100 users at a time.'),
  type: z.enum(['general', 'crowdfunding', 'pitch_deck']), amount: z.number().int().min(1).max(10000000),
  reason: AdminReason, requestId: AdminRequestId,
}).refine(value => new Set(value.userIds).size === value.userIds.length, 'Select each user only once.')
export const AdminStatusSchema = z.strictObject({
  action: z.enum(['block', 'unblock', 'deactivate', 'reactivate']), reason: AdminReason, requestId: AdminRequestId,
})
const postgresIntegerMaximum = 2_147_483_647

export async function grantAdminCredits(actor: AdminActor, input: unknown) {
  const value = AdminGrantSchema.parse(input)
  value.userIds.sort()
  const result = await db.transaction(async tx => {
    const request = await beginAdminRequest(tx, actor, value.requestId, 'credits.grant', value)
    if (request.entries.length) return { duplicate: true, recipients: value.userIds.length, amount: value.amount, type: value.type }
    // Deterministic locks make a bulk grant atomic and avoid concurrent lost updates.
    const recipients = await tx.select().from(users).where(inArray(users.id, value.userIds)).orderBy(users.id).for('update')
    if (recipients.length !== value.userIds.length) throw new AdminOperationError('One of the selected users no longer exists. Refresh the user list.', 404, 'user_not_found')
    const field = value.type === 'general' ? 'purchasedCredits' : value.type === 'crowdfunding' ? 'crowdfundingCredits' : 'pitchDeckCredits'
    for (const user of recipients) {
      if (isOwnerAccount(user) || user.isAdmin) throw new AdminOperationError('The owner already has unlimited access. Select user accounts for this grant.')
      if (user.accountStatus === 'deactivated') throw new AdminOperationError('Reactivate deactivated users before granting credits.')
      if (user[field] > postgresIntegerMaximum - value.amount) throw new AdminOperationError('This grant would exceed the supported credit balance.')
      const before = user[field]
      await tx.update(users).set({ [field]: before + value.amount, updatedAt: new Date() }).where(eq(users.id, user.id))
      await tx.insert(creditLedger).values({ userId: user.id, amount: value.amount,
        transactionType: 'ADMIN_' + value.type.toUpperCase() + '_GRANT', description: 'Owner credit grant: ' + value.reason })
      await recordAdminAction(tx, actor, { requestId: value.requestId, requestHash: request.requestHash,
        action: 'credits.grant', targetUserId: user.id, targetEmail: user.email, reason: value.reason,
        details: { type: value.type, amount: value.amount, before, after: before + value.amount, recipients: recipients.length } })
    }
    return { duplicate: false, recipients: recipients.length, amount: value.amount, type: value.type }
  })
  return { ...result, requestId: value.requestId }
}

export async function cancelUserJobs(userId: string) {
  const jobs = await db.select({ id: validationJobs.id }).from(validationJobs)
    .where(and(eq(validationJobs.userId, userId), inArray(validationJobs.status, ['pending', 'running'])))
  // Status is committed first; jobs acquire job->user locks, matching completion/refund.
  for (const job of jobs) await failValidationJob(job.id)
}

export async function changeAdminAccountStatus(actor: AdminActor, userId: string, input: unknown) {
  z.string().uuid().parse(userId)
  const value = AdminStatusSchema.parse(input)
  const result = await db.transaction(async tx => {
    const request = await beginAdminRequest(tx, actor, value.requestId, 'user.' + value.action, { userId, ...value })
    if (request.entries.length) {
      const captured = z.array(z.string().uuid()).safeParse(request.entries[0].details.validationJobIds)
      return { duplicate: true, jobIds: captured.success ? captured.data : [] }
    }
    const [user] = await tx.select().from(users).where(eq(users.id, userId)).for('update')
    if (!user) throw new AdminOperationError('This user no longer exists.', 404, 'user_not_found')
    if (user.isAdmin || user.id === actor.id) throw new AdminOperationError('The owner account cannot be blocked, deactivated, or deleted.')
    const deletes = await tx.select().from(adminAuditLog).where(and(eq(adminAuditLog.targetUserId, userId), eq(adminAuditLog.action, 'user.delete')))
    if (deletes.some(entry => entry.details.state === 'pending')) throw new AdminOperationError('Permanent deletion is in progress. Retry the deletion before changing this account.')
    const desired = value.action === 'block' ? 'blocked' : value.action === 'deactivate' ? 'deactivated' : 'active'
    const expected = value.action === 'unblock' ? 'blocked' : value.action === 'reactivate' ? 'deactivated' : value.action === 'block' ? 'active' : null
    if (user.accountStatus === desired || (expected && user.accountStatus !== expected)) {
      throw new AdminOperationError('The account status changed. Refresh the user before trying again.')
    }
    // Capture only work owned by this action. Read without job locks while the
    // user is locked; cancellation later follows the established job->user order.
    const activeJobs = value.action === 'block' || value.action === 'deactivate'
      ? await tx.select({ id: validationJobs.id }).from(validationJobs)
        .where(and(eq(validationJobs.userId, userId), inArray(validationJobs.status, ['pending', 'running'])))
      : []
    const jobIds = activeJobs.map(job => job.id)
    await tx.update(users).set({ accountStatus: desired, statusReason: value.reason, statusChangedAt: new Date(), updatedAt: new Date() })
      .where(eq(users.id, userId))
    await recordAdminAction(tx, actor, { requestId: value.requestId, requestHash: request.requestHash,
      action: 'user.' + value.action, targetUserId: user.id, targetEmail: user.email, reason: value.reason,
      details: { before: user.accountStatus, after: desired, validationJobIds: jobIds } })
    return { duplicate: false, jobIds }
  })
  for (const jobId of result.jobIds) await failValidationJob(jobId)
  return { duplicate: result.duplicate, requestId: value.requestId, user: (await getAdminUserDetail(actor, userId)).user }
}
