import { serve } from 'inngest/next'
import { inngest } from '@/inngest/client'
import { validateStartup } from '@/inngest/functions'

export const maxDuration = 600
export const { GET, POST, PUT } = serve({ client: inngest, functions: [validateStartup] })
