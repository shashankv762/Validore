import { and, eq, gt, isNull, lt, or } from 'drizzle-orm'
import { db } from '@/db'
import { validationJobs } from '@/db/schema'
import { inngest } from '@/inngest/client'
import { databaseErrorCode } from '@/lib/database-errors'

/** The admitted pending job is the transactional outbox record. A send may
 * succeed even when its HTTP response is lost, so never refund on that ambiguity.
 * Event identity and the consumer's job settlement are both idempotent.
 */
export async function dispatchValidationJob(jobId: string): Promise<boolean> {
  if (process.env.VALIDATION_RUNNER !== 'inngest') return false
  const now = new Date()
  const leaseExpiresAt = new Date(now.getTime() + 60_000)
  let phase = 'lease'
  try {
    const [job] = await db.update(validationJobs).set({ dispatchLeaseExpiresAt: leaseExpiresAt }).where(and(
      eq(validationJobs.id, jobId), eq(validationJobs.status, 'pending'), isNull(validationJobs.dispatchedAt),
      or(isNull(validationJobs.dispatchLeaseExpiresAt), lt(validationJobs.dispatchLeaseExpiresAt, now)),
      gt(validationJobs.createdAt, new Date(now.getTime() - 60 * 60_000)),
    )).returning({ id: validationJobs.id, userId: validationJobs.userId })
    if (!job) return false
    phase = 'send'
    await inngest.send({ id: job.id, name: 'validore/validation.requested', data: { jobId: job.id, userId: job.userId } })
    // Fence an expired publisher against a newer reconciliation attempt.
    phase = 'acknowledge'
    await db.update(validationJobs).set({ dispatchedAt: new Date(), dispatchLeaseExpiresAt: null }).where(and(
      eq(validationJobs.id, job.id), eq(validationJobs.dispatchLeaseExpiresAt, leaseExpiresAt),
    ))
    return true
  } catch (error) {
    // Admission already committed. A transient lease or queue failure leaves
    // the pending job available for polling and reconciliation, without a new debit.
    console.warn('[validation/dispatch] Pending job retained for reconciliation', { phase, code: databaseErrorCode(error) })
    return false
  }
}

export async function reconcileValidationDispatches(): Promise<{ dispatched: number }> {
  if (process.env.VALIDATION_RUNNER !== 'inngest') return { dispatched: 0 }
  const now = new Date()
  const jobs = await db.query.validationJobs.findMany({ where: and(
    eq(validationJobs.status, 'pending'), isNull(validationJobs.dispatchedAt),
    or(isNull(validationJobs.dispatchLeaseExpiresAt), lt(validationJobs.dispatchLeaseExpiresAt, now)),
  ), columns: { id: true }, limit: 20 })
  let dispatched = 0
  for (const job of jobs) if (await dispatchValidationJob(job.id)) dispatched++
  return { dispatched }
}
