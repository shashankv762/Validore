import { NextRequest, NextResponse } from 'next/server'
import { renderReportPdf } from '@/lib/exports/pdf'
import { buildReportDocument } from '@/lib/exports/document'
import { createClient } from '@/lib/supabase/server'
import { getOrCreateDbUser } from '@/lib/auth-sync'
import { db } from '@/db'
import { ideas, validationReports, pitchDecks } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import { canUserAccess } from '@/lib/tier-gate'
import { z } from 'zod'

const QuerySchema = z.object({
  reportId: z.string().uuid(),
})

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const reportIdParam = searchParams.get('reportId')
    const parsedQuery = QuerySchema.safeParse({ reportId: reportIdParam })
    if (!parsedQuery.success) {
      return NextResponse.json(
        { error: 'reportId parameter is required and must be a valid UUID' },
        { status: 400 }
      )
    }
    const reportId = parsedQuery.data.reportId

    const dbUser = await getOrCreateDbUser(user)

    if (!dbUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Tier check: Max tier required for White-label PDF export
    const canExport = await canUserAccess(user.id, 'canWhitelabelPdf')
    if (!canExport) {
      return NextResponse.json(
        { error: 'White-label PDF export requires Max tier' },
        { status: 403 }
      )
    }

    // Query validation report (or fallback to pitch deck if reportId is a deckId)
    const report = await db.query.validationReports.findFirst({
      where: and(eq(validationReports.id, reportId), eq(validationReports.userId, dbUser.id)),
    })

    let ideaId: string | null = report?.ideaId ?? null
    let pitchDeckRecord = null

    if (!report) {
      pitchDeckRecord = await db.query.pitchDecks.findFirst({
        where: and(eq(pitchDecks.id, reportId), eq(pitchDecks.userId, dbUser.id)),
      })
      if (pitchDeckRecord) {
        ideaId = pitchDeckRecord.ideaId
      }
    }

    const source = report ?? pitchDeckRecord
    if (!source) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 })
    }

    const idea = ideaId
      ? await db.query.ideas.findFirst({
          where: eq(ideas.id, ideaId),
        })
      : null

    const document = buildReportDocument(source, idea ?? null, report ? 'validation' : 'pitch')
    const buffer = await renderReportPdf(document, { whiteLabel: true })

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Disposition': `attachment; filename="report-${reportId}.pdf"`,
      },
    })
  } catch (err: unknown) {
    console.error('[export] Failed', { name: err instanceof Error ? err.name : 'UnknownError' })
    return NextResponse.json({ error: 'Unable to export this report. Please try again.' }, { status: 500 })
  }
}
