import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/db'
import { leanCanvases, users } from '@/db/schema'
import { eq } from 'drizzle-orm'

/** Format an array of objects or strings to a numbered list */
function formatArray(items: unknown[]): string {
  if (!items || items.length === 0) return 'None'
  return items.map((item, i) => {
    if (typeof item === 'string') return `${i + 1}. ${item}`
    if (typeof item === 'object' && item !== null) {
      return `${i + 1}. ` + Object.entries(item as Record<string, unknown>)
        .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : String(v)}`)
        .join(' | ')
    }
    return `${i + 1}. ${String(item)}`
  }).join('\n')
}

/** Format an object to key: value lines */
function formatObject(obj: unknown): string {
  if (!obj || typeof obj !== 'object') return 'Not available'
  return Object.entries(obj as Record<string, unknown>)
    .map(([k, v]) => {
      if (Array.isArray(v)) return `${k}: ${v.join(', ')}`
      if (typeof v === 'object' && v !== null) return `${k}: ${JSON.stringify(v)}`
      return `${k}: ${String(v)}`
    })
    .join('\n')
}

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const ideaId = request.nextUrl.searchParams.get('ideaId')
  if (!ideaId) return NextResponse.json({ error: 'ideaId required' }, { status: 400 })

  const canvases = await db.query.leanCanvases.findMany({
    where: eq(leanCanvases.ideaId, ideaId),
    orderBy: (lc, { desc }) => [desc(lc.version)],
  })

  if (!canvases.length) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const canvas = canvases[0]
  const analysis = (canvas.analysisData as any) || {}

  const reportSections = [
    { title: '1. Problem', content: (canvas.problem as any)?.content || 'Not defined' },
    { title: '2. Customer Segments', content: (canvas.customerSegments as any)?.content || 'Not defined' },
    { title: '3. Unique Value Proposition', content: (canvas.uvp as any)?.content || 'Not defined' },
    { title: '4. Solution', content: (canvas.solution as any)?.content || 'Not defined' },
    { title: '5. Channels', content: (canvas.channels as any)?.content || 'Not defined' },
    { title: '6. Revenue Streams', content: (canvas.revenueStreams as any)?.content || 'Not defined' },
    { title: '7. Cost Structure', content: (canvas.costStructure as any)?.content || 'Not defined' },
    { title: '8. Key Metrics', content: (canvas.keyMetrics as any)?.content || 'Not defined' },
    { title: '9. Unfair Advantage', content: (canvas.unfairAdvantage as any)?.content || 'Not defined' },
    { title: '10. Riskiest Assumption', content: (canvas.confidenceScores as any)?.riskiestAssumption || 'Not identified' },
    { title: '11. Assumption Register', content: formatArray(analysis.assumptionRegister || []) },
    { title: '12. Validation Experiments', content: formatArray((canvas.confidenceScores as any)?.validationExperiments || []) },
    { title: '13. Problem Statement', content: analysis.problemStatement || 'Not defined' },
    { title: '14. Segment Prioritization', content: formatArray(analysis.segmentPrioritization || []) },
    { title: '15. Customer Personas', content: formatArray(analysis.customerPersonas || []) },
    { title: '16. Business Model Canvas', content: formatObject(analysis.businessModelCanvas || {}) },
    { title: '17. Build-Measure-Learn Cycles', content: formatArray(analysis.buildMeasureLearnCycles || []) },
    { title: '18. Pivot Analysis', content: formatObject(analysis.pivotAnalysis || {}) },
    { title: '19. IF→THEN Rules', content: formatArray(analysis.ifThenRules || []) },
    { title: '20. Validation Score & Confidence', content: `Score: ${canvas.validationScore || 0}/100` },
  ]

  return NextResponse.json({ canvas, reportSections, reportNarrative: 'Lean Canvas Report' })
}
