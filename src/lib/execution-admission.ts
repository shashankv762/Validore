import { and, eq, sql } from 'drizzle-orm'
import { db } from '@/db'
import { aiExecutionLeases } from '@/db/schema'
import type { CreditTransaction } from './credits'

export class ExecutionCapacityError extends Error {
  readonly status = 429
  readonly retryAfter = 30
  constructor() { super('Analysis capacity is currently in use. Retry shortly; no new analysis or charge was created.') }
}

/** One shared admission lock across validation and keyed planning requests.
 * It is held only through the short admission transaction, never model work.
 * Expired work is excluded; its own fencing/deadline still prevents publication.
 */
export async function assertExecutionCapacity(tx: CreditTransaction, options: { excludePlanningRequestId?: string } = {}) {
  const configured = process.env.AI_GLOBAL_ACTIVE_RUNS
  // Production/free-host default is one. Local development can run independent fixtures.
  if (!configured && process.env.NODE_ENV !== 'production') return
  const limit = Number(configured ?? 1)
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 10) throw new Error('AI_GLOBAL_ACTIVE_RUNS must be an integer from 1 to 10')
  await tx.execute(sql`select pg_advisory_xact_lock(782364091)`)
  await tx.execute(sql`delete from ai_execution_leases where expires_at <= now()`)
  const result = await tx.execute(sql`select (
    (select count(*) from validation_jobs where
      (status = 'running' and coalesce(updated_at, created_at) > now() - interval '15 minutes' and created_at > now() - interval '90 minutes') or
      (status = 'pending' and coalesce(updated_at, created_at) > now() - interval '60 minutes')) +
    (select count(*) from planning_module_requests where status = 'pending' and lease_expires_at > now()
      and (${options.excludePlanningRequestId ?? null}::uuid is null or id <> ${options.excludePlanningRequestId ?? null}::uuid)) +
    (select count(*) from ai_execution_leases where expires_at > now())
    )::integer as active`)
  const rows = 'rows' in result ? result.rows as Array<{ active: number }> : result
  const active = Number(rows[0]?.active)
  if (!Number.isSafeInteger(active) || active < 0) throw new Error('Unable to confirm analysis capacity')
  if (active >= limit) throw new ExecutionCapacityError()
}

/** Reserve a durable slot in the same transaction and under the same advisory
 * lock as validation/planning admission; every application instance sees it. */
export async function reserveExecutionLease(tx: CreditTransaction, userId: string, leaseKind: 'customer-feedback-analysis',
  expiresAt: Date) {
  if (!(expiresAt instanceof Date) || !Number.isFinite(expiresAt.getTime()) || expiresAt <= new Date()) throw new Error('Invalid analysis lease expiry')
  await assertExecutionCapacity(tx)
  const [lease] = await tx.insert(aiExecutionLeases).values({ userId, leaseKind, expiresAt }).returning({ id: aiExecutionLeases.id })
  if (!lease) throw new Error('Unable to reserve analysis capacity')
  return lease.id
}

export async function releaseExecutionLease(id: string, userId: string) {
  await db.delete(aiExecutionLeases).where(and(eq(aiExecutionLeases.id, id), eq(aiExecutionLeases.userId, userId)))
}
