import { describe, expect, it } from 'vitest'
import { PlanningBasisSchema } from '@/lib/validation/schemas'
import { validatePlanningBasis } from '@/lib/validation/agents/quality-auditor'
import { buildFinancialReview } from '@/lib/validation/agents/finance-review'
import { PIPELINE_REPLIES } from './fixtures/agent-payloads'

const finance = { estimatedSellingPrice: 999, estimatedVariableCost: 300, estimatedFixedCostMonthly: 75000,
  estimatedCACMonthly: 1500, estimatedMonthlyCustomers: 25, estimatedChurnRate: 0.2, currency: 'INR' }
const basis = PlanningBasisSchema.parse({ ...(PIPELINE_REPLIES.product as { planningBasis: object }).planningBasis,
  cohortSize: 10, programWeeks: 6, utilityWeeks: 2,
  offer: { amount: 999, currency: 'INR', period: 'month', basis: 'finance_base', variantRationale: '' },
  financeRelationship: 'The six-week research program has ten eligible participants, not the modeled operating cohort of 25 paying customers. The two-week utility test sits inside the six-week program.' })

describe('one coherent proposed validation program', () => {
  it('accepts a shorter utility phase inside the shared overall horizon and finance-base offer', () => {
    expect(validatePlanningBasis({ planningBasis: basis }, finance)).toEqual([])
  })
  it('rejects the recorded silent 999-to-499 price change and divergent growth basis', () => {
    const changed = { ...basis, offer: { ...basis.offer, amount: 499 } }
    expect(validatePlanningBasis({ planningBasis: changed }, finance).map(issue => issue.field)).toContain('planningBasis.offer')
    expect(validatePlanningBasis({ planningBasis: changed }, finance, basis).map(issue => issue.field)).toContain('planningBasis')
  })
  it('permits an explicit named offer variant and calculates its comparable price scenario', () => {
    const variant = { ...basis, id: '499-pilot-variant', offer: { ...basis.offer, amount: 499, basis: 'named_variant' as const,
      variantRationale: 'Test a lower proposed monthly offer against the explicit 999 operating base; no demand is established.' } }
    expect(validatePlanningBasis({ planningBasis: variant }, finance)).toEqual([])
    const review = buildFinancialReview(finance, variant).review
    if (review.status !== 'available') throw new Error('Missing finance review')
    expect(review.offerComparison).toMatchObject({ status: 'comparable', planId: variant.id, offeredPrice: 499, contributionMargin: 199 })
    expect(review.offerComparison?.note).toContain('not treated as paying customers')
  })
  it('does not model a one-time variant as recurring monthly sales', () => {
    const variant = { ...basis, id: 'one-time-pilot', offer: { ...basis.offer, period: 'one_time' as const, basis: 'named_variant' as const,
      variantRationale: 'A separately named one-time purchase test rather than monthly credit renewal.' } }
    expect(validatePlanningBasis({ planningBasis: variant }, finance)).toEqual([])
    const review = buildFinancialReview(finance, variant).review
    if (review.status !== 'available') throw new Error('Missing finance review')
    expect(review.offerComparison?.status).toBe('not_comparable')
  })
  it('rejects a changed participant unit or milestones beyond the agreed horizon', () => {
    const step = { week: 'Week 7', action: 'Proposed test', owner: 'Founder', kpi: 'Observed outcome',
      hypothesis: 'Test hypothesis', participantUnit: 'A different incubator cohort', denominator: 'Ten proposed people',
      passCriterion: 'A defined pass threshold', decisionOnFailure: 'Revise the proposed test' }
    expect(validatePlanningBasis({ planningBasis: basis, actionPlan: [step] }, finance, basis).map(issue => issue.field))
      .toEqual(expect.arrayContaining(['actionPlan.0.week', 'actionPlan.0.participantUnit']))
  })
})
