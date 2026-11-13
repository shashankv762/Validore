import { and, count, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/db'
import { adminAuditLog, creditLedger, ideas, userDevices, users, validationJobs, validationReports } from '@/db/schema'
import type { AdminAuditEntry, AdminAuditResponse, AdminOverview, AdminUser, AdminUserDetail, AdminUsersResponse } from './admin-types'
import { adminDate, assertAdminActor, type AdminActor, AdminOperationError } from './admin-requests'

const pageSchema = z.coerce.number().int().min(1).max(100000).default(1)
const pageSize = 25
const userFields = {
  id: users.id, email: users.email, tier: users.tier, accountStatus: users.accountStatus, isAdmin: users.isAdmin,
  statusReason: users.statusReason, statusChangedAt: users.statusChangedAt, subscriptionStatus: users.subscriptionStatus,
  createdAt: users.createdAt, creditBalance: users.creditBalance, purchasedCredits: users.purchasedCredits,
  rewardCredits: users.rewardCredits, crowdfundingCredits: users.crowdfundingCredits, pitchDeckCredits: users.pitchDeckCredits,
  lastActiveAt: sql<string | null>`(select max(${userDevices.lastActive}) from ${userDevices} where ${userDevices.userId} = ${users.id})`,
}

type UserRow = Omit<AdminUser, 'createdAt' | 'statusChangedAt' | 'lastActiveAt' | 'accountStatus'> & {
  createdAt: Date | null; statusChangedAt: Date | null; lastActiveAt: string | null; accountStatus: string
}
function userDto(row: UserRow): AdminUser {
  return { ...row, accountStatus: row.accountStatus as AdminUser['accountStatus'], createdAt: adminDate(row.createdAt),
    statusChangedAt: adminDate(row.statusChangedAt), lastActiveAt: adminDate(row.lastActiveAt) }
}
function auditDto(row: typeof adminAuditLog.$inferSelect): AdminAuditEntry {
  const { requestHash: _hash, ...details } = row.details
  void _hash
  return { id: row.id, action: row.action, actorEmail: row.actorEmail, targetEmail: row.targetEmail,
    reason: row.reason, createdAt: row.createdAt.toISOString(), details }
}
function pageMeta(total: number, page: number) { return { total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) } }

export async function getAdminOverview(actor: AdminActor): Promise<AdminOverview> {
  await assertAdminActor(actor)
  const [accountCounts, ideaCount, reportCount, activeCount, failedCount, grantTotal, recent] = await Promise.all([
    db.select({ total: count(), active: sql<number>`count(*) filter (where ${users.accountStatus} = 'active')::int`,
      blocked: sql<number>`count(*) filter (where ${users.accountStatus} = 'blocked')::int`,
      deactivated: sql<number>`count(*) filter (where ${users.accountStatus} = 'deactivated')::int`,
      newThisWeek: sql<number>`count(*) filter (where ${users.createdAt} >= ${new Date(Date.now() - 7 * 86_400_000)})::int` }).from(users),
    db.select({ total: count() }).from(ideas), db.select({ total: count() }).from(validationReports),
    db.select({ total: count() }).from(validationJobs).where(inArray(validationJobs.status, ['pending', 'running'])),
    db.select({ total: count() }).from(validationJobs).where(eq(validationJobs.status, 'failed')),
    db.select({ total: sql<number>`coalesce(sum((${adminAuditLog.details}->>'amount')::bigint), 0)::bigint` }).from(adminAuditLog)
      .where(eq(adminAuditLog.action, 'credits.grant')),
    db.select().from(adminAuditLog).orderBy(desc(adminAuditLog.createdAt), desc(adminAuditLog.id)).limit(8),
  ])
  return { updatedAt: new Date().toISOString(),
    users: { total: Number(accountCounts[0].total), active: Number(accountCounts[0].active), blocked: Number(accountCounts[0].blocked),
      deactivated: Number(accountCounts[0].deactivated), newThisWeek: Number(accountCounts[0].newThisWeek) },
    activity: { ideas: ideaCount[0].total, reports: reportCount[0].total, activeJobs: activeCount[0].total,
      failedJobs: failedCount[0].total, creditsGranted: Number(grantTotal[0].total) }, recentActivity: recent.map(auditDto) }
}

export async function getAdminUsers(actor: AdminActor, input: { q?: unknown; status?: unknown; page?: unknown }): Promise<AdminUsersResponse> {
  await assertAdminActor(actor)
  const q = z.string().trim().max(320).default('').parse(input.q)
  const status = z.enum(['all', 'active', 'blocked', 'deactivated']).default('all').parse(input.status)
  const page = pageSchema.parse(input.page)
  const literal = q.replace(/[\\%_]/g, character => '\\' + character)
  const search = q ? or(ilike(users.email, '%' + literal + '%'), z.string().uuid().safeParse(q).success ? eq(users.id, q) : undefined) : undefined
  const where = and(search, status !== 'all' ? eq(users.accountStatus, status) : undefined)
  const [rows, totals] = await Promise.all([
    db.select(userFields).from(users).where(where).orderBy(desc(users.createdAt), users.id).limit(pageSize).offset((page - 1) * pageSize),
    db.select({ total: count() }).from(users).where(where),
  ])
  return { users: rows.map(userDto), ...pageMeta(totals[0].total, page) }
}

export async function getAdminUserDetail(actor: AdminActor, id: string): Promise<AdminUserDetail> {
  await assertAdminActor(actor)
  z.string().uuid().parse(id)
  const [user] = await db.select(userFields).from(users).where(eq(users.id, id)).limit(1)
  if (!user) throw new AdminOperationError('This user no longer exists.', 404, 'user_not_found')
  const [ideaCount, reportCount, validationCount, credits, audit] = await Promise.all([
    db.select({ total: count() }).from(ideas).where(eq(ideas.userId, id)),
    db.select({ total: count() }).from(validationReports).where(eq(validationReports.userId, id)),
    db.select({ total: count() }).from(validationJobs).where(eq(validationJobs.userId, id)),
    db.select().from(creditLedger).where(eq(creditLedger.userId, id)).orderBy(desc(creditLedger.createdAt), desc(creditLedger.id)).limit(20),
    db.select().from(adminAuditLog).where(eq(adminAuditLog.targetUserId, id)).orderBy(desc(adminAuditLog.createdAt), desc(adminAuditLog.id)).limit(20),
  ])
  return { user: userDto(user), stats: { ideas: ideaCount[0].total, reports: reportCount[0].total, validations: validationCount[0].total },
    recentCredits: credits.map(entry => ({ id: entry.id, transactionType: entry.transactionType, amount: entry.amount,
      description: entry.description, createdAt: adminDate(entry.createdAt) ?? new Date(0).toISOString() })), recentActivity: audit.map(auditDto) }
}

export async function getAdminAudit(actor: AdminActor, input: { page?: unknown }): Promise<AdminAuditResponse> {
  await assertAdminActor(actor)
  const page = pageSchema.parse(input.page)
  const [entries, totals] = await Promise.all([
    db.select().from(adminAuditLog).orderBy(desc(adminAuditLog.createdAt), desc(adminAuditLog.id)).limit(pageSize).offset((page - 1) * pageSize),
    db.select({ total: count() }).from(adminAuditLog),
  ])
  return { entries: entries.map(auditDto), ...pageMeta(totals[0].total, page) }
}
