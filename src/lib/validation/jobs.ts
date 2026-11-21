import { db } from '@/db'
import { ideas, users, validationJobs, validationReports } from '@/db/schema'
import { eq, and, inArray, or, lt, isNull, sql } from 'drizzle-orm'
import { NonRetriableError } from 'inngest'
import { createHash, randomUUID } from 'node:crypto'
import { runLiteValidation, runFullValidation } from './engine'
import { decryptApiKey } from '@/lib/byok-crypto'
import { refundValidationCredits } from '@/lib/credits'
import { runInlineStep, type RunValidationStep } from './steps'
import type { IdeaInput } from './schemas'
import { FULL_AGENT_COUNT, LITE_AGENT_COUNT } from '@/lib/ai/roles'
import { loadFounderContext } from '@/lib/interview/context'
import { normalizeValidationScores } from '@/lib/scoring'
import { isActiveAccount, isOwnerAccount } from '@/lib/admin-access'
import { getPlan } from '@/lib/plan-catalog'
import { hasUsefulValidationCoverage } from './delivery-quality'
import { approvedPublicResearchFocus } from '@/lib/ai/research-brief'

type GeneratedReport = (Awaited<ReturnType<typeof runLiteValidation>> | NonNullable<Awaited<ReturnType<typeof runFullValidation>>>) & {
  ideaSnapshot?: IdeaInput & { briefFingerprint: string; capturedAt?: string }
}

export async function generateValidationReport(jobId: string, options?: { runStep: RunValidationStep }): Promise<GeneratedReport> {
  const checkActive = async () => {
    const currentJob = await db.query.validationJobs.findFirst({ where: eq(validationJobs.id, jobId) })
    if (!currentJob || !['pending', 'running'].includes(currentJob.status)) throw new NonRetriableError('Validation job is no longer active')
    if (isStaleValidationJob(currentJob)) throw new NonRetriableError('Validation execution window expired. The failed run will be refunded.')
    const account = await db.query.users.findFirst({ where: eq(users.id, currentJob.userId) })
    if (!account || !isActiveAccount(account)) throw new NonRetriableError('Validation account is not active')
  }
  // Check outside durable steps as well: cached preparation cannot restore a revoked job.
  const executeStep: RunValidationStep = async (name, work) => {
    await checkActive()
    return (options?.runStep ?? runInlineStep)(name, async () => {
      // Only actual work refreshes activity. Replayed cached steps must not
      // keep a crashed worker alive indefinitely by replaying old progress.
      await checkActive()
      await db.update(validationJobs).set({ updatedAt: new Date() }).where(and(eq(validationJobs.id, jobId), eq(validationJobs.status, 'running')))
      const result = await work()
      await checkActive()
      await db.update(validationJobs).set({ updatedAt: new Date() }).where(and(eq(validationJobs.id, jobId), eq(validationJobs.status, 'running')))
      return result
    })
  }
  const context = await executeStep('prepare-validation', async () => {
    const job = await db.query.validationJobs.findFirst({ where: eq(validationJobs.id, jobId) })
    if (!job) throw new NonRetriableError('Validation job not found')
    const idea = await db.query.ideas.findFirst({ where: and(eq(ideas.id, job.ideaId), eq(ideas.userId, job.userId)) })
    if (!idea) throw new NonRetriableError('Validation idea not found')
    const [claimed] = await db.update(validationJobs).set({ status: 'running', updatedAt: new Date() }).where(and(
      eq(validationJobs.id, jobId), inArray(validationJobs.status, ['pending', 'running']),
    )).returning({ id: validationJobs.id })
    if (!claimed) throw new NonRetriableError('Validation job is no longer active')
    const input: IdeaInput = { name: idea.name, industry: idea.industry, product: idea.product,
      targetCustomer: idea.targetCustomer, location: idea.location, businessModel: idea.businessModel,
      coreProblem: idea.coreProblem, proposedSolution: idea.proposedSolution,
      ...(approvedPublicResearchFocus(idea.publicResearchFocus) ? { publicResearchFocus: approvedPublicResearchFocus(idea.publicResearchFocus) } : {}) }
    const privateContext = await loadFounderContext(idea.id, job.userId)
    return { userId: job.userId, isLite: job.isLite, idea: input, privateContext, preparedAt: new Date().toISOString() }
  })
  // Keys are read afresh on the server, never returned from a durable step.
  const user = await db.query.users.findFirst({ where: eq(users.id, context.userId) })
  if (!user || !isActiveAccount(user)) throw new NonRetriableError('Validation account is not active')
  const admittedJob = await db.query.validationJobs.findFirst({ where: eq(validationJobs.id, jobId) })
  const entitlement = admittedJob?.entitlementSnapshot
  const opts = { preferredAiProvider: user.preferredAiProvider,
    maxTokensPerCall: entitlement ? entitlement.ownerUnlimited ? undefined : entitlement.maxTokensPerCall
      : isOwnerAccount(user) ? undefined : (await getPlan(user.tier)).maxTokensPerCall,
    privateContext: context.privateContext,
    customOpenRouterKey: user.encryptedOpenrouterKey ? decryptApiKey(user.encryptedOpenrouterKey) : null,
    runStep: executeStep,
    retryTransientFailures: Boolean(options?.runStep),
    researchBudgetId: jobId,
    asOfDate: context.preparedAt?.slice(0, 10),
    onProgress: async (completed: number, total: number) => {
      await checkActive()
      await db.update(validationJobs).set({ completedSections: sql`greatest(${validationJobs.completedSections}, ${completed})`, totalSections: total })
        .where(and(eq(validationJobs.id, jobId), eq(validationJobs.status, 'running')))
    } }
  const report = context.isLite ? await runLiteValidation(context.idea, opts) : await runFullValidation(context.idea, jobId, opts)
  if (!report) throw new Error('AI generation failed')
  if (!hasUsefulValidationCoverage(report, context.isLite)) throw new NonRetriableError('Core research could not complete. No incomplete validation will be charged as a delivered report; retry after provider access is restored.')
  // Capture the actual durable input, never today's editable idea on replay.
  // Older queued contexts have no public focus; they keep generic research.
  const ideaSnapshot = { ...context.idea, briefFingerprint: createHash('sha256').update(JSON.stringify(context.idea)).digest('hex'),
    ...(context.preparedAt ? { capturedAt: context.preparedAt } : {}) }
  return { ...report, ideaSnapshot }
}

export async function completeValidationJob(jobId: string, report: GeneratedReport): Promise<string> {
  // Ownership is immutable. Resolve it before locking, then use the same
  // account → job order as admission and account administration.
  const owner = await db.query.validationJobs.findFirst({ where: eq(validationJobs.id, jobId), columns: { userId: true } })
  if (!owner) throw new Error('Validation job not found')
  return db.transaction(async (tx) => {
    const [account] = await tx.select().from(users).where(eq(users.id, owner.userId)).for('update')
    if (!account || !isActiveAccount(account)) throw new NonRetriableError('Validation account is not active')
    const [job] = await tx.select().from(validationJobs).where(eq(validationJobs.id, jobId)).for('update')
    if (!job) throw new Error('Validation job not found')
    const [existing] = await tx.select().from(validationReports).where(eq(validationReports.jobId, jobId)).limit(1)
    if (existing) return existing.id
    if (job.status === 'failed') throw new Error('Validation job was already refunded')
    if (isStaleValidationJob(job)) throw new NonRetriableError('Validation execution window expired before delivery.')
    // Also normalize cached reports produced before this release on queue replay.
    report = normalizeValidationScores(report)
    if (!hasUsefulValidationCoverage(report, job.isLite)) throw new NonRetriableError('Validation content is incomplete. No incomplete report will be saved as delivered.')
    const data = report as unknown as Record<string, unknown>
    const trail = data.agentTrail as { agents?: Record<string, string> } | undefined
    const partial = Object.values(trail?.agents ?? {}).some(status => status === 'failed' || status === 'partial')
    const status = partial ? 'partial' : 'complete'
    const [saved] = await tx.insert(validationReports).values({
      jobId, ideaId: job.ideaId, userId: job.userId, shareToken: randomUUID(), overallScore: report.overallScore,
      problemScore: report.problemScore, customerScore: report.customerScore, marketScore: report.marketScore,
      competitiveScore: report.competitiveScore, wtpScore: report.wtpScore, businessModelScore: report.businessModelScore,
      financialScore: report.financialScore, executionScore: report.executionScore,
      decision: report.decision, decisionReasons: report.decisionReasons, keyEvidence: report.keyEvidence,
      keyRisks: report.keyRisks, actionPlan: report.actionPlan, reportData: report, isLite: job.isLite, status,
    }).returning({ id: validationReports.id })
    await tx.update(validationJobs).set({ status, completedSections: job.isLite ? LITE_AGENT_COUNT : FULL_AGENT_COUNT, totalSections: job.isLite ? LITE_AGENT_COUNT : FULL_AGENT_COUNT,
      tokensUsed: report.tokensUsed, aiProvider: report.provider, errorMessage: null, updatedAt: new Date(),
    }).where(eq(validationJobs.id, jobId))
    return saved.id
  })
}

const RUNNING_STALE_MS = 15 * 60_000
// Full runs may contain nine sequential 240-second model stages. Idle and
// overall limits serve different purposes; useful progress extends only idle.
const TOTAL_EXECUTION_MS = 90 * 60_000

/** Scheduling cannot outlive the same heartbeat window used by polling/reaping. */
export async function validationRetryDeadline(jobId: string): Promise<number | null> {
  const job = await db.query.validationJobs.findFirst({ where: eq(validationJobs.id, jobId), columns: { status: true, updatedAt: true, createdAt: true } })
  const timestamp = job?.updatedAt ?? job?.createdAt
  if (job?.status !== 'running' || !timestamp || !Number.isFinite(timestamp.getTime())) return null
  const total = job.createdAt && Number.isFinite(job.createdAt.getTime()) ? job.createdAt.getTime() + TOTAL_EXECUTION_MS : Infinity
  return Math.min(timestamp.getTime() + RUNNING_STALE_MS, total)
}

export function isStaleValidationJob(job: Pick<typeof validationJobs.$inferSelect, 'status' | 'updatedAt' | 'createdAt'>, now = new Date()) {
  if (job.status !== 'pending' && job.status !== 'running') return false
  const timestamp = job.updatedAt ?? job.createdAt
  const timeout = job.status === 'pending' && process.env.VALIDATION_RUNNER === 'inngest' ? 60 * 60_000 : RUNNING_STALE_MS
  return Boolean(timestamp && timestamp.getTime() < now.getTime() - timeout) ||
    Boolean(job.createdAt && job.createdAt.getTime() < now.getTime() - TOTAL_EXECUTION_MS)
}

export async function reapStaleValidationJobs(jobId?: string): Promise<void> {
  const now = new Date()
  const runningCutoff = new Date(now.getTime() - RUNNING_STALE_MS)
  const pendingCutoff = new Date(now.getTime() - (process.env.VALIDATION_RUNNER === 'inngest' ? 60 : 15) * 60_000)
  const stale = await db.query.validationJobs.findMany({
    where: and(jobId ? eq(validationJobs.id, jobId) : undefined, or(
      and(inArray(validationJobs.status, ['pending', 'running']), lt(validationJobs.createdAt, new Date(now.getTime() - TOTAL_EXECUTION_MS))),
      and(eq(validationJobs.status, 'running'), or(lt(validationJobs.updatedAt, runningCutoff), and(isNull(validationJobs.updatedAt), lt(validationJobs.createdAt, runningCutoff)))),
      and(eq(validationJobs.status, 'pending'), or(lt(validationJobs.updatedAt, pendingCutoff), and(isNull(validationJobs.updatedAt), lt(validationJobs.createdAt, pendingCutoff)))),
    )), columns: { id: true }, limit: 100,
  })
  for (const job of stale) await failValidationJob(job.id, true)
}

export async function failValidationJob(jobId: string, onlyIfStale = false): Promise<void> {
  const owner = await db.query.validationJobs.findFirst({ where: eq(validationJobs.id, jobId), columns: { userId: true } })
  if (!owner) return
  await db.transaction(async (tx) => {
    await tx.select().from(users).where(eq(users.id, owner.userId)).for('update')
    const [job] = await tx.select().from(validationJobs).where(eq(validationJobs.id, jobId)).for('update')
    if (!job || job.status === 'failed' || (onlyIfStale && !isStaleValidationJob(job))) return null
    const [report] = await tx.select().from(validationReports).where(eq(validationReports.jobId, jobId)).limit(1)
    if (report) return null
    await refundValidationCredits(job.userId, jobId, tx)
    await tx.update(validationJobs).set({ status: 'failed', errorMessage: 'Analysis could not complete. Your credits have been returned.', updatedAt: new Date() }).where(eq(validationJobs.id, jobId))
  })
}

export async function runValidationJob(jobId: string): Promise<void> {
  try { await completeValidationJob(jobId, await generateValidationReport(jobId)) }
  catch (error) {
    console.error('[validation/job] Failed:', error)
    await failValidationJob(jobId)
  }
}
