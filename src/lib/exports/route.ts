import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { rateLimitCheck } from '@/lib/rate-limit'
import { loadExportDocument } from './load-document'

export async function exportDocument(request: NextRequest, format: 'pdf' | 'docx') {
  try {
    const { data: { user } } = await (await createClient()).auth.getUser()
    if (!user) return NextResponse.json({ error: 'Sign in to download your report.' }, { status: 401 })
    const loaded = await loadExportDocument(request.nextUrl.searchParams, user.id)
    if ('error' in loaded) return NextResponse.json({ error: loaded.error }, { status: loaded.status })
    if (!(await rateLimitCheck(user.id, 'export')).success) return NextResponse.json({ error: 'Please wait a minute before downloading another report.' }, { status: 429 })
    const buffer = format === 'pdf'
      ? await (await import('./pdf')).renderReportPdf(loaded.document)
      : await (await import('./word')).renderReportWord(loaded.document)
    return new NextResponse(new Uint8Array(buffer), { headers: {
      'Content-Type': format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': 'attachment; filename="' + loaded.filename + '.' + format + '"',
      'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
    } })
  } catch {
    console.error('[export] Document rendering failed')
    return NextResponse.json({ error: 'Your document could not be prepared. Please try again.' }, { status: 503, headers: { 'Cache-Control': 'private, no-store' } })
  }
}
