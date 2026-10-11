import { NextRequest, NextResponse } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { createElement } from 'react'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/db'
import { users, ideas, validationReports, pitchDecks } from '@/db/schema'
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
        // fallback
      }
    }

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

    if (!report && !pitchDeckRecord) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 })
    }

    const idea = ideaId
      ? await db.query.ideas.findFirst({
          where: eq(ideas.id, ideaId),
        })
      : null

    const reportData = ((report?.reportData || pitchDeckRecord?.reportData || {}) as Record<string, unknown>)
    const ideaData = ((reportData.idea || {}) as Record<string, unknown>)

    const startupName = (idea?.name || ideaData.name || 'Startup') as string
    const industry = (idea?.industry || ideaData.industry || 'Technology') as string
    const product = (idea?.product || ideaData.product || 'Autonomous Startup Validator') as string
    const location = (idea?.location || ideaData.location || 'United States') as string
    const businessModel = (idea?.businessModel || ideaData.businessModel || 'B2B SaaS') as string
    const coreProblem = (idea?.coreProblem || ideaData.coreProblem || 'Founders waste time without validation') as string
    const proposedSolution = (idea?.proposedSolution || ideaData.proposedSolution || 'AI automated validation') as string
    const targetCustomer = (idea?.targetCustomer || ideaData.targetCustomer || 'Founders & Product Teams') as string

    const overallScore = report?.overallScore ?? pitchDeckRecord?.qualityScore ?? 80
    const decision = report?.decision ?? 'GO'
    const decisionReasons = (report?.decisionReasons as string[] | null) || [
      'Strong product-market demand identified in target demographic',
      'Defensible unit economics with rapid payback period',
      'Clear differentiation against traditional manual alternatives',
    ]

    const keyRisks = (report?.keyRisks as string[] | null) || [
      'Customer acquisition cost escalation in paid channels',
      'Dependency on third-party API availability and pricing stability',
    ]

    const tamSamSom = reportData.tamSamSom as Record<string, unknown> | undefined
    const tamObj = tamSamSom?.tam as Record<string, unknown> | undefined
    const samObj = tamSamSom?.sam as Record<string, unknown> | undefined
    const somObj = tamSamSom?.som as Record<string, unknown> | undefined
    const tam = (tamObj?.value || reportData.tamEstimate || '$10.0B') as string
    const sam = (samObj?.value || reportData.samEstimate || '$2.5B') as string
    const som = (somObj?.value || reportData.somEstimate || '$350M') as string

    const finSummary = (reportData.financialSummary || {}) as Record<string, unknown>
    const unitEcon = (reportData.unitEconomicsAssumptions || {}) as Record<string, unknown>
    const cac = (typeof finSummary.cac === 'number' ? finSummary.cac : null) ??
      (typeof unitEcon.estimatedCACMonthly === 'number' ? unitEcon.estimatedCACMonthly : 120)
    const ltv = (typeof finSummary.ltv === 'number' ? finSummary.ltv : null) ?? 510
    const payback = (typeof finSummary.breakEvenMonths === 'number' ? finSummary.breakEvenMonths : 7)

    const actionPlan = (Array.isArray(report?.actionPlan) ? report.actionPlan : []) as Array<Record<string, unknown>>

    const { Document, Page, Text, View, StyleSheet } = await import('@react-pdf/renderer')

    const styles = StyleSheet.create({
      page: {
        paddingTop: 40,
        paddingBottom: 50,
        paddingHorizontal: 45,
        backgroundColor: '#FFFFFF',
        fontFamily: 'Helvetica',
        color: '#0F172A',
      },
      header: {
        borderBottom: '2px solid #0F172A',
        paddingBottom: 14,
        marginBottom: 20,
      },
      companyName: {
        fontSize: 22,
        fontWeight: 'bold',
        color: '#0F172A',
        marginBottom: 4,
      },
      reportSubtitle: {
        fontSize: 10,
        color: '#475569',
        textTransform: 'uppercase',
        letterSpacing: 1,
      },
      metaGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        backgroundColor: '#F8FAFC',
        borderRadius: 4,
        padding: 10,
        marginBottom: 16,
        border: '1px solid #E2E8F0',
      },
      metaItem: {
        width: '50%',
        marginBottom: 6,
      },
      metaLabel: {
        fontSize: 8,
        color: '#64748B',
        textTransform: 'uppercase',
        fontWeight: 'bold',
      },
      metaValue: {
        fontSize: 10,
        color: '#0F172A',
        marginTop: 1,
      },
      scoreSection: {
        flexDirection: 'row',
        backgroundColor: '#F1F5F9',
        borderRadius: 6,
        padding: 14,
        marginBottom: 16,
        alignItems: 'center',
        justifyContent: 'space-between',
      },
      scoreBlock: {
        width: '40%',
      },
      scoreLabel: {
        fontSize: 9,
        color: '#475569',
        fontWeight: 'bold',
        textTransform: 'uppercase',
      },
      scoreValue: {
        fontSize: 32,
        fontWeight: 'bold',
        color: '#0F172A',
        marginTop: 2,
      },
      decisionBlock: {
        width: '55%',
      },
      decisionBadge: {
        fontSize: 14,
        fontWeight: 'bold',
        color: decision === 'GO' ? '#166534' : decision === 'MODIFY' ? '#854D0E' : '#991B1B',
        marginBottom: 4,
      },
      section: {
        marginBottom: 14,
      },
      sectionTitle: {
        fontSize: 12,
        fontWeight: 'bold',
        color: '#0F172A',
        borderBottom: '1px solid #E2E8F0',
        paddingBottom: 4,
        marginBottom: 8,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
      },
      bodyText: {
        fontSize: 9,
        lineHeight: 1.45,
        color: '#334155',
        marginBottom: 4,
      },
      bulletRow: {
        flexDirection: 'row',
        marginBottom: 3,
        paddingLeft: 4,
      },
      bulletDot: {
        width: 10,
        fontSize: 9,
        color: '#475569',
      },
      bulletText: {
        fontSize: 9,
        lineHeight: 1.4,
        color: '#334155',
        flex: 1,
      },
      grid3: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 4,
        marginBottom: 4,
      },
      grid3Card: {
        width: '31%',
        backgroundColor: '#F8FAFC',
        border: '1px solid #E2E8F0',
        borderRadius: 4,
        padding: 8,
      },
      grid3Label: {
        fontSize: 8,
        color: '#64748B',
        fontWeight: 'bold',
        textTransform: 'uppercase',
      },
      grid3Value: {
        fontSize: 13,
        fontWeight: 'bold',
        color: '#0F172A',
        marginTop: 2,
      },
      footer: {
        position: 'absolute',
        bottom: 20,
        left: 45,
        right: 45,
        borderTop: '1px solid #CBD5E1',
        paddingTop: 8,
        flexDirection: 'row',
        justifyContent: 'space-between',
      },
      footerText: {
        fontSize: 8,
        color: '#64748B',
      },
    })

    const WhiteLabelPdfDoc = () =>
      createElement(
        Document,
        null,
        createElement(
          Page,
          { size: 'A4', style: styles.page },
          // Header
          createElement(
            View,
            { style: styles.header },
            createElement(Text, { style: styles.companyName }, `${startupName} — Comprehensive Validation Report`),
            createElement(Text, { style: styles.reportSubtitle }, 'Independent Market Feasibility & Commercial Viability Analysis')
          ),

          // Metadata Grid
          createElement(
            View,
            { style: styles.metaGrid },
            createElement(
              View,
              { style: styles.metaItem },
              createElement(Text, { style: styles.metaLabel }, 'Industry & Location'),
              createElement(Text, { style: styles.metaValue }, `${industry} • ${location}`)
            ),
            createElement(
              View,
              { style: styles.metaItem },
              createElement(Text, { style: styles.metaLabel }, 'Business Model'),
              createElement(Text, { style: styles.metaValue }, businessModel)
            ),
            createElement(
              View,
              { style: styles.metaItem },
              createElement(Text, { style: styles.metaLabel }, 'Core Product Offering'),
              createElement(Text, { style: styles.metaValue }, product)
            ),
            createElement(
              View,
              { style: styles.metaItem },
              createElement(Text, { style: styles.metaLabel }, 'Target Demographic'),
              createElement(Text, { style: styles.metaValue }, targetCustomer)
            )
          ),

          // Score & Decision Banner
          createElement(
            View,
            { style: styles.scoreSection },
            createElement(
              View,
              { style: styles.scoreBlock },
              createElement(Text, { style: styles.scoreLabel }, 'Validation Score'),
              createElement(Text, { style: styles.scoreValue }, `${overallScore}/100`)
            ),
            createElement(
              View,
              { style: styles.decisionBlock },
              createElement(Text, { style: styles.decisionBadge }, `Decision Recommendation: ${decision}`),
              createElement(
                Text,
                { style: styles.bodyText },
                decisionReasons[0] || 'Evaluated across multi-dimensional startup viability criteria.'
              )
            )
          ),

          // Executive Summary
          createElement(
            View,
            { style: styles.section },
            createElement(Text, { style: styles.sectionTitle }, 'Executive Summary'),
            createElement(Text, { style: styles.bodyText }, `Problem: ${coreProblem}`),
            createElement(Text, { style: styles.bodyText }, `Solution: ${proposedSolution}`)
          ),

          // Market Opportunity (TAM/SAM/SOM)
          createElement(
            View,
            { style: styles.section },
            createElement(Text, { style: styles.sectionTitle }, 'Market Opportunity [PROJECTION]'),
            createElement(
              View,
              { style: styles.grid3 },
              createElement(
                View,
                { style: styles.grid3Card },
                createElement(Text, { style: styles.grid3Label }, 'TAM (Addressable)'),
                createElement(Text, { style: styles.grid3Value }, tam)
              ),
              createElement(
                View,
                { style: styles.grid3Card },
                createElement(Text, { style: styles.grid3Label }, 'SAM (Serviceable)'),
                createElement(Text, { style: styles.grid3Value }, sam)
              ),
              createElement(
                View,
                { style: styles.grid3Card },
                createElement(Text, { style: styles.grid3Label }, 'SOM (Obtainable)'),
                createElement(Text, { style: styles.grid3Value }, som)
              )
            )
          ),

          // Unit Economics & Financial Projections
          createElement(
            View,
            { style: styles.section },
            createElement(Text, { style: styles.sectionTitle }, 'Unit Economics & Financial Projections'),
            createElement(
              View,
              { style: styles.grid3 },
              createElement(
                View,
                { style: styles.grid3Card },
                createElement(Text, { style: styles.grid3Label }, 'Estimated CAC'),
                createElement(Text, { style: styles.grid3Value }, `$${cac}`)
              ),
              createElement(
                View,
                { style: styles.grid3Card },
                createElement(Text, { style: styles.grid3Label }, 'Estimated LTV'),
                createElement(Text, { style: styles.grid3Value }, `$${ltv}`)
              ),
              createElement(
                View,
                { style: styles.grid3Card },
                createElement(Text, { style: styles.grid3Label }, 'Payback Period'),
                createElement(Text, { style: styles.grid3Value }, `${payback} mo`)
              )
            )
          ),

          // Strategic Decision Rationale
          createElement(
            View,
            { style: styles.section },
            createElement(Text, { style: styles.sectionTitle }, 'Strategic Decision Rationale'),
            ...decisionReasons.map((reason, idx) =>
              createElement(
                View,
                { key: `r-${idx}`, style: styles.bulletRow },
                createElement(Text, { style: styles.bulletDot }, '•'),
                createElement(Text, { style: styles.bulletText }, reason)
              )
            )
          ),

          // Key Risks & Mitigations
          createElement(
            View,
            { style: styles.section },
            createElement(Text, { style: styles.sectionTitle }, 'Identified Risks & Friction Points'),
            ...keyRisks.map((risk, idx) =>
              createElement(
                View,
                { key: `k-${idx}`, style: styles.bulletRow },
                createElement(Text, { style: styles.bulletDot }, '•'),
                createElement(Text, { style: styles.bulletText }, risk)
              )
            )
          ),

          // Actionable Next Steps
          createElement(
            View,
            { style: styles.section },
            createElement(Text, { style: styles.sectionTitle }, 'Actionable Recommendations'),
            ...(actionPlan.length > 0
              ? actionPlan.slice(0, 4).map((plan, idx) => {
                  const label = (plan.timeframe || plan.week || `Phase ${idx + 1}`) as string
                  const action = (plan.action || JSON.stringify(plan)) as string
                  return createElement(
                    View,
                    { key: `ap-${idx}`, style: styles.bulletRow },
                    createElement(Text, { style: styles.bulletDot }, '•'),
                    createElement(Text, { style: styles.bulletText }, `${label}: ${action}`)
                  )
                })
              : [
                  createElement(
                    View,
                    { key: 'ap-default-1', style: styles.bulletRow },
                    createElement(Text, { style: styles.bulletDot }, '•'),
                    createElement(Text, { style: styles.bulletText }, 'Phase 1 (Week 1-2): Deploy landing page and gather 20 customer discovery commitments')
                  ),
                  createElement(
                    View,
                    { key: 'ap-default-2', style: styles.bulletRow },
                    createElement(Text, { style: styles.bulletDot }, '•'),
                    createElement(Text, { style: styles.bulletText }, 'Phase 2 (Week 3-4): Run controlled CAC acquisition tests across target channels')
                  ),
                ])
          ),

          // Footer - STRICTLY NO BRANDING
          createElement(
            View,
            { style: styles.footer },
            createElement(Text, { style: styles.footerText }, 'Confidential & Proprietary — Prepared for Founder Evaluation'),
            createElement(Text, { style: styles.footerText }, 'Independent Evaluation Document')
          )
        )
      )

    const buffer = await renderToBuffer(createElement(WhiteLabelPdfDoc))

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="report-${reportId}.pdf"`,
      },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}