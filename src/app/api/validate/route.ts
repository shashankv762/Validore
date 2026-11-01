import { after, NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/db'
import { users, ideas, validationJobs } from '@/db/schema'
import { eq, and, inArray } from 'drizzle-orm'
import { checkValidationLimit } from '@/lib/tier-gate'
import { checkCredits, deductCredits } from '@/lib/credits'
import { CREDIT_COSTS } from '@/lib/credit-costs'
import { rateLimitCheck, checkAndIncrementConcurrency, decrementConcurrency } from '@/lib/rate-limit'
import { runValidationJob, failValidationJob } from '@/lib/validation/jobs'
import { inngest } from '@/inngest/client'
import { FULL_AGENT_COUNT, LITE_AGENT_COUNT } from '@/lib/ai/roles'
import { isSameOriginMutation } from '@/lib/api-security'

export const maxDuration = 300
const InputSchema = z.object({ ideaId: z.string().uuid() })
class ReservationConflict extends Error {}

export async function POST(request: NextRequest) {
  let releaseUser: string | null = null
  let scheduled = false
  let reservedJob: string | null = null
  try {
    if (!isSameOriginMutation(request)) return NextResponse.json({ error: 'Invalid request origin' }, { status: 403 })
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const dbUser = await db.query.users.findFirst({ where: eq(users.supabaseId, user.id) })
    if (!dbUser) return NextResponse.json({ error: 'User not found' }, { status: 404 })
    if (dbUser.tier === 'free' && dbUser.validationsThisMonth === 0 && !user.email_confirmed_at) {
      return NextResponse.json({ error: 'Please verify your email address before running your first validation.' }, { status: 403 })
    }
    const parsed = InputSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: 'A valid ideaId is required' }, { status: 400 })
    const idea = await db.query.ideas.findFirst({ where: and(eq(ideas.id, parsed.data.ideaId), eq(ideas.userId, dbUser.id)) })
    if (!idea || idea.userId !== dbUser.id || idea.isReadOnly || idea.isActive === false) return NextResponse.json({ error: 'Idea not found or read-only' }, { status: 404 })
    const activeJob = await db.query.validationJobs.findFirst({ where: and(eq(validationJobs.ideaId, idea.id), eq(validationJobs.userId, dbUser.id), inArray(validationJobs.status, ['pending', 'running'])) })
    if (activeJob) return NextResponse.json({ jobId: activeJob.id, status: activeJob.status, reused: true, message: 'Your existing analysis is still in progress.' }, { status: 202 })
    const limit = await checkValidationLimit(user.id)
    if (!limit.allowed) return NextResponse.json({ error: 'Monthly validation limit reached.', remaining: 0 }, { status: 429 })
    const limited = await rateLimitCheck(dbUser.id)
    if (!limited.success) return NextResponse.json({ error: 'Too many requests', retryAfter: 60 }, { status: 429, headers: { 'Retry-After': '60' } })
    const isLite = dbUser.tier === 'free'
    const cost = isLite ? CREDIT_COSTS.LITE_VALIDATION : CREDIT_COSTS.DEEP_VALIDATION
    if (!(await checkCredits(dbUser.id, cost)).allowed) return NextResponse.json({ error: 'Insufficient credits' }, { status: 402 })
    const queued = process.env.VALIDATION_RUNNER === 'inngest'
    if (process.env.NODE_ENV === 'production' && !queued) {
      return NextResponse.json({ error: 'Validation queue is temporarily unavailable' }, { status: 503 })
    }
    if (queued && process.env.INNGEST_DEV !== '1' && (!process.env.INNGEST_EVENT_KEY || !process.env.INNGEST_SIGNING_KEY)) {
      return NextResponse.json({ error: 'Validation queue is temporarily unavailable' }, { status: 503 })
    }
    if (!queued) {
      const concurrency = await checkAndIncrementConcurrency(dbUser.id, { free: 1, premium: 2, max_premium: 3 }[dbUser.tier])
      if (!concurrency.allowed) return NextResponse.json({ error: 'Too many concurrent requests. Wait for your current analysis to complete.' }, { status: 429 })
      releaseUser = dbUser.id
    }
    const config = await db.query.tierConfig.findFirst({ where: (table, { eq }) => eq(table.tier, dbUser.tier) })
    if (!config) return NextResponse.json({ error: 'Plan configuration is unavailable' }, { status: 503 })
    const reservation = await db.transaction(async (tx) => {
      const [current] = await tx.select().from(ideas).where(and(eq(ideas.id, idea.id), eq(ideas.userId, dbUser.id))).for('update')
      if (!current || !current.isActive || current.isReadOnly) throw new Error('Idea is no longer editable')
      const [running] = await tx.select().from(validationJobs).where(and(eq(validationJobs.ideaId, idea.id), eq(validationJobs.userId, dbUser.id), inArray(validationJobs.status, ['pending', 'running']))).limit(1)
      if (running) return { job: running, reused: true }
      const [created] = await tx.insert(validationJobs).values({ ideaId: idea.id, userId: dbUser.id,
        isLite, status: 'pending', totalSections: isLite ? LITE_AGENT_COUNT : FULL_AGENT_COUNT, completedSections: 0 }).returning()
      if (!await deductCredits(dbUser.id, cost, 'VALIDATION', created.id, config.monthlyValidationLimit, tx)) {
        throw new ReservationConflict('Credit or monthly allowance changed')
      }
      return { job: created, reused: false }
    })
    const job = reservation.job
    if (reservation.reused) return NextResponse.json({ jobId: job.id, status: job.status, reused: true, message: 'Your existing analysis is still in progress.' }, { status: 202 })
    reservedJob = job.id
    if (queued) {
      // Only references are sent to the queue; credentials stay in server-side storage.
      await inngest.send({ id: job.id, name: 'validore/validation.requested', data: { jobId: job.id, userId: dbUser.id } })
      scheduled = true
    } else {
      const userId = dbUser.id
      after(async () => {
        try { await runValidationJob(job.id) }
        finally { await decrementConcurrency(userId) }
      })
      scheduled = true
    }
    return NextResponse.json({ jobId: job.id, status: 'pending', message: 'Validation started.' }, { status: 202 })
  } catch (error) {
    if (error instanceof ReservationConflict) {
      return NextResponse.json({ error: 'Credits or monthly allowance were used by another request. Refresh and try again.' }, { status: 409 })
    }
    console.error('[validate] Unable to start validation:', error)
    if (reservedJob) await failValidationJob(reservedJob).catch(refundError => console.error('[validate] Recovery failed:', refundError))
    return NextResponse.json({ error: 'Unable to start validation. Please try again.' }, { status: 503 })
  } finally {
    if (releaseUser && !scheduled) await decrementConcurrency(releaseUser)
  }
}
