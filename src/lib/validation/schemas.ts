import { z } from 'zod'
import { STARTUP_WEIGHTS } from '../scoring'

// ─────────────────────────────────────────────────────────────────────────────
// Single source of truth for all validation report schemas.
//
// The monolithic engine, the multi-agent pipeline and the downstream report
// consumers all share these definitions, so the merged agent output is
// guaranteed to satisfy the exact same FullReportSchema the monolith produces.
// This module must stay a leaf (no imports from engine or agents) so the
// dependency graph stays cycle-free:
//
//   schemas.ts (leaf) ← agents/* ← orchestrator ← engine ← routes
// ─────────────────────────────────────────────────────────────────────────────

// ─── Shared schemas ──────────────────────────────────────────────────────────

export const EvidenceItemSchema = z.object({
  claim: z.string(),
  source: z.string().optional(),
  publication: z.string().optional(),
  year: z.string().optional(),
  link: z.string().optional(),
  geography: z.string().optional(),
  fetchedAt: z.string().optional(),
  strength: z.enum(['WEAK', 'MODERATE', 'STRONGER']),
  label: z
    .enum([
      'ASSUMPTION',
      'PROJECTION',
      'PROPOSED_STRATEGY',
      'AI_ESTIMATE_UNVERIFIED',
      'VERIFIED',
    ])
    .optional(),
})

export type EvidenceItem = z.infer<typeof EvidenceItemSchema>

export const CategoryScoreSchema = z.object({
  score: z.number(),
  maxScore: z.number(),
  rationale: z.string(),
  evidence: z.array(EvidenceItemSchema),
  risks: z.array(z.string()),
  confidenceLevel: z.enum(['low', 'medium', 'high']),
})

// ─── Idea input ──────────────────────────────────────────────────────────────

export type IdeaInput = {
  name: string
  industry: string
  product: string
  targetCustomer: string
  location: string
  businessModel: string
  coreProblem: string
  proposedSolution: string
}

// ─── Agent output schemas (FullReport field ownership) ───────────────────────
// Each agent owns a disjoint subset of the FullReport fields; the union of all
// six schemas is exactly the FullReportSchema. Field shapes are identical to
// the original monolithic schema so nothing downstream can tell the difference.

// Owned by the market agent
export const MarketAgentSchema = z.object({
  marketScore: z.number(),
  tamSamSom: z.object({
    tam: z.object({ value: z.string(), method: z.string(), source: z.string(), label: z.literal('PROJECTION') }),
    sam: z.object({ value: z.string(), method: z.string(), label: z.literal('PROJECTION') }),
    som: z.object({ value: z.string(), method: z.string(), label: z.literal('PROJECTION') }),
  }),
  pestleAnalysis: z.object({
    political: z.array(z.string()),
    economic: z.array(z.string()),
    social: z.array(z.string()),
    technological: z.array(z.string()),
    legal: z.array(z.string()),
    environmental: z.array(z.string()),
  }),
})

// Owned by the customer agent
export const FullPersonaSchema = z.object({
  name: z.string(),
  ageRange: z.string(),
  occupation: z.string(),
  incomeRange: z.string(),
  location: z.string(),
  goals: z.array(z.string()),
  problems: z.array(z.string()),
  frustrations: z.array(z.string()),
  buyingBehaviour: z.string(),
  preferredChannels: z.array(z.string()),
  decisionFactors: z.array(z.string()),
  priceSensitivity: z.enum(['low', 'medium', 'high']),
  jobToBeDone: z.string(),
})

export const CustomerAgentSchema = z.object({
  problemScore: z.number(),
  customerScore: z.number(),
  wtpScore: z.number(),
  personas: z.array(FullPersonaSchema).min(1).max(3),
  problemValidation5Factor: z.object({
    frequency: z.object({ score: z.number().min(1).max(10), reasoning: z.string() }),
    severity: z.object({ score: z.number().min(1).max(10), reasoning: z.string() }),
    urgency: z.object({ score: z.number().min(1).max(10), reasoning: z.string() }),
    dissatisfaction: z.object({ score: z.number().min(1).max(10), reasoning: z.string() }),
    willingnessToSeekSolution: z.object({ score: z.number().min(1).max(10), reasoning: z.string() }),
  }),
  customerJPG: z.object({
    jobs: z.array(z.string()),
    pains: z.array(z.string()),
    gains: z.array(z.string()),
    painRelievers: z.array(z.string()),
    gainCreators: z.array(z.string()),
  }),
  interviewQuestions: z.array(z.object({
    question: z.string(),
    category: z.string(),
    rationale: z.string(),
  })).min(10).max(15),
  wtpSurveyQuestions: z.array(z.object({
    question: z.string(),
    type: z.enum(['open', 'scale', 'multiple_choice']),
    options: z.array(z.string()).optional(),
  })),
})

// Owned by the competitor agent
export const CompetitorSchema = z.object({
  name: z.string(),
  targetCustomer: z.string(),
  product: z.string(),
  pricing: z.string(),
  pricingModel: z.string(),
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  marketGap: z.string(),
  dateChecked: z.string(),
})

export const CompetitorAgentSchema = z.object({
  competitiveScore: z.number(),
  competitors: z.array(CompetitorSchema).min(3).max(10),
  competitorPositioning: z.array(z.object({
    name: z.string(),
    x: z.number(),
    y: z.number(),
    isOurStartup: z.boolean(),
  })),
  portersFiveForces: z.object({
    competitiveRivalry: z.object({ level: z.enum(['LOW', 'MEDIUM', 'HIGH']), reasoning: z.string() }),
    threatOfNewEntrants: z.object({ level: z.enum(['LOW', 'MEDIUM', 'HIGH']), reasoning: z.string() }),
    supplierPower: z.object({ level: z.enum(['LOW', 'MEDIUM', 'HIGH']), reasoning: z.string() }),
    buyerPower: z.object({ level: z.enum(['LOW', 'MEDIUM', 'HIGH']), reasoning: z.string() }),
    threatOfSubstitutes: z.object({ level: z.enum(['LOW', 'MEDIUM', 'HIGH']), reasoning: z.string() }),
  }),
})

// Owned by the finance agent
export const FinanceAgentSchema = z.object({
  financialScore: z.number(),
  businessModelScore: z.number(),
  unitEconomicsAssumptions: z.object({
    estimatedSellingPrice: z.number(),
    estimatedVariableCost: z.number(),
    estimatedFixedCostMonthly: z.number(),
    estimatedCACMonthly: z.number(),
    estimatedMonthlyCustomers: z.number(),
    estimatedChurnRate: z.number(),
    assumptionLabel: z.literal('ASSUMPTION'),
  }),
})

// Owned by the risk agent
export const RiskAgentSchema = z.object({
  keyRisks: z.array(z.string()),
  swot: z.object({
    strengths: z.array(z.string()),
    weaknesses: z.array(z.string()),
    opportunities: z.array(z.string()),
    threats: z.array(z.string()),
  }),
  riskRegister: z.array(
    z.object({
      risk: z.string(),
      probability: z.enum(['low', 'medium', 'high']),
      impact: z.enum(['low', 'medium', 'high']),
      riskLevel: z.enum(['low', 'medium', 'high', 'critical']),
      mitigation: z.string(),
    })
  ),
})

// Owned by the synthesis agent — final judgment over all research
export const SynthesisAgentSchema = z.object({
  executionScore: z.number(),
  decision: z.enum(['GO', 'MODIFY', 'TEST_FURTHER', 'NO_GO']),
  decisionReasons: z.array(z.string()),
  keyEvidence: z.array(EvidenceItemSchema),
  actionPlan: z.array(
    z.object({ week: z.string(), action: z.string(), owner: z.string(), kpi: z.string() })
  ),
  uvpOptions: z.array(z.string()).length(3),
  selectedUvp: z.string(),
  moscowFeatures: z.object({
    mustHave: z.array(z.string()),
    shouldHave: z.array(z.string()),
    couldHave: z.array(z.string()),
    wontHave: z.array(z.string()),
  }),
  mvpDescription: z.string(),
  integrityNote: z.string(),
  nextStepRecommendation: z.enum([
    'MORE_VALIDATION',
    'BUILD_MVP',
    'GET_FIRST_CUSTOMERS',
    'SCALE_GROWTH',
    'FUNDRAISING',
  ]),
  nextStepRationale: z.string(),
  oneLineConcept: z.string(),
  founderAssumptions: z.array(z.object({
    id: z.number(),
    assumption: z.string(),
    category: z.enum(['PROBLEM', 'CUSTOMER', 'MARKET', 'PRICING', 'SOLUTION', 'CHANNEL', 'REVENUE', 'COST', 'COMPETITION', 'EXECUTION']),
    preResearchBelief: z.string(),
    postResearchFinding: z.string(),
    validated: z.boolean(),
    confidenceChange: z.enum(['INCREASED', 'DECREASED', 'UNCHANGED']),
  })),
  landingPageCopy: z.object({
    headline: z.string(),
    subheadline: z.string(),
    benefits: z.array(z.string()).length(3),
    howItWorks: z.string(),
    cta: z.string(),
    pricingHypothesis: z.string(),
    faq: z.array(z.object({ question: z.string(), answer: z.string() })),
  }),
})

// ─── Full report (union of all agent schemas) ────────────────────────────────

export const FullReportSchema = z.object({
  ...MarketAgentSchema.shape,
  ...CustomerAgentSchema.shape,
  ...CompetitorAgentSchema.shape,
  ...FinanceAgentSchema.shape,
  ...RiskAgentSchema.shape,
  ...SynthesisAgentSchema.shape,
})

export type FullReport = z.infer<typeof FullReportSchema>

// Max score weights per category — used by agent prompts (informational only;
// the engine clamps all scores deterministically after generation).
export const FULL_REPORT_WEIGHT_TABLE = STARTUP_WEIGHTS
