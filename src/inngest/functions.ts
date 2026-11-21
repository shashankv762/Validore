import { inngest } from './client'
import { generateValidationReport, completeValidationJob, failValidationJob, validationRetryDeadline } from '@/lib/validation/jobs'
import { z } from 'zod'
import type { RunValidationStep } from '@/lib/validation/steps'
import { maintainCredits } from '@/lib/credit-maintenance'
import { NonRetriableError, RetryAfterError } from 'inngest'
import { GenerationUnavailableError } from '@/lib/ai/generation-failure'
import { reconcileValidationDispatches } from '@/lib/validation/dispatch'
import { reapStaleValidationJobs } from '@/lib/validation/jobs'

/** Convert safe provider timing while still inside the failed step callback:
 * the installed SDK serializes RetryAfterError as its retry-after response. */
export function validationStepRunner(jobId: string, run: RunValidationStep): RunValidationStep {
  return async <T>(id: string, work: () => Promise<T>): Promise<T> => run(id, async () => {
    try { return await work() }
    catch (error) {
      if (!(error instanceof GenerationUnavailableError)) throw error
      if (!error.retryable) throw new NonRetriableError('AI provider access cannot complete this analysis. The failed run will be refunded.')
      const retryAt = Math.max(Date.now() + 1000, error.retryAt ?? Date.now() + 30_000)
      const deadline = await validationRetryDeadline(jobId)
      // The generator retains its existing 240-second maximum request budget.
      // Reserve that work window as well as dispatch slack; otherwise polling
      // could reap the job while the delayed provider call is still running.
      if (deadline === null || retryAt >= deadline - 240_000 - 1000) {
        throw new NonRetriableError('AI provider availability exceeds this analysis window. The run will stop and its credits will be refunded; try again when provider access is restored.')
      }
      // Never attach an APICallError cause: SDK causes include provider bodies,
      // request values and credentials and are serialized to the queue.
      throw new RetryAfterError('AI provider is temporarily unavailable. Retry after its cooldown.', new Date(retryAt))
    }
  })
}

const globalConcurrency = Number(process.env.VALIDATION_GLOBAL_CONCURRENCY || 2)
if (!Number.isSafeInteger(globalConcurrency) || globalConcurrency < 1 || globalConcurrency > 50) throw new Error('VALIDATION_GLOBAL_CONCURRENCY must be an integer from 1 to 50')
const JobEvent = z.object({ jobId: z.string().uuid(), userId: z.string().uuid() })

// Render schedules credit maintenance through Inngest.
export const dailyCreditMaintenance = inngest.createFunction({
  id: 'daily-credit-maintenance', name: 'Renew credits and clean expired records',
  triggers: { cron: '0 0 * * *' }, retries: 2, concurrency: 1,
}, async ({ step }) => step.run('maintain-credits', maintainCredits))

export const reconcileValidationQueue = inngest.createFunction({
  id: 'reconcile-validation-queue', name: 'Recover admitted validation jobs',
  triggers: { cron: '*/5 * * * *' }, retries: 2, concurrency: 1,
}, async ({ step }) => {
  await step.run('reap-expired-jobs', reapStaleValidationJobs)
  return step.run('dispatch-pending-jobs', reconcileValidationDispatches)
})

export const validateStartup = inngest.createFunction({
  id: 'validate-startup', name: 'Validate startup with specialist agents',
  triggers: { event: 'validore/validation.requested' },
  retries: 2, idempotency: 'event.data.jobId',
  checkpointing: false,
  concurrency: [{ limit: globalConcurrency }, { limit: 1, key: 'event.data.userId' }],
  onFailure: async ({ event }) => {
    const { jobId } = JobEvent.parse(event.data.event.data)
    await failValidationJob(jobId)
  },
}, async ({ event, step }) => {
  const { jobId } = JobEvent.parse(event.data)
  // Each model call has a separate durable step and a bounded request budget.
  const runStep = validationStepRunner(jobId, async <T>(id: string, work: () => Promise<T>) => await step.run(id, work) as T)
  const report = await generateValidationReport(jobId, { runStep })
  const reportId = await step.run('save-report', () => completeValidationJob(jobId, report))
  return { jobId, reportId }
})
