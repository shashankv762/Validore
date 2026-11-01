// Synthetic provider responses for testing the real SDK/coordinator boundary.
// These are never seeded or used as market evidence in the application.
export const PRIVATE_ANSWER = 'PRIVATE-FOUNDER-NOTES-7439'
export const PRIVATE_DERIVED = 'PRIVATE-DERIVED-CUSTOMER-FINDING-8520'
export const PIPELINE_IDEA = {
  name: 'Confidential Pilot Name', industry: 'Retail software', product: 'Private inventory prototype',
  targetCustomer: 'Independent shops', location: 'India', businessModel: 'Subscription',
  coreProblem: 'Uncertain demand for inventory support', proposedSolution: 'A limited customer pilot',
}
const nextTest = { week: 'Week 1', action: 'Interview five independent shop owners', owner: 'Founder', kpi: 'Record the latest stockout and workaround in five interviews' }
const persona = { name: 'Proposed shop owner', ageRange: 'Unknown', occupation: 'Shop owner', incomeRange: 'Unknown', location: 'India',
  goals: ['Reduce stockouts'], problems: ['Stock visibility'], frustrations: ['Time spent counting'], buyingBehaviour: 'Unverified',
  preferredChannels: ['Direct discovery'], decisionFactors: ['Time saved'], priceSensitivity: 'high', jobToBeDone: 'Track stock consistently' }
const product = {
  uvpOptions: ['Simpler stock counts', 'Earlier reorder prompts', 'A shared inventory log'], selectedUvp: 'Simpler stock counts',
  moscowFeatures: { mustHave: ['Stock log'], shouldHave: ['Reorder reminders'], couldHave: ['Supplier export'], wontHave: ['Payment processing'] },
  mvpDescription: 'Test a stock log with five shops.', oneLineConcept: 'A proposed stock log for independent shops.',
  landingPageCopy: { headline: 'Explore a simpler stock log', subheadline: 'A proposed pilot', benefits: ['Clear counts', 'Simple notes', 'Reorder prompts'],
    howItWorks: 'Record stock and review changes', cta: 'Join a discovery call', pricingHypothesis: 'Test a monthly subscription', faq: [] },
}
const growth = { actionPlan: [nextTest], nextStepRecommendation: 'MORE_VALIDATION', nextStepRationale: 'Willingness to pay is untested.' }
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
  actionPlan: [nextTest], persona, competitors: [], tamEstimate: 'Not established', samEstimate: 'Not established', somEstimate: 'Not established', integrityNote: 'Desk research only.',
}
