import { NextRequest, NextResponse } from 'next/server'
import PptxGenJS from 'pptxgenjs'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/db'
import { users, ideas, pitchDecks, validationReports, crowdfundingAnalyses, leanCanvases, pricingSimulations } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import { getUserWithTierConfig } from '@/lib/tier-gate'
import { z } from 'zod'

const PptxQuerySchema = z.object({
  ideaId: z.string().uuid().optional(),
  deckId: z.string().uuid().optional(),
  reportId: z.string().uuid().optional(),
  deckType: z.enum(['validation', 'pitch', 'crowdfunding', 'pricing']).optional().default('pitch'),
}).refine(data => Boolean(data.ideaId || data.deckId || data.reportId), {
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
}

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
    const deckTypeParam = searchParams.get('deckType') || 'pitch'

    const parsedQuery = PptxQuerySchema.safeParse({
      ideaId: ideaIdParam,
      deckId: deckIdParam,
      reportId: reportIdParam,
      deckType: deckTypeParam,
    })

    if (!parsedQuery.success) {
      return NextResponse.json(
        { error: 'Either ideaId or deckId must be provided and must be valid UUIDs' },
        { status: 400 }
      )
    }

    const { ideaId, deckId, reportId } = parsedQuery.data

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

    // Tier / Credit check: canExportPptx (Max tier) OR dbUser.pitchDeckCredits > 0
    const userTier = await getUserWithTierConfig(user.id)
    const canExportPptx = Boolean(userTier?.config?.canExportPptx)
    const hasPitchCredits = dbUser.pitchDeckCredits > 0

    if (!canExportPptx && !hasPitchCredits) {
      return NextResponse.json(
        { error: 'PPTX export requires Max tier or pitch deck credits' },
        { status: 403 }
      )
    }

    let pitchDeckRecord = null
    let ideaRecord = null
    let reportRecord: any = null

    if (reportId) {
      if (deckTypeParam === 'crowdfunding') {
        reportRecord = await db.query.crowdfundingAnalyses.findFirst({
          where: and(eq(crowdfundingAnalyses.id, reportId), eq(crowdfundingAnalyses.userId, dbUser.id)),
        })
      } else if (deckTypeParam === 'pricing') {
        reportRecord = await db.query.pricingSimulations.findFirst({
          where: and(eq(pricingSimulations.id, reportId), eq(pricingSimulations.userId, dbUser.id)),
        })
      } else {
        reportRecord = await db.query.validationReports.findFirst({
          where: and(eq(validationReports.id, reportId), eq(validationReports.userId, dbUser.id)),
        })
      }
      if (reportRecord) {
        ideaRecord = await db.query.ideas.findFirst({
          where: eq(ideas.id, reportRecord.ideaId),
        })
      }
    } else if (deckId) {
      pitchDeckRecord = await db.query.pitchDecks.findFirst({
        where: and(eq(pitchDecks.id, deckId), eq(pitchDecks.userId, dbUser.id)),
      })
      if (pitchDeckRecord) {
        ideaRecord = await db.query.ideas.findFirst({
          where: eq(ideas.id, pitchDeckRecord.ideaId),
        })
      }
    } else if (ideaId) {
      pitchDeckRecord = await db.query.pitchDecks.findFirst({
        where: and(eq(pitchDecks.ideaId, ideaId), eq(pitchDecks.userId, dbUser.id)),
      })
      ideaRecord = await db.query.ideas.findFirst({
        where: and(eq(ideas.id, ideaId), eq(ideas.userId, dbUser.id)),
      })
    }

    if (!pitchDeckRecord && !ideaRecord && !reportRecord) {
      return NextResponse.json(
        { error: 'Pitch deck or idea not found' },
        { status: 404 }
      )
    }

    const startupName = ideaRecord?.name || 'Venture'
    const industry = ideaRecord?.industry || 'Technology / SaaS'
    const product = ideaRecord?.product || 'Autonomous Business Platform'
    const targetCustomer = ideaRecord?.targetCustomer || 'High-Growth Startups & Founders'
    const businessModel = ideaRecord?.businessModel || 'B2B Subscription SaaS'
    const coreProblem = ideaRecord?.coreProblem || 'Founders waste 6+ months building products without customer validation.'
    const proposedSolution = ideaRecord?.proposedSolution || 'AI-driven multi-agent simulations that stress-test business assumptions in 60 seconds.'

    // PPTX Setup
    const pptx = new PptxGenJS()
    pptx.layout = 'LAYOUT_16x9'
    pptx.author = 'Validore'
    pptx.company = startupName
    pptx.title = `${startupName} Investor Pitch Deck`

    // Extract or build slides
    const rawSlides = (Array.isArray(pitchDeckRecord?.slides) ? pitchDeckRecord.slides : []) as SlideData[]
    
    if (deckTypeParam === 'validation' && reportRecord) {
      const data = (reportRecord.reportData as Record<string, unknown>) || {};
      const score = reportRecord.overallScore || 0;
      
      const formatPoints = (arr: unknown) => Array.isArray(arr) ? arr.map(a => typeof a === 'string' ? a : JSON.stringify(a)) : [];
      
      const validationSlides: SlideData[] = [
        { title: 'Validation Report', headline: `Validation Score: ${score}/100`, content: startupName },
        { title: 'Problem & Market', headline: coreProblem, keyPoints: [`TAM: ${(data.tamSamSom as Record<string,any>)?.tam?.value || ''}`, `SAM: ${(data.tamSamSom as Record<string,any>)?.sam?.value || ''}`] },
        { title: 'Customer Personas', headline: 'Target Audience', keyPoints: formatPoints((data.personas as any[])?.map(p => p.name + ' - ' + (p.problems?.[0]||''))) },
        { title: 'Value Proposition', headline: (data.selectedUvp as string) || 'UVP', content: 'Jobs to be done: ' + ((data.customerJPG as Record<string,any>)?.jobs?.join(', ') || '') },
        { title: 'Competitor Landscape', headline: 'Positioning Map', keyPoints: formatPoints((data.competitorPositioning as any[])?.map(c => c.name)) },
        { title: 'Business Model', headline: businessModel, keyPoints: formatPoints((data.pestleAnalysis as Record<string,any>)?.economic) },
        { title: 'SWOT Analysis', headline: 'Strengths & Weaknesses', keyPoints: [...formatPoints((data.swot as Record<string,any>)?.strengths), ...formatPoints((data.swot as Record<string,any>)?.weaknesses)] },
        { title: 'Risk Register', headline: 'Key Risks', keyPoints: formatPoints((data.riskRegister as any[])?.map(r => r.risk + ' - ' + r.mitigation)) },
        { title: '30-Day Action Plan', headline: 'Next 30 Days', keyPoints: formatPoints((data.actionPlan as any[])?.map(a => a.action)) },
        { title: 'Recommendation', headline: (data.nextStepRecommendation as string) || 'Next Steps', content: (data.nextStepRationale as string) || '' },
      ];
      rawSlides.push(...validationSlides);
    } else if (deckTypeParam === 'crowdfunding' && reportRecord) {
      const data = (reportRecord.reportData as Record<string, unknown>)?.ai || {}
      const computed = (reportRecord.reportData as Record<string, unknown>)?.computedMetrics || {}
      const score = reportRecord.performanceScore || 0
      const band = reportRecord.classificationBand || ''
      const formatPoints = (arr: unknown) => Array.isArray(arr) ? arr.map((a: unknown) => typeof a === 'string' ? a : JSON.stringify(a)) : [];

      const crowdfundingSlides: SlideData[] = [
        { title: 'Crowdfunding Assessment', headline: `Score: ${score}/100 (${band})`, content: startupName },
        { title: 'Market Size & Benchmarks', headline: 'Category Analysis', keyPoints: [`First 24h Target: $${(data as any).firstDayTarget || 0}`, `First Week Target: $${(data as any).firstWeekTarget || 0}`] },
        { title: 'Competitor Analysis', headline: 'Campaign Benchmarks', keyPoints: formatPoints((data as any).keyStrengths) },
        { title: 'Reward Structure', headline: 'Tier Economics', keyPoints: ((data as any).rewardEconomics || []).map((r: any) => `${r.tier}: $${r.cost} Cost -> $${r.revenue} Rev (ROI: ${r.roi}%)`) },
        { title: 'Backer Segments', headline: 'Audience Breakdown', keyPoints: ((data as any).backerSegments || []).map((b: any) => `${b.segment} (${b.percentage}%): ${b.motivation}`) },
        { title: 'Marketing Strategy', headline: 'Funnel & Channels', keyPoints: [...((data as any).marketingFunnel?.awareness?.channels || []), ...((data as any).marketingFunnel?.consideration?.tactics || [])] },
        { title: 'Campaign Story', headline: 'Story Scorecard', keyPoints: [`Problem Clarity: ${(data as any).campaignStoryScorecard?.problemClarity || 0}/10`, `Solution Compelling: ${(data as any).campaignStoryScorecard?.solutionCompelling || 0}/10`] },
        { title: 'Financial Projections', headline: 'Funding Scenarios', keyPoints: [`Base Scenario: ${(data as any).scenarios?.base?.fundingPercent || 0}% Funded`, `Required Backers: ${(computed as any).requiredBackers || 0}`] },
        { title: 'Risk Register', headline: 'Key Campaign Risks', keyPoints: ((data as any).riskRegister || []).map((r: any) => `${r.risk} (${r.riskLevel}) - ${r.mitigation}`) },
        { title: 'Action Plan', headline: '30-Day Pre-Launch', keyPoints: ((data as any).thirtyDayPrelaunchPlan || []).map((p: any) => `Week ${p.week}: ${p.activity}`) }
      ]
      rawSlides.push(...crowdfundingSlides);
    } else if (deckTypeParam === 'pricing' && reportRecord) {
      const data = (reportRecord.reportData as Record<string, unknown>)?.aiAnalysis || {}
      const computed = (reportRecord.reportData as Record<string, unknown>)?.computedMetrics || {}
      const score = reportRecord.pricingScore || 0
      const formatPoints = (arr: unknown) => Array.isArray(arr) ? arr.map((a: unknown) => typeof a === 'string' ? a : JSON.stringify(a)) : [];

      const pricingSlides: SlideData[] = [
        { title: 'Pricing Strategy', headline: `Score: ${score}/100`, content: startupName },
        { title: 'Customer WTP', headline: 'Willingness to Pay', keyPoints: [`Van Westendorp Range: ${(data as any).vanWestendorpInsights?.acceptableRange || 'N/A'}`] },
        { title: 'Customer Value Analysis', headline: 'Value Drivers', content: (data as any).customerValueAnalysis as string || '' },
        { title: 'Competitor Pricing', headline: 'Market Landscape', keyPoints: ((data as any).competitorPrices || []).map((c: any) => `${c.name}: ${c.price}`) },
        { title: 'Recommended Price', headline: 'Optimal Price Point', content: (data as any).recommendedPriceToTest as string || '' },
        { title: 'Financial Impact', headline: 'Economics', keyPoints: [`LTV/CAC: ${(computed as any).ltvCacRatio || 0}`, `Break-Even: ${(computed as any).breakEvenUnits || 0} units`] },
        { title: 'Validation Plan', headline: '30-Day Testing', keyPoints: ((data as any).thirtyDayValidationPlan || []).map((p: any) => `${p.week}: ${p.activity}`) },
        { title: 'Risk Register', headline: 'Key Pricing Risks', keyPoints: ((data as any).riskRegister || []).map((r: any) => `${r.risk} - ${r.mitigation}`) },
        { title: 'Price Elasticity', headline: 'Volume Impact', content: (data as any).priceElasticity?.interpretation as string || '' },
        { title: 'Psychological Pricing', headline: 'Positioning Tactics', keyPoints: ((data as any).psychologicalPricing || []).map((p: any) => `${p.technique}: ${p.recommendedUse}`) },
      ]
      rawSlides.push(...pricingSlides);
    }

    const slidesToRender: SlideData[] = rawSlides.length >= 8
      ? rawSlides
      : [
          {
            title: 'Title & Pitch Deck',
            headline: startupName,
            content: product,
            keyPoints: [
              `Industry: ${industry}`,
              `Target Market: ${targetCustomer}`,
              `Prepared for Investor Evaluation • ${new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`,
            ],
            speakerNotes: `Welcome investors. Today we are presenting ${startupName}, an innovative approach to ${industry.toLowerCase()}.`,
          },
          {
            title: 'The Problem',
            headline: 'Critical Pain Point in Current Market Workflows',
            content: coreProblem,
            keyPoints: [
              `Target Customer Impact: ${targetCustomer} faces severe friction and wasted capital.`,
              'Legacy Alternatives: Manual consulting and ad-hoc spreadsheets are too slow and expensive.',
              'Urgency: Decision velocity is paramount in today\'s competitive landscape.',
            ],
            speakerNotes: 'Address market failure rates and explain why existing approaches do not solve this problem efficiently.',
          },
          {
            title: 'The Solution',
            headline: 'Autonomous, Rapid & Defensible Value Delivery',
            content: proposedSolution,
            keyPoints: [
              `Core Product: ${product}`,
              '10x Faster: Delivers high-fidelity insights in minutes rather than weeks.',
              'Data Moat: Proprietary benchmarking engine strengthens defensibility over time.',
            ],
            speakerNotes: 'Walk through product workflow and demonstrate the customer value proposition.',
          },
          {
            title: 'Target Market & Opportunity',
            headline: '$14B Global Addressable Market Headroom',
            content: 'Rapid market expansion driven by digital transformation and entrepreneurship growth.',
            keyPoints: [
              'TAM (Total Addressable Market): $14B global market spend [PROJECTION]',
              'SAM (Serviceable Addressable Market): $3.2B in primary target segments [PROJECTION]',
              'SOM (Obtainable Market): $480M over 36-month horizon [PROJECTION]',
            ],
            speakerNotes: 'Highlight bottom-up and top-down market sizing and growth CAGR.',
          },
          {
            title: 'Business Model & Pricing',
            headline: 'Predictable, High-Margin B2B SaaS Economics',
            content: businessModel,
            keyPoints: [
              'Subscription SaaS: Free tier for viral acquisition, $49/mo Pro, $99/mo Max.',
              'Unit Economics: Estimated LTV/CAC ratio of 4.2x with 7-month CAC payback.',
              'Gross Margin Profile: 80%+ gross margins with scalable cloud infrastructure.',
            ],
            speakerNotes: 'Walk through revenue architecture, pricing tiers, and expansion paths.',
          },
          {
            title: 'Competitive Advantage',
            headline: 'Defensible Technical Moat & Speed Advantage',
            content: 'Significantly faster and more comprehensive than fragmented consulting solutions.',
            keyPoints: [
              'Proprietary Synthetic Telemetry: High-accuracy predictive models.',
              'Continuous Learning Flywheel: Product insights compound with platform usage.',
              'Cost Asymmetry: 10x lower cost structure compared to bespoke agencies.',
            ],
            speakerNotes: 'Emphasize defensibility against both incumbents and generic LLM wrappers.',
          },
          {
            title: 'Go-To-Market & Traction',
            headline: 'Product-Led Growth + Targeted Enterprise Outbound',
            content: 'Self-reinforcing distribution flywheels driving sustainable low CAC.',
            keyPoints: [
              'Organic Flywheel: Viral validation reports and founder benchmark sharing.',
              'Community Partnerships: Direct distribution via accelerator programs and incubators.',
              'Traction Signals: Strong early customer validation and high willingness to pay.',
            ],
            speakerNotes: 'Detail organic distribution channels and initial milestone accomplishments.',
          },
          {
            title: 'Financials & Ask',
            headline: '$1.5M Seed Financing to Accelerate Growth',
            content: '18 months runway to scale ARR and expand enterprise features.',
            keyPoints: [
              'Use of Funds: 60% Engineering & Product, 30% Go-To-Market, 10% Operations.',
              'Key Milestones: Reach $1M ARR and onboard 500 active teams within 12 months.',
              'Break-Even Horizon: Projected operational break-even within 18 months.',
            ],
            speakerNotes: 'Close with fund allocation breakdown, milestone targets, and founder contact.',
          },
        ]

    // Render each slide
    slidesToRender.forEach((s, idx) => {
      const slide = pptx.addSlide()
      const isCover = idx === 0

      if (isCover) {
        // Cover Slide
        slide.background = { color: '0A1628' }

        slide.addText(s.headline || startupName, {
          x: 1.0,
          y: 1.8,
          w: 11.3,
          h: 1.2,
          fontSize: 44,
          bold: true,
          color: 'C8A860',
          fontFace: 'Arial',
        })

        slide.addText(s.content || product, {
          x: 1.0,
          y: 3.1,
          w: 11.3,
          h: 0.8,
          fontSize: 22,
          color: 'FFFFFF',
          fontFace: 'Arial',
        })

        const coverBullets = (s.keyPoints || []).join('\n')
        if (coverBullets) {
          slide.addText(coverBullets, {
            x: 1.0,
            y: 4.2,
            w: 11.3,
            h: 1.8,
            fontSize: 14,
            color: '94A3B8',
            fontFace: 'Arial',
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
          color: 'C8A860',
          fontFace: 'Arial',
        })

        slide.addText(s.headline || s.title, {
          x: 0.8,
          y: 0.9,
          w: 11.5,
          h: 0.8,
          fontSize: 26,
          bold: true,
          color: '0A1628',
          fontFace: 'Arial',
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
            fontFace: 'Arial',
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
              lineSpacing: 26,
            },
          }))

          slide.addText(bulletItems, {
            x: 0.8,
            y: 2.7,
            w: 11.5,
            h: 3.8,
            fontFace: 'Arial',
          })
        }

        // Slide Footer
        slide.addText(`${startupName} • Confidential Investor Presentation`, {
          x: 0.8,
          y: 6.8,
          w: 9.0,
          h: 0.3,
          fontSize: 9,
          color: '94A3B8',
          fontFace: 'Arial',
        })

        slide.addText(`${idx + 1} / ${slidesToRender.length}`, {
          x: 11.0,
          y: 6.8,
          w: 1.5,
          h: 0.3,
          fontSize: 9,
          color: '94A3B8',
          align: 'right',
          fontFace: 'Arial',
        })
      }

      // Speaker Notes
      if (s.speakerNotes) {
        slide.addNotes(s.speakerNotes)
      }
    })

    const buffer = (await pptx.write({ outputType: 'nodebuffer' })) as Buffer
    const exportFileId = deckId || ideaId || 'presentation'

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'Content-Disposition': `attachment; filename="pitch-deck-${exportFileId}.pptx"`,
      },
    })
  } catch (err: unknown) {
    console.error('PPTX Export Error:', err)
    const message = err instanceof Error ? err.message : 'Internal Server Error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}