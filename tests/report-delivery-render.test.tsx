import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import ReportView from '@/app/dashboard/report/ReportView'
import { ScoreCoveragePanel } from '@/components/ScoreCoveragePanel'

const action = { week: 'Week 1', action: 'Offer a narrow paid pilot.', owner: 'Founder', kpi: 'Paid pilot commitments',
  hypothesis: 'Shop owners will pay to resolve weekly reconciliation.', participantUnit: 'Independent shop owner',
  denominator: '20 eligible owners approached', passCriterion: 'At least 5 pay the pilot deposit',
  decisionOnFailure: 'Revisit the buyer segment before building.' }
describe('saved report delivery', () => {
  it('puts the saved recommendation and next test before optional score detail', () => {
    const html = renderToStaticMarkup(createElement(ReportView, { hideDownloads: true, report: { overallScore: 42, decision: 'TEST_FURTHER', decisionReasons: ['No verified customer commitments.'], reportData: {
      nextStepRecommendation: 'MORE_VALIDATION', nextStepRationale: 'Test paid intent before building.', decisionReasons: ['Obsolete duplicate recommendation.'],
      evidenceGaps: ['Direct interviews remain incomplete.'],
    } } }))
    expect(html.indexOf('Recommendation and next test')).toBeLessThan(html.indexOf('Validation Score'))
    for (const value of ['Test paid intent before building.', 'No verified customer commitments.', 'Direct interviews remain incomplete.']) expect(html).toContain(value)
    expect(html).not.toContain('Obsolete duplicate recommendation.')
  })
  const planningBasis = { id: 'internal-eight-week-offer-id', targetCustomer: 'Independent shop owners', participantUnit: 'One independent shop owner',
    cohortDefinition: 'Ten eligible owners; retain non-buyers and record paid subsets separately.', cohortSize: 10, programWeeks: 8, utilityWeeks: 2,
    offer: { amount: 499, currency: 'INR', period: 'month', basis: 'named_variant', variantRationale: 'Test a named monthly offer against the original operating price.' },
    financeRelationship: 'The ten proposed research participants are not the operating model’s assumed paying customers.' }
  it('shows the named offer, participant unit and separate study/program durations without a fixed thirty-day promise', () => {
    const html = renderToStaticMarkup(createElement(ReportView, { hideDownloads: true, report: { reportData: { planningBasis, actionPlan: [action] } } }))
    for (const value of ['Customer and offer to test', 'Independent shop owners', 'One independent shop owner', '₹499.00 / month',
      planningBasis.cohortDefinition, planningBasis.offer.variantRationale, planningBasis.financeRelationship, '8 weeks', '2 weeks inside the full program', '8-week experiment plan']) expect(html).toContain(value)
    expect(html).not.toContain('30-Day Validation'); expect(html).not.toContain(planningBasis.id)
  })
  it('shows comparable named monthly offer calculations including zero and unknown outcomes', () => {
    const base = { currency: 'INR', cumulativeOperatingResult: 1000, contributionMargin: 500, breakEvenCustomers: 20, months: [] }
    const html = renderToStaticMarkup(createElement(ReportView, { hideDownloads: true, report: { reportData: { planningBasis: { ...planningBasis, offer: { ...planningBasis.offer, amount: 0 } },
      financialReview: { status: 'available', base, offerComparison: { status: 'comparable', planId: planningBasis.id, offeredPrice: 0,
        currency: 'INR', cumulativeOperatingResult: 0, largestCumulativeDeficit: 12000, contributionMargin: 0, breakEvenCustomers: null,
        months: [{ month: 1, customers: 0 }], note: 'Only offer price changes; research participants are not treated as paying customers.' } } } } }))
    expect(html).toContain('Proposed monthly offer: ₹0.00 / month'); expect(html).toContain('₹0.00')
    expect(html).toContain('research participants are not treated as paying customers.'); expect(html).toContain('Not established')
    expect(html).not.toContain(planningBasis.id)
  })
  it('keeps a one-time or mismatched-currency offer comparison explicitly unavailable', () => {
    const render = (comparison: unknown) => renderToStaticMarkup(createElement(ReportView, { hideDownloads: true, report: { reportData: {
      financialReview: { status: 'available', base: { currency: 'INR' }, offerComparison: comparison } } } }))
    const html = render({ status: 'not_comparable', planId: planningBasis.id, note: 'The one-time offer needs purchase-frequency and matching cost evidence before comparison.' })
    expect(html).toContain('Offer comparison is not available'); expect(html).toContain('purchase-frequency and matching cost evidence')
    expect(html).not.toContain('Proposed monthly offer:')
    const corrupted = render({ status: 'comparable', currency: 'USD', offeredPrice: 499, note: 'An invalid legacy claim of comparable currency.' })
    expect(corrupted).toContain('Offer comparison is not available'); expect(corrupted).not.toContain('Proposed monthly offer:')
    expect(corrupted).not.toContain('An invalid legacy claim')
  })
  it('retains zero participant counts and unknown offer fields, and uses a neutral title for older reports', () => {
    const html = renderToStaticMarkup(createElement(ReportView, { hideDownloads: true, report: { reportData: {
      planningBasis: { ...planningBasis, cohortSize: 0, utilityWeeks: 0, offer: { amount: null, currency: null, period: 'not_established' } }, actionPlan: [action] } } }))
    expect(html).toContain('Price not established'); expect(html).toContain('0 weeks inside the full program')
    expect(html).toContain('Research participants</dt><dd class="mt-1 text-[#536172]">0</dd>')
    const legacy = renderToStaticMarkup(createElement(ReportView, { hideDownloads: true, report: { reportData: { actionPlan: [action] } } }))
    expect(legacy).toContain('Experiment plan'); expect(legacy).not.toContain('30-Day Validation'); expect(legacy).not.toContain('Customer and offer to test')
  })
  it('shows saved financial sensitivities in their declared currency, preserves zero, and leaves unknown break-even unmeasured', () => {
    const base = { currency: 'INR', cumulativeOperatingResult: 0, largestCumulativeDeficit: 12000,
      contributionMargin: 500, breakEvenCustomers: null, months: [{ month: 1, customers: 100 }, { month: 12, customers: 70 }] }
    const html = renderToStaticMarkup(createElement(ReportView, { hideDownloads: true, report: { reportData: {
      financialReview: { status: 'available', basis: 'Explicit assumptions, not observed conversion.', base,
        sensitivity: [{ ...base, scenario: 'Selling price 20% lower; all other inputs held constant', cumulativeOperatingResult: -3000 }],
        limitation: 'These mechanical tests are not probability ranges or cash runway.' },
    } } }))
    expect(html).toContain('Financial assumptions and sensitivity'); expect(html).toContain('Selling price 20% lower')
    expect(html).toContain('₹0'); expect(html).toContain('-₹3,000'); expect(html).toContain('₹12,000')
    expect(html).toContain('Not established'); expect(html).toContain('not probability ranges or cash runway')
    expect(html).not.toContain('$3,000')
  })
  it('shows exact experiment criteria in both phone and desktop action rows', () => {
    const html = renderToStaticMarkup(createElement(ReportView, { hideDownloads: true,
      report: { overallScore: 60, reportData: { actionPlan: [action] } } }))
    for (const field of ['hypothesis', 'participantUnit', 'denominator', 'passCriterion', 'decisionOnFailure'] as const) {
      expect(html.split(action[field])).toHaveLength(3)
    }
    expect(html).toContain('Pass criterion'); expect(html).toContain('If the test fails')
  })
  it.each([
    { status: 'partial', reportData: {} },
    { status: 'complete', reportData: { agentTrail: { agents: { market: 'partial', customer: 'ok' } } } },
    { status: 'complete', reportData: { scoreCoverage: { evaluatedMaximum: 65, evaluatedScore: 42, missingCategories: ['Customer', 'Willingness to pay'] } } },
  ])('discloses incomplete research before displaying the score even on older saved reports', report => {
    const html = renderToStaticMarkup(createElement(ReportView, { hideDownloads: true, report: { overallScore: 42, ...report } }))
    expect(html.indexOf('This analysis is partial')).toBeGreaterThan(-1)
    expect(html.indexOf('This analysis is partial')).toBeLessThan(html.indexOf('Validation Score'))
    if ('scoreCoverage' in report.reportData) {
      expect(html.indexOf('This score has incomplete coverage')).toBeLessThan(html.indexOf('Validation Score'))
      expect(html).toContain('Unreviewed criteria do not establish that the business failed.')
    }
  })
  it('does not warn about incomplete work for a completed, fully reviewed report or render invalid coverage numbers', () => {
    const html = renderToStaticMarkup(createElement(ReportView, { hideDownloads: true,
      report: { status: 'complete', overallScore: 70, reportData: { agentTrail: { agents: { market: 'ok' } },
        scoreCoverage: { evaluatedMaximum: 100, evaluatedScore: 70, missingCategories: [] } } } }))
    expect(html).not.toContain('This analysis is partial')
    expect(renderToStaticMarkup(createElement(ScoreCoveragePanel, { value: { evaluatedMaximum: NaN, evaluatedScore: 42, missingCategories: ['Customer'] } }))).toBe('')
  })
})
