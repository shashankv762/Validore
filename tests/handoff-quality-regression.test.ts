import { describe, expect, it, vi } from 'vitest'
import recorded from './fixtures/handoff-regression.json'
import { buildAgentHandoff, serializeHandoffs, auditHandoffCoverage, buildScoreSummary, type AgentHandoff } from '@/lib/validation/agents/handoffs'
import { reconcileDecision, validateSynthesisHandoffClaims, hasReviewedBlockingEvidence, auditSourceReview } from '@/lib/validation/agents/quality-auditor'
import { FullReportSchema, type EvidenceItem, type EvidenceReview, type FullReport } from '@/lib/validation/schemas'
import type { SearchResult } from '@/lib/ai/search'
import type { AgentRole } from '@/lib/ai/roles'
import { evaluateValidationAcceptance } from '../scripts/lib/validation-acceptance'
import { computeUnitEconomics, buildFinancialProjection } from '@/lib/financial'
vi.mock('@/db', () => ({ db: {} }))
import { LiteReportSchema } from '@/lib/validation/engine'
import { PIPELINE_LITE_REPLY } from './fixtures/agent-payloads'

const sources = recorded.observations.map(source => ({ ...source, content: 'Test fixture contains source metadata only; original page text is deliberately not reproduced.' }) as SearchResult)
function handoffs(): AgentHandoff[] {
  return recorded.handoffs.map(item => buildAgentHandoff(item.role as AgentRole, { data: item.data, provider: 'recorded-synthetic-model', tokensUsed: 0,
    sources: item.sourceIds.map(index => sources[index]) }))
}
const parse = (text: string) => JSON.parse(text.slice(text.indexOf('{')))
const completeAgents = Object.fromEntries([...recorded.handoffs.map(item => item.role), 'synthesis'].map(role => [role, 'ok' as const]))

describe('recorded long handoff regression', () => {
  it('retains actual scores, the complete MVP, selected proposition and all six experiment essentials within 24k', () => {
    const original = handoffs()
    const text = serializeHandoffs(original)
    const bundle = parse(text)
    const audit = auditHandoffCoverage(original, text)
    expect(text.length).toBeLessThanOrEqual(24000)
    expect(audit).toMatchObject({ version: 3, productPlanProvided: true, growthPlanProvided: true, missingCriticalFields: [],
      knownScores: { problemScore: 4, customerScore: 7, wtpScore: 1, marketScore: 5, competitiveScore: 3, businessModelScore: 4, financialScore: 2 } })
    expect(buildScoreSummary(original)).toMatchObject({ knownSubtotal: 26, knownMaximum: 95, remainingMaximum: 5 })
    const product = bundle.handoffs.find((item: { role: string }) => item.role === 'product').findings
    expect(product.mvpDescription).toBe(original.find(item => item.role === 'product')!.findings.mvpDescription)
    expect(product.selectedUvp).toBe(original.find(item => item.role === 'product')!.findings.selectedUvp)
    const growth = bundle.handoffs.find((item: { role: string }) => item.role === 'growth').findings.actionPlan
    expect(growth).toHaveLength(6)
    for (const step of growth) for (const field of ['week', 'action', 'owner', 'hypothesis', 'participantUnit', 'denominator', 'passCriterion', 'decisionOnFailure']) {
      expect(typeof step[field]).toBe('string'); expect(step[field].length).toBeGreaterThan(0)
    }
    expect(growth[2].passCriterion).toContain('actual INR 499 payment')
    expect(JSON.stringify(bundle.sourceRegister).length).toBeLessThan(4000)
  })
  it('rejects the old score/plan shells instead of treating field names as successful coordination', () => {
    const original = handoffs()
    const serialized = serializeHandoffs(original)
    const bundle = parse(serialized)
    for (const handoff of bundle.handoffs) for (const field of Object.keys(handoff.findings)) handoff.findings[field] = { detailOmitted: true }
    const damaged = serialized.slice(0, serialized.indexOf('{')) + JSON.stringify(bundle)
    const audit = auditHandoffCoverage(original, damaged)
    expect(audit.missingCriticalFields).toEqual(expect.arrayContaining(['customer.problemScore', 'market.marketScore', 'product.mvpDescription', 'growth.actionPlan']))
    expect(audit.productPlanProvided).toBe(false); expect(audit.growthPlanProvided).toBe(false)
  })
  it('does not credit the final reviewer with pass criteria whose decision-critical ending was compacted away', () => {
    const original = handoffs()
    const growth = original.find(item => item.role === 'growth')!
    const actionPlan = structuredClone(growth.findings.actionPlan) as Array<Record<string, unknown>>
    growth.findings.actionPlan = actionPlan
    const completeCriterion = 'Set a measurable pass threshold before the experiment. '.repeat(60) + 'The final condition requires a recorded paid commitment.'
    actionPlan[0] = { ...actionPlan[0], passCriterion: completeCriterion }

    const serialized = serializeHandoffs(original)
    const handoffAudit = auditHandoffCoverage(original, serialized)

    expect(parse(serialized).handoffs.find((item: { role: string }) => item.role === 'growth').findings.actionPlan[0].passCriterion).toContain('[Excerpt]')
    expect(handoffAudit.growthPlanProvided).toBe(false)
    expect(handoffAudit.missingCriticalFields).toContain('growth.actionPlan.0.passCriterion')
  })
  it('detects the exact false omission claims from the rejected fresh Full report', () => {
    const original = handoffs()
    const audit = auditHandoffCoverage(original, serializeHandoffs(original))
    const issues = validateSynthesisHandoffClaims(recorded.originalFullJudgment as Pick<FullReport, 'decisionReasons' | 'integrityNote' | 'nextStepRationale'>, audit)
    expect(issues).toHaveLength(2)
    expect(validateSynthesisHandoffClaims({ decisionReasons: ['Customer evidence is missing; the provided scores and proposed MVP remain provisional.'],
      integrityNote: 'Ancillary details were excerpted; the proposed plan is not validated.', nextStepRationale: 'Test the paid offer.' }, audit)).toEqual([])
  })
})

describe('evidence-limited final decisions', () => {
  const evidence = recorded.rejectedFullJudgment.keyEvidence as EvidenceItem[]
  const review = recorded.rejectedFullJudgment.evidenceReview as EvidenceReview
  it('preserves the real Full judge’s cautious recommendation and useful rationale despite the low band', () => {
    const raw = recorded.originalFullJudgment
    const result = reconcileDecision({ ...raw, decision: 'TEST_FURTHER', nextStepRecommendation: 'MORE_VALIDATION' }, 28,
      { agents: completeAgents, evidence, review, sources })
    expect(result.decision).toBe('TEST_FURTHER')
    expect(result.nextStepRationale).toBe(raw.nextStepRationale)
    expect(result.decisionReasons).toEqual(raw.decisionReasons)
    expect(result.decisionAudit).toMatchObject({ originalDecision: 'TEST_FURTHER', scoreBand: 'NO_GO', finalDecision: 'TEST_FURTHER' })
  })
  it('keeps a valid five-reason Lite response inside its final schema after calibration', () => {
    const reasons = recorded.rejectedLiteJudgment.decisionReasons.slice(0, 5)
    const result = reconcileDecision({ ...PIPELINE_LITE_REPLY, decision: 'TEST_FURTHER', decisionReasons: reasons,
      nextStepRecommendation: 'MORE_VALIDATION', nextStepRationale: 'Offer the paid pilot and record non-purchases before changing the segment.' }, 29,
      { agents: { market: 'ok', customer: 'ok', synthesis: 'ok' }, evidence: recorded.rejectedLiteJudgment.keyEvidence as EvidenceItem[], sources })
    expect(result.decision).toBe('TEST_FURTHER')
    expect(result.decisionReasons).toEqual(reasons)
    expect(LiteReportSchema.safeParse(result).success).toBe(true)
    expect(result.nextStepRationale).toContain('record non-purchases')
  })
  it('does not authorize NO_GO from ordinary read competitor pages or hypothetical losses', () => {
    expect(hasReviewedBlockingEvidence({ evidence, review, sources })).toBe(false)
    const result = reconcileDecision({ ...recorded.originalFullJudgment, decision: 'NO_GO', nextStepRecommendation: 'MORE_VALIDATION' }, 28,
      { agents: completeAgents, evidence, review, sources })
    expect(result.decision).toBe('TEST_FURTHER')
  })
  it('requires exact original text for an explicitly claimed blocking finding', () => {
    const page: SearchResult = { url: 'https://authority.example/terms', source: 'authority.example', title: 'Synthetic terms', fetchedAt: '2026-11-15T00:00:00Z',
      retrievalKind: 'page', content: 'Commercial use of the indispensable licensed dataset is expressly prohibited.' }
    const check = { claim: 'The current concept can commercially use its indispensable dataset.', url: page.url, assessment: 'contradicts' as const,
      rationale: 'The explicit condition prevents the stated commercial use.', decisionRelevance: 'blocking' as const, evidenceExcerpt: page.content }
    const reviewed = { summary: 'A blocking condition for the current plan.', checks: [check], gaps: [] }
    const cited = [{ claim: check.claim, link: page.url, evidenceExcerpt: page.content, strength: 'MODERATE' as const }]
    expect(hasReviewedBlockingEvidence({ evidence: cited, review: reviewed, sources: [page] })).toBe(true)
    const unsupported = auditSourceReview({ ...reviewed, checks: [{ ...check, evidenceExcerpt: 'A different, invented restriction appears here.' }] }, [page])
    expect(unsupported.checks[0].decisionRelevance).toBe('material')
    expect(hasReviewedBlockingEvidence({ evidence: cited, review: unsupported, sources: [page] })).toBe(false)
  })
})

describe('acceptance rejects the recorded qualitative defects', () => {
  it('rejects missing coordination, false omission claims and score-only rejection even when Full JSON is valid', () => {
    const original = handoffs()
    const report = FullReportSchema.parse(Object.assign({}, ...recorded.handoffs.map(item => item.data), {
      ...recorded.rejectedFullJudgment,
      executionScore: 2, integrityNote: recorded.originalFullJudgment.integrityNote,
      founderAssumptions: [], decision: 'NO_GO',
    }))
    const value = { ...report, overallScore: 28, agentTrail: { agents: completeAgents }, researchSources: sources,
      handoffAudit: auditHandoffCoverage(original, serializeHandoffs(original)), scoreSummary: buildScoreSummary(original),
      evidenceReview: recorded.rejectedFullJudgment.evidenceReview, decisionAudit: recorded.rejectedFullJudgment.decisionAudit,
      computedUnitEconomics: computeUnitEconomics(report.unitEconomicsAssumptions), financialProjection: buildFinancialProjection(report.unitEconomicsAssumptions) }
    const issues = evaluateValidationAcceptance(value, 'full', FullReportSchema)
    expect(issues.some(issue => issue.includes('Do not claim those scores were omitted'))).toBe(true)
    expect(issues.some(issue => issue.startsWith('NO_GO requires'))).toBe(true)
    const missingAudit = evaluateValidationAcceptance({ ...value, handoffAudit: undefined }, 'full', FullReportSchema)
    expect(missingAudit).toContain('The final reviewer must receive the actual specialist scores and retained product/experiment essentials.')
  })
})
