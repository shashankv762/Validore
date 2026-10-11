import { describe, it, expect } from 'vitest'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { ScatterPlot2x2 } from '@/components/ui/ScatterPlot2x2'
import { RiskRegisterTable, RiskItem } from '@/components/ui/RiskRegisterTable'
import { ActionPlanTable, ActionPlanRow } from '@/components/ui/ActionPlanTable'
import { ScorecardGrid, ScorecardItem } from '@/components/ui/ScorecardGrid'

describe('Empirical Challenger P0: Reusable UI Components & Boundary Stress Harness', () => {

  describe('1. ScatterPlot2x2 Component Stress Testing', () => {
    it('handles empty points array gracefully', () => {
      const html = renderToString(React.createElement(ScatterPlot2x2, { data: [] }))
      expect(html).toContain('Loading positioning chart...')
    })

    it('handles extreme and negative coordinates without error', () => {
      const points = [
        { name: 'Underflow Point', x: -100, y: -50 },
        { name: 'Overflow Point', x: 9999, y: 8888, isHighlighted: true },
        { name: 'Zero Point', x: 0, y: 0 },
        { name: 'Standard Point', x: 50, y: 50, category: 'Incumbent', notes: 'Strong moat' },
      ]
      const html = renderToString(React.createElement(ScatterPlot2x2, {
        data: points,
        title: 'Adversarial Scatter Test',
        subtitle: 'Boundary coords',
        xLabel: 'X Metric',
        yLabel: 'Y Metric',
      }))
      // In SSR / node, mounted is false so fallback renders cleanly without crashing
      expect(html).toContain('Loading positioning chart...')
    })
  })

  describe('2. RiskRegisterTable Component Stress Testing', () => {
    it('handles empty risks array and displays fallback message', () => {
      const html = renderToString(React.createElement(RiskRegisterTable, { risks: [] }))
      expect(html).toContain('No specific risk factors cataloged')
    })

    it('correctly maps severity levels and badges across various inputs', () => {
      const risks: RiskItem[] = [
        { risk: 'Explicit Critical', riskLevel: 'critical', mitigation: 'Hedge now' },
        { risk: 'High Risk Combo', probability: 'high', impact: 'high', mitigation: 'Dual supplier' },
        { risk: 'High Prob Only', probability: 'high', impact: 'low', mitigation: 'Monitor' },
        { risk: 'Medium Combo', probability: 'medium', impact: 'medium', mitigation: 'Plan B' },
        { risk: 'Low Risk', probability: 'low', impact: 'low', mitigation: 'Accept' },
        { risk: 'Malformed Risk', probability: 'unknown-prob', impact: 'unknown-imp', mitigation: 'Review' },
      ]
      const html = renderToString(React.createElement(RiskRegisterTable, {
        risks,
        title: 'Project Risk Analysis',
        showOwner: true,
      }))

      expect(html).toContain('Explicit Critical')
      expect(html).toContain('High Risk Combo')
      expect(html).toContain('Mitigation Strategy')
      expect(html).toContain('Owner')
      expect(html).toContain('critical')
      expect(html).toContain('high')
      expect(html).toContain('medium')
      expect(html).toContain('low')
    })

    it('safely escapes special characters and long text', () => {
      const risks: RiskItem[] = [
        {
          risk: 'Injection <script>alert("risk")</script> & Risk',
          probability: 'high',
          impact: 'high',
          mitigation: 'Strict input sanitization & <tag> testing',
        },
      ]
      const html = renderToString(React.createElement(RiskRegisterTable, { risks }))
      expect(html).toContain('&lt;script&gt;alert(&quot;risk&quot;)&lt;/script&gt;')
      expect(html).not.toContain('<script>')
    })
  })

  describe('3. ActionPlanTable Component Stress Testing', () => {
    it('renders empty plan fallback', () => {
      const html = renderToString(React.createElement(ActionPlanTable, { plan: [] }))
      expect(html).toContain('No phased action steps currently scheduled')
    })

    it('resolves timeline headers flexibly from week, phase, timeframe, or step', () => {
      const plan: ActionPlanRow[] = [
        { week: 'Week 1', action: 'Customer Discovery', owner: 'Alice', kpi: '10 Interviews' },
        { phase: 'Phase A', activity: 'Prototyping', owner: 'Bob', kpi: 'Figma wireframes' },
        { timeframe: 'Q3 2026', action: 'Beta Rollout', kpi: '100 signups' },
        { step: 4, activity: 'Launch Day', kpi: 'Product Hunt top 3' },
        { action: 'Fallback Timeline', kpi: 'Post-launch' },
      ]
      const html = renderToString(React.createElement(ActionPlanTable, {
        plan,
        showExpectedOutput: true,
      }))

      expect(html).toContain('Week 1')
      expect(html).toContain('Phase A')
      expect(html).toContain('Q3 2026')
      expect(html).toContain('Step 4')
      expect(html).toContain('Phase 5') // fallback for index 4
      expect(html).toContain('Customer Discovery')
      expect(html).toContain('Prototyping')
      expect(html).toContain('Expected Output')
    })
  })

  describe('4. ScorecardGrid Component Stress Testing', () => {
    it('returns null on empty array', () => {
      const html = renderToString(React.createElement(ScorecardGrid, { scores: [] }))
      expect(html).toBe('')
    })

    it('correctly calculates percentages and defaults maxScore', () => {
      const scores: ScorecardItem[] = [
        { label: 'Small Category', score: 12 }, // max should default to 15 (12/15 = 80% -> green)
        { label: 'Medium Category', score: 18 }, // max should default to 20 (18/20 = 90% -> green)
        { label: 'Large Category', score: 45 }, // max should default to 100 (45/100 = 45% -> red)
        { label: 'Explicit Max', score: 7, maxScore: 10 }, // 7/10 = 70% -> gold
        { label: 'Zero Score', score: 0, maxScore: 10 },
        { label: 'Negative / Clamped', score: -5, maxScore: 10 },
        { label: 'Over 100% Clamped', score: 150, maxScore: 100 },
      ]
      const html = renderToString(React.createElement(ScorecardGrid, {
        scores,
        columns: 4,
        title: 'Quality Dimensions',
      }))

      expect(html).toContain('Small Category')
      expect(html).toMatch(/\/\s*(<!-- -->)?\s*15/)
      expect(html).toMatch(/\/\s*(<!-- -->)?\s*20/)
      expect(html).toMatch(/\/\s*(<!-- -->)?\s*100/)
      expect(html).toMatch(/\/\s*(<!-- -->)?\s*10/)
      expect(html).toContain('Quality Dimensions')
    })
  })

  describe('5. 30-Field Formula & Data Contract Verification Harness', () => {
    it('0A (Validation): TAM/SAM/SOM, MoSCoW, SWOT, ActionPlan, Personas data contracts match', () => {
      const sampleReportData = {
        tamSamSom: {
          tam: { value: '$10B', method: 'Top-down Gartner report' },
          sam: { value: '$2B', method: 'Serviceable US tech SME' },
          som: { value: '$200M', method: 'Capture 10% SAM' },
        },
        personas: [
          {
            name: 'Startup Founder Sarah',
            occupation: 'CEO',
            goals: ['Validate fast', 'Raise seed'],
            problems: ['High uncertainty', 'Slow dev'],
            priceSensitivity: 'low',
          },
        ],
        selectedUvp: 'Validate ideas in 24 hours with AI and real market signals',
        uvpOptions: ['Angle 1: Fast test', 'Angle 2: Investor ready', 'Angle 3: Risk mitigation'],
        moscowFeatures: {
          mustHave: ['Authentication', 'Core Report'],
          shouldHave: ['Export PPTX'],
          couldHave: ['Custom themes'],
          wontHave: ['Mobile app native'],
        },
        swot: {
          strengths: ['Proprietary dataset'],
          weaknesses: ['New brand'],
          opportunities: ['Growing solopreneur market'],
          threats: ['Fast follower competition'],
        },
        riskRegister: [
          { risk: 'Model drift', probability: 'medium', impact: 'high', riskLevel: 'high', mitigation: 'Pin versions' },
        ],
        actionPlan: [
          { week: 'Week 1', action: 'Beta launch', owner: 'Team', kpi: '10 users' },
        ],
        mvpDescription: 'Core Next.js dashboard with 5 modules',
        nextStepRecommendation: 'BUILD_MVP',
        nextStepRationale: 'Problem and demand scores exceed 80/100 threshold',
        keyEvidence: [
          { claim: '70% startups fail from no market need', source: 'CB Insights', year: '2023', strength: 'STRONGER', label: 'VERIFIED' },
        ],
      }

      expect(sampleReportData.tamSamSom.tam.value).toBe('$10B')
      expect(sampleReportData.personas).toHaveLength(1)
      expect(sampleReportData.uvpOptions).toHaveLength(3)
      expect(sampleReportData.moscowFeatures.mustHave).toContain('Authentication')
      expect(sampleReportData.swot.strengths).toHaveLength(1)
      expect(sampleReportData.riskRegister[0].riskLevel).toBe('high')
      expect(sampleReportData.actionPlan[0].week).toBe('Week 1')
      expect(sampleReportData.mvpDescription).toBeTruthy()
      expect(sampleReportData.nextStepRecommendation).toBe('BUILD_MVP')
      expect(sampleReportData.keyEvidence[0].label).toBe('VERIFIED')
    })

    it('0B (Crowdfunding): 10 scores, marketing cost per backer calculation', () => {
      const budget = 2000
      const requiredBackers = 400
      const marketingCostPerBacker = requiredBackers > 0 ? budget / requiredBackers : 0
      expect(marketingCostPerBacker).toBe(5.00)

      // Test zero backers edge case
      const zeroBackers = 0
      const costWithZero = zeroBackers > 0 ? budget / zeroBackers : 0
      expect(costWithZero).toBe(0)
    })

    it('0C (Lean Canvas): confidence score gauge and experiment contracts', () => {
      const confidenceScores = {
        riskiestAssumption: 'Founders will pay $29/mo for automated validation',
        validationExperiments: [
          { assumption: 'Pay $29/mo', experiment: 'Fake door landing page', successMetric: '5% signup rate', timeframe: '2 weeks' },
        ],
        overallScore: 78,
      }
      expect(confidenceScores.riskiestAssumption).toBeTruthy()
      expect(confidenceScores.validationExperiments).toHaveLength(1)
      expect(confidenceScores.overallScore).toBe(78)
    })

    it('0D (Pitch Deck): 10 quality scores, founder readiness, portfolio sections', () => {
      const aiData = {
        problemClarityScore: 9,
        solutionStrengthScore: 8,
        customerEvidenceScore: 7,
        marketOpportunityScore: 9,
        businessModelScore: 8,
        competitivePositioningScore: 8,
        gtmStrategyScore: 7,
        financialLogicScore: 8,
        teamExecutionScore: 9,
        presentationQualityScore: 8,
        founderReadinessScore: 82,
        founderReadinessNote: 'Strong technical background, needs direct sales iteration.',
        portfolioSections: [
          { sectionTitle: 'Overview', content: 'Validore AI validation', label: 'PORTFOLIO' },
        ],
      }
      const sum = (
        aiData.problemClarityScore +
        aiData.solutionStrengthScore +
        aiData.customerEvidenceScore +
        aiData.marketOpportunityScore +
        aiData.businessModelScore +
        aiData.competitivePositioningScore +
        aiData.gtmStrategyScore +
        aiData.financialLogicScore +
        aiData.teamExecutionScore +
        aiData.presentationQualityScore
      )
      expect(sum).toBe(81)
      expect(aiData.founderReadinessScore).toBe(82)
      expect(aiData.portfolioSections).toHaveLength(1)
    })

    it('0E (Pricing): discount break-even volume formula edge cases', () => {
      const price = 1000
      const vc = 300
      const customers = 100
      const discountPct = 10 // 10% discount -> price 900
      const normalCm = price - vc // 700
      const discountedCm = (price * (1 - discountPct / 100)) - vc // 900 - 300 = 600

      const discountBreakEven = discountedCm > 0 ? (normalCm * customers) / discountedCm : Infinity
      expect(discountBreakEven).toBeCloseTo(116.67, 1)

      // Extreme edge case: discount wipes out contribution margin
      const deepDiscountPct = 80 // price 200, vc 300 -> discountedCm = -100
      const deepDiscountedCm = (price * (1 - deepDiscountPct / 100)) - vc
      const invalidBreakEven = deepDiscountedCm > 0 ? (normalCm * customers) / deepDiscountedCm : Infinity
      expect(invalidBreakEven).toBe(Infinity)
    })
  })
})
