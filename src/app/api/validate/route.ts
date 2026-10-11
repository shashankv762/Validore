import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/db'
import { users, ideas, validationJobs, validationReports } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { checkValidationLimit } from '@/lib/tier-gate'
import { runLiteValidation, runFullValidation } from '@/lib/validation/engine'
import { randomUUID } from 'crypto'
import { checkCredits, deductCredits } from '@/lib/credits'
import { CREDIT_COSTS } from '@/lib/credit-costs'
import { rateLimitCheck, checkAndIncrementConcurrency, decrementConcurrency } from '@/lib/rate-limit'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user: supaUser } } = await supabase.auth.getUser()
  if (!supaUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const dbUser = await db.query.users.findFirst({ where: eq(users.supabaseId, supaUser.id) })
  if (!dbUser) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  // GAP-3: Email verification gate BEFORE credit check
  // FIX-W5.3: Email verification gate — free tier first-time users must verify email
  if (dbUser.tier === 'free' && dbUser.validationsThisMonth === 0) {
    if (!supaUser.email_confirmed_at) {
      return NextResponse.json(
        { error: 'Please verify your email address before running your first validation. Check your inbox for a verification link.' },
        { status: 403 }
      )
    }
  }

  const limitCheck = await checkValidationLimit(supaUser.id)
  if (!limitCheck.allowed) {
    return NextResponse.json({ error: 'Monthly validation limit reached.', remaining: 0 }, { status: 429 })
  }

  const { ideaId } = await request.json()
  if (!ideaId) return NextResponse.json({ error: 'ideaId required' }, { status: 400 })

  const idea = await db.query.ideas.findFirst({ where: eq(ideas.id, ideaId) })
  if (!idea || idea.userId !== dbUser.id) return NextResponse.json({ error: 'Idea not found' }, { status: 404 })

  const isLite = dbUser.tier === 'free'
  const cost = isLite ? CREDIT_COSTS.LITE_VALIDATION : CREDIT_COSTS.DEEP_VALIDATION

  const rl = await rateLimitCheck(dbUser.id)
  if (!rl.success) {
    return NextResponse.json({ error: 'Too many requests', retryAfter: 60 }, { status: 429 })
  }

  const creditCheck = await checkCredits(dbUser.id, cost)
  if (!creditCheck.allowed) {
    return NextResponse.json({ error: 'Insufficient credits' }, { status: 402 })
  }

  // GAP-1: Concurrency check
  const tierConcurrencyLimits: Record<string, number> = { free: 1, premium: 2, max_premium: 3 }
  const maxConcurrent = tierConcurrencyLimits[dbUser.tier || 'free'] ?? 1
  const concurrencyCheck = await checkAndIncrementConcurrency(dbUser.id, maxConcurrent)
  if (!concurrencyCheck.allowed) {
    return NextResponse.json(
      { error: 'Too many concurrent requests. Please wait for your current analysis to complete.' },
      { status: 429 }
    )
  }

  // GAP-2: Decrypt custom OpenRouter key if stored
  let customOpenRouterKey: string | null = null
  const encryptedKey = (dbUser as any).encryptedOpenrouterKey as string | null
  if (encryptedKey) {
    if (encryptedKey.includes(':') && process.env.ENCRYPTION_KEY) {
      try {
        const crypto = await import('crypto')
        const [ivHex, encryptedHex] = encryptedKey.split(':')
        const iv = Buffer.from(ivHex, 'hex')
        const decipher = crypto.createDecipheriv(
          'aes-256-cbc',
          Buffer.from(process.env.ENCRYPTION_KEY, 'hex'),
          iv
        )
        let decrypted = decipher.update(encryptedHex, 'hex', 'utf8')
        decrypted += decipher.final('utf8')
        customOpenRouterKey = decrypted
      } catch {
        console.warn('[BYOK] Failed to decrypt custom key, using platform default')
      }
    } else {
      customOpenRouterKey = encryptedKey // Unencrypted fallback (dev)
    }
  }

  try {
    const ideaInput = {
      name: idea.name, industry: idea.industry, product: idea.product, targetCustomer: idea.targetCustomer,
      location: idea.location, businessModel: idea.businessModel, coreProblem: idea.coreProblem, proposedSolution: idea.proposedSolution,
    }

    // FIX-W5.4: Create job row immediately, return 202 with jobId, then run AI async
    const [job] = await db.insert(validationJobs).values({
      ideaId: idea.id, userId: dbUser.id, isLite, status: 'pending', totalSections: isLite ? 1 : 8, completedSections: 0,
    }).returning()

    await db.update(users).set({ validationsThisMonth: dbUser.validationsThisMonth + 1 }).where(eq(users.id, dbUser.id))

    // Fire and forget — AI work runs asynchronously
    Promise.resolve().then(async () => {
      try {
        let reportData: Record<string, unknown>
        let overallScore: number
        let decision: 'GO' | 'MODIFY' | 'TEST_FURTHER' | 'NO_GO'
        let provider: string

        if (isLite) {
          const report = await runLiteValidation(ideaInput, { customOpenRouterKey, preferredAiProvider: dbUser.preferredAiProvider })
          overallScore = report.overallScore
          decision = report.decision as 'GO' | 'MODIFY' | 'TEST_FURTHER' | 'NO_GO'
          provider = report.provider
          reportData = report as unknown as Record<string, unknown>
        } else {
          const report = await runFullValidation(ideaInput, job.id, { customOpenRouterKey, preferredAiProvider: dbUser.preferredAiProvider })
          if (!report) {
            await db.update(validationJobs).set({ status: 'failed', errorMessage: 'AI generation returned null' }).where(eq(validationJobs.id, job.id))
            return
          }
          overallScore = report.overallScore
          decision = report.decision as 'GO' | 'MODIFY' | 'TEST_FURTHER' | 'NO_GO'
          provider = report.provider
          reportData = report as unknown as Record<string, unknown>
        }

        await deductCredits(dbUser.id, cost, 'VALIDATION', job.id)

        const shareToken = randomUUID()

        const baseValues = {
          jobId: job.id, ideaId: idea.id, userId: dbUser.id, shareToken, overallScore,
          problemScore: (reportData.problemScore as number) ?? null,
          customerScore: (reportData.customerScore as number) ?? null,
          marketScore: (reportData.marketScore as number) ?? null,
          competitiveScore: (reportData.competitiveScore as number) ?? null,
          wtpScore: (reportData.wtpScore as number) ?? null,
          businessModelScore: (reportData.businessModelScore as number) ?? null,
          financialScore: (reportData.financialScore as number) ?? null,
          executionScore: (reportData.executionScore as number) ?? null,
          decision, decisionReasons: (reportData.decisionReasons as string[]) ?? [], keyEvidence: (reportData.keyEvidence as string[]) ?? [],
          keyRisks: (reportData.keyRisks as string[]) ?? [], actionPlan: (reportData.actionPlan as string[]) ?? [], reportData, isLite,
        }

        try {
          await db.insert(validationReports).values({
            ...baseValues,
            status: 'complete'
          } as any).returning()
        } catch (e: any) {
          if (e.message?.includes('column') && e.message?.includes('does not exist')) {
            await db.insert(validationReports).values(baseValues).returning()
          } else {
            throw e
          }
        }

        await db.update(validationJobs).set({ status: 'complete', aiProvider: provider }).where(eq(validationJobs.id, job.id))
      } catch (err) {
        console.error('[VALIDATE] Async AI processing failed:', err)
        await db.update(validationJobs)
          .set({ status: 'failed', errorMessage: err instanceof Error ? err.message : 'Unknown error' })
          .where(eq(validationJobs.id, job.id))
          .catch(() => {})
      }
    }).catch(() => {})

    // Return 202 immediately with jobId so client can poll status
    return NextResponse.json(
      { jobId: job.id, status: 'pending', message: 'Validation started. Poll /api/reports/status?jobId=' + job.id + ' for progress.' },
      { status: 202 }
    )
  } finally {
    await decrementConcurrency(dbUser.id)
  }
}