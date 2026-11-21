import { describe, expect, it } from 'vitest'
import { calculateCampaign, calculatePricing, CrowdfundingInputSchema, PricingInputSchema } from '@/lib/planning/economics'
import { normalizeSavedModuleRecord } from '@/lib/saved-module-result'
import { stagedPitchFixture } from './fixtures/pitch-deck'
import { SourceReportSnapshotSchema } from '@/lib/planning/source-report-contract'

const id = '11111111-1111-4111-8111-111111111111'
const ideaId = '22222222-2222-4222-8222-222222222222'
const sources = [{ title: 'Source to review', url: 'https://example.com/pricing', fetchedAt: '2026-11-14', retrievalKind: 'page', evidenceNote: 'Read before relying on this claim.' }]
const pricingInputs = PricingInputSchema.parse({ ideaId, sellingPrice: 1200, expectedCustomers: 80, variableCostPerUnit: 400,
  fixedCostMonthly: 40000, discountPercent: 15, conversionRatePercent: 1.2, estimatedCac: 300, retentionMonths: 9,
  billingModel: 'one_time', paymentFeePercent: 2, demandElasticity: 0.7 })
const campaignInputs = CrowdfundingInputSchema.parse({ ideaId, fundingGoal: 50000, projectDescription: 'A campaign with budgeted delivery obligations.',
  category: 'Design', country: 'India', preLaunchCommunitySize: 500, socialFollowers: 1000, emailListSize: 300, campaignDurationDays: 25,
  rewardTiers: 3, lowestReward: 50, averageReward: 250, highestReward: 500, hasVideo: true, marketingBudget: 4000,
  currency: 'INR', expectedVisitors: 8000, conversionRatePercent: 4.2, platformFeePercent: 6, processingFeePercent: 2.5,
  processingFeePerBacker: 3, rewardCostPerBacker: 100, shippingCostPerBacker: 20, productionFixedCost: 6000, contingencyPercent: 15, allOrNothing: false })
const sourceReport=SourceReportSnapshotSchema.parse({version:'validation-planning-v1',reportId:'33333333-3333-4333-8333-333333333333',ideaId,
  status:'partial',mode:'lite',score:43,reportCreatedAt:'2026-11-15T00:00:00Z',capturedAt:'2026-11-16T00:00:00Z',contentHash:'a'.repeat(64),
  briefProvenance:'captured_with_report',originalBrief:{name:'Original idea',coreProblem:'Earlier private problem',publicResearchFocus:'Approved inventory topic'},
  findings:{decisionReasons:['Demand remains unmeasured'],actionPlan:[{passCriterion:'4 actual paid deposits / 20 eligible offers',decisionOnFailure:'Revise the buyer hypothesis'}]},
  coverage:{suppliedFields:['decisionReasons','actionPlan'],omittedFields:['landingPageCopy'],sourceCount:0,suppliedSourceCount:0,sourceExcerpts:0,metadataOnlySources:0,notices:['Partial AI report, not verified demand']},researchSources:[],interpretation:'Prior AI interpretations and proposed tests, not observed facts'})

describe('saved planning result round trips', () => {
  it.each(['pricing','crowdfunding','pitch-deck'] as const)('keeps selected report identity, original brief, private criteria and partial coverage when reopening %s',module=>{
    const input = module==='pricing' ? {id,ideaId,pricingScore:40,reportData:{inputs:{...pricingInputs,sourceReportId:sourceReport.reportId},...calculatePricing(pricingInputs),sourceReport}}
      :module==='crowdfunding' ? {id,ideaId,performanceScore:40,recommendation:'TEST_FURTHER',reportData:{inputs:{...campaignInputs,sourceReportId:sourceReport.reportId},...calculateCampaign(campaignInputs),sourceReport}}
      :{id,ideaId,qualityScore:40,...stagedPitchFixture,reportData:{ai:stagedPitchFixture,inputs:{sourceReportId:sourceReport.reportId},sourceReport}}
    const reopened=normalizeSavedModuleRecord(module,JSON.parse(JSON.stringify(input)))
    expect(reopened.reportData.sourceReport).toEqual(sourceReport)
    expect(reopened.reportData.inputs.sourceReportId).toBe(sourceReport.reportId)
  })
  it('keeps every staged pitch slide, speaker note, script, investor answer and strategy section on reopening', () => {
    const record = { id, ideaId, qualityScore: 38,
      ...stagedPitchFixture, reportData: { ai: stagedPitchFixture, researchSources: sources,
        generationTrace: { method: 'staged_pitch_v2', stages: [{ stage: 'slides', provider: 'synthetic-model' }], reviewHandoff: { slides: stagedPitchFixture.slides, strategy: { kpiTargets: stagedPitchFixture.kpiTargets } } },
        inputs: { founderName: 'Exact founder', founderBackground: 'A founder-supplied retail operating background.', teamSize: 2,
          fundingAskAmount: 'USD 75,000 after the evidence review', useOfFunds: 'Pilot delivery first; no spend before milestone review.',
          milestones: [{ milestone: 'Measure paid demand', targetDate: '2026-12-01', status: 'PLANNED' }] } } }
    const reopened = normalizeSavedModuleRecord('pitch-deck', JSON.parse(JSON.stringify(record)))
    expect(reopened.slides).toEqual(stagedPitchFixture.slides)
    expect(reopened.pitchScript3min).toBe(stagedPitchFixture.pitchScript3min)
    expect(reopened.pitchScript60sec).toBe(stagedPitchFixture.pitchScript60sec)
    expect(reopened.investorQa).toEqual(stagedPitchFixture.investorQa)
    expect(reopened.portfolioSections).toEqual(stagedPitchFixture.portfolioSections)
    expect(reopened.reportData.ai.actionPlan).toEqual(stagedPitchFixture.actionPlan)
    expect(reopened.reportData.ai.kpiTargets).toEqual(stagedPitchFixture.kpiTargets)
    expect(reopened.reportData.ai.pestleAnalysis).toEqual(stagedPitchFixture.pestleAnalysis)
    expect(reopened.reportData.inputs).toEqual(record.reportData.inputs)
    expect(reopened.reportData.generationTrace).toEqual(record.reportData.generationTrace)
  })
  it('preserves every pricing input and produces identical calculator output on reopening', () => {
    const calculated = calculatePricing(pricingInputs)
    const record = { id, ideaId, pricingScore: 60, reportData: { inputs: pricingInputs, ...calculated, researchSources: sources, evidenceGaps: ['Demand remains unmeasured.'], aiAnalysis: {} } }
    const reopened = normalizeSavedModuleRecord('pricing', JSON.parse(JSON.stringify(record)))
    expect(reopened.reportData.inputs).toEqual(pricingInputs)
    expect(calculatePricing(reopened.reportData.inputs)).toEqual(calculated)
    expect(reopened.reportData.computedMetrics).toEqual(calculated.computedMetrics)
    expect(reopened.reportData.scenarios).toEqual(calculated.scenarios)
    expect(reopened.reportData.sensitivityMatrix).toEqual(calculated.sensitivityMatrix)
    expect(reopened.reportData.researchSources).toEqual(sources)
    expect(reopened.reportData.evidenceGaps).toEqual(record.reportData.evidenceGaps)
  })
  it('preserves campaign currency, fees, delivery costs and collection model', () => {
    const calculated = calculateCampaign(campaignInputs)
    const record = { id, ideaId, performanceScore: 60, recommendation: 'TEST_FURTHER', reportData: { inputs: campaignInputs, ...calculated, researchSources: sources, evidenceGaps: ['Confirm supplier quotes.'], ai: { scenarios: calculated.scenarios } } }
    const reopened = normalizeSavedModuleRecord('crowdfunding', JSON.parse(JSON.stringify(record)))
    expect(reopened.reportData.inputs).toEqual(campaignInputs)
    expect(calculateCampaign(reopened.reportData.inputs)).toEqual(calculated)
    expect(reopened.reportData.computedMetrics).toEqual(calculated.computedMetrics)
    expect(reopened.reportData.scenarios).toEqual(calculated.scenarios)
    expect(reopened.reportData.ai.scenarios).toEqual(calculated.scenarios)
    expect(reopened.reportData.calculationAssumptions).toEqual(calculated.calculationAssumptions)
    expect(reopened.reportData.warnings).toEqual(calculated.warnings)
  })
  it('preserves the attainable campaign goal proceeds and their exact calculation basis on reopening', () => {
    const inputs = { ...campaignInputs, fundingGoal: 40, lowestReward: 100, averageReward: 100, highestReward: 100,
      expectedVisitors: 100, conversionRatePercent: 1, marketingBudget: 0, productionFixedCost: 0,
      platformFeePercent: 5, processingFeePercent: 4, processingFeePerBacker: 0,
      rewardCostPerBacker: 30, shippingCostPerBacker: 10, contingencyPercent: 10 }
    const calculated = calculateCampaign(inputs)
    const reopened = normalizeSavedModuleRecord('crowdfunding', JSON.parse(JSON.stringify({ id, ideaId,
      performanceScore: 50, recommendation: 'TEST_FURTHER', reportData: { inputs, ...calculated } })))
    expect(reopened.reportData.computedMetrics).toEqual(calculated.computedMetrics)
    expect(reopened.reportData.computedMetrics).toMatchObject({ grossPledgesAtGoal: 100, feesAtGoal: 9, goalNetSurplus: 47 })
    expect(reopened.reportData.calculationAssumptions.goalBasis).toBe(calculated.calculationAssumptions.goalBasis)
  })
  it('preserves future flat calculated metrics and rejects invalid metric payloads', () => {
    const computedMetrics = { ...calculatePricing(pricingInputs).computedMetrics, futureCashMetric: -1200.5, futureMetricNote: 'Explicit calculation basis', futureFlag: true, futureUnavailableMetric: null }
    const record = { id, ideaId, pricingScore: 60, reportData: { inputs: pricingInputs, computedMetrics } }
    expect(normalizeSavedModuleRecord('pricing', record).reportData.computedMetrics).toEqual(computedMetrics)
    for (const invalid of [Infinity, NaN, { nested: 100 }, [100]]) {
      expect(() => normalizeSavedModuleRecord('pricing', { ...record, reportData: { ...record.reportData, computedMetrics: { ...computedMetrics, futureCashMetric: invalid } } })).toThrow(/incomplete/)
    }
  })
  it('uses the documented legacy pricing defaults when newer assumptions were never saved', () => {
    const legacy = { sellingPrice: 1000, expectedCustomers: 100, variableCostPerUnit: 300, fixedCostMonthly: 50000, discountPercent: 10, estimatedCac: 500, retentionMonths: 18 }
    const reopened = normalizeSavedModuleRecord('pricing', { id, ideaId, pricingScore: 50, reportData: { inputs: legacy } })
    expect(reopened.reportData.inputs).toMatchObject({ ...legacy, billingModel: 'recurring', paymentFeePercent: 0, demandElasticity: 1.5, conversionRatePercent: 3.5 })
    expect(calculatePricing({ ideaId, ...reopened.reportData.inputs }).computedMetrics.operatingProfit).toBe(20000)
  })
  it('continues to reopen partial legacy campaign records without inventing delivery costs', () => {
    const reopened = normalizeSavedModuleRecord('crowdfunding', { id, ideaId, performanceScore: 50, recommendation: 'TEST_FURTHER', reportData: { inputs: { fundingGoal: 50000, projectDescription: null }, computedMetrics: { requiredBackers: 500 } } })
    expect(reopened.reportData.inputs.fundingGoal).toBe(50000)
    expect(reopened.reportData.inputs.projectDescription).toBeUndefined()
    expect(reopened.reportData.inputs.rewardCostPerBacker ?? 0).toBe(0)
  })
  it.each([{ paymentFeePercent: -2 }, { demandElasticity: 10 }, { billingModel: 'annual' }, { conversionRatePercent: 150 }])('rejects corrupted pricing assumption %j before mounting', patch => {
    expect(() => normalizeSavedModuleRecord('pricing', { id, ideaId, pricingScore: 50, reportData: { inputs: { ...pricingInputs, ...patch } } })).toThrow(/incomplete/)
  })
  it.each([{ currency: 'XYZ' }, { rewardCostPerBacker: -5 }, { allOrNothing: 'false' }, { averageReward: 1000 }])('rejects corrupted campaign assumption %j before mounting', patch => {
    expect(() => normalizeSavedModuleRecord('crowdfunding', { id, ideaId, performanceScore: 50, recommendation: 'TEST_FURTHER', reportData: { inputs: { ...campaignInputs, ...patch } } })).toThrow(/incomplete/)
  })
})
