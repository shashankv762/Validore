import { z } from 'zod'
import { PlanningArtifactSelectionSchema } from './context-contract'
import { PITCH_WEIGHTS } from '@/lib/scoring'
import { SourceReportIdSchema } from './source-report-contract'
import { PitchFundingSchema } from './pitch-funding'

export const PitchDeckInputSchema = z.object({
  ideaId: z.string().uuid(),
  sourceReportId: SourceReportIdSchema,
  ...PlanningArtifactSelectionSchema.shape,
  founderName: z.string().trim().min(2).max(200),
  founderBackground: z.string().trim().min(10).max(8000),
  teamSize: z.number().int().min(1).max(10000),
  fundingAskAmount: z.string().max(200).optional(),
  fundingAsk: PitchFundingSchema.optional(),
  useOfFunds: z.string().max(4000).optional(),
  currentTraction: z.string().max(4000).optional(),
  milestones: z.array(z.object({
    milestone: z.string().max(2000),
    targetDate: z.string().max(100),
    status: z.enum(['PLANNED', 'ACHIEVED']),
  })).max(50).optional(),
}).superRefine((input, ctx) => {
  if (input.fundingAsk && input.fundingAskAmount?.trim()) {
    ctx.addIssue({ code: 'custom', path: ['fundingAskAmount'], message: 'Supply the funding ask as structured amount and currency or as legacy text, not both.' })
  }
})

export const SlideSchema = z.object({
  slideNumber: z.number().int().min(1).max(12),
  title: z.string().trim().min(3).max(200),
  content: z.string().trim().min(20).max(2500),
  keyPoints: z.array(z.string().trim().min(3).max(500)).min(1).max(6),
  speakerNotes: z.string().trim().min(20).max(4000),
  dataLabel: z.string().optional(),
  sourceUrls: z.array(z.string().url()).max(8).optional(),
})

export const PitchDeckAiSchema = z.object({
  slides: z.array(SlideSchema).length(12),
  pitchScript3min: z.string().trim().min(100).max(5000),
  pitchScript60sec: z.string().trim().min(50).max(2500),
  investorQa: z.array(z.object({
    question: z.string().trim().min(5).max(500),
    answer: z.string().trim().min(20).max(1600),
    label: z.string().trim().min(3).max(80),
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
  founderReadinessNote: z.string().trim().min(20).max(2000),
  // Portfolio sections
  portfolioSections: z.array(z.object({
    sectionTitle: z.string().trim().min(3).max(200),
    content: z.string().trim().min(20).max(4000),
    label: z.string().optional(),
  })).min(1).max(8),
  // Roadmap
  roadmap: z.array(z.object({
    phase: z.string().trim().min(3).max(200),
    timeframe: z.string().trim().min(3).max(300),
    milestones: z.array(z.object({
      milestone: z.string().trim().min(5).max(1000),
      status: z.enum(['PLANNED', 'ACHIEVED']),
    })).min(1).max(8),
  })).min(1).max(6),
  integrityNote: z.string().trim().min(20).max(2000),
  entrepreneurialSkillsMatrix: z.array(z.object({ skill: z.string(), selfRating: z.number(), evidence: z.string(), gap: z.string() })).optional(),
  customerJourney: z.array(z.object({ stage: z.string(), touchpoint: z.string(), emotion: z.string(), opportunity: z.string() })).optional(),
  valuePropositionCanvas: z.object({ customerJobs: z.array(z.string()), pains: z.array(z.string()), gains: z.array(z.string()), products: z.array(z.string()), painRelievers: z.array(z.string()), gainCreators: z.array(z.string()) }).optional(),
  moscowFeatures: z.object({ must: z.array(z.string()), should: z.array(z.string()), could: z.array(z.string()), wont: z.array(z.string()) }).optional(),
  competitorMatrix: z.array(z.object({ competitor: z.string(), pricing: z.string(), strengths: z.array(z.string()), weaknesses: z.array(z.string()), ourAdvantage: z.string() })).optional(),
  positioningMap: z.array(z.object({ label: z.string(), x: z.number(), y: z.number(), isUs: z.boolean() })).optional(),
  swot: z.object({ strengths: z.array(z.string()), weaknesses: z.array(z.string()), opportunities: z.array(z.string()), threats: z.array(z.string()) }).optional(),
  pestleAnalysis: z.object({ political: z.array(z.string()), economic: z.array(z.string()), social: z.array(z.string()), technological: z.array(z.string()), legal: z.array(z.string()), environmental: z.array(z.string()) }).optional(),
  useOfFundsBreakdown: z.array(z.object({ category: z.string().trim().min(1).max(300), amount: z.number().finite().min(0).max(1_000_000_000), percentage: z.number().finite().min(0).max(100), rationale: z.string().trim().min(5).max(2000) })).max(12).optional(),
  gtmStrategy: z.object({ phase1: z.object({ name: z.string(), channels: z.array(z.string()), budget: z.string(), timeline: z.string() }), phase2: z.object({ name: z.string(), channels: z.array(z.string()), budget: z.string(), timeline: z.string() }) }).optional(),
  salesFunnel: z.array(z.object({ stage: z.string(), count: z.number(), conversion: z.number(), tactic: z.string() })).optional(),
  brandStrategy: z.object({ positioning: z.string(), voiceTone: z.string(), visualIdentity: z.string(), tagline: z.string() }).optional(),
  kpiTargets: z.array(z.object({ metric: z.string(), current: z.string(), target: z.string(), timeline: z.string() })).optional(),
  riskRegister: z.array(z.object({ risk: z.string(), severity: z.enum(['high','medium','low']), likelihood: z.enum(['high','medium','low']), mitigation: z.string() })).optional(),
  actionPlan: z.object({ thirtyDay: z.array(z.object({ action: z.string(), owner: z.string(), deadline: z.string() })), ninetyDay: z.array(z.object({ action: z.string(), owner: z.string(), deadline: z.string() })) }).optional(),
  investorQA: z.array(z.object({ question: z.string(), answer: z.string(), category: z.string() })).optional(),
})


