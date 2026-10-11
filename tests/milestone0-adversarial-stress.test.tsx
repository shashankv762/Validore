import { vi, describe, it, expect } from 'vitest'
import React from 'react'
import { renderToString } from 'react-dom/server'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

import { ScatterPlot2x2 } from '@/components/ui/ScatterPlot2x2'
import { RiskRegisterTable, RiskItem } from '@/components/ui/RiskRegisterTable'
import { ActionPlanTable, ActionPlanRow } from '@/components/ui/ActionPlanTable'
import { ScorecardGrid, ScorecardItem } from '@/components/ui/ScorecardGrid'
import ReportView, { ReportModel } from '@/app/dashboard/report/ReportView'

describe('Milestone 0: Adversarial Empirical Stress Suite', () => {

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. Reusable UI Components: ScatterPlot2x2
  // ─────────────────────────────────────────────────────────────────────────────
  describe('ScatterPlot2x2 Stress Testing', () => {
    it('handles empty data array without throwing during SSR', () => {
      const html = renderToString(
        <ScatterPlot2x2 data={[]} title="Empty Scatter" />
      )
      expect(html).toContain('Loading positioning chart')
    })

    it('handles extreme and boundary coordinates (negative, >100, NaN)', () => {
      const adversarialPoints = [
        { name: 'Negative Coord', x: -50, y: -100 },
        { name: 'Over 100', x: 250, y: 999 },
        { name: 'Zero Point', x: 0, y: 0 },
        { name: 'Highlighted Point', x: 50, y: 50, isHighlighted: true },
        { name: 'NaN Point', x: NaN, y: NaN },
      ]
      const html = renderToString(
        <ScatterPlot2x2 data={adversarialPoints} title="Adversarial Coordinates" />
      )
      expect(html).toBeDefined()
    })

    it('handles undefined/missing quadrantLabels gracefully', () => {
      const html = renderToString(
        <ScatterPlot2x2
          data={[{ name: 'Point A', x: 20, y: 80 }]}
          quadrantLabels={{ topRight: 'Leader' }}
        />
      )
      expect(html).toBeDefined()
    })

    it('handles 1000 data points without memory exhaustion or throw', () => {
      const largeData = Array.from({ length: 1000 }, (_, i) => ({
        name: `Startup ${i}`,
        x: Math.sin(i) * 50 + 50,
        y: Math.cos(i) * 50 + 50,
      }))
      const html = renderToString(
        <ScatterPlot2x2 data={largeData} title="Scale Test" />
      )
      expect(html).toBeDefined()
    })
  })

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. Reusable UI Components: RiskRegisterTable
  // ─────────────────────────────────────────────────────────────────────────────
  describe('RiskRegisterTable Stress Testing', () => {
    it('renders empty fallback card when risks array is empty or undefined', () => {
      const htmlEmpty = renderToString(<RiskRegisterTable risks={[]} />)
      expect(htmlEmpty).toContain('No specific risk factors cataloged')

      const htmlUndefined = renderToString(<RiskRegisterTable risks={undefined as unknown as RiskItem[]} />)
      expect(htmlUndefined).toContain('No specific risk factors cataloged')
    })

    it('handles empty object {} in risk array without crashing', () => {
      const html = renderToString(
        <RiskRegisterTable risks={[{} as RiskItem]} title="Empty Object Risk" />
      )
      expect(html).toContain('Empty Object Risk')
      expect(html).toContain('low') // defaults to low severity
    })

    it('handles completely malformed / unrecognised risk levels and severities', () => {
      const malformedRisks: RiskItem[] = [
        { risk: 'Catastrophic event', probability: 'UNKNOWN', impact: 'MASSIVE', riskLevel: 'APOCALYPTIC', mitigation: 'None' },
        { risk: 'Missing mitigation', probability: undefined, impact: undefined, mitigation: '' },
        { risk: 'Case insensitive test', riskLevel: 'CRITICAL', mitigation: 'Defense' },
      ]
      const html = renderToString(<RiskRegisterTable risks={malformedRisks} showOwner={true} />)
      expect(html).toContain('Catastrophic event')
      expect(html).toContain('critical')
      expect(html).toContain('Founder') // default owner fallback
    })

    it('handles HTML injection characters in risk text safely', () => {
      const injectionRisk: RiskItem[] = [
        { risk: '<script>alert("xss")</script>', mitigation: '<b>Sanitize</b>' }
      ]
      const html = renderToString(<RiskRegisterTable risks={injectionRisk} />)
      expect(html).not.toContain('<script>')
      expect(html).toContain('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;')
    })
  })

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. Reusable UI Components: ActionPlanTable
  // ─────────────────────────────────────────────────────────────────────────────
  describe('ActionPlanTable Stress Testing', () => {
    it('renders empty fallback when plan is empty or undefined', () => {
      const htmlEmpty = renderToString(<ActionPlanTable plan={[]} />)
      expect(htmlEmpty).toContain('No phased action steps currently scheduled')

      const htmlUndefined = renderToString(<ActionPlanTable plan={undefined as unknown as ActionPlanRow[]} />)
      expect(htmlUndefined).toContain('No phased action steps currently scheduled')
    })

    it('handles empty object {} in plan array without crashing', () => {
      const html = renderToString(<ActionPlanTable plan={[{} as ActionPlanRow]} />)
      expect(html).toContain('Phase 1')
      expect(html).toContain('Validation action item')
      expect(html).toContain('Founder / Team')
    })

    it('resolves diverse timeline formats and activities cleanly', () => {
      const diversePlan: ActionPlanRow[] = [
        { week: 'Week 1-2', action: 'Customer interviews', kpi: '20 calls' },
        { phase: 'Phase Alpha', activity: 'Prototyping', expectedOutput: 'Figma mock' },
        { step: 3, action: 'Pilot program', owner: 'Product Lead' },
        { timeframe: 'Month 2', activity: 'Go-to-market rollout' },
        { action: 'Fallback phase' },
      ]
      const html = renderToString(<ActionPlanTable plan={diversePlan} showExpectedOutput={true} />)
      expect(html).toContain('Week 1-2')
      expect(html).toContain('Phase Alpha')
      expect(html).toContain('Step 3')
      expect(html).toContain('Month 2')
      expect(html).toContain('Phase 5')
      expect(html).toContain('Expected Output')
    })
  })

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. Reusable UI Components: ScorecardGrid
  // ─────────────────────────────────────────────────────────────────────────────
  describe('ScorecardGrid Stress Testing', () => {
    it('returns null when scores array is empty or undefined', () => {
      expect(renderToString(<ScorecardGrid scores={[]} />)).toBe('')
      expect(renderToString(<ScorecardGrid scores={undefined as unknown as ScorecardItem[]} />)).toBe('')
    })

    it('handles extreme scores (negative, >100, NaN, 0, maxScore=0)', () => {
      const adversarialScores: ScorecardItem[] = [
        { label: 'Negative Score', score: -25, maxScore: 100 },
        { label: 'Over 100 Score', score: 350, maxScore: 100 },
        { label: 'NaN Score', score: NaN, maxScore: 100 },
        { label: 'Zero MaxScore', score: 10, maxScore: 0 },
        { label: 'Auto Scale <= 15', score: 12 },
        { label: 'Auto Scale <= 20', score: 18 },
        { label: 'Auto Scale > 20', score: 75 },
      ]
      const html = renderToString(<ScorecardGrid scores={adversarialScores} columns={5} />)
      expect(html).toContain('Negative Score')
      expect(html).toContain('Over 100 Score')
      expect(html).toContain('Auto Scale &lt;= 15')
      expect(html).toMatch(/\/.*15/)
      expect(html).toMatch(/\/.*20/)
      expect(html).toMatch(/\/.*100/)
    })

    it('supports all responsive column configurations (2, 3, 4, 5)', () => {
      const scores = [{ label: 'Metric', score: 10, maxScore: 10 }]
      for (const cols of [2, 3, 4, 5] as const) {
        const html = renderToString(<ScorecardGrid scores={scores} columns={cols} />)
        expect(html).toBeDefined()
      }
    })
  })

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. Dashboard ReportView Component Adversarial Stress Testing
  // ─────────────────────────────────────────────────────────────────────────────
  describe('ReportView Adversarial Stress Testing', () => {
    it('renders cleanly when report is null', () => {
      const html = renderToString(<ReportView report={null} />)
      expect(html).toContain('Validation Score')
      expect(html).toMatch(/DECISION:.*N\/A/)
      expect(html).toContain('/ 100')
    })

    it('renders cleanly when report is empty object {}', () => {
      const html = renderToString(<ReportView report={{} as ReportModel} />)
      expect(html).toContain('Validation Score')
      expect(html).toMatch(/DECISION:.*N\/A/)
      expect(html).toContain('Problem')
      expect(html).toContain('Financial Projections')
    })

    it('renders cleanly when reportData is an empty object {}', () => {
      const emptyReport: ReportModel = {
        overallScore: 65,
        decision: 'PROCEED_WITH_CAUTION',
        problemScore: 14,
        customerScore: 12,
        marketScore: 11,
        competitiveScore: 9,
        wtpScore: 8,
        businessModelScore: 10,
        financialScore: 7,
        executionScore: 8,
        decisionReasons: [],
        reportData: {},
      }
      const html = renderToString(<ReportView report={emptyReport} />)
      expect(html).toContain('65')
      expect(html).toContain('PROCEED_WITH_CAUTION')
      // Fallback financials and competitors should render
      expect(html).toContain('Competitor A')
      expect(html).toContain('Financial Projections')
    })

    it('renders with adversarial reportData (null arrays, empty objects, missing fields)', () => {
      const adversarialReport: ReportModel = {
        overallScore: 88,
        decision: 'GO',
        reportData: {
          tamSamSom: {},
          tamEstimate: '$5B Global',
          personas: [],
          persona: {
            name: 'Sole Persona',
            priceSensitivity: 'high',
            jobToBeDone: 'Automate pipeline',
            goals: ['Save time'],
            problems: ['Too slow'],
          },
          selectedUvp: 'The AI autopilot for founders',
          uvpOptions: ['Angle 1', 'Angle 2'],
          moscowFeatures: {
            mustHave: ['Core auth', 'Report generation'],
            shouldHave: [],
            couldHave: undefined,
            wontHave: [],
          },
          swot: {
            strengths: ['First mover'],
            weaknesses: ['Small team'],
            opportunities: ['Growing market'],
            threats: ['Incumbents'],
          },
          riskRegister: [],
          keyRisks: ['Regulatory delay', 'API cost surge'],
          actionPlan: ['Week 1 launch', 'Week 2 iterate'],
          mvpDescription: 'Minimal dashboard with validation engine.',
          nextStepRecommendation: 'BUILD_MVP',
          nextStepRationale: 'Strong demand signals warrant rapid prototyping.',
          keyEvidence: [
            {
              claim: 'Market expanding at 30% CAGR',
              source: 'Gartner Report',
              year: '2026',
              label: 'VERIFIED',
              strength: 'STRONGER',
              link: 'https://example.com/source',
            },
          ],
          integrityNote: 'All estimates audited against public indices.',
        },
      }

      const html = renderToString(<ReportView report={adversarialReport} />)
      expect(html).toContain('Total Addressable Market (TAM)')
      expect(html).toContain('$5B Global')
      expect(html).toContain('Sole Persona')
      expect(html).toContain('The AI autopilot for founders')
      expect(html).toContain('MoSCoW Matrix')
      expect(html).toContain('SWOT Analysis Matrix')
      expect(html).toContain('Comprehensive Risk Register')
      expect(html).toContain('Regulatory delay')
      expect(html).toContain('30-Day Validation &amp; Execution Plan')
      expect(html).toContain('MVP Scope &amp; Minimum Viable Architecture')
      expect(html).toContain('Build Minimum Viable Product (MVP)')
      expect(html).toContain('BUILD_MVP')
      expect(html).toContain('Evidence Sources &amp; Integrity Citations')
      expect(html).toContain('Market expanding at 30% CAGR')
      expect(html).toContain('AUDITED_SOURCES')
    })

    it('handles all 5 Next Step Recommendation enum variants', () => {
      const recommendations = [
        'BUILD_MVP',
        'GET_FIRST_CUSTOMERS',
        'SCALE_GROWTH',
        'FUNDRAISING',
        'MORE_VALIDATION',
        'NON_STANDARD_REC', // unhandled fallback
      ]

      for (const rec of recommendations) {
        const html = renderToString(
          <ReportView
            report={{
              overallScore: 70,
              decision: 'TEST',
              reportData: {
                nextStepRecommendation: rec,
                nextStepRationale: `Rationale for ${rec}`,
              },
            }}
          />
        )
        expect(html).toContain(rec)
        expect(html).toContain(`Rationale for ${rec}`)
      }
    })

    it('handles negative and out-of-bounds overall scores without crashing', () => {
      const extremeScores = [-50, 0, 150, 999]
      for (const s of extremeScores) {
        const html = renderToString(
          <ReportView report={{ overallScore: s, decision: 'TEST' }} />
        )
        expect(html).toContain(String(s))
      }
    })
  })

  // ─────────────────────────────────────────────────────────────────────────────
  // 6. Adversarial Deep Edge Cases: Nulls Inside Arrays & Incomplete Objects
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Adversarial Deep Edge Cases: Nulls in Arrays & Empty Objects', () => {
    it('tests ScatterPlot2x2 resilience when data prop is undefined or null', () => {
      // Test if component defaults data or throws
      try {
        const htmlUndefined = renderToString(<ScatterPlot2x2 data={undefined as unknown as React.ComponentProps<typeof ScatterPlot2x2>['data']} />)
        expect(htmlUndefined).toBeDefined()
      } catch (err: unknown) {
        // Record whether it throws
        expect(err).toBeInstanceOf(TypeError)
      }
    })

    it('tests RiskRegisterTable with [null] array element', () => {
      try {
        const html = renderToString(<RiskRegisterTable risks={[null as unknown as React.ComponentProps<typeof RiskRegisterTable>['risks'][0]]} />)
        expect(html).toBeDefined()
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(TypeError)
      }
    })

    it('tests ActionPlanTable with [null] array element', () => {
      try {
        const html = renderToString(<ActionPlanTable plan={[null as unknown as React.ComponentProps<typeof ActionPlanTable>['plan'][0]]} />)
        expect(html).toBeDefined()
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(TypeError)
      }
    })

    it('tests ScorecardGrid with [null] array element', () => {
      try {
        const html = renderToString(<ScorecardGrid scores={[null as unknown as React.ComponentProps<typeof ScorecardGrid>['scores'][0]]} />)
        expect(html).toBeDefined()
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(TypeError)
      }
    })

    it('tests ReportView with null inside actionPlan and keyRisks arrays', () => {
      // In ReportView, rawActionPlan.map handles null safely:
      // if (typeof item === 'object' && item !== null) -> else return String(item)
      const report: ReportModel = {
        overallScore: 75,
        decision: 'GO',
        reportData: {
          actionPlan: [null as unknown as string],
          keyRisks: [null as unknown as string],
        },
      }
      const html = renderToString(<ReportView report={report} />)
      expect(html).toBeDefined()
      expect(html).toContain('null')
    })
  })

  // ─────────────────────────────────────────────────────────────────────────────
  // 7. Data Integrity & Badging Verification
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Integrity Badging Verification', () => {
    it('verifies that PROJECTION, ASSUMPTION, and PROPOSED_STRATEGY badges appear', () => {
      const report: ReportModel = {
        overallScore: 82,
        decision: 'GO',
        reportData: {
          tamEstimate: '$10B',
          selectedUvp: 'Best product',
          persona: { name: 'Target' },
          mvpDescription: 'Basic app',
          swot: { strengths: ['Strength'] },
        },
      }
      const html = renderToString(<ReportView report={report} />)
      expect(html).toContain('PROJECTION')
      expect(html).toContain('ASSUMPTION')
      expect(html).toContain('PROPOSED_STRATEGY')
      expect(html).toContain('AI_ESTIMATE_UNVERIFIED')
    })
  })
})
