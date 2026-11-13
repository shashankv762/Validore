import { z } from 'zod'

const strings = z.array(z.string())
const optional = <T extends z.ZodType>(schema: T) => schema.nullish()
const rows = (shape: z.ZodRawShape) => z.array(z.object(shape))
const stringFields = (keys: string[]) => Object.fromEntries(keys.map(key => [key, optional(z.string())]))
const numberFields = (keys: string[]) => Object.fromEntries(keys.map(key => [key, optional(z.number())]))
const stringArrays = (keys: string[]) => Object.fromEntries(keys.map(key => [key, optional(strings)]))
const score = z.number().min(0).max(100)
const milestone = z.object({ milestone: z.string(), targetDate: z.string().nullish().transform(value => value ?? ''), status: z.enum(['PLANNED', 'ACHIEVED']) })
const roadmap = rows({ phase: z.string(), timeframe: z.string(), milestones: z.array(milestone) })
const portfolio = rows({ sectionTitle: z.string(), content: z.string(), label: optional(z.string()) })
const actions = rows({ action: z.string(), owner: optional(z.string()), deadline: optional(z.string()) })
const risks = rows({ risk: z.string(), mitigation: z.string(), probability: optional(z.string()), impact: optional(z.string()), riskLevel: optional(z.string()), severity: optional(z.string()), likelihood: optional(z.string()) })

const pitchAi = z.object({
  ...stringFields(['integrityNote', 'founderReadinessNote']),
  ...numberFields(['problemClarityScore', 'solutionStrengthScore', 'customerEvidenceScore', 'marketOpportunityScore', 'businessModelScore', 'competitivePositioningScore', 'gtmStrategyScore', 'financialLogicScore', 'teamExecutionScore', 'presentationQualityScore', 'founderReadinessScore']),
  portfolioSections: optional(portfolio),
  entrepreneurialSkillsMatrix: optional(rows({ skill: z.string(), selfRating: z.number(), evidence: z.string(), gap: z.string() })),
  customerJourney: optional(rows({ stage: z.string(), touchpoint: z.string(), emotion: z.string(), opportunity: z.string() })),
  valuePropositionCanvas: optional(z.object(stringArrays(['customerJobs', 'pains', 'gains', 'products', 'painRelievers', 'gainCreators']))),
  moscowFeatures: optional(z.object(stringArrays(['must', 'should', 'could', 'wont']))),
  swot: optional(z.object(stringArrays(['strengths', 'weaknesses', 'opportunities', 'threats']))),
  pestleAnalysis: optional(z.object(stringArrays(['political', 'economic', 'social', 'technological', 'legal', 'environmental']))),
  competitorMatrix: optional(rows({ competitor: z.string(), pricing: z.string(), strengths: strings, weaknesses: strings, ourAdvantage: z.string() })),
  positioningMap: optional(rows({ label: z.string(), x: z.number(), y: z.number(), isUs: z.boolean() })),
  useOfFundsBreakdown: optional(rows({ category: z.string(), amount: z.number(), percentage: z.number(), rationale: z.string() })),
  gtmStrategy: optional(z.object({ phase1: optional(z.object({ name: z.string(), channels: strings, budget: z.string(), timeline: z.string() })), phase2: optional(z.object({ name: z.string(), channels: strings, budget: z.string(), timeline: z.string() })) })),
  salesFunnel: optional(rows({ stage: z.string(), count: z.number(), conversion: z.number(), tactic: z.string() })),
  brandStrategy: optional(z.object(stringFields(['positioning', 'voiceTone', 'visualIdentity', 'tagline']))),
  kpiTargets: optional(rows({ metric: z.string(), current: z.string(), target: z.string(), timeline: z.string() })),
  riskRegister: optional(risks), actionPlan: optional(z.object({ thirtyDay: optional(actions), ninetyDay: optional(actions) })),
  investorQA: optional(rows({ question: z.string(), answer: z.string(), category: z.string() })),
})
const campaignAi = z.object({
  ...numberFields(['problemProductAppealScore', 'fundingGoalFeasibilityScore', 'preLaunchAudienceScore', 'campaignPageQualityScore', 'rewardStrategyScore', 'pricingEconomicsScore', 'marketingReadinessScore', 'founderCredibilityScore', 'earlyMomentumPlanScore', 'operationalReadinessScore', 'preLaunchReadinessScore', 'firstDayTarget', 'firstWeekTarget']),
  ...stringFields(['recommendation', 'integrityNote']),
  ...stringArrays(['recommendationReasons', 'keyStrengths', 'keyWeaknesses', 'founderAssumptions']),
  rewardTierAnalysis: optional(rows({ tier: z.string(), price: z.string(), value: z.string(), backerEstimate: z.string(), label: optional(z.string()) })),
  marketingChannels: optional(rows({ channel: z.string(), estimatedReach: z.string(), costEstimate: z.string(), priority: z.string(), label: optional(z.string()) })),
  thirtyDayPrelaunchPlan: optional(rows({ week: z.string(), activity: z.string(), owner: z.string(), kpi: z.string(), expectedOutput: z.string() })),
  riskRegister: optional(risks),
  scenarios: optional(z.object(Object.fromEntries(['conservative', 'base', 'optimistic'].map(key => [key, z.object({ fundingPercent: z.number(), backers: z.number(), amountRaised: z.number() })])))),
  fundingBands: optional(rows({ range: z.string(), probability: z.number(), tips: strings })),
  goalBands: optional(rows({ goalMultiple: z.string(), successRate: z.number(), insight: z.string() })),
  backerSegments: optional(rows({ segment: z.string(), percentage: z.number(), avgPledge: z.number(), motivation: z.string() })),
  rewardEconomics: optional(rows({ tier: z.string(), cost: z.number(), revenue: z.number(), roi: z.number(), recommendation: z.string() })),
  campaignDurationAnalysis: optional(rows({ duration: z.string(), successRate: z.number(), avgFunded: z.number(), insight: z.string() })),
  categoryBenchmark: optional(z.object(numberFields(['medianGoal', 'medianFunded', 'medianBackers', 'successRate', 'top25PercentFunded']))),
  campaignPageScorecard: optional(z.record(z.string(), z.number())), campaignStoryScorecard: optional(z.record(z.string(), z.number())),
  earlyMomentumAnalysis: optional(z.object({ ...numberFields(['targetFirstDay', 'targetFirstWeek']), momentumStrategy: optional(strings), earlyBirdRecommendation: optional(z.string()) })),
  marketingFunnel: optional(z.object({ awareness: optional(z.object({ channels: optional(strings), estimatedReach: optional(z.number()) })), consideration: optional(z.object({ tactics: optional(strings) })), conversion: optional(z.object({ cta: optional(z.string()), urgencyTactics: optional(strings) })) })),
  socialProofAnalysis: optional(z.object(stringArrays(['currentStrengths', 'gaps', 'recommendations']))),
  preLaunchChecklist: optional(rows({ item: z.string(), status: z.string(), impact: z.string(), daysToComplete: z.number() })),
})
const pricingAi = z.object({
  ...stringFields(['customerWtpInsights', 'customerValueAnalysis', 'pricingModelRecommendation', 'recommendedPriceToTest', 'integrityNote', 'pricingProblem']),
  ...numberFields(['customerWtpScore', 'customerValueScore', 'competitivePositionScore', 'demandPotentialScore', 'scalabilityScore', 'pricingSimplicityScore']),
  validationStepsRequired: optional(strings),
  competitorPrices: optional(rows({ name: z.string(), price: z.string(), model: optional(z.string()), dateChecked: z.string(), source: optional(z.string()) })),
  vanWestendorpInsights: optional(z.object(stringFields(['tooExpensive', 'expensive', 'bargain', 'tooCheap', 'acceptableRange', 'label']))),
  thirtyDayValidationPlan: optional(rows({ week: z.string(), activity: z.string(), owner: z.string(), kpi: z.string(), expectedOutput: z.string() })),
  riskRegister: optional(risks),
  customerSegments: optional(rows({ segment: z.string(), size: z.string(), wtp: z.number(), priceElasticity: z.string() })),
  customerPersonas: optional(rows({ name: z.string(), description: z.string(), budget: z.string(), decisionFactors: strings })),
  wtpQuestionnaire: optional(rows({ question: z.string(), options: strings, insight: z.string() })),
  competitorPricingMatrix: optional(rows({ competitor: z.string(), price: z.number(), tier: z.string(), features: strings, positioning: z.string() })),
  competitivePricingMap: optional(rows({ label: z.string(), price: z.number(), quality: z.number(), isUs: z.boolean() })),
  costBreakdown: optional(z.object(numberFields(['cogs', 'fixedCosts', 'variableCosts', 'targetMargin', 'breakEvenPrice']))),
  pricingModels: optional(rows({ name: z.string(), description: z.string(), recommendedPrice: z.number(), pros: strings, cons: strings, suitabilityScore: z.number() })),
  psychologicalPricing: optional(rows({ technique: z.string(), example: z.string(), psychologicalImpact: z.string(), recommendedUse: z.string() })),
  discountSensitivityTable: optional(rows({ discountPct: z.number(), expectedVolumeLift: z.number(), netRevenueImpact: z.number(), recommendation: z.string() })),
  priceElasticity: optional(z.object({ coefficient: z.number(), interpretation: z.string(), elasticityType: z.string(), implications: strings })),
  whatIfAnalysis: optional(rows({ scenario: z.string(), assumption: z.string(), financialImpact: z.string(), recommendation: z.string() })),
  pricingDecisionMatrix: optional(rows({ option: z.string(), score: z.number(), evidence: z.string(), risk: z.string(), verdict: z.string() })),
  pricingVsVolumeMatrix: optional(rows({ pricePoint: z.number(), estimatedVolume: z.number(), revenue: z.number(), contributionMargin: z.number() })),
})
const base = { id: z.uuid(), ideaId: z.uuid() }
const pitch = z.looseObject({ ...base, qualityScore: score, founderReadinessScore: score,
  integrityNote: optional(z.string()), ai: optional(pitchAi),
  slides: rows({ slideNumber: z.number(), title: z.string(), content: z.string(), keyPoints: strings, speakerNotes: z.string(), dataLabel: optional(z.string()) }).min(1),
  pitchScript3min: z.string().nullish().transform(value => value ?? ''), pitchScript60sec: z.string().nullish().transform(value => value ?? ''),
  investorQa: rows({ question: z.string(), answer: z.string(), label: optional(z.string()) }), roadmap, portfolioSections: optional(portfolio),
  reportData: z.object({ ai: optional(pitchAi), inputs: optional(z.object({ ...stringFields(['founderName', 'founderBackground', 'fundingAskAmount', 'useOfFunds', 'currentTraction']), teamSize: optional(z.number()), milestones: optional(z.array(milestone)) })) }).nullish().transform(value => value ?? {}),
})
const campaign = z.looseObject({ ...base, performanceScore: score, recommendation: z.string(), reportData: z.object({
  ai: optional(campaignAi), aiAnalysis: optional(campaignAi), disclaimer: optional(z.string()),
  computedMetrics: optional(z.object(numberFields(['requiredBackers', 'requiredVisitors', 'marketingCostPerBacker']))),
  benchmark: optional(z.object({ avgFundingPct: optional(z.union([z.string(), z.number()])), totalCount: optional(z.number()), dataLabel: optional(z.string()) })),
  inputs: optional(z.object({ ...stringFields(['projectDescription', 'category', 'country']), ...numberFields(['fundingGoal', 'preLaunchCommunitySize', 'socialFollowers', 'emailListSize', 'campaignDurationDays', 'rewardTiers', 'lowestReward', 'averageReward', 'highestReward', 'marketingBudget']), hasVideo: optional(z.boolean()) })),
}) })
const pricing = z.looseObject({ ...base, pricingScore: score, reportData: z.object({
  aiAnalysis: optional(pricingAi), pricingScore: optional(score),
  computedMetrics: optional(z.object(numberFields(['contributionMargin', 'contributionMarginPct', 'grossMarginPct', 'markupPct', 'breakEvenUnits', 'breakEvenRevenue', 'revenue', 'operatingProfit', 'ltv', 'ltvCacRatio', 'cacPayback', 'discountBreakEven']))),
  inputs: optional(z.object(Object.fromEntries(['sellingPrice', 'expectedCustomers', 'variableCostPerUnit', 'fixedCostMonthly', 'discountPercent', 'estimatedCac', 'retentionMonths'].map(key => [key, z.number()])))),
}) })

/** Reject incomplete historical records before mutating a mounted page's state. */
export function normalizeSavedModuleRecord(module: 'pricing' | 'crowdfunding' | 'pitch-deck', value: unknown): Record<string, any> {
  const result = (module === 'pricing' ? pricing : module === 'crowdfunding' ? campaign : pitch).safeParse(value)
  if (!result.success) throw new Error('This saved result is incomplete and could not be opened. Choose another result or try again.')
  const record = result.data as Record<string, any>
  if (record.reportData?.inputs) record.reportData.inputs = Object.fromEntries(Object.entries(record.reportData.inputs).filter(([, entry]) => entry != null))
  return record
}
