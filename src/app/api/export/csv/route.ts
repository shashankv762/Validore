import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/db'
import { users, ideas, validationReports } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import { canUserAccess } from '@/lib/tier-gate'
import { z } from 'zod'
import { STARTUP_WEIGHTS as W } from '@/lib/scoring'

const QuerySchema = z.object({
  reportId: z.string().uuid().optional().nullable(),
  ideaId: z.string().uuid().optional().nullable(),
  canvasId: z.string().uuid().optional().nullable(),
}).refine(data => (data.reportId || data.ideaId) && (!data.canvasId || (data.ideaId && !data.reportId)), {
  message: "Either reportId or ideaId is required"
})

function escapeCell(val: unknown): string {
  if (val === null || val === undefined) return '""'
  const raw = String(val)
  const str = typeof val === 'string' && /^[\s\u0000-\u001f]*[=+@-]/.test(raw) ? "'" + raw : raw
  return `"${str.replace(/"/g, '""')}"`
}

function csvRow(category: string, metric: string, scoreOrValue: string | number, details: string): string {
  return `${escapeCell(category)},${escapeCell(metric)},${escapeCell(scoreOrValue)},${escapeCell(details)}`
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const reportIdParam = searchParams.get('reportId')
    const ideaIdParam = searchParams.get('ideaId')
    const parsedQuery = QuerySchema.safeParse({ reportId: reportIdParam, ideaId: ideaIdParam, canvasId: searchParams.get('canvasId') })
    if (!parsedQuery.success) {
      return NextResponse.json(
        { error: 'Either reportId or ideaId parameter is required and must be a valid UUID' },
        { status: 400 }
      )
    }
    const reportId = parsedQuery.data.reportId
    const ideaId = parsedQuery.data.ideaId
    const canvasId = parsedQuery.data.canvasId

    let dbUser = await db.query.users.findFirst({
      where: eq(users.supabaseId, user.id),
    })

    if (!dbUser && user.email) {
      try {
        const [inserted] = await db
          .insert(users)
          .values({
            email: user.email,
            supabaseId: user.id,
            tier: 'free',
          })
          .onConflictDoNothing()
          .returning()
        dbUser = inserted || (await db.query.users.findFirst({ where: eq(users.supabaseId, user.id) }))
      } catch {
        // fallback to query
      }
    }

    if (!dbUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Tier check: Pro or Max required for CSV export
    const canExport = await canUserAccess(user.id, 'canExportCsv')
    if (!canExport) {
      return NextResponse.json(
        { error: 'CSV export requires Pro or Max tier' },
        { status: 403 }
      )
    }

    // Query validation report
    let report = null
    if (reportId) {
      report = await db.query.validationReports.findFirst({
        where: and(eq(validationReports.id, reportId), eq(validationReports.userId, dbUser.id)),
      })
    } else if (ideaId && !canvasId) {
      report = await db.query.validationReports.findFirst({
        where: and(eq(validationReports.ideaId, ideaId), eq(validationReports.userId, dbUser.id)),
        orderBy: (reports, { desc }) => [desc(reports.createdAt)]
      })
    }

    if (!report) {
      if (ideaId) {
        // Try crowdfunding analysis
        const { crowdfundingAnalyses, pricingSimulations, leanCanvases } = await import('@/db/schema')
        const { desc: descOrder } = await import('drizzle-orm')

        const cfAnalysis = canvasId ? null : await db.query.crowdfundingAnalyses.findFirst({
          where: and(eq(crowdfundingAnalyses.ideaId, ideaId), eq(crowdfundingAnalyses.userId, dbUser.id)),
          orderBy: [descOrder(crowdfundingAnalyses.createdAt)],
        })

        if (cfAnalysis) {
          const cfData = (cfAnalysis.reportData as Record<string, unknown>) || {}
          const computed = (cfData.computedMetrics as Record<string, unknown>) || {}
          const rows = [
            'Category,Metric,Score_Or_Value,Details',
            csvRow('Overview', 'Performance Score', String(cfAnalysis.performanceScore || 0), cfAnalysis.classificationBand || ''),
            csvRow('Overview', 'Expected Funding', String(cfAnalysis.expectedFunding || 0), 'USD'),
            csvRow('Overview', 'Expected Backers', String(cfAnalysis.expectedBackers || 0), ''),
            csvRow('Overview', 'Required Backers', String((computed as any).requiredBackers || 0), 'PROJECTION'),
            csvRow('Overview', 'Conversion Rate', cfAnalysis.conversionRate || 'N/A', ''),
            csvRow('Recommendation', 'Summary', cfAnalysis.recommendation || '', 'AI_ESTIMATE_UNVERIFIED'),
          ]
          return new NextResponse(rows.join('\r\n'), {
            status: 200,
            headers: {
              'Content-Type': 'text/csv; charset=utf-8',
              'Cache-Control': 'private, no-store',
              'Content-Disposition': `attachment; filename="crowdfunding-analysis-${cfAnalysis.id.slice(0,8)}.csv"`,
            },
          })
        }

        const prSim = canvasId ? null : await db.query.pricingSimulations.findFirst({
          where: and(eq(pricingSimulations.ideaId, ideaId), eq(pricingSimulations.userId, dbUser.id)),
          orderBy: [descOrder(pricingSimulations.createdAt)],
        })

        if (prSim) {
          const rows = [
            'Category,Metric,Score_Or_Value,Details',
            csvRow('Overview', 'Pricing Score', String(prSim.pricingScore || 0), ''),
            csvRow('Overview', 'Recommended Price', prSim.recommendedPrice || 'N/A', 'PROJECTION'),
          ]
          return new NextResponse(rows.join('\r\n'), {
            status: 200,
            headers: {
              'Content-Type': 'text/csv; charset=utf-8',
              'Cache-Control': 'private, no-store',
              'Content-Disposition': `attachment; filename="pricing-analysis-${prSim.id.slice(0,8)}.csv"`,
            },
          })
        }

        const leanCanvas = await db.query.leanCanvases.findFirst({
          where: and(eq(leanCanvases.ideaId, ideaId), eq(leanCanvases.userId, dbUser.id), canvasId ? eq(leanCanvases.id, canvasId) : undefined),
          orderBy: [descOrder(leanCanvases.createdAt)],
        })

        if (leanCanvas) {
          const rows = [
            'Category,Block,Content,Badge',
            csvRow('Canvas', 'Problem', (leanCanvas.problem as any)?.content || '', 'ASSUMPTION'),
            csvRow('Canvas', 'Solution', (leanCanvas.solution as any)?.content || '', 'ASSUMPTION'),
            csvRow('Canvas', 'UVP', (leanCanvas.uvp as any)?.content || '', 'ASSUMPTION'),
            csvRow('Canvas', 'Customer Segments', (leanCanvas.customerSegments as any)?.content || '', 'ASSUMPTION'),
            csvRow('Canvas', 'Channels', (leanCanvas.channels as any)?.content || '', 'ASSUMPTION'),
            csvRow('Canvas', 'Revenue Streams', (leanCanvas.revenueStreams as any)?.content || '', 'ASSUMPTION'),
            csvRow('Canvas', 'Cost Structure', (leanCanvas.costStructure as any)?.content || '', 'ASSUMPTION'),
            csvRow('Canvas', 'Key Metrics', (leanCanvas.keyMetrics as any)?.content || '', 'ASSUMPTION'),
            csvRow('Canvas', 'Unfair Advantage', (leanCanvas.unfairAdvantage as any)?.content || '', 'ASSUMPTION'),
            csvRow('Scores', 'Validation Score', String(leanCanvas.validationScore || 0), 'AI_ESTIMATE_UNVERIFIED'),
          ]
          return new NextResponse(rows.join('\r\n'), {
            status: 200,
            headers: {
              'Content-Type': 'text/csv; charset=utf-8',
              'Cache-Control': 'private, no-store',
              'Content-Disposition': `attachment; filename="lean-canvas-${leanCanvas.id}.csv"`,
            },
          })
        }

        // Nothing found
        return NextResponse.json({ error: 'No module data found for ideaId' }, { status: 404 })
      }
      return NextResponse.json({ error: 'Report not found' }, { status: 404 })
    }

    // Query idea metadata
    const idea = await db.query.ideas.findFirst({
      where: eq(ideas.id, report.ideaId),
    })

    const reportData = (report.reportData || {}) as Record<string, unknown>
    const ideaData = (reportData.idea || {}) as Record<string, unknown>

    const startupName = String(idea?.name ?? ideaData.name ?? 'Not available')
    const industry = String(idea?.industry ?? ideaData.industry ?? 'Not available')
    const product = String(idea?.product ?? ideaData.product ?? 'Not available')
    const location = String(idea?.location ?? ideaData.location ?? 'Not available')
    const businessModel = String(idea?.businessModel ?? ideaData.businessModel ?? 'Not available')
    const coreProblem = String(idea?.coreProblem ?? ideaData.coreProblem ?? 'Not available')
    const proposedSolution = String(idea?.proposedSolution ?? ideaData.proposedSolution ?? 'Not available')
    const targetCustomer = String(idea?.targetCustomer ?? ideaData.targetCustomer ?? 'Not available')

    const overallScore = report.overallScore ?? 'Not available'
    const decision = report.decision ?? 'PENDING'
    const decisionReasons = (report.decisionReasons as string[] | null) || []
    const decisionSummary = decisionReasons.length > 0 ? decisionReasons.join('; ') : `Decision: ${decision}`

    const percent = (scores: Array<{ value: unknown; weight: number }>) => {
      if (scores.some(score => typeof score.value !== 'number' || !Number.isFinite(score.value) || score.value < 0 || score.value > score.weight)) return 'Not available'
      return Math.round(100 * scores.reduce((sum, score) => sum + Number(score.value), 0) / scores.reduce((sum, score) => sum + score.weight, 0))
    }
    const rows: string[] = [
      'Category,Metric,Score_Or_Value,Details_And_Evidence',
      // Metadata
      csvRow('Metadata', 'Report ID', report.id, 'Validore Autonomous Validation Engine Report'),
      csvRow('Metadata', 'Startup Name', startupName, product),
      csvRow('Metadata', 'Industry', industry, `Location: ${location}`),
      csvRow('Metadata', 'Business Model', businessModel, `Target: ${targetCustomer}`),
      csvRow('Metadata', 'Decision', decision, decisionSummary),
      csvRow('Metadata', 'Overall Validation Score', overallScore, `Composite multi-dimensional score (out of 100)`),
      csvRow('Metadata', 'Creation Date', report.createdAt ? new Date(report.createdAt).toISOString() : 'Not available', 'Validation report timestamp'),

      // Composite & Dimension Scores
      csvRow('Scores', 'Desirability Score', percent([{ value: report.problemScore, weight: W.problemValidation }, { value: report.customerScore, weight: W.customerValidation }, { value: report.wtpScore, weight: W.willingnessToPay }]), 'Composite customer interest, problem pain, and willingness to pay [0-100 normalized]'),
      csvRow('Scores', 'Feasibility Score', percent([{ value: report.competitiveScore, weight: W.competitiveDifferentiation }, { value: report.executionScore, weight: W.executionFeasibility }]), 'Composite technical, moat, and execution viability [0-100 normalized]'),
      csvRow('Scores', 'Viability Score', percent([{ value: report.marketScore, weight: W.marketOpportunity }, { value: report.businessModelScore, weight: W.businessModel }, { value: report.financialScore, weight: W.financialFeasibility }]), 'Composite market size, unit economics, and business model sustainability [0-100 normalized]'),
      csvRow('Scores', 'Market Score', report.marketScore ?? 'Not available', 'Total addressable market dynamics and growth potential (weight: 15%)'),
      csvRow('Scores', 'Financial Score', report.financialScore ?? 'Not available', 'Unit economics, capital requirements, and profitability (max 5 points)'),
      csvRow('Scores', 'Execution Score', report.executionScore ?? 'Not available', 'Execution feasibility (max 5 points)'),
      csvRow('Scores', 'Problem Validation', report.problemScore ?? 'Not available', 'Problem severity, frequency, and founder alignment (max 20 points)'),
      csvRow('Scores', 'Customer Validation', report.customerScore ?? 'Not available', 'Customer archetype clarity and segment accessibility (max 20 points)'),
      csvRow('Scores', 'Competitive Differentiation', report.competitiveScore ?? 'Not available', 'Moat defensibility and alternative solutions (weight: 10%)'),
      csvRow('Scores', 'Willingness to Pay', report.wtpScore ?? 'Not available', 'Budget availability, pricing elasticity, and urgency (weight: 15%)'),
      csvRow('Scores', 'Business Model', report.businessModelScore ?? 'Not available', 'Revenue scalability, pricing model, and distribution synergy (weight: 10%)'),
    ]

    // Financial Metrics
    const tamSamSom = reportData.tamSamSom as Record<string, unknown> | undefined
    const tamObj = tamSamSom?.tam as Record<string, unknown> | undefined
    const samObj = tamSamSom?.sam as Record<string, unknown> | undefined
    const somObj = tamSamSom?.som as Record<string, unknown> | undefined
    const tamVal = String(tamObj?.value ?? reportData.tamEstimate ?? 'Not available')
    const samVal = String(samObj?.value ?? reportData.samEstimate ?? 'Not available')
    const somVal = String(somObj?.value ?? reportData.somEstimate ?? 'Not available')
    const computed = (reportData.computedUnitEconomics ?? {}) as Record<string, unknown>
    const summary = (reportData.financialSummary ?? {}) as Record<string, unknown>
    const assumptions = (reportData.unitEconomicsAssumptions ?? {}) as Record<string, unknown>
    const numeric = (...values: unknown[]): number | null => {
      for (const value of values) if (typeof value === 'number' && Number.isFinite(value)) return value
      return null
    }
    const cac = numeric(computed.cac, summary.cac, assumptions.estimatedCACMonthly)
    const ltv = numeric(computed.ltv, summary.ltv)
    const ltvCac = numeric(computed.ltvCacRatio) ?? (cac !== null && cac > 0 && ltv !== null ? ltv / cac : null)
    const paybackMonths = numeric(computed.cacPaybackMonths)
    const breakEven = numeric(computed.breakEvenCustomers, summary.breakEvenUnits)
    const value = (amount: number | null, suffix = '', prefix = '') => amount === null ? 'Not available' : prefix + amount + suffix

    rows.push(
      csvRow('Financial', 'TAM', tamVal, 'Total Addressable Market [PROJECTION]'),
      csvRow('Financial', 'SAM', samVal, 'Serviceable Addressable Market [PROJECTION]'),
      csvRow('Financial', 'SOM', somVal, 'Serviceable Obtainable Market [PROJECTION]'),
      csvRow('Financial', 'CAC', value(cac, '', '$'), 'Customer Acquisition Cost [ASSUMPTION]'),
      csvRow('Financial', 'LTV', value(ltv, '', '$'), 'Estimated Customer Lifetime Value [PROJECTION]'),
      csvRow('Financial', 'LTV/CAC', value(ltvCac === null ? null : Number(ltvCac.toFixed(2)), 'x'), 'Unit Economics Health Ratio (Target > 3.0x)'),
      csvRow('Financial', 'Payback Months', value(paybackMonths, ' months'), 'CAC Recovery Payback Period'),
      csvRow('Financial', 'Break-even', value(breakEven, ' units/mo'), 'Monthly units required for operational break-even')
    )

    // Strategic Sections
    const uvpOptions = Array.isArray(reportData.uvpOptions) ? reportData.uvpOptions : []
    const uvp = (reportData.selectedUvp || uvpOptions[0] || 'Not available') as string
    rows.push(
      csvRow('Strategic', 'Problem', coreProblem, 'Identified core customer friction and pain point'),
      csvRow('Strategic', 'Solution', proposedSolution, 'Value delivery mechanism and product workflow'),
      csvRow('Strategic', 'Target Customer', targetCustomer, 'Ideal customer profile and primary buyer persona'),
      csvRow('Strategic', 'Unique Value Prop', uvp, 'Differentiated promise and competitive moat'),
      csvRow('Strategic', 'Revenue Streams', businessModel, 'Founder-provided business model'),
      csvRow('Strategic', 'Cost Structure', String(reportData.costStructure ?? 'Not available'), 'Estimated cost drivers'),
      csvRow('Strategic', 'Key Channels', String(reportData.keyChannels ?? 'Not available'), 'Multi-channel acquisition strategy')
    )

    // Competitors
    const competitors = (Array.isArray(reportData.competitors) ? reportData.competitors : []) as Array<Record<string, unknown>>
    if (competitors.length > 0) {
      competitors.forEach((c, idx) => {
        const name = (c.name || `Competitor ${idx + 1}`) as string
        const weakness = (c.weakness || (Array.isArray(c.weaknesses) ? c.weaknesses.join('; ') : 'Not available')) as string
        const threat = (c.threat ?? c.pricing ?? 'Not available') as string
        rows.push(csvRow('Strategic', 'Competitors', name, `Threat: ${threat} | Weakness: ${weakness}`))
      })
    } else {
      rows.push(csvRow('Strategic', 'Competitors', 'Not available', 'No competitor data was saved'))
    }

    // Key Risks
    const keyRisks = (report.keyRisks as string[] | null) || []
    if (keyRisks.length > 0) {
      keyRisks.forEach((risk, idx) => {
        rows.push(csvRow('Strategic', 'Key Risks', `Risk ${idx + 1}`, risk))
      })
    } else {
      rows.push(csvRow('Strategic', 'Key Risks', 'Not available', 'No risk data was saved'))
    }

    // Recommended Next Steps / Action Plan
    const actionPlan = (Array.isArray(report.actionPlan) ? report.actionPlan : []) as Array<Record<string, unknown>>
    if (actionPlan.length > 0) {
      actionPlan.forEach((plan, idx) => {
        const stepName = (plan.timeframe || plan.week || `Step ${idx + 1}`) as string
        const actionText = (plan.action || JSON.stringify(plan)) as string
        const kpi = plan.kpi ? ` (KPI: ${String(plan.kpi)})` : ''
        rows.push(csvRow('Strategic', 'Recommended Next Steps', stepName, `${actionText}${kpi}`))
      })
    } else {
      const rec = (reportData.nextStepRecommendation ?? 'Not available') as string
      const rationale = (reportData.nextStepRationale ?? 'No next-step rationale was saved') as string
      rows.push(csvRow('Strategic', 'Recommended Next Steps', rec, rationale))
    }

    const csvContent = rows.join('\r\n')

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
              'Cache-Control': 'private, no-store',
        'Content-Disposition': `attachment; filename="validation-report-${reportId || report.id}.csv"`,
      },
    })
  } catch {
    return NextResponse.json({ error: 'Export could not be created. Please try again.' }, { status: 503 })
  }
}