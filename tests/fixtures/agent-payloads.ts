// Synthetic provider responses for testing the real SDK/coordinator boundary.
// These are never seeded or used as market evidence in the application.
export const PRIVATE_ANSWER = 'PRIVATE-FOUNDER-NOTES-7439'
export const PRIVATE_DERIVED = 'PRIVATE-DERIVED-CUSTOMER-FINDING-8520'
export const PIPELINE_IDEA = {
  name: 'Confidential Pilot Name', industry: 'Retail software', product: 'Private inventory prototype',
  targetCustomer: 'Independent shops', location: 'India', businessModel: 'Subscription',
  coreProblem: 'Uncertain demand for inventory support', proposedSolution: 'A limited customer pilot',
}
const planningBasis = {
  id: 'five-shop-pilot', targetCustomer: 'Independent shop owners in India', participantUnit: 'One independent shop owner',
  cohortDefinition: 'Five owners representing five shops; retain non-buyers and track paid subsets separately.',
  cohortSize: 5, programWeeks: 4, utilityWeeks: 1,
  offer: { amount: 50, currency: 'USD', period: 'month', basis: 'finance_base', variantRationale: '' },
  financeRelationship: 'Use the illustrative USD 50 monthly price. The five-person research cohort is not the finance scenario of 50 operating customers.',
} as const
const nextTest = { week: 'Week 1', action: 'Interview five independent shop owners', owner: 'Founder', kpi: 'Record the latest stockout and workaround in five interviews',
  hypothesis: 'A recent stockout motivates changing the current workaround', participantUnit: planningBasis.participantUnit, denominator: 'Five proposed purposively selected interviews',
  passCriterion: 'At least three owners describe a stockout in the last month and its cost', decisionOnFailure: 'Revise the customer segment before offering a pilot' }
const persona = { name: 'Proposed shop owner', ageRange: 'Unknown', occupation: 'Shop owner', incomeRange: 'Unknown', location: 'India',
  goals: ['Reduce stockouts'], problems: ['Stock visibility'], frustrations: ['Time spent counting'], buyingBehaviour: 'Unverified',
  preferredChannels: ['Direct discovery'], decisionFactors: ['Time saved'], priceSensitivity: 'high', jobToBeDone: 'Track stock consistently' }
const product = {
  planningBasis,
  uvpOptions: ['Simpler stock counts', 'Earlier reorder prompts', 'A shared inventory log'], selectedUvp: 'Simpler stock counts',
  moscowFeatures: { mustHave: ['Stock log'], shouldHave: ['Reorder reminders'], couldHave: ['Supplier export'], wontHave: ['Payment processing'] },
  mvpDescription: 'Test a stock log with five shops.', oneLineConcept: 'A proposed stock log for independent shops.',
  landingPageCopy: { headline: 'Explore a simpler stock log', subheadline: 'A proposed pilot', benefits: ['Clear counts', 'Simple notes', 'Reorder prompts'],
    howItWorks: 'Record stock and review changes', cta: 'Join a discovery call', pricingHypothesis: 'Test a monthly subscription', faq: [] },
}
const growth = { planningBasis, actionPlan: [nextTest,
  { week: 'Week 2', action: 'Offer a narrow paid pilot to recent problem sufferers.', owner: 'Founder', kpi: 'Record offers and accepted paid pilots; continue only after two real commitments.',
    hypothesis: 'Owners with recent costly stockouts will pay for a limited pilot', participantUnit: planningBasis.participantUnit, denominator: 'Five proposed identical paid offers', passCriterion: 'At least two paid pilot commitments at the disclosed pilot price', decisionOnFailure: 'Pause building and interview non-buyers before revising the offer' },
  { week: 'Week 3', action: 'Measure reconciliation time and repeat use in the pilot.', owner: 'Founder', kpi: 'Review completed weekly checks and documented time saved with each pilot participant.',
    hypothesis: 'The pilot reduces time spent reconciling stock', participantUnit: planningBasis.participantUnit, denominator: 'The two paying pilot shops, if the prior criterion passes', passCriterion: 'Both shops repeat the workflow and record at least 20% less time than baseline', decisionOnFailure: 'Revise the workflow and repeat the same measurement before expanding' },
  { week: 'Week 4', action: 'Compare pilot costs and retention, then decide the next iteration.', owner: 'Founder', kpi: 'Choose expand, revise or stop from observed reuse and delivery costs.',
    hypothesis: 'Paid reuse covers the direct cost of delivery', participantUnit: planningBasis.participantUnit, denominator: 'The same two pilot shops', passCriterion: 'Both renew at the disclosed price and each has positive measured contribution', decisionOnFailure: 'Stop expansion and revise costs or pricing with the existing shops' }], nextStepRecommendation: 'MORE_VALIDATION', nextStepRationale: 'Willingness to pay is untested.' }
const market = {
  marketScore: 6,
  tamSamSom: { tam: { value: 'Not established', method: 'Reachable customer counts and spending are missing', source: '', label: 'PROJECTION' },
    sam: { value: 'Not established', method: 'No segment counts', label: 'PROJECTION' }, som: { value: 'Not established', method: 'No acquisition evidence', label: 'PROJECTION' } },
  pestleAnalysis: { political: [], economic: ['Macroeconomic data provides context only.'], social: [], technological: [], legal: [], environmental: [] },
}
const force = { level: 'MEDIUM', reasoning: 'Unverified initial hypothesis' }
export const PIPELINE_REPLIES: Record<string, unknown> = {
  market,
  customer: { problemScore: 8, customerScore: 6, wtpScore: 4, personas: [persona],
    problemValidation5Factor: Object.fromEntries(['frequency', 'severity', 'urgency', 'dissatisfaction', 'willingnessToSeekSolution'].map(name => [name, { score: 3, reasoning: PRIVATE_DERIVED }])),
    customerJPG: { jobs: ['Count stock'], pains: ['Uncertain inventory'], gains: ['Time saved'], painRelievers: ['Stock log'], gainCreators: ['Shared visibility'] },
    interviewQuestions: Array.from({ length: 10 }, (_, index) => ({ question: 'Describe a recent stock decision, example ' + (index + 1), category: 'Past behavior', rationale: 'Check a specific experience' })),
    wtpSurveyQuestions: [{ question: 'What did the last stockout cost?', type: 'open' }] },
  competitor: { competitiveScore: 3, competitors: [], competitorPositioning: [], portersFiveForces: { competitiveRivalry: force, threatOfNewEntrants: force, supplierPower: force, buyerPower: force, threatOfSubstitutes: force } },
  finance: { financialScore: 2, businessModelScore: 4, unitEconomicsAssumptions: { estimatedSellingPrice: 50, estimatedVariableCost: 10, estimatedFixedCostMonthly: 5000, estimatedCACMonthly: 200, estimatedMonthlyCustomers: 50, estimatedChurnRate: 0.02, assumptionLabel: 'ASSUMPTION' } },
  risk: { keyRisks: ['Demand is untested', 'Acquisition costs are unknown'], swot: { strengths: ['Narrow initial scope'], weaknesses: ['No verified demand'], opportunities: ['Discovery interviews'], threats: ['Existing workarounds'] }, riskRegister: [] },
  product, growth,
  evidence: { summary: 'Official macroeconomic evidence does not establish customer demand.', checks: [], gaps: ['Verify willingness to pay with customers.'] },
  synthesis: { ...product, ...growth, executionScore: 2, decision: 'TEST_FURTHER', decisionReasons: ['Demand is untested', 'Pricing is a hypothesis'],
    keyEvidence: [], integrityNote: 'Desk research and synthetic assumptions only.', founderAssumptions: [{ id: 1, assumption: 'Shops want a simpler inventory log', category: 'CUSTOMER', preResearchBelief: 'Uncertain', postResearchFinding: PRIVATE_DERIVED, validated: false, confidenceChange: 'UNCHANGED' }] },
}
export const PIPELINE_LITE_REPLY = {
  problemScore: 8, customerScore: 6, marketScore: 6, competitiveScore: 3, wtpScore: 4, businessModelScore: 4, financialScore: 2, executionScore: 2,
  decision: 'TEST_FURTHER', decisionReasons: ['Demand is untested', 'Pricing is a hypothesis'], keyEvidence: [], keyRisks: ['Demand is untested', 'Acquisition costs are unknown'],
  nextStepRecommendation: 'MORE_VALIDATION' as const, nextStepRationale: 'Offer a clearly priced paid pilot to five eligible shop owners; revise the offer if fewer than two make a paid commitment.',
  actionPlan: growth.actionPlan, persona, competitors: [], tamEstimate: 'Not established', samEstimate: 'Not established', somEstimate: 'Not established', integrityNote: 'Desk research only.',
}
