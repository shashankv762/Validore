import { inngest } from './client'
import { generateValidationReport, completeValidationJob, failValidationJob } from '@/lib/validation/jobs'
import { z } from 'zod'
import type { RunValidationStep } from '@/lib/validation/steps'
import { maintainCredits } from '@/lib/credit-maintenance'

const globalConcurrency = Number(process.env.VALIDATION_GLOBAL_CONCURRENCY || 2)
if (!Number.isSafeInteger(globalConcurrency) || globalConcurrency < 1 || globalConcurrency > 50) throw new Error('VALIDATION_GLOBAL_CONCURRENCY must be an integer from 1 to 50')
const JobEvent = z.object({ jobId: z.string().uuid(), userId: z.string().uuid() })

// Render Free has no free cron service. Reuse the configured durable queue.
// Registered only when CREDIT_MAINTENANCE_RUNNER=inngest; Workers keeps its cron.
export const dailyCreditMaintenance = inngest.createFunction({
  id: 'daily-credit-maintenance', name: 'Renew credits and clean expired records',
  triggers: { cron: '0 0 * * *' }, retries: 2, concurrency: 1,
}, async ({ step }) => step.run('maintain-credits', maintainCredits))

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
  // Each model call has a separate durable step and a 120s request budget.
  const runStep: RunValidationStep = async <T>(id: string, work: () => Promise<T>) => await step.run(id, work) as T
  const report = await generateValidationReport(jobId, { runStep })
  const reportId = await step.run('save-report', () => completeValidationJob(jobId, report))
  return { jobId, reportId }
})
