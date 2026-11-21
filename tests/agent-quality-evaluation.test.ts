import { describe, expect, it } from 'vitest'
import { buildAgentHandoff, serializeHandoffs } from '@/lib/validation/agents/handoffs'
import { auditMarketSizing, reconcileDecision, validateCustomerSignals, validateSynthesisPlan, validateGrowthPlan } from '@/lib/validation/agents/quality-auditor'
import { FULL_AGENT_ROLES } from '@/lib/ai/roles'
import { PIPELINE_REPLIES } from './fixtures/agent-payloads'
import { FullReportSchema, GrowthAgentSchema, type FullReport } from '@/lib/validation/schemas'
import { retrieveAgentReference } from '@/lib/validation/knowledge/playbooks'
import type { SearchResult } from '@/lib/ai/search'

const evidence = { claim: 'The retrieved original document describes the customer job.', link: 'https://source.example.org/report',
  evidenceExcerpt: 'The retrieved original document describes the customer job in detail.', strength: 'MODERATE' as const }
const agents = Object.fromEntries(FULL_AGENT_ROLES.map(role => [role, 'ok' as const]))
const decision = { decision: 'GO' as const, decisionReasons: ['A concept hypothesis from the supplied brief.'], nextStepRecommendation: 'FUNDRAISING' as const, nextStepRationale: 'Proposed next step.' }

describe('research handoff and decision acceptance', () => {
  it('retains customer rationale, contrary signals, source vintage and role ownership', () => {
    const handoff = buildAgentHandoff('customer', { data: { ...PIPELINE_REPLIES.customer as object, customerSignals: { summary: 'Two records report pain while three do not.',
      observations: [{ theme: 'Reconciliation effort', direction: 'mixed', sourceType: 'recorded_feedback', count: 2, sampleSize: 5, sourceUrls: [], limitation: 'Five selected records; willingness to pay unknown.' }], unresolvedQuestions: ['Who pays?'] } },
      provider: 'synthetic', tokensUsed: 200, sources: [{ title: 'Original document', url: evidence.link, source: 'source.example.org', content: 'Original text', fetchedAt: '2026-11-14T00:00:00Z', dataPeriod: '2025', retrievalKind: 'page' }] })
    expect(handoff.findings).toHaveProperty('problemValidation5Factor')
    expect(JSON.stringify(handoff)).toContain('willingness to pay unknown')
    expect(handoff.scope).toContain('customerSignals'); expect(handoff.sources[0]).toMatchObject({ dataPeriod: '2025', retrievalKind: 'page' })
    const missing = buildAgentHandoff('finance', null)
    expect(missing.status).toBe('unavailable'); expect(missing.interpretation).toContain('unknowns, not negative evidence')
  })
  it('bounds full JSON handoffs without truncating serialized values or removing source identities', () => {
    const huge = FULL_AGENT_ROLES.map(role => buildAgentHandoff(role, { data: Object.fromEntries(['pestleAnalysis', 'problemValidation5Factor', 'customerSignals', 'competitors', 'actionPlan', 'keyRisks', 'riskRegister', 'unitEconomicsAssumptions', 'landingPageCopy'].map(key => [key, Array.from({ length: 30 }, () => ({ value: 'x'.repeat(9000), url: evidence.link }))])), provider: 'synthetic', tokensUsed: 0 }))
    const text = serializeHandoffs(huge)
    expect(text.length).toBeLessThan(24_200); expect(() => JSON.parse(text.slice(text.indexOf('{')))).not.toThrow()
    expect(text).toContain('excerpted'); expect(text).toContain('scope')
  })
  it('does not convert a promising score into a launch verdict without commercial validation', () => {
    const result = reconcileDecision(decision, 86, { agents, evidence: [evidence] })
    expect(result.decision).toBe('TEST_FURTHER'); expect(result.nextStepRecommendation).toBe('MORE_VALIDATION')
    expect(result.decisionAudit).toMatchObject({ scoreBand: 'GO', originalDecision: 'GO', finalDecision: 'TEST_FURTHER' })
  })
  it('keeps strong negative findings distinct from missing specialist work', () => {
    const passage = 'Commercial use of the indispensable licensed dataset is expressly prohibited.'
    const complete = reconcileDecision({ ...decision, decision: 'NO_GO' as const }, 28, { agents, evidence: [evidence],
      sources: [{ url: evidence.link, title: 'Synthetic license terms', source: 'source.example.org', fetchedAt: '2026-11-15T00:00:00Z', retrievalKind: 'page', content: passage + ' ' + evidence.evidenceExcerpt }],
      review: { summary: 'The original source contradicts the proposed use.', checks: [{ claim: 'The present concept can commercially use the indispensable dataset.', url: evidence.link,
        assessment: 'contradicts', rationale: 'The stated license blocks the current concept.', decisionRelevance: 'blocking', evidenceExcerpt: passage }], gaps: [] } })
    expect(complete.decision).toBe('NO_GO')
    const missing = reconcileDecision(decision, 28, { agents: { ...agents, customer: 'failed' }, evidence: [evidence] })
    expect(missing.decision).toBe('TEST_FURTHER'); expect(missing.decisionAudit.missingAgents).toContain('customer')
  })
  it('does not use national macro indicators as negative commercial evidence for a low-scoring concept', () => {
    const context = { ...evidence, claim: 'GDP is national background, not evidence of this buyer budget.', link: 'https://api.worldbank.org/v2/country/IN/indicator/NY.GDP.PCAP.CD?format=json' }
    const result = reconcileDecision({ ...decision, decision: 'NO_GO' as const }, 28, { agents, evidence: [context] })
    expect(result.decision).toBe('TEST_FURTHER')
    expect(result.decisionAudit.issues.join(' ')).toContain('No reviewed evidence supports the commercial conclusion')
  })
  it('preserves supported modification judgments and cautious unknowns rather than manufacturing a verdict from the band', () => {
    const sources = [{ url: evidence.link, source: 'source.example.org', title: 'Synthetic source', fetchedAt: '2026-11-14T00:00:00Z', retrievalKind: 'page' as const, content: evidence.evidenceExcerpt }]
    expect(reconcileDecision({ ...decision, decision: 'MODIFY' }, 62, { agents, evidence: [evidence], sources }).decision).toBe('MODIFY')
    expect(reconcileDecision({ ...decision, decision: 'TEST_FURTHER' }, 47, { agents, evidence: [evidence] }).decision).toBe('TEST_FURTHER')
    expect(reconcileDecision({ ...decision, decision: 'TEST_FURTHER' }, 28, { agents, evidence: [evidence] }).decision).toBe('TEST_FURTHER')
  })
})

describe('review and plan quality gates', () => {
  const signal = (overrides = {}) => ({ customerSignals: { summary: 'One selected review mentions price.', observations: [{ theme: 'Price', direction: 'negative' as const,
    sourceType: 'public_review' as const, count: 1, sampleSize: 1, sourceUrls: [evidence.link], limitation: 'Selected unique text, not representative demand.', ...overrides }], unresolvedQuestions: ['Will a target buyer pay?'] } })
  const page: SearchResult = { title: 'A readable promotional page', url: evidence.link, source: 'source.example.org', fetchedAt: '2026-11-14T00:00:00Z', retrievalKind: 'page', content: 'Our customers love our product; 5-star average.' }
  it('requires actual extracted public review records, not arbitrary readable promotional copy', () => {
    expect(validateCustomerSignals(signal(), [page]).some(issue => issue.field.endsWith('sourceUrls'))).toBe(true)
    const review = { ...page, content: JSON.stringify({ kind: 'public_review_markup', reviews: [{ content: 'The price is expensive.' }] }) }
    expect(validateCustomerSignals(signal(), [review])).toEqual([])
    const feed = { ...page, content: JSON.stringify({ kind: 'public_review_feed', provider: 'WordPress.org review RSS',
      sampleSize: 2, reviews: [{ content: 'The setup is simple but support is slow.' }, { content: 'The monthly cost is too high.' }] }) }
    expect(validateCustomerSignals(signal({ count: 2, sampleSize: 2 }), [feed])).toEqual([])
    expect(validateCustomerSignals(signal({ sampleSize: 3 }), [feed]).some(issue => issue.field.endsWith('sampleSize'))).toBe(true)
    expect(validateCustomerSignals(signal({ sampleSize: 100 }), [review]).some(issue => issue.field.endsWith('sampleSize'))).toBe(true)
    expect(validateCustomerSignals(signal({ count: 2 }), [review]).some(issue => issue.field.endsWith('count'))).toBe(true)
  })
  it('keeps proposed opportunities free of invented observed customer counts', () => {
    expect(validateCustomerSignals(signal({ sourceType: 'assumption', sourceUrls: [] }), []).some(issue => issue.field.endsWith('count'))).toBe(true)
    expect(validateCustomerSignals(signal({ sourceType: 'assumption', sourceUrls: [], count: null, sampleSize: null }), [])).toEqual([])
  })
  it('does not match a small market input inside a larger source number or convert a quoted currency implicitly', () => {
    const sizing = { tam: { value: 'USD 200000', source: evidence.link, method: 'A sourced sizing scenario.', label: 'PROJECTION' as const,
      inputs: { customerCount: { value: 1000, unit: 'eligible firms', source: evidence.link, evidenceExcerpt: '10000 eligible firms' },
        annualSpend: { value: 200, currency: 'USD', source: evidence.link, evidenceExcerpt: 'USD 2000 annual spend' } } },
      sam: { value: 'USD 20000', method: 'Proposed region.', label: 'PROJECTION' as const }, som: { value: 'USD 2000', method: 'Proposed capacity.', label: 'PROJECTION' as const } }
    expect(auditMarketSizing(sizing, [{ ...page, content: '10000 eligible firms with USD 2000 annual spend.' }]).tam.value).toBe('Not established')
    const wrongCurrency = { ...sizing, tam: { ...sizing.tam, inputs: { customerCount: { ...sizing.tam.inputs.customerCount, evidenceExcerpt: '1000 eligible firms' }, annualSpend: { ...sizing.tam.inputs.annualSpend, evidenceExcerpt: 'GBP 200 annual spend' } } } }
    expect(auditMarketSizing(wrongCurrency, [{ ...page, content: '1000 eligible firms with GBP 200 annual spend.' }]).tam.value).toBe('Not established')
  })
  it('does not annualize monthly spend or retain serviceable markets larger than a source-supported TAM', () => {
    const sizing = { tam: { value: 'INR 2,400,000', source: evidence.link, method: 'Source-described price.', label: 'PROJECTION' as const,
      inputs: { customerCount: { value: 1000, unit: 'eligible firms', source: evidence.link, evidenceExcerpt: '1,000 eligible firms' },
        annualSpend: { value: 2400, currency: 'INR', source: evidence.link, evidenceExcerpt: 'INR 2,400 per month' } } },
      sam: { value: 'INR 3,000,000', method: 'Arbitrary regional selection.', label: 'PROJECTION' as const },
      som: { value: 'INR 3,500,000', method: 'Arbitrary capture share.', label: 'PROJECTION' as const } }
    const monthly = auditMarketSizing(sizing, [{ ...page, content: '1,000 eligible firms pay INR 2,400 per month.' }])
    expect(monthly.tam.value).toBe('Not established')
    expect(monthly.sam.value).toBe('Not established')
    const annual = auditMarketSizing({ ...sizing, tam: { ...sizing.tam, inputs: { ...sizing.tam.inputs, annualSpend: {
      ...sizing.tam.inputs.annualSpend, evidenceExcerpt: 'INR 2,400 annual software spend' } } } },
    [{ ...page, content: '1,000 eligible firms with INR 2,400 annual software spend.' }])
    expect(annual.tam.value.replace(/,/g, '')).toBe('INR 2400000')
    expect(annual.sam.value).toBe('Not established')
    expect(annual.som.value).toBe('Not established')
  })
  it('requires a coherent value proposition and useful sequential next experiments', () => {
    const valid = PIPELINE_REPLIES.synthesis as Pick<FullReport, 'uvpOptions' | 'selectedUvp' | 'actionPlan' | 'mvpDescription' | 'oneLineConcept'>
    expect(validateSynthesisPlan(valid)).toEqual([])
    expect(validateSynthesisPlan({ ...valid, selectedUvp: 'A different unproposed product' }).some(issue => issue.field === 'selectedUvp')).toBe(true)
    expect(validateSynthesisPlan({ ...valid, uvpOptions: ['', '', ''], actionPlan: [] }).map(issue => issue.field)).toContain('actionPlan')
  })
  it('requires explicit experiment decisions from new growth output while retaining compatibility with old reports', () => {
    const legacySteps = (PIPELINE_REPLIES.growth as FullReport).actionPlan.map(({ week, action, owner, kpi }) => ({ week, action, owner, kpi }))
    const legacy = { ...PIPELINE_REPLIES.growth as object, actionPlan: legacySteps }
    expect(GrowthAgentSchema.safeParse(legacy).success).toBe(false)
    expect(validateGrowthPlan({ actionPlan: legacySteps })[0].expected).toContain('decisionOnFailure')
    const report = Object.assign({}, ...Object.values(PIPELINE_REPLIES), { actionPlan: legacySteps })
    expect(FullReportSchema.safeParse(report).success).toBe(true)
    expect(GrowthAgentSchema.safeParse(PIPELINE_REPLIES.growth).success).toBe(true)
  })
  it('recalls authored counterexamples for repeated unsupported beliefs, payment tests and shrinking financial cohorts', () => {
    const customer = retrieveAgentReference('customer', 'India customer price sensitivity budget frequency')
    expect(customer.ids).toContain('customer-unknown-is-not-negative')
    expect(customer.text).toContain('Agreement between agents is not corroboration')
    const growth = retrieveAgentReference('growth', 'growth plan conversion experiments')
    expect(growth.text).toContain('emails alone do not pass')
    expect(growth.text).toContain('proposed convenience sample')
    const finance = retrieveAgentReference('finance', 'finance cohort ltv cac churn acquisition cash sensitivity')
    expect(finance.ids).toContain('finance-cohort-sustainability')
    expect(finance.text).toContain('INR 30,000')
    for (const reference of [customer, growth, finance]) expect(reference.text).toContain('synthetic examples, not training/fine-tuning')
  })
})
