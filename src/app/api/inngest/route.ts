import { serve } from 'inngest/next'
import { inngest } from '@/inngest/client'
import { dailyCreditMaintenance, reconcileValidationQueue, validateStartup } from '@/inngest/functions'

export const { GET, POST, PUT } = serve({ client: inngest, functions: [validateStartup,
  ...(process.env.VALIDATION_RUNNER === 'inngest' ? [reconcileValidationQueue] : []),
  ...(process.env.CREDIT_MAINTENANCE_RUNNER === 'inngest' ? [dailyCreditMaintenance] : []),
] })
