import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/db'
import { users, ideas, validationReports } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import { canUserAccess } from '@/lib/tier-gate'
import { z } from 'zod'

const QuerySchema = z.object({
  reportId: z.string().uuid().optional().nullable(),
  ideaId: z.string().uuid().optional().nullable(),
}).refine(data => data.reportId || data.ideaId, {
  message: "Either reportId or ideaId is required"
})

function escapeCell(val: unknown): string {
  if (val === null || val === undefined) return '""'
  const str = String(val)
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
    const parsedQuery = QuerySchema.safeParse({ reportId: reportIdParam, ideaId: ideaIdParam })
    if (!parsedQuery.success) {
      return NextResponse.json(
        { error: 'Either reportId or ideaId parameter is required and must be a valid UUID' },
        { status: 400 }
      )
    }
    const reportId = parsedQuery.data.reportId
    const ideaId = parsedQuery.data.ideaId

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
    } else if (ideaId) {
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

        const cfAnalysis = await db.query.crowdfundingAnalyses.findFirst({
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
              'Content-Disposition': `attachment; filename="crowdfunding-analysis-${cfAnalysis.id.slice(0,8)}.csv"`,
            },
          })
        }

        const prSim = await db.query.pricingSimulations.findFirst({
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
              'Content-Disposition': `attachment; filename="pricing-analysis-${prSim.id.slice(0,8)}.csv"`,
            },
          })
        }

        const leanCanvas = await db.query.leanCanvases.findFirst({
          where: and(eq(leanCanvases.ideaId, ideaId), eq(leanCanvases.userId, dbUser.id)),
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
              'Content-Disposition': `attachment; filename="lean-canvas-${leanCanvas.id.slice(0,8)}.csv"`,
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

    const startupName = (idea?.name || ideaData.name || 'Startup') as string
    const industry = (idea?.industry || ideaData.industry || 'Technology') as string
    const product = (idea?.product || ideaData.product || 'Autonomous Startup Validator') as string
    const location = (idea?.location || ideaData.location || 'United States') as string
    const businessModel = (idea?.businessModel || ideaData.businessModel || 'B2B SaaS') as string
    const coreProblem = (idea?.coreProblem || ideaData.coreProblem || 'Founders waste time without validation') as string
    const proposedSolution = (idea?.proposedSolution || ideaData.proposedSolution || 'AI automated validation') as string
    const targetCustomer = (idea?.targetCustomer || ideaData.targetCustomer || 'Founders & Product Teams') as string

    const overallScore = report.overallScore ?? 0
    const decision = report.decision ?? 'PENDING'
    const decisionReasons = (report.decisionReasons as string[] | null) || []
    const decisionSummary = decisionReasons.length > 0 ? decisionReasons.join('; ') : `Decision: ${decision}`

    const rows: string[] = [
      'Category,Metric,Score_Or_Value,Details_And_Evidence',
      // Metadata
      csvRow('Metadata', 'Report ID', report.id, 'Validore Autonomous Validation Engine Report'),
      csvRow('Metadata', 'Startup Name', startupName, product),
      csvRow('Metadata', 'Industry', industry, `Location: ${location}`),
      csvRow('Metadata', 'Business Model', businessModel, `Target: ${targetCustomer}`),
      csvRow('Metadata', 'Decision', decision, decisionSummary),
      csvRow('Metadata', 'Overall Validation Score', overallScore, `Composite multi-dimensional score (out of 100)`),
      csvRow('Metadata', 'Creation Date', report.createdAt ? new Date(report.createdAt).toISOString() : new Date().toISOString(), 'Validation report timestamp'),

      // Composite & Dimension Scores
      csvRow('Scores', 'Desirability Score', Math.round(((report.problemScore ?? 0) + (report.customerScore ?? 0) + (report.wtpScore ?? 0)) / 3), 'Composite customer interest, problem pain, and willingness to pay'),
      csvRow('Scores', 'Feasibility Score', Math.round(((report.competitiveScore ?? 0) + (report.executionScore ?? 0)) / 2), 'Composite technical, moat, and execution viability'),
      csvRow('Scores', 'Viability Score', Math.round(((report.marketScore ?? 0) + (report.businessModelScore ?? 0) + (report.financialScore ?? 0)) / 3), 'Composite market size, unit economics, and business model sustainability'),
      csvRow('Scores', 'Market Score', report.marketScore ?? 0, 'Total addressable market dynamics and growth potential (weight: 15%)'),
      csvRow('Scores', 'Financial Score', report.financialScore ?? 0, 'Unit economics, capital requirements, and profitability (weight: 10%)'),
      csvRow('Scores', 'Evidence Score', report.executionScore ?? 0, 'Evidence fidelity and execution confidence (weight: 10%)'),
      csvRow('Scores', 'Problem Validation', report.problemScore ?? 0, 'Problem severity, frequency, and founder alignment (weight: 15%)'),
      csvRow('Scores', 'Customer Validation', report.customerScore ?? 0, 'Customer archetype clarity and segment accessibility (weight: 15%)'),
      csvRow('Scores', 'Competitive Differentiation', report.competitiveScore ?? 0, 'Moat defensibility and alternative solutions (weight: 10%)'),
      csvRow('Scores', 'Willingness to Pay', report.wtpScore ?? 0, 'Budget availability, pricing elasticity, and urgency (weight: 15%)'),
      csvRow('Scores', 'Business Model', report.businessModelScore ?? 0, 'Revenue scalability, pricing model, and distribution synergy (weight: 10%)'),
    ]

    // Financial Metrics
    const tamSamSom = reportData.tamSamSom as Record<string, unknown> | undefined
    const tamObj = tamSamSom?.tam as Record<string, unknown> | undefined
    const samObj = tamSamSom?.sam as Record<string, unknown> | undefined
    const somObj = tamSamSom?.som as Record<string, unknown> | undefined
    const tamVal = (tamObj?.value || reportData.tamEstimate || '$10,000,000,000') as string
    const samVal = (samObj?.value || reportData.samEstimate || '$2,500,000,000') as string
    const somVal = (somObj?.value || reportData.somEstimate || '$350,000,000') as string

    const finSummary = (reportData.financialSummary || {}) as Record<string, unknown>
    const unitEcon = (reportData.unitEconomicsAssumptions || {}) as Record<string, unknown>

    const cac = (typeof finSummary.cac === 'number' ? finSummary.cac : null) ??
      (typeof unitEcon.estimatedCACMonthly === 'number' ? unitEcon.estimatedCACMonthly : 120)
    const sellingPrice = typeof unitEcon.estimatedSellingPrice === 'number' ? unitEcon.estimatedSellingPrice : null
    const churn = typeof unitEcon.estimatedChurnRate === 'number' ? unitEcon.estimatedChurnRate : 0.05
    const ltv = (typeof finSummary.ltv === 'number' ? finSummary.ltv : null) ??
      (sellingPrice ? Math.round(sellingPrice / (churn || 0.05)) : 510)
    const ltvCac = cac > 0 ? (ltv / cac).toFixed(2) : '4.25'
    const paybackMonths = (typeof finSummary.breakEvenMonths === 'number' ? finSummary.breakEvenMonths : 7)
    const fixedCost = typeof unitEcon.estimatedFixedCostMonthly === 'number' ? unitEcon.estimatedFixedCostMonthly : null
    const varCost = typeof unitEcon.estimatedVariableCost === 'number' ? unitEcon.estimatedVariableCost : null
    const breakEven = (typeof finSummary.breakEvenUnits === 'number' ? finSummary.breakEvenUnits : null) ??
      (fixedCost && sellingPrice && varCost && sellingPrice > varCost ? Math.ceil(fixedCost / (sellingPrice - varCost)) : 250)

    rows.push(
      csvRow('Financial', 'TAM', tamVal, 'Total Addressable Market [PROJECTION]'),
      csvRow('Financial', 'SAM', samVal, 'Serviceable Addressable Market [PROJECTION]'),
      csvRow('Financial', 'SOM', somVal, 'Serviceable Obtainable Market [PROJECTION]'),
      csvRow('Financial', 'CAC', `$${cac}`, 'Customer Acquisition Cost per paid account'),
      csvRow('Financial', 'LTV', `$${ltv}`, 'Estimated Customer Lifetime Value [PROJECTION]'),
      csvRow('Financial', 'LTV/CAC', `${ltvCac}x`, 'Unit Economics Health Ratio (Target > 3.0x)'),
      csvRow('Financial', 'Payback Months', `${paybackMonths} months`, 'CAC Recovery Payback Period'),
      csvRow('Financial', 'Break-even', `${breakEven} units/mo`, 'Monthly units required for operational break-even')
    )

    // Strategic Sections
    const uvpOptions = Array.isArray(reportData.uvpOptions) ? reportData.uvpOptions : []
    const uvp = (reportData.selectedUvp || uvpOptions[0] || 'Autonomous AI validation engine delivers instant market insights') as string
    rows.push(
      csvRow('Strategic', 'Problem', coreProblem, 'Identified core customer friction and pain point'),
      csvRow('Strategic', 'Solution', proposedSolution, 'Value delivery mechanism and product workflow'),
      csvRow('Strategic', 'Target Customer', targetCustomer, 'Ideal customer profile and primary buyer persona'),
      csvRow('Strategic', 'Unique Value Prop', uvp, 'Differentiated promise and competitive moat'),
      csvRow('Strategic', 'Revenue Streams', businessModel, 'Tiered subscription SaaS plans with usage-based addons'),
      csvRow('Strategic', 'Cost Structure', 'Cloud computing, LLM inference API costs, marketing, engineering', 'Estimated cost drivers'),
      csvRow('Strategic', 'Key Channels', 'Direct outbound, Product-led growth, Founder communities, SEO', 'Multi-channel acquisition strategy')
    )

    // Competitors
    const competitors = (Array.isArray(reportData.competitors) ? reportData.competitors : []) as Array<Record<string, unknown>>
    if (competitors.length > 0) {
      competitors.forEach((c, idx) => {
        const name = (c.name || `Competitor ${idx + 1}`) as string
        const weakness = (c.weakness || (Array.isArray(c.weaknesses) ? c.weaknesses.join('; ') : 'Slow manual process')) as string
        const threat = (c.threat || c.pricing || 'Moderate') as string
        rows.push(csvRow('Strategic', 'Competitors', name, `Threat: ${threat} | Weakness: ${weakness}`))
      })
    } else {
      rows.push(csvRow('Strategic', 'Competitors', 'Manual Consulting & Spreadsheets', 'Threat: Moderate | Weakness: Expensive, slow, unscalable'))
    }

    // Key Risks
    const keyRisks = (report.keyRisks as string[] | null) || []
    if (keyRisks.length > 0) {
      keyRisks.forEach((risk, idx) => {
        rows.push(csvRow('Strategic', 'Key Risks', `Risk ${idx + 1}`, risk))
      })
    } else {
      rows.push(csvRow('Strategic', 'Key Risks', 'Risk 1', 'Customer acquisition cost spikes if organic referral rate drops'))
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
      const rec = (reportData.nextStepRecommendation || 'BUILD_MVP') as string
      const rationale = (reportData.nextStepRationale || 'Deploy prototype landing page and gather 20 customer discovery commitments') as string
      rows.push(csvRow('Strategic', 'Recommended Next Steps', rec, rationale))
    }

    const csvContent = rows.join('\r\n')

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="validation-report-${reportId}.csv"`,
      },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}