import { NextRequest, NextResponse } from 'next/server'
import PptxGenJS from 'pptxgenjs'
import { createClient } from '@/lib/supabase/server'
import { getOrCreateDbUser } from '@/lib/auth-sync'
import { db } from '@/db'
import { ideas, pitchDecks, validationReports, crowdfundingAnalyses, pricingSimulations } from '@/db/schema'
import { eq, and, desc } from 'drizzle-orm'
import { getUserWithTierConfig } from '@/lib/tier-gate'
import { z } from 'zod'
import { buildReportDocument } from '@/lib/exports/document'
import { savedExportIdea } from '@/lib/exports/idea-context'

const PptxQuerySchema = z.object({
  ideaId: z.string().uuid().optional(),
  deckId: z.string().uuid().optional(),
  reportId: z.string().uuid().optional(),
  simulationId: z.uuid().optional(),
  analysisId: z.uuid().optional(),
  deckType: z.enum(['validation', 'pitch', 'crowdfunding', 'pricing']).optional().default('pitch'),
}).refine(data => Boolean(data.ideaId || data.deckId || data.reportId || data.simulationId || data.analysisId) && [data.reportId, data.deckId, data.simulationId, data.analysisId].filter(Boolean).length <= 1 && (!data.deckId || data.deckType === 'pitch') && (!data.simulationId || data.deckType === 'pricing') && (!data.analysisId || data.deckType === 'crowdfunding'), {
  message: 'Either ideaId, deckId, or reportId must be provided',
})

interface SlideData {
  title: string
  slideNumber?: number
  headline?: string
  content?: string
  keyPoints?: string[]
  speakerNotes?: string
  dataLabel?: string
  sourceUrls?: string[]
  sourceList?: boolean
}

const objectValue = (value: unknown): Record<string, any> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {}
const numericText = (value: unknown, suffix = '') => typeof value === 'number' && Number.isFinite(value)
  ? new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value) + suffix : 'Not established'
const scoreText = (value: unknown) => typeof value === 'number' && value >= 0 && value <= 100 ? numericText(value, '/100') : 'Not established'
const currencyText = (value: unknown) => typeof value === 'string' && /^[A-Z]{3}$/.test(value) ? value : null
const monetaryText = (value: unknown, currency: string | null) => typeof value === 'number' && Number.isFinite(value)
  ? currency ? currency + ' ' + numericText(value) : numericText(value) + ' (currency not recorded)' : 'Not established'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const ideaIdParam = searchParams.get('ideaId') || undefined
    const deckIdParam = searchParams.get('deckId') || undefined
    const reportIdParam = searchParams.get('reportId') || undefined
    const simulationIdParam = searchParams.get('simulationId') || undefined
    const analysisIdParam = searchParams.get('analysisId') || undefined
    const deckTypeParam = searchParams.get('deckType') || (simulationIdParam ? 'pricing' : analysisIdParam ? 'crowdfunding' : reportIdParam ? 'validation' : 'pitch')

    const parsedQuery = PptxQuerySchema.safeParse({
      ideaId: ideaIdParam,
      deckId: deckIdParam,
      reportId: reportIdParam,
      simulationId: simulationIdParam,
      analysisId: analysisIdParam,
      deckType: deckTypeParam,
    })

    if (!parsedQuery.success) {
      return NextResponse.json(
        { error: 'Either ideaId or deckId must be provided and must be valid UUIDs' },
        { status: 400 }
      )
    }

    const { ideaId, deckId, reportId, simulationId, analysisId } = parsedQuery.data

    const dbUser = await getOrCreateDbUser(user)

    if (!dbUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    let pitchDeckRecord = null
    let ideaRecord = null
    let reportRecord: any = null

    if (deckTypeParam === 'pricing') {
      const reference = simulationId || reportId
      reportRecord = await db.query.pricingSimulations.findFirst({
        where: and(eq(pricingSimulations.userId, dbUser.id), reference ? eq(pricingSimulations.id, reference) : eq(pricingSimulations.ideaId, ideaId!), ideaId ? eq(pricingSimulations.ideaId, ideaId) : undefined),
        orderBy: [desc(pricingSimulations.createdAt)],
      })
    } else if (deckTypeParam === 'crowdfunding') {
      const reference = analysisId || reportId
      reportRecord = await db.query.crowdfundingAnalyses.findFirst({
        where: and(eq(crowdfundingAnalyses.userId, dbUser.id), reference ? eq(crowdfundingAnalyses.id, reference) : eq(crowdfundingAnalyses.ideaId, ideaId!), ideaId ? eq(crowdfundingAnalyses.ideaId, ideaId) : undefined),
        orderBy: [desc(crowdfundingAnalyses.createdAt)],
      })
    } else if (deckTypeParam === 'validation' || reportId) {
      reportRecord = await db.query.validationReports.findFirst({
        where: and(eq(validationReports.userId, dbUser.id), reportId ? eq(validationReports.id, reportId) : eq(validationReports.ideaId, ideaId!), ideaId ? eq(validationReports.ideaId, ideaId) : undefined),
        orderBy: [desc(validationReports.createdAt)],
      })
    } else if (deckId) {
      pitchDeckRecord = await db.query.pitchDecks.findFirst({
        where: and(eq(pitchDecks.id, deckId), eq(pitchDecks.userId, dbUser.id), ideaId ? eq(pitchDecks.ideaId, ideaId) : undefined),
      })
    } else if (ideaId) {
      pitchDeckRecord = await db.query.pitchDecks.findFirst({
        where: and(eq(pitchDecks.ideaId, ideaId), eq(pitchDecks.userId, dbUser.id)),
        orderBy: [desc(pitchDecks.createdAt)],
      })
    }
    const source = reportRecord || pitchDeckRecord
    if (source && source.userId !== dbUser.id) return NextResponse.json({ error: 'Report not found' }, { status: 404 })
    if (source) {
      ideaRecord = await db.query.ideas.findFirst({
        where: and(eq(ideas.id, source.ideaId), eq(ideas.userId, dbUser.id)),
      })
    }

    if (!pitchDeckRecord && !ideaRecord && !reportRecord) {
      return NextResponse.json(
        { error: 'Pitch deck or idea not found' },
        { status: 404 }
      )
    }

    const userTier = await getUserWithTierConfig(user.id)
    if (!userTier?.config?.canExportPptx && !pitchDeckRecord) {
      return NextResponse.json({ error: 'PPTX export requires Max tier or an owned pitch deck' }, { status: 403 })
    }

    const exportIdea = savedExportIdea(source ?? {}, ideaRecord ?? null)
    const startupName = typeof exportIdea?.name === 'string' && exportIdea.name.trim() ? exportIdea.name : 'Venture'
    const product = typeof exportIdea?.product === 'string' ? exportIdea.product : 'Product details not supplied'
    const businessModel = typeof exportIdea?.businessModel === 'string' ? exportIdea.businessModel : 'Business model not supplied'
    const coreProblem = typeof exportIdea?.coreProblem === 'string' ? exportIdea.coreProblem : 'Problem evidence not supplied'

    // PPTX Setup
    const pptx = new PptxGenJS()
    pptx.layout = 'LAYOUT_WIDE'
    pptx.author = 'Validore'
    pptx.company = startupName
    pptx.title = `${startupName} Investor Pitch Deck`

    // Extract or build slides
    const rawSlides = (Array.isArray(pitchDeckRecord?.slides) ? [...pitchDeckRecord.slides] : []) as SlideData[]
    
    if (deckTypeParam === 'validation' && reportRecord) {
      const data = (reportRecord.reportData as Record<string, unknown>) || {};
      const score = typeof reportRecord.overallScore === 'number' && Number.isFinite(reportRecord.overallScore) && reportRecord.overallScore >= 0 && reportRecord.overallScore <= 100
        ? `${reportRecord.overallScore}/100` : 'Not established';
      
      const formatPoints = (arr: unknown) => Array.isArray(arr) ? arr.map(a => typeof a === 'string' ? a : JSON.stringify(a)) : [];
      
      const validationSlides: SlideData[] = [
        { title: 'Validation Report', headline: `Validation Score: ${score}`, content: startupName },
        { title: 'Problem & Market', headline: coreProblem, keyPoints: [`TAM: ${(data.tamSamSom as Record<string,any>)?.tam?.value || 'Not established'}`, `SAM: ${(data.tamSamSom as Record<string,any>)?.sam?.value || 'Not established'}`] },
        { title: 'Customer Personas', headline: 'Target Audience', keyPoints: formatPoints((data.personas as any[])?.map(p => p.name + ' - ' + (p.problems?.[0]||''))) },
        { title: 'Value Proposition', headline: (data.selectedUvp as string) || 'UVP', content: 'Jobs to be done: ' + ((data.customerJPG as Record<string,any>)?.jobs?.join(', ') || '') },
        { title: 'Competitor Landscape', headline: 'Alternatives and positioning', keyPoints: formatPoints((data.competitorPositioning as any[])?.map(c => c.name)) },
        { title: 'Business Model', headline: businessModel, keyPoints: formatPoints((data.pestleAnalysis as Record<string,any>)?.economic) },
        { title: 'SWOT Analysis', headline: 'Strengths & Weaknesses', keyPoints: [...formatPoints((data.swot as Record<string,any>)?.strengths), ...formatPoints((data.swot as Record<string,any>)?.weaknesses)] },
        { title: 'Risk Register', headline: 'Key Risks', keyPoints: Array.isArray(data.riskRegister) && data.riskRegister.length
          ? formatPoints(data.riskRegister.map(r => r.risk + ' - ' + r.mitigation)) : formatPoints(reportRecord.keyRisks ?? data.keyRisks) },
        { title: 'Experiment Plan', headline: 'Next tests and decisions', keyPoints: formatPoints((data.actionPlan as any[])?.map(a => [a.week, a.action].filter(Boolean).join(': '))) },
        { title: 'Recommendation', headline: (data.nextStepRecommendation as string) || 'Next Steps', content: (data.nextStepRationale as string) || '' },
      ];
      rawSlides.push(...validationSlides);
    } else if (deckTypeParam === 'crowdfunding' && reportRecord) {
      const saved = objectValue(reportRecord.reportData)
      const data = objectValue(saved.ai ?? saved.aiAnalysis)
      const computed = objectValue(saved.computedMetrics)
      const currency = currencyText(objectValue(saved.calculationAssumptions).currency) ?? currencyText(objectValue(saved.inputs).currency)
      const baseScenario = objectValue(objectValue(saved.scenarios ?? data.scenarios).base)
      const band = reportRecord.recommendation || reportRecord.classificationBand || ''
      const formatPoints = (arr: unknown) => Array.isArray(arr) ? arr.map((a: unknown) => typeof a === 'string' ? a : JSON.stringify(a)) : [];

      const crowdfundingSlides: SlideData[] = [
        { title: 'Crowdfunding Assessment', headline: `Readiness: ${scoreText(reportRecord.performanceScore)}`, content: [startupName, band].filter(Boolean).join(' · ') },
        { title: 'Campaign Targets', headline: 'Proposed launch targets', keyPoints: [`First 24h target: ${monetaryText(data.firstDayTarget, currency)}`, `First week target: ${monetaryText(data.firstWeekTarget, currency)}`], dataLabel: 'PROPOSED STRATEGY — targets are not observed funding' },
        { title: 'Competitor Analysis', headline: 'Campaign Benchmarks', keyPoints: formatPoints((data as any).keyStrengths) },
        { title: 'Reward Structure', headline: 'Tier Economics', keyPoints: (data.rewardEconomics || []).map((r: any) => `${r.tier}: cost ${monetaryText(r.cost, currency)}; pledge ${monetaryText(r.revenue, currency)}; return on entered costs ${numericText(r.roi, '%')}`), dataLabel: 'ASSUMPTION — confirm costs before promising rewards' },
        { title: 'Backer Segments', headline: 'Audience Breakdown', keyPoints: ((data as any).backerSegments || []).map((b: any) => `${b.segment} (${b.percentage}%): ${b.motivation}`) },
        { title: 'Marketing Strategy', headline: 'Funnel & Channels', keyPoints: [...((data as any).marketingFunnel?.awareness?.channels || []), ...((data as any).marketingFunnel?.consideration?.tactics || [])] },
        { title: 'Campaign Story', headline: 'Story Scorecard', keyPoints: [`Problem clarity: ${numericText(data.campaignStoryScorecard?.problemClarity, '/10')}`, `Solution clarity: ${numericText(data.campaignStoryScorecard?.solutionCompelling, '/10')}`] },
        { title: 'Financial Projections', headline: 'Funding Scenarios', keyPoints: [`Base scenario: ${numericText(baseScenario.fundingPercent, '% of goal')}`, `Base pledges: ${monetaryText(baseScenario.amountRaised, currency)}`, `Base collected: ${monetaryText(baseScenario.collected, currency)}`, `Required backers: ${numericText(computed.requiredBackers)}`], dataLabel: 'ASSUMPTION — saved scenario, not a funding probability' },
        { title: 'Risk Register', headline: 'Key Campaign Risks', keyPoints: ((data as any).riskRegister || []).map((r: any) => `${r.risk} (${r.riskLevel}) - ${r.mitigation}`) },
        { title: 'Action Plan', headline: '30-Day Pre-Launch', keyPoints: ((data as any).thirtyDayPrelaunchPlan || []).map((p: any) => `${/^\d+$/.test(String(p.week)) ? 'Week ' : ''}${p.week}: ${p.activity}`) }
      ]
      rawSlides.push(...crowdfundingSlides);
    } else if (deckTypeParam === 'pricing' && reportRecord) {
      const data = (reportRecord.reportData as Record<string, unknown>)?.aiAnalysis || {}
      const computed = (reportRecord.reportData as Record<string, unknown>)?.computedMetrics || {}
      const score = scoreText(reportRecord.pricingScore)

      const pricingSlides: SlideData[] = [
        { title: 'Pricing Strategy', headline: `Score: ${score}`, content: startupName },
        { title: 'Customer WTP', headline: 'Willingness to Pay', keyPoints: [`Van Westendorp Range: ${(data as any).vanWestendorpInsights?.acceptableRange || 'N/A'}`] },
        { title: 'Customer Value Analysis', headline: 'Value Drivers', content: (data as any).customerValueAnalysis as string || '' },
        { title: 'Competitor Pricing', headline: 'Market Landscape', keyPoints: ((data as any).competitorPrices || []).map((c: any) => `${c.name}: ${c.price}`) },
        { title: 'Recommended Price', headline: 'Price hypothesis to test', content: (data as any).recommendedPriceToTest as string || '' },
        { title: 'Financial Impact', headline: 'Economics', keyPoints: [`LTV/CAC: ${numericText((computed as any).ltvCacRatio)}`, `Break-even: ${numericText((computed as any).breakEvenUnits, ' units')}`] },
        { title: 'Validation Plan', headline: '30-Day Testing', keyPoints: ((data as any).thirtyDayValidationPlan || []).map((p: any) => `${p.week}: ${p.activity}`) },
        { title: 'Risk Register', headline: 'Key Pricing Risks', keyPoints: ((data as any).riskRegister || []).map((r: any) => `${r.risk} - ${r.mitigation}`) },
        { title: 'Price Elasticity', headline: 'Volume Impact', content: (data as any).priceElasticity?.interpretation as string || '' },
        { title: 'Psychological Pricing', headline: 'Positioning Tactics', keyPoints: ((data as any).psychologicalPricing || []).map((p: any) => `${p.technique}: ${p.recommendedUse}`) },
      ]
      rawSlides.push(...pricingSlides);
    }

    if (!rawSlides.length) return NextResponse.json({ error: 'Generate a report or pitch deck before exporting.' }, { status: 404 })
    for (const slide of rawSlides) {
      if (!slide.content?.trim() && !slide.keyPoints?.some(point => point.trim())) {
        slide.content = 'This section is not available in the saved report. Review the research notes before presenting.'
      }
    }
    const document = buildReportDocument(source, exportIdea, pitchDeckRecord ? 'pitch' : deckTypeParam)
    if (document.partial) {
      rawSlides[0].dataLabel = 'PARTIAL ANALYSIS — review missing evidence before relying on the score'
    }
    // Slides remain a concise presentation. The exact saved research, source
    // excerpts, financial scenarios and experiment criteria travel with the deck.
    rawSlides.push({ title: 'Complete saved analysis', headline: 'Research and experiment details',
      content: 'Open this slide’s speaker notes for the complete saved findings, evidence limits and next steps.',
      dataLabel: document.partial ? 'PARTIAL ANALYSIS — unreviewed criteria are not a business failure' : 'AI-assisted decision support — review evidence and test assumptions',
      speakerNotes: [document.partial ? 'Partial analysis. Some research remains incomplete.' : '',
        ...document.sections.map(section => `${section.title}\n${section.lines.map(line => line.text).join('\n')}`)].filter(Boolean).join('\n\n') })
    const recordData = (pitchDeckRecord?.reportData || reportRecord?.reportData || {}) as Record<string, unknown>
    const sourceRegister = Array.isArray(recordData.researchSources) ? recordData.researchSources as Array<{ title?: string; url?: string }> : []
    for (let index = 0; index < sourceRegister.length; index += 4) {
      rawSlides.push({ title: 'Research source register', headline: 'Evidence to review', sourceList: true, dataLabel: 'RETRIEVED SOURCES — relevance must be reviewed',
        keyPoints: sourceRegister.slice(index, index + 4).map(source => `${source.title || 'Source'} — ${source.url || 'URL unavailable'}`),
        speakerNotes: 'Retrieved sources establish provenance, not proof of the startup claims. Review the original source before presenting.' })
    }
    const slidesToRender = rawSlides.flatMap((raw, index) => {
      const points = raw.keyPoints || []
      const notes = [raw.speakerNotes, raw.dataLabel ? `Evidence status: ${raw.dataLabel}` : '',
        raw.content ? `Full slide content: ${raw.content}` : '', points.length ? `Full key points:\n${points.join('\n')}` : '',
        raw.sourceUrls?.length ? `Sources:\n${raw.sourceUrls.join('\n')}` : ''].filter(Boolean).join('\n\n')
      const groups = Math.max(1, Math.ceil(points.length / 6))
      return Array.from({ length: groups }, (_, group) => ({ ...raw,
        title: (raw.title + (group ? ' (continued)' : '')).slice(0, 110),
        headline: (raw.headline || raw.title).slice(0, index === 0 ? 80 : 110),
        content: raw.content ? raw.content.slice(0, 220) + (raw.content.length > 220 ? '… Full text in speaker notes.' : '') : undefined,
        keyPoints: points.slice(group * 6, group * 6 + 6).map(point => {
          const visible = point.replace(/\s+/g, ' ').trim()
          const limit = raw.sourceList ? 180 : 220
          return visible.length > limit ? visible.slice(0, limit - 20) + '… (see notes)' : visible
        }),
        speakerNotes: notes,
      }))
    })

    // Render each slide
    slidesToRender.forEach((s, idx) => {
      const slide = pptx.addSlide()
      const isCover = idx === 0

      if (isCover) {
        // Cover Slide
        slide.background = { color: '141923' }

        slide.addText(s.headline || startupName, {
          x: 1.0,
          y: 1.8,
          w: 11.3,
          h: 1.2,
          fontSize: 44,
          bold: true,
          color: 'E0A526',
          fontFace: 'Geist Sans',
        })

        slide.addText(s.content || product, {
          x: 1.0,
          y: 3.1,
          w: 11.3,
          h: 0.8,
          fontSize: 22,
          color: 'FFFFFF',
          fontFace: 'Geist Sans',
        })

        const coverBullets = (s.keyPoints || []).join('\n')
        if (coverBullets) {
          slide.addText(coverBullets, {
            x: 1.0,
            y: 4.2,
            w: 11.3,
            h: 1.8,
            fontSize: 14,
            color: '657081',
            fontFace: 'Geist Sans',
            lineSpacing: 22,
          })
        }
      } else {
        // Content Slide
        slide.background = { color: 'FAFAF7' }

        // Slide Header Banner
        slide.addText(s.title.toUpperCase(), {
          x: 0.8,
          y: 0.5,
          w: 11.5,
          h: 0.4,
          fontSize: 11,
          bold: true,
          color: 'E0A526',
          fontFace: 'Geist Sans',
        })

        slide.addText(s.headline || s.title, {
          x: 0.8,
          y: 0.9,
          w: 11.5,
          h: 0.8,
          fontSize: 26,
          bold: true,
          color: '141923',
          fontFace: 'Geist Sans',
        })

        // Content Subtitle / Summary
        if (s.content) {
          slide.addText(s.content, {
            x: 0.8,
            y: 1.8,
            w: 11.5,
            h: 0.7,
            fontSize: 15,
            color: '475569',
            fontFace: 'Geist Sans',
          })
        }

        // Key Points / Bullets
        const points = s.keyPoints || []
        if (points.length > 0) {
          const bulletItems = points.map((pt) => ({
            text: pt,
            options: {
              bullet: true,
              fontSize: 14,
              color: '1E293B',
              lineSpacing: s.sourceList ? 22 : 26,
            },
          }))

          slide.addText(bulletItems, {
            x: 0.8,
            y: 2.7,
            w: 11.5,
            h: s.sourceList ? 3.4 : 3.8,
            fontFace: 'Geist Sans',
          })
        }

        // Slide Footer
        slide.addText(`${startupName} • Confidential Investor Presentation`, {
          x: 0.8,
          y: 6.8,
          w: 9.0,
          h: 0.3,
          fontSize: 9,
          color: '657081',
          fontFace: 'Geist Sans',
        })

        slide.addText(`${idx + 1} / ${slidesToRender.length}`, {
          x: 11.0,
          y: 6.8,
          w: 1.5,
          h: 0.3,
          fontSize: 9,
          color: '657081',
          align: 'right',
          fontFace: 'Geist Sans',
        })
      }

      if (s.dataLabel) slide.addText(s.dataLabel, { x: 0.8, y: 6.45, w: 11.5, h: 0.25, fontSize: 9, color: isCover ? 'F0C04E' : '89620B', fontFace: 'Geist Sans' })
      // Speaker Notes
      if (s.speakerNotes) {
        slide.addNotes(s.speakerNotes)
      }
    })

    const buffer = (await pptx.write({ outputType: 'nodebuffer' })) as Buffer
    const exportFileId = deckId || simulationId || analysisId || reportId || ideaId || 'presentation'

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'Content-Disposition': `attachment; filename="pitch-deck-${exportFileId}.pptx"`,
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (err: unknown) {
    console.error('PPTX Export Error:', err)
    console.error('[export] Failed', { name: err instanceof Error ? err.name : 'UnknownError' })
    return NextResponse.json({ error: 'Unable to export this report. Please try again.' }, { status: 500 })
  }
}
