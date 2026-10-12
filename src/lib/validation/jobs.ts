import { db } from '@/db'
import { ideas, users, validationJobs, validationReports } from '@/db/schema'
import { eq, and, inArray } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { runLiteValidation, runFullValidation } from './engine'
import { decryptApiKey } from '@/lib/byok-crypto'
import { refundValidationCredits } from '@/lib/credits'

type GeneratedReport = Awaited<ReturnType<typeof runLiteValidation>> | NonNullable<Awaited<ReturnType<typeof runFullValidation>>>

export async function generateValidationReport(jobId: string): Promise<GeneratedReport> {
  const job = await db.query.validationJobs.findFirst({ where: eq(validationJobs.id, jobId) })
  if (!job) throw new Error('Validation job not found')
  const user = await db.query.users.findFirst({ where: eq(users.id, job.userId) })
  const idea = await db.query.ideas.findFirst({ where: and(eq(ideas.id, job.ideaId), eq(ideas.userId, job.userId)) })
  if (!user || !idea) throw new Error('Validation owner or idea not found')
  const [claimed] = await db.update(validationJobs).set({ status: 'running', updatedAt: new Date() }).where(and(
    eq(validationJobs.id, jobId), inArray(validationJobs.status, ['pending', 'running']),
  )).returning({ id: validationJobs.id })
  if (!claimed) throw new Error('Validation job is no longer active')
  const opts = { preferredAiProvider: user.preferredAiProvider,
    customOpenRouterKey: user.encryptedOpenrouterKey ? decryptApiKey(user.encryptedOpenrouterKey) : null }
  const report = job.isLite ? await runLiteValidation(idea, opts) : await runFullValidation(idea, jobId, opts)
  if (!report) throw new Error('AI generation failed')
  return report
}

export async function completeValidationJob(jobId: string, report: GeneratedReport): Promise<string> {
  return db.transaction(async (tx) => {
    const [job] = await tx.select().from(validationJobs).where(eq(validationJobs.id, jobId)).for('update')
    if (!job) throw new Error('Validation job not found')
    const [existing] = await tx.select().from(validationReports).where(eq(validationReports.jobId, jobId)).limit(1)
    if (existing) return existing.id
    if (job.status === 'failed') throw new Error('Validation job was already refunded')
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
    await tx.update(validationJobs).set({ status, completedSections: job.isLite ? 1 : 6,
      tokensUsed: report.tokensUsed, aiProvider: report.provider, errorMessage: null, updatedAt: new Date(),
    }).where(eq(validationJobs.id, jobId))
    return saved.id
  })
}

export async function failValidationJob(jobId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [job] = await tx.select().from(validationJobs).where(eq(validationJobs.id, jobId)).for('update')
    if (!job) return null
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
