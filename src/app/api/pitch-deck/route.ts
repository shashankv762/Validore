import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/db'
import { users, ideas, pitchDecks } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import { checkCredits, deductCredits } from '@/lib/credits'
import { CREDIT_COSTS } from '@/lib/credit-costs'
import { generateWithFallback } from '@/lib/ai/generate'
import { z } from 'zod'
import { PITCH_WEIGHTS, clampScore } from '@/lib/scoring'
import { rateLimitCheck, checkAndIncrementConcurrency, decrementConcurrency } from '@/lib/rate-limit'

const PitchDeckInputSchema = z.object({
  ideaId: z.string().uuid(),
  founderName: z.string().min(2),
  founderBackground: z.string().min(10),
  teamSize: z.number().min(1),
  fundingAskAmount: z.string().optional(),
  useOfFunds: z.string().optional(),
  currentTraction: z.string().optional(),
  milestones: z.array(z.object({
    milestone: z.string(),
    targetDate: z.string(),
    status: z.enum(['PLANNED', 'ACHIEVED']),
  })).optional(),
})

const SlideSchema = z.object({
  slideNumber: z.number(),
  title: z.string(),
  content: z.string(),
  keyPoints: z.array(z.string()),
  speakerNotes: z.string(),
  dataLabel: z.string().optional(),
})

const PitchDeckAiSchema = z.object({
  slides: z.array(SlideSchema).length(12),
  pitchScript3min: z.string(),
  pitchScript60sec: z.string(),
  investorQa: z.array(z.object({
    question: z.string(),
    answer: z.string(),
    label: z.string(),
  })).length(20),
  // Quality scoring (10 categories × 10 points)
  problemClarityScore: z.number().min(0).max(PITCH_WEIGHTS.problemClarity),
  solutionStrengthScore: z.number().min(0).max(PITCH_WEIGHTS.solutionStrength),
  customerEvidenceScore: z.number().min(0).max(PITCH_WEIGHTS.customerEvidence),
  marketOpportunityScore: z.number().min(0).max(PITCH_WEIGHTS.marketOpportunity),
  businessModelScore: z.number().min(0).max(PITCH_WEIGHTS.businessModel),
  competitivePositioningScore: z.number().min(0).max(PITCH_WEIGHTS.competitivePositioning),
  gtmStrategyScore: z.number().min(0).max(PITCH_WEIGHTS.gtmStrategy),
  financialLogicScore: z.number().min(0).max(PITCH_WEIGHTS.financialLogic),
  teamExecutionScore: z.number().min(0).max(PITCH_WEIGHTS.teamExecutionReadiness),
  presentationQualityScore: z.number().min(0).max(PITCH_WEIGHTS.presentationQuality),
  // Founder readiness (self-assessment, not diagnosis)
  founderReadinessScore: z.number().min(0).max(100),
  founderReadinessNote: z.string(),
  // Portfolio sections
  portfolioSections: z.array(z.object({
    sectionTitle: z.string(),
    content: z.string(),
    label: z.string().optional(),
  })),
  // Roadmap
  roadmap: z.array(z.object({
    phase: z.string(),
    timeframe: z.string(),
    milestones: z.array(z.object({
      milestone: z.string(),
      status: z.enum(['PLANNED', 'ACHIEVED']),
    })),
  })),
  integrityNote: z.string(),
  entrepreneurialSkillsMatrix: z.array(z.object({ skill: z.string(), selfRating: z.number(), evidence: z.string(), gap: z.string() })).optional(),
  customerJourney: z.array(z.object({ stage: z.string(), touchpoint: z.string(), emotion: z.string(), opportunity: z.string() })).optional(),
  valuePropositionCanvas: z.object({ customerJobs: z.array(z.string()), pains: z.array(z.string()), gains: z.array(z.string()), products: z.array(z.string()), painRelievers: z.array(z.string()), gainCreators: z.array(z.string()) }).optional(),
  moscowFeatures: z.object({ must: z.array(z.string()), should: z.array(z.string()), could: z.array(z.string()), wont: z.array(z.string()) }).optional(),
  competitorMatrix: z.array(z.object({ competitor: z.string(), pricing: z.string(), strengths: z.array(z.string()), weaknesses: z.array(z.string()), ourAdvantage: z.string() })).optional(),
  positioningMap: z.array(z.object({ label: z.string(), x: z.number(), y: z.number(), isUs: z.boolean() })).optional(),
  swot: z.object({ strengths: z.array(z.string()), weaknesses: z.array(z.string()), opportunities: z.array(z.string()), threats: z.array(z.string()) }).optional(),
  pestleAnalysis: z.object({ political: z.array(z.string()), economic: z.array(z.string()), social: z.array(z.string()), technological: z.array(z.string()), legal: z.array(z.string()), environmental: z.array(z.string()) }).optional(),
  useOfFundsBreakdown: z.array(z.object({ category: z.string(), amount: z.number(), percentage: z.number(), rationale: z.string() })).optional(),
  gtmStrategy: z.object({ phase1: z.object({ name: z.string(), channels: z.array(z.string()), budget: z.string(), timeline: z.string() }), phase2: z.object({ name: z.string(), channels: z.array(z.string()), budget: z.string(), timeline: z.string() }) }).optional(),
  salesFunnel: z.array(z.object({ stage: z.string(), count: z.number(), conversion: z.number(), tactic: z.string() })).optional(),
  brandStrategy: z.object({ positioning: z.string(), voiceTone: z.string(), visualIdentity: z.string(), tagline: z.string() }).optional(),
  kpiTargets: z.array(z.object({ metric: z.string(), current: z.string(), target: z.string(), timeline: z.string() })).optional(),
  riskRegister: z.array(z.object({ risk: z.string(), severity: z.enum(['high','medium','low']), likelihood: z.enum(['high','medium','low']), mitigation: z.string() })).optional(),
  actionPlan: z.object({ thirtyDay: z.array(z.object({ action: z.string(), owner: z.string(), deadline: z.string() })), ninetyDay: z.array(z.object({ action: z.string(), owner: z.string(), deadline: z.string() })) }).optional(),
  investorQA: z.array(z.object({ question: z.string(), answer: z.string(), category: z.string() })).optional(),
})

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const dbUser = await db.query.users.findFirst({ where: eq(users.supabaseId, user.id) })
  if (!dbUser) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const rl = await rateLimitCheck(dbUser.id)
  if (!rl.success) {
    return NextResponse.json({ error: 'Too many requests', retryAfter: 60 }, { status: 429 })
  }

  const creditCheck = await checkCredits(dbUser.id, CREDIT_COSTS.PITCH_DECK)
  if (!creditCheck.allowed) {
    return NextResponse.json({ error: 'Insufficient credits' }, { status: 402 })
  }

  // GAP-1: Concurrency check
  const tierConcurrencyLimits: Record<string, number> = { free: 1, premium: 2, max_premium: 3 }
  const maxConcurrent = tierConcurrencyLimits[dbUser.tier || 'free'] ?? 1
  const concurrencyCheck = await checkAndIncrementConcurrency(dbUser.id, maxConcurrent)
  if (!concurrencyCheck.allowed) {
    return NextResponse.json(
      { error: 'Too many concurrent requests. Please wait for your current analysis to complete.' },
      { status: 429 }
    )
  }

  // GAP-2: Decrypt custom OpenRouter key if stored
  let customOpenRouterKey: string | null = null
  const encryptedKey = (dbUser as any).encryptedOpenrouterKey as string | null
  if (encryptedKey) {
    if (encryptedKey.includes(':') && process.env.ENCRYPTION_KEY) {
      try {
        const crypto = await import('crypto')
        const [ivHex, encryptedHex] = encryptedKey.split(':')
        const iv = Buffer.from(ivHex, 'hex')
        const decipher = crypto.createDecipheriv(
          'aes-256-cbc',
          Buffer.from(process.env.ENCRYPTION_KEY, 'hex'),
          iv
        )
        let decrypted = decipher.update(encryptedHex, 'hex', 'utf8')
        decrypted += decipher.final('utf8')
        customOpenRouterKey = decrypted
      } catch {
        console.warn('[BYOK] Failed to decrypt custom key, using platform default')
      }
    } else {
      customOpenRouterKey = encryptedKey // Unencrypted fallback (dev)
    }
  }

  try {
    const body = await request.json()
    const parsed = PitchDeckInputSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

    const i = parsed.data
    const idea = await db.query.ideas.findFirst({
      where: and(eq(ideas.id, i.ideaId), eq(ideas.userId, dbUser.id)),
    })
    if (!idea) return NextResponse.json({ error: 'Idea not found' }, { status: 404 })

    const today = new Date().toISOString().split('T')[0]
    const milestonesStr = i.milestones?.map(m => `- ${m.milestone} | ${m.targetDate} | Status: ${m.status}`).join('\n') ?? 'No milestones provided'

    const prompt = `You are a world-class pitch deck consultant creating a professional 12-slide investor pitch deck.

STARTUP:
Name: ${idea.name}
Industry: ${idea.industry}
Product: ${idea.product}
Target Customer: ${idea.targetCustomer}
Location: ${idea.location}
Business Model: ${idea.businessModel}
Core Problem: ${idea.coreProblem}
Proposed Solution: ${idea.proposedSolution}

FOUNDER:
Name: ${i.founderName}
Background: ${i.founderBackground}
Team Size: ${i.teamSize}

TRACTION (if any): ${i.currentTraction ?? 'Pre-launch — no traction yet'}
FUNDING ASK: ${i.fundingAskAmount ?? 'Not specified'}
USE OF FUNDS: ${i.useOfFunds ?? 'Not specified'}

MILESTONES (MUST use exact status provided — never change PLANNED to ACHIEVED):
${milestonesStr}

Today: ${today}

SLIDE STRUCTURE (12 slides exactly):
Slide 1: Cover — name, tagline, founder name, date
Slide 2: Problem — target customer, pain points, market gap
Slide 3: Solution — product, how it works, key benefit
Slide 4: Market Opportunity — TAM/SAM/SOM (label: PROJECTION)
Slide 5: Product/MVP — features, user journey, differentiation
Slide 6: Business Model — revenue streams, pricing, who pays
Slide 7: Competition — competitor matrix, positioning, moat
Slide 8: Go-To-Market — channels, funnel, launch strategy (label: PROPOSED_STRATEGY)
Slide 9: Traction/Validation — if pre-launch: research done + MVP plan (label: PROPOSED not ACHIEVED)
Slide 10: Financials — CAC, LTV, projections (label: PROJECTION — never present as real)
Slide 11: Team & Roadmap — backgrounds + milestones (use exact PLANNED/ACHIEVED status from input)
Slide 12: Funding Ask & Next Steps

SCORING (max per category):
problemClarityScore max: ${PITCH_WEIGHTS.problemClarity}
solutionStrengthScore max: ${PITCH_WEIGHTS.solutionStrength}
customerEvidenceScore max: ${PITCH_WEIGHTS.customerEvidence}
marketOpportunityScore max: ${PITCH_WEIGHTS.marketOpportunity}
businessModelScore max: ${PITCH_WEIGHTS.businessModel}
competitivePositioningScore max: ${PITCH_WEIGHTS.competitivePositioning}
gtmStrategyScore max: ${PITCH_WEIGHTS.gtmStrategy}
financialLogicScore max: ${PITCH_WEIGHTS.financialLogic}
teamExecutionScore max: ${PITCH_WEIGHTS.teamExecutionReadiness}
presentationQualityScore max: ${PITCH_WEIGHTS.presentationQuality}

founderReadinessScore (0-100): developmental self-assessment of founder's readiness, NOT a personality diagnosis
founderReadinessNote: explain what this score means for this specific founder's journey

CRITICAL RULES:
1. NEVER present planned milestones as achieved
2. NEVER claim pre-launch traction if none was provided
3. Label all financial projections as PROJECTION
4. Label all strategies as PROPOSED_STRATEGY
5. Investor Q&A: provide honest, balanced answers — do not over-promise
6. Do not automatically recommend fundraising if evidence is thin — note what evidence is still needed
7. founderReadinessScore is a developmental tool, not a personality diagnosis
8. integrityNote must list what is verified evidence vs PROJECTION vs PROPOSED_STRATEGY in this deck
9. Generate 20 investor Q&As for the investorQA array.
10. Generate all fields including: entrepreneurialSkillsMatrix, customerJourney, valuePropositionCanvas, moscowFeatures, competitorMatrix, positioningMap, swot, pestleAnalysis, useOfFundsBreakdown, gtmStrategy, salesFunnel, brandStrategy, kpiTargets, riskRegister, actionPlan, investorQA`

    const aiResult = await generateWithFallback({ prompt, schema: PitchDeckAiSchema, temperature: 0.3, preferredAiProvider: dbUser.preferredAiProvider, customOpenRouterKey })
    const ai = aiResult.data

    const qualityScore =
      clampScore(ai.problemClarityScore, PITCH_WEIGHTS.problemClarity) +
      clampScore(ai.solutionStrengthScore, PITCH_WEIGHTS.solutionStrength) +
      clampScore(ai.customerEvidenceScore, PITCH_WEIGHTS.customerEvidence) +
      clampScore(ai.marketOpportunityScore, PITCH_WEIGHTS.marketOpportunity) +
      clampScore(ai.businessModelScore, PITCH_WEIGHTS.businessModel) +
      clampScore(ai.competitivePositioningScore, PITCH_WEIGHTS.competitivePositioning) +
      clampScore(ai.gtmStrategyScore, PITCH_WEIGHTS.gtmStrategy) +
      clampScore(ai.financialLogicScore, PITCH_WEIGHTS.financialLogic) +
      clampScore(ai.teamExecutionScore, PITCH_WEIGHTS.teamExecutionReadiness) +
      clampScore(ai.presentationQualityScore, PITCH_WEIGHTS.presentationQuality)

    await deductCredits(dbUser.id, CREDIT_COSTS.PITCH_DECK, 'PITCH_DECK', i.ideaId)
    const [saved] = await db.insert(pitchDecks).values({
      ideaId: i.ideaId,
      userId: dbUser.id,
      qualityScore,
      founderReadinessScore: clampScore(ai.founderReadinessScore, 100),
      slides: ai.slides,
      pitchScript3min: ai.pitchScript3min,
      pitchScript60sec: ai.pitchScript60sec,
      investorQa: ai.investorQa,
      portfolioSections: ai.portfolioSections,
      roadmap: ai.roadmap,
      milestones: i.milestones ?? [],
      reportData: { inputs: i, ai, qualityScore },
    }).returning()

    return NextResponse.json({
      deckId: saved.id,
      qualityScore,
      founderReadinessScore: saved.founderReadinessScore,
      result: saved,
    })
  } finally {
    await decrementConcurrency(dbUser.id)
  }
}