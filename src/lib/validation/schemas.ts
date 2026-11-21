import { z } from 'zod'
import { STARTUP_WEIGHTS } from '../scoring'

// Keep these shared schemas independent of the engine and agents to avoid import cycles.

export const EvidenceItemSchema = z.object({
  claim: z.string(),
  source: z.string().optional(),
  publication: z.string().optional(),
  year: z.string().optional(),
  link: z.string().optional(),
  evidenceExcerpt: z.string().max(800).optional().describe('Exact supporting passage copied from the successfully read linked source; paraphrase separately in claim.'),
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
  publicResearchFocus?: string | null
}

// ─── Agent output schemas (FullReport field ownership) ───────────────────────
// Each agent owns a disjoint subset of the FullReport fields; the union of all
// six schemas is exactly the FullReportSchema. Field shapes are identical to
// the original monolithic schema so nothing downstream can tell the difference.

// Owned by the market agent
export const MarketAgentSchema = z.object({
  marketScore: z.number().min(0).max(STARTUP_WEIGHTS.marketOpportunity),
  tamSamSom: z.object({
    tam: z.object({ value: z.string(), method: z.string(), source: z.string(), label: z.literal('PROJECTION'),
      inputs: z.object({
        customerCount: z.object({ value: z.number().positive(), unit: z.string(), source: z.string(), year: z.number().int().optional(), evidenceExcerpt: z.string().max(800).optional() }),
        annualSpend: z.object({ value: z.number().positive(), currency: z.string().regex(/^[A-Z]{3}$/), source: z.string(), year: z.number().int().optional(), evidenceExcerpt: z.string().max(800).optional() }),
      }).optional(),
    }),
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
export const PriceSensitivitySchema = z.enum(['low', 'medium', 'high', 'unknown']).default('unknown')
  .describe('Response to price changes, not willingness to pay. Use unknown without direct buyer pricing evidence; do not infer from income or nationality.')

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
  priceSensitivity: PriceSensitivitySchema,
  jobToBeDone: z.string(),
})

export const CustomerAgentSchema = z.object({
  problemScore: z.number().min(0).max(STARTUP_WEIGHTS.problemValidation),
  customerScore: z.number().min(0).max(STARTUP_WEIGHTS.customerValidation),
  wtpScore: z.number().min(0).max(STARTUP_WEIGHTS.willingnessToPay),
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
  customerSignals: z.object({
    summary: z.string(),
    observations: z.array(z.object({
      theme: z.string(), direction: z.enum(['positive', 'negative', 'mixed', 'unknown']),
      sourceType: z.enum(['recorded_feedback', 'public_review', 'founder_statement', 'assumption']),
      count: z.number().int().nonnegative().nullable(), sampleSize: z.number().int().positive().nullable(),
      sourceUrls: z.array(z.string()).max(5), limitation: z.string(),
    })).max(8),
    opposingSignals: z.array(z.string()).max(8).optional(),
    unresolvedQuestions: z.array(z.string()).max(8),
  }).optional(),
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
  sourceUrl: z.string().url().optional().describe('Successfully read page that names this competitor; omitted when no such source was retrieved.'),
})

export const CompetitorAgentSchema = z.object({
  competitiveScore: z.number().min(0).max(STARTUP_WEIGHTS.competitiveDifferentiation),
  competitors: z.array(CompetitorSchema).max(10),
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
  financialScore: z.number().min(0).max(STARTUP_WEIGHTS.financialFeasibility),
  businessModelScore: z.number().min(0).max(STARTUP_WEIGHTS.businessModel),
  unitEconomicsAssumptions: z.object({
    estimatedSellingPrice: z.number().nonnegative(),
    estimatedVariableCost: z.number().nonnegative(),
    estimatedFixedCostMonthly: z.number().nonnegative(),
    estimatedCACMonthly: z.number().nonnegative(),
    estimatedMonthlyCustomers: z.number().nonnegative(),
    estimatedChurnRate: z.number().min(0).max(1),
    estimatedMonthlyGrowthRate: z.number().min(0).max(1).optional(),
    currency: z.string().regex(/^[A-Z]{3}$/).optional(),
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
  executionScore: z.number().min(0).max(STARTUP_WEIGHTS.executionFeasibility),
  decision: z.enum(['GO', 'MODIFY', 'TEST_FURTHER', 'NO_GO']),
  decisionReasons: z.array(z.string()),
  keyEvidence: z.array(EvidenceItemSchema),
  actionPlan: z.array(
    z.object({ week: z.string(), action: z.string(), owner: z.string(), kpi: z.string(),
      hypothesis: z.string().optional(), participantUnit: z.string().optional(), denominator: z.string().optional(),
      passCriterion: z.string().optional(), decisionOnFailure: z.string().optional(),
    })
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
    // This is a descriptive grouping, not a decision or permission. An unknown
    // grouping must not discard an otherwise valid report or spend another call.
    category: z.enum(['PROBLEM', 'CUSTOMER', 'MARKET', 'PRICING', 'SOLUTION', 'CHANNEL', 'REVENUE', 'COST', 'COMPETITION', 'EXECUTION', 'OTHER']).catch('OTHER'),
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

// Completed product and growth work is already owned and validated. A final
// reviewer can reconcile the verdict without regenerating those entire plans.
export const SynthesisReviewSchema = SynthesisAgentSchema.pick({
  executionScore: true, decision: true, decisionReasons: true, keyEvidence: true,
  integrityNote: true, nextStepRecommendation: true, nextStepRationale: true, founderAssumptions: true,
})

/** One proposed program shared by product and growth. It is a planning
 * assumption, not an observed cohort, validated offer or revenue forecast. */
export const PlanningBasisSchema = z.object({
  id: z.string().trim().min(1).max(80),
  targetCustomer: z.string().trim().min(1).max(240),
  participantUnit: z.string().trim().min(1).max(120),
  cohortDefinition: z.string().trim().min(1).max(400),
  cohortSize: z.number().int().min(1).max(10000),
  programWeeks: z.number().int().min(4).max(12),
  utilityWeeks: z.number().int().min(1).max(6),
  offer: z.object({
    amount: z.number().nonnegative().nullable(),
    currency: z.string().regex(/^[A-Z]{3}$/).nullable(),
    period: z.enum(['month', 'one_time', 'not_established']),
    basis: z.enum(['finance_base', 'named_variant', 'not_established']),
    variantRationale: z.string().max(600),
  }),
  financeRelationship: z.string().trim().min(1).max(600),
})
export type PlanningBasis = z.infer<typeof PlanningBasisSchema>

// ─── Full report (union of all agent schemas) ────────────────────────────────

export const FullReportSchema = z.object({
  ...MarketAgentSchema.shape,
  ...CustomerAgentSchema.shape,
  ...CompetitorAgentSchema.shape,
  ...FinanceAgentSchema.shape,
  ...RiskAgentSchema.shape,
  ...SynthesisAgentSchema.shape,
  // Final assembled reports may contain explicitly unavailable customer work.
  // The generating CustomerAgentSchema remains strict; a failed specialist
  // contributes no invented persona or completed interview questions.
  personas: z.array(FullPersonaSchema).max(3),
  interviewQuestions: z.array(CustomerAgentSchema.shape.interviewQuestions.element).max(15),
  planningBasis: PlanningBasisSchema.optional(),
})

export type FullReport = z.infer<typeof FullReportSchema>

export const ProductAgentSchema = FullReportSchema.pick({ uvpOptions: true, selectedUvp: true, moscowFeatures: true,
  mvpDescription: true, oneLineConcept: true, landingPageCopy: true }).extend({ planningBasis: PlanningBasisSchema })
export const GrowthAgentSchema = FullReportSchema.pick({ actionPlan: true, nextStepRecommendation: true, nextStepRationale: true }).extend({
  planningBasis: PlanningBasisSchema,
  actionPlan: z.array(SynthesisAgentSchema.shape.actionPlan.element.extend({
    hypothesis: z.string().trim().min(1), participantUnit: z.string().trim().min(1), denominator: z.string().trim().min(1),
    passCriterion: z.string().trim().min(1), decisionOnFailure: z.string().trim().min(1),
  })).min(4).max(6),
})
export const EvidenceReviewSchema = z.object({
  summary: z.string(),
  checks: z.array(z.object({ claim: z.string(), url: z.string(),
    assessment: z.enum(['supports', 'contradicts', 'inconclusive']), rationale: z.string(),
    decisionRelevance: z.enum(['context', 'material', 'blocking']).optional(),
    evidenceExcerpt: z.string().max(1000).optional(),
  })).max(8),
  gaps: z.array(z.string()).max(8),
})
export type EvidenceReview = z.infer<typeof EvidenceReviewSchema>

// Max score weights per category — used by agent prompts (informational only;
// the engine clamps all scores deterministically after generation).
export const FULL_REPORT_WEIGHT_TABLE = STARTUP_WEIGHTS
