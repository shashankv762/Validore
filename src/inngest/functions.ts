import { inngest } from './client'
import { generateValidationReport, completeValidationJob, failValidationJob } from '@/lib/validation/jobs'
import { z } from 'zod'

const globalConcurrency = Number(process.env.VALIDATION_GLOBAL_CONCURRENCY || 2)
if (!Number.isSafeInteger(globalConcurrency) || globalConcurrency < 1 || globalConcurrency > 50) throw new Error('VALIDATION_GLOBAL_CONCURRENCY must be an integer from 1 to 50')
const JobEvent = z.object({ jobId: z.string().uuid(), userId: z.string().uuid() })

export const validateStartup = inngest.createFunction({
  id: 'validate-startup', name: 'Validate startup with specialist agents',
  triggers: { event: 'validore/validation.requested' },
  retries: 2, idempotency: 'event.data.jobId',
  concurrency: [{ limit: globalConcurrency }, { limit: 1, key: 'event.data.userId' }],
  onFailure: async ({ event }) => {
    const { jobId } = JobEvent.parse(event.data.event.data)
    await failValidationJob(jobId)
  },
}, async ({ event, step }) => {
  const { jobId } = JobEvent.parse(event.data)
  const report = await step.run('generate-report', () => generateValidationReport(jobId))
  const reportId = await step.run('save-report', () => completeValidationJob(jobId, report))
  return { jobId, reportId }
})
