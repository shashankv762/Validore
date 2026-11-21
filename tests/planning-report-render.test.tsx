import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
vi.mock('@/components/AccountProvider',()=>({useAccount:()=>({data:{user:{id:'11111111-1111-4111-8111-111111111111'}}})}))
import { PricingReport } from '@/app/dashboard/pricing/PricingReport'
import { CrowdfundingReport } from '@/app/dashboard/crowdfunding/CrowdfundingReport'
import { calculatePricing, PricingInputSchema } from '@/lib/planning/economics'
import { PlanningEvidence } from '@/components/planning/PlanningEvidence'
import { CampaignEconomics } from '@/app/dashboard/crowdfunding/CampaignEconomics'
import { calculateCampaign, CrowdfundingInputSchema } from '@/lib/planning/economics'
import { SourceReportSelector } from '@/components/planning/SourceReportSelector'
import { SourceReportSummary } from '@/components/planning/SourceReportSummary'

describe('useful planning reports with incomplete evidence', () => {
  it('defaults the shared report selector to no selection and names its private evidence boundary',()=>{
    const html=renderToStaticMarkup(createElement(SourceReportSelector,{ideaId:'11111111-1111-4111-8111-111111111111',value:'',onChange:vi.fn()}))
    expect(html).toContain('<option value="" selected="">Continue without a linked report</option>')
    expect(html).toContain('Use a saved validation report (optional)')
    expect(html).toContain('Prior AI assessments remain assumptions and interpretations')
  })
  it('shows captured partial provenance and missing criteria without presenting them as verified observations',()=>{
    const html=renderToStaticMarkup(createElement(SourceReportSummary,{value:{version:'validation-planning-v1',reportId:'11111111-1111-4111-8111-111111111111',ideaId:'22222222-2222-4222-8222-222222222222',
      status:'partial',mode:'lite',score:43,reportCreatedAt:'2026-11-15',capturedAt:'2026-11-16',contentHash:'a'.repeat(64),briefProvenance:'unavailable_in_legacy_report',originalBrief:null,
      findings:{actionPlan:[{passCriterion:'No legacy criterion supplied'}]},coverage:{suppliedFields:['actionPlan'],omittedFields:[],sourceCount:2,suppliedSourceCount:1,sourceExcerpts:0,metadataOnlySources:1,
        notices:['Partial report: missing customer work remains unavailable.','Metadata-only source does not establish a verified price.']},researchSources:[],interpretation:'Prior AI findings'}}))
    expect(html).toContain('Linked Lite validation · Partial · 43/100')
    expect(html).toContain('missing customer work remains unavailable')
    expect(html).toContain('does not establish a verified price')
  })
  it('keeps usable source links while ignoring malformed or credential-bearing legacy links', () => {
    const html = renderToStaticMarkup(createElement(PlanningEvidence, { sources: [
      { url: 'https://' }, { url: 'javascript:alert(1)' }, { url: 'https://owner:secret@example.test/private' },
      { url: 'https://example.test/research', fetchedAt: '2026-11-14', retrievalKind: 'page' },
    ] }))
    expect(html).toContain('https://example.test/research')
    expect(html).toContain('1 sources')
    expect(html).not.toContain('owner:secret'); expect(html).not.toContain('javascript:')
  })
  it('renders available research and next tests without empty optional pricing tables', () => {
    const html = renderToStaticMarkup(createElement(PricingReport, { data: { customerWtpInsights: 'A paid pilot is still needed to establish willingness to pay.',
      customerValueAnalysis: 'Measure the time saved by the proposed stock workflow.', validationStepsRequired: ['Offer a narrow paid pilot.'], thirtyDayValidationPlan: [], riskRegister: [] } }))
    expect(html).toContain('paid pilot'); expect(html).toContain('Customer WTP Insights')
    expect(html).not.toContain('Competitor Pricing Matrix'); expect(html).not.toContain('Cost Breakdown')
    expect(html).not.toContain('Risk Register'); expect(html).not.toContain('30-Day Validation Plan')
  })
  it('keeps explicit zero-cost assumptions and populated competitor evidence visible', () => {
    const html = renderToStaticMarkup(createElement(PricingReport, { data: { costBreakdown: { cogs: 0, fixedCosts: 0, variableCosts: 0, targetMargin: 0, breakEvenPrice: 0 },
      competitorPricingMatrix: [{ competitor: 'Synthetic comparable', price: 100, tier: 'Entry', features: ['Stock log'], positioning: 'A proposed comparison.' }] } }))
    expect(html).toContain('Cost Breakdown'); expect(html).toContain('Synthetic comparable'); expect(html).toContain('INR 100')
  })
  it('does not present empty campaign probability bands or synthetic benchmark tables as analysis', () => {
    const html = renderToStaticMarkup(createElement(CrowdfundingReport, { data: { founderAssumptions: ['Delivery costs need to be confirmed.'], fundingBands: [], goalBands: [], categoryBenchmark: null, marketingFunnel: [] } }))
    expect(html).toContain('Delivery costs'); expect(html).not.toContain('Funding Probability Bands'); expect(html).not.toContain('Goal Multiple Analysis')
  })
  it('shows the financial difference between base, discount and newly acquired-customer scenarios', () => {
    const input = PricingInputSchema.parse({ ideaId: '11111111-1111-4111-8111-111111111111', sellingPrice: 1200, expectedCustomers: 100, variableCostPerUnit: 300,
      fixedCostMonthly: 50000, discountPercent: 10, conversionRatePercent: 3.5, estimatedCac: 500, retentionMonths: 18, paymentFeePercent: 2 })
    const m = calculatePricing(input).computedMetrics
    expect(m.operatingProfit).toBe(37600); expect(m.discountedPrice).toBe(1080)
    expect(m.discountedRevenue).toBe(108000); expect(m.discountedOperatingProfit).toBe(25840)
    expect(m.firstMonthProfitAfterAcquisition).toBe(-12400)
  })
  it('renders the immutable campaign calculation snapshot before local what-if changes', () => {
    const inputs = CrowdfundingInputSchema.parse({ ideaId: '11111111-1111-4111-8111-111111111111', fundingGoal: 40,
      projectDescription: 'A founder-supplied product and fulfillment campaign.', category: 'Design', country: 'United States',
      preLaunchCommunitySize: 0, socialFollowers: 0, emailListSize: 0, campaignDurationDays: 30, rewardTiers: 1,
      lowestReward: 100, averageReward: 100, highestReward: 100, hasVideo: false, marketingBudget: 0,
      expectedVisitors: 100, conversionRatePercent: 1, rewardCostPerBacker: 40 })
    const saved = calculateCampaign(inputs)
    const historical = { ...saved, computedMetrics: { ...saved.computedMetrics, goalNetSurplus: 111 },
      calculationAssumptions: { ...saved.calculationAssumptions, methodVersion: 'historical-campaign-contract' } }
    const html = renderToStaticMarkup(createElement(CampaignEconomics, { inputs, saved: historical }))
    expect(html).toContain('Showing the calculations saved with this report.')
    expect(html).toContain('$111')
    expect(html).not.toContain('Reset to saved assumptions')
  })
})
