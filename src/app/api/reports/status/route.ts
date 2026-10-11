import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/db'
import { validationReports, validationJobs, users } from '@/db/schema'
import { eq, and } from 'drizzle-orm'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const dbUser = await db.query.users.findFirst({ where: eq(users.supabaseId, user.id) })
  if (!dbUser) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const jobId = request.nextUrl.searchParams.get('jobId')
  const reportId = request.nextUrl.searchParams.get('reportId')

  if (!jobId && !reportId) return NextResponse.json({ error: 'jobId or reportId required' }, { status: 400 })

  if (jobId) {
    const job = await db.query.validationJobs.findFirst({
      where: and(eq(validationJobs.id, jobId), eq(validationJobs.userId, dbUser.id)),
    })
    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

    // When the job is done, include the reportId so the client can redirect.
    let reportId: string | null = null
    let errorMessage: string | null = null
    if (job.status === 'complete' || job.status === 'partial') {
      const report = await db.query.validationReports.findFirst({
        where: and(eq(validationReports.jobId, job.id), eq(validationReports.userId, dbUser.id)),
      })
      reportId = report?.id ?? null
      // If the job finished but no report row exists yet, treat as still finishing
      if (!report) errorMessage = 'Report is being finalised'
    } else if (job.status === 'failed') {
      errorMessage = job.errorMessage ?? 'Validation failed'
    }

    return NextResponse.json({
      jobId: job.id,
      status: job.status,
      completedSections: job.completedSections,
      totalSections: job.totalSections,
      progress: job.totalSections > 0 ? Math.round((job.completedSections / job.totalSections) * 100) : 0,
      reportId,
      errorMessage,
    })
  }

  const report = await db.query.validationReports.findFirst({
    where: eq(validationReports.id, reportId!),
  })

  if (!report || report.userId !== dbUser.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Handle missing column gracefully
  const status = (report as any).status ?? 'complete'

  return NextResponse.json({ status })
}
