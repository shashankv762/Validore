import { createHash } from 'node:crypto'
import { and, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/db'
import { adminAuditLog, users } from '@/db/schema'
import { AdminAccessError, isOwnerAccount } from './admin-access'

export type AdminActor = Pick<typeof users.$inferSelect, 'id' | 'email' | 'supabaseId' | 'isAdmin' | 'accountStatus'>
export type AdminTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0]
export const AdminReason = z.string().trim().min(3, 'Enter a reason with at least three characters.').max(1000)
export const AdminRequestId = z.string().uuid()

export class AdminOperationError extends Error {
  constructor(message: string, readonly status = 409, readonly code = 'admin_operation_conflict') { super(message) }
}

/** Recheck the stored owner at the data boundary, including direct service callers. */
export async function assertAdminActor(actor: AdminActor, executor: Pick<typeof db, 'select'> = db) {
  if (!actor || !isOwnerAccount(actor)) throw new AdminAccessError('This page is unavailable.', 404, 'not_found')
  const [current] = await executor.select({ id: users.id, supabaseId: users.supabaseId, isAdmin: users.isAdmin, accountStatus: users.accountStatus })
    .from(users).where(and(eq(users.id, actor.id), eq(users.supabaseId, actor.supabaseId))).limit(1)
  if (!current || !isOwnerAccount(current)) throw new AdminAccessError('This page is unavailable.', 404, 'not_found')
}

/** A request lock and payload digest prevent duplicate grants after uncertain network results. */
export async function beginAdminRequest(tx: AdminTransaction, actor: AdminActor, requestId: string, action: string, payload: unknown) {
  AdminRequestId.parse(requestId)
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${ 'validore-admin-' + requestId }))`)
  await assertAdminActor(actor, tx)
  const requestHash = createHash('sha256').update(JSON.stringify({ actorId: actor.id, action, payload })).digest('hex')
  const entries = await tx.select().from(adminAuditLog).where(eq(adminAuditLog.requestId, requestId))
  if (entries.some(entry => entry.actorId !== actor.id || entry.action !== action || entry.details.requestHash !== requestHash)) {
    throw new AdminOperationError('This request reference was already used for a different action. Refresh and try again.', 409, 'request_id_conflict')
  }
  return { requestHash, entries }
}

export async function recordAdminAction(tx: AdminTransaction, actor: AdminActor, input: {
  requestId: string; requestHash: string; action: string; reason: string
  targetUserId?: string; targetEmail?: string; details?: Record<string, unknown>
}) {
  const [entry] = await tx.insert(adminAuditLog).values({
    requestId: input.requestId, actorId: actor.id, actorEmail: actor.email, action: input.action,
    targetUserId: input.targetUserId ?? null, targetEmail: input.targetEmail ?? null,
    reason: input.reason, details: { ...input.details, requestHash: input.requestHash },
  }).returning()
  return entry
}

export function adminDate(value: Date | string | null | undefined): string | null {
  return value ? new Date(value).toISOString() : null
}
