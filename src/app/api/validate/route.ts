import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/db'
import { users, ideas, validationJobs, validationReports } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { checkValidationLimit } from '@/lib/tier-gate'
import { runLiteValidation, runFullValidation } from '@/lib/validation/engine'
import { randomUUID } from 'crypto'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user: supaUser } } = await supabase.auth.getUser()
  if (!supaUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const dbUser = await db.query.users.findFirst({ where: eq(users.supabaseId, supaUser.id) })
  if (!dbUser) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const limitCheck = await checkValidationLimit(supaUser.id)
  if (!limitCheck.allowed) {
    return NextResponse.json({ error: 'Monthly validation limit reached.', remaining: 0 }, { status: 429 })
  }

  const { ideaId } = await request.json()
  if (!ideaId) return NextResponse.json({ error: 'ideaId required' }, { status: 400 })

  const idea = await db.query.ideas.findFirst({ where: eq(ideas.id, ideaId) })
  if (!idea || idea.userId !== dbUser.id) return NextResponse.json({ error: 'Idea not found' }, { status: 404 })

  const isLite = dbUser.tier === 'free'
  const ideaInput = {
    name: idea.name, industry: idea.industry, product: idea.product, targetCustomer: idea.targetCustomer,
    location: idea.location, businessModel: idea.businessModel, coreProblem: idea.coreProblem, proposedSolution: idea.proposedSolution,
  }

  const [job] = await db.insert(validationJobs).values({
    ideaId: idea.id, userId: dbUser.id, isLite, status: 'pending', totalSections: isLite ? 1 : 8, completedSections: 0,
  }).returning()

  await db.update(users).set({ validationsThisMonth: dbUser.validationsThisMonth + 1 }).where(eq(users.id, dbUser.id))

  let reportData: Record<string, unknown>
  let overallScore: number
  let decision: 'GO' | 'MODIFY' | 'TEST_FURTHER' | 'NO_GO'
  let provider: string

  if (isLite) {
    const report = await runLiteValidation(ideaInput)
    overallScore = report.overallScore
    decision = report.decision as any
    provider = report.provider
    reportData = report as unknown as Record<string, unknown>
  } else {
    const report = await runFullValidation(ideaInput, job.id)
    if (!report) return NextResponse.json({ error: 'Validation failed', jobId: job.id }, { status: 500 })
    overallScore = report.overallScore
    decision = report.decision as any
    provider = report.provider
    reportData = report as unknown as Record<string, unknown>
  }

  const shareToken = randomUUID()
  const [validationReport] = await db.insert(validationReports).values({
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
    keyRisks: (reportData.keyRisks as string[]) ?? [], actionPlan: (reportData.actionPlan as any[]) ?? [], reportData, isLite,
  }).returning()

  await db.update(validationJobs).set({ status: 'complete', aiProvider: provider }).where(eq(validationJobs.id, job.id))

  return NextResponse.json({ reportId: validationReport.id, shareToken: validationReport.shareToken, overallScore, decision, remaining: limitCheck.remaining - 1 })
}