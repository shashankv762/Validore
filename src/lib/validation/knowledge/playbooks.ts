import type { AgentRole } from '@/lib/ai/roles'

/** Authored method guidance, never observations about the startup being evaluated. */
export const PLAYBOOK_VERSION = '2026-11-15.2'
export type ReferenceSource = { title: string; url: string; checkedAt: string; scope: string }
export type AgentPlaybook = {
  id: string
  roles: readonly AgentRole[]
  keywords: readonly string[]
  objective: string
  method: readonly string[]
  example: { kind: 'synthetic'; situation: string; weakResponse: string; betterResponse: string }
  provenance: readonly string[]
}

// Pages checked at curation time. Sources establish the method, not the examples,
// any current market size, pricing, customer behavior or willingness to pay.
export const REFERENCE_SOURCES: Record<string, ReferenceSource> = {
  sba: { title: 'SBA: Plan your business', url: 'https://www.sba.gov/counseling/plan-your-business/', checkedAt: '2026-11-14', scope: 'Market research, competitive analysis and startup cost planning.' },
  strategyzer: { title: 'Strategyzer: Mastering business testing', url: 'https://www.strategyzer.com/training-programs/mastering-business-testing-how-to-design-and-assess-winning-business-models', checkedAt: '2026-11-14', scope: 'Testable hypotheses, experiments and assessing business ideas with customers.' },
  validore: { title: 'Validore authored reliability policy', url: '', checkedAt: '2026-11-14', scope: 'Evidence provenance, privacy, partial failure and conservative decision policy.' },
}

export const AGENT_PLAYBOOKS: readonly AgentPlaybook[] = [
  {
    id: 'customer-unknown-is-not-negative', roles: ['customer', 'risk', 'evidence', 'synthesis'], keywords: ['customer', 'price', 'sensitivity', 'india', 'culture', 'budget', 'frequency'],
    objective: 'Keep unsupported buying-behavior claims as unknowns, including when several agents repeat them.',
    method: ['National income, internet penetration and geographic labels do not measure the target buyer\'s budget or price sensitivity.', 'A proposed persona or another agent\'s confident wording is not an observation. Preserve the original evidence type across handoffs.', 'Name both the proposed explanation and a contrary explanation, then ask for a direct observable test. Do not treat missing interviews as negative interviews.'],
    example: { kind: 'synthetic', situation: 'A report has only national internet and GDP data but several specialists repeat that founders pitch weekly and refuse to pay.', weakResponse: 'Extreme cultural price sensitivity proves poor willingness to pay and severe conversion friction.', betterResponse: 'Use frequency, budget authority and price sensitivity are unknown for this buyer. Both a cash-constrained individual founder and an organization-funded buyer are plausible. Record recent research purchases and the payer, then test an explicit paid pilot. Agreement between agents is not corroboration.' }, provenance: ['strategyzer', 'validore'],
  },
  {
    id: 'market-bottom-up', roles: ['market', 'finance', 'synthesis'], keywords: ['market', 'tam', 'sam', 'som', 'customers', 'revenue'],
    objective: 'Size the exact customer segment before interpreting a broad market headline.',
    method: ['Define buyer, geography, reference year, purchase unit and currency.', 'Separate observed counts and spending from explicit assumptions. Show customers × annual spend; do not use national population as the buyer count.', 'TAM ≥ SAM ≥ SOM when the measures are comparable. SOM must reflect reachable customers, acquisition economics and delivery capacity.', 'If segment counts or spending are unsupported, return Not established and specify the smallest research task needed. A source URL alone does not establish inputs.'],
    example: { kind: 'synthetic', situation: 'A shop inventory product has a national population indicator and no shop-count or spend data.', weakResponse: 'Capture 1% of the national economy; the market is huge.', betterResponse: 'TAM is Not established. Population does not count inventory-software buyers. Source eligible shop counts and annual software spend, then estimate reachable shops from tested distribution and onboarding capacity.' }, provenance: ['sba', 'validore'],
  },
  {
    id: 'customer-observed-behavior', roles: ['customer', 'growth', 'synthesis'], keywords: ['customer', 'interview', 'feedback', 'reviews', 'wtp', 'problem'],
    objective: 'Distinguish observable behavior from founder belief and hypothetical interest.',
    method: ['Identify user, buyer, payer, triggering event, current workaround and the cost of doing nothing.', 'Ask about the last real occurrence, money or time spent, alternatives tried and decision authority before pitching a solution.', 'Treat reviews as a selected sample of a particular product. Preserve sample denominator, dates, exact source and mixed or contrary signals; do not project sentiment to the entire market.', 'Self-reported founder evidence remains self-reported. A proposed survey, fabricated persona or positive review is not a completed validation test.', 'For every critical hypothesis, give a direct behavioral test, pass/fail threshold and a change in plan if the test fails.'],
    example: { kind: 'synthetic', situation: 'Two of five recorded shopkeeper comments complain about manual stock reconciliation; none mentions payment.', weakResponse: '40% of shopkeepers will buy our product.', betterResponse: 'Two of these five selected records mention reconciliation pain. This does not estimate population prevalence or willingness to pay. Interview recent sufferers and test a paid pilot; preserve the three records that did not report this issue.' }, provenance: ['strategyzer', 'validore'],
  },
  {
    id: 'competitor-job-and-price', roles: ['competitor', 'market', 'product'], keywords: ['competitor', 'pricing', 'alternative', 'substitute'],
    objective: 'Compare the same customer job and normalize commercially relevant pricing.',
    method: ['Separate direct competitors, indirect substitutes, current workarounds and potential partners.', 'Inspect original product/pricing pages for material claims. Preserve billing interval, geography, tax, plan limitations and observation date.', 'Missing posted pricing means not publicly established, not free. Weaknesses are hypotheses unless supported by evidence.', 'Explain a defensible customer-specific gap rather than generic cheaper/faster/AI positioning.'],
    example: { kind: 'synthetic', situation: 'A coaching agency and bookkeeping software both serve small business owners.', weakResponse: 'The agency is a direct software competitor and has no automated inventory feature.', betterResponse: 'The agency is an indirect alternative or potential partner. Compare software performing the same inventory job separately; verify pricing and constraints on the original pages.' }, provenance: ['sba', 'validore'],
  },
  {
    id: 'finance-units-and-scenarios', roles: ['finance', 'risk', 'synthesis'], keywords: ['finance', 'cash', 'cost', 'price', 'churn', 'runway'],
    objective: 'Build internally consistent scenarios instead of inventing measured unit economics.',
    method: ['State currency, period and per-customer unit; separate fixed cost, variable cost, acquisition cost and price.', 'Use supplied values or explicitly labeled scenario assumptions. Do not infer measured CAC, retention, conversion or revenue from a persona.', 'Check contribution margin, break-even denominator and whether acquisition/delivery capacity can support the proposed customer count.', 'Negative contribution margin and zero denominators require an explicit limitation. Test a downside scenario and identify the most decision-sensitive assumption.'],
    example: { kind: 'synthetic', situation: 'A scenario has price 50, variable cost 60 and fixed monthly cost 1,000 in the same currency.', weakResponse: 'Scale sales to achieve break-even at 100 customers.', betterResponse: 'Contribution is −10 per customer, so selling more worsens losses under this scenario. There is no positive-volume break-even until price or variable cost changes; these values are assumptions.' }, provenance: ['sba', 'validore'],
  },
  {
    id: 'finance-cohort-sustainability', roles: ['finance', 'synthesis', 'growth'], keywords: ['finance', 'cohort', 'ltv', 'cac', 'churn', 'acquisition', 'cash', 'sensitivity'],
    objective: 'Interpret the cohort and operating projection alongside attractive unit ratios.',
    method: ['Review actual deterministic output before describing a scenario as viable. Distinguish contribution break-even from acquisition outlay and cumulative operating result.', 'With no new acquisitions, churn shrinks the cohort. A strong assumed LTV:CAC ratio is not a sales pipeline or a cash balance.', 'State which input would reverse the conclusion and the direct experiment to measure it. Mechanical price, CAC or churn shocks are authored sensitivity tests, not observed probabilities or forecasts.'],
    example: { kind: 'synthetic', situation: 'Monthly price INR 1,500, variable cost 300, fixed costs 50,000, CAC 800, 50 initial customers, 10% monthly churn and zero later acquisitions.', weakResponse: 'LTV:CAC is 15, so the business is financially strong and ready to scale.', betterResponse: 'Under these untested inputs, contribution is INR 1,200 and assumed LTV:CAC is 15, but month one loses INR 30,000 after acquiring the initial cohort. Customers then decline without acquisition, undermining fixed-cost coverage. Review the calculated 12-month losses and test paid reuse and acquisition cost before scaling; no opening cash was supplied to establish runway.' }, provenance: ['sba', 'validore'],
  },
  {
    id: 'risk-falsification', roles: ['risk', 'evidence', 'synthesis'], keywords: ['risk', 'regulation', 'uncertainty', 'contradiction'],
    objective: 'Expose the assumptions that could reverse the recommendation.',
    method: ['Prioritize risks by probability, impact, detectability and reversibility; explain the mechanism.', 'For material contradictions, retain both interpretations with source, date, customer segment and competing explanation.', 'A legal or regulatory claim needs jurisdiction and an original authority; otherwise identify a specialist review requirement without inventing legal certainty.', 'Each high risk needs an owner, early warning signal and a test or mitigation that changes the exposure.'],
    example: { kind: 'synthetic', situation: 'One public source describes demand growth while interviews report no budget.', weakResponse: 'Demand growth proves commercial viability.', betterResponse: 'Industry growth and this buyer’s budget answer different questions. Keep budget uncertainty as a critical risk and test purchase authority and a paid commitment before broad launch.' }, provenance: ['strategyzer', 'validore'],
  },
  {
    id: 'evidence-claim-source-fit', roles: ['evidence', 'synthesis', 'market'], keywords: ['evidence', 'source', 'review', 'statistics', 'claim'],
    objective: 'Review claim-source fit rather than counting URLs.',
    method: ['Check whether the retrieved text establishes the exact number, geography, timeframe and target customer.', 'A snippet, bibliographic record or stale memory is a lead, not a verified factual claim. Unread pages are inconclusive.', 'A primary national indicator can establish that indicator; it cannot establish startup demand or a narrow addressable market.', 'Label claim interpretations separately from retrieval metadata and preserve evidence that contradicts the preferred hypothesis.'],
    example: { kind: 'synthetic', situation: 'A retrieved pricing URL is present but its snippet contains no price.', weakResponse: 'Pricing verified because the source URL exists.', betterResponse: 'The URL was retrieved, but the supplied text does not establish a price. Read the original pricing page; until then pricing is not publicly established.' }, provenance: ['validore'],
  },
  {
    id: 'product-smallest-test', roles: ['product', 'synthesis'], keywords: ['product', 'mvp', 'features', 'solution'],
    objective: 'Design the smallest useful test of the most fragile product hypothesis.',
    method: ['Connect each must-have feature to a customer job and a measurable test outcome.', 'Prefer a narrow concierge or manual pilot where it can test the same hypothesis cheaply.', 'Make benefit claims proposed outcomes. Do not write testimonials, user counts, completed capabilities or guaranteed results into landing-page copy.', 'Separate MVP scope from later ideas and explain which hypothesis determines the next iteration.'],
    example: { kind: 'synthetic', situation: 'Inventory accuracy is untested, and the founder proposes a multi-platform suite.', weakResponse: 'Build analytics, AI forecasting, integrations and loyalty before launch.', betterResponse: 'Pilot stock reconciliation for one shop workflow using a simple upload and human checks. Test reconciliation time and paid reuse before building forecasting or broad integrations.' }, provenance: ['strategyzer', 'validore'],
  },
  {
    id: 'growth-sequential-experiments', roles: ['growth', 'synthesis'], keywords: ['growth', 'plan', 'channel', 'conversion', 'experiments'],
    objective: 'Order experiments by learning value, cost and prerequisites.',
    method: ['Start with problem and buyer evidence, then test willingness to pay and a repeatable channel before scaling.', 'Each experiment needs a hypothesis, action, owner, denominator, pass/fail threshold, timebox and decision on failure.', 'Treat discovery interviews as qualitative, not a representative survey. Do not apply population margin-of-error claims to a convenience sample.', 'Use observed conversion counts only when supplied. A modeled funnel must be labeled a scenario at every stage.'],
    example: { kind: 'synthetic', situation: 'No customer has been interviewed. A plan treats 10 email signups as payment proof and switches from individual founders to five incubator cohorts.', weakResponse: 'Collect 100 survey responses and 10 emails, then build the MVP and launch to five paying cohorts.', betterResponse: 'Hypothesis: individual founders with recent research spending will pay for a narrow pilot. Participant unit: one founder. Denominator: 10 eligible founders receiving the same explicit pilot offer, a proposed convenience sample. Pass criterion: at least 2 paid commitments at the stated pilot price; emails alone do not pass. If missed: stop expansion, interview non-buyers and revise the offer or test a separate organizational payer. Build the broader MVP only if the criterion passes.' }, provenance: ['strategyzer', 'validore'],
  },
  {
    id: 'synthesis-calibrated-verdict', roles: ['synthesis'], keywords: ['decision', 'verdict', 'score', 'handoff', 'validation'],
    objective: 'Make the verdict consistent with scores, evidence limits and missing specialist work.',
    method: ['Reconcile specialist findings using structured handoffs; do not silently overwrite contradictory claims.', 'A high concept score alone is not proven demand. GO requires direct product-specific commercial validation; desk research should name the behavioral test still required.', 'Unavailable agents create unknowns, not negative evidence or proof of failure. Disclose missing review and choose further validation before committing.', 'Align the selected value proposition, MVP scope, next step and weekly plan. Preserve Not established values, uncertainty and source-review contradictions.'],
    example: { kind: 'synthetic', situation: 'Concept score is 83 but all willingness-to-pay evidence is untested and the finance agent failed.', weakResponse: 'GO: strong score, launch and raise funding now.', betterResponse: 'TEST_FURTHER: promising concept score, but commercial validation and financial review remain incomplete. Test a paid pilot and complete cost assumptions before a launch decision.' }, provenance: ['strategyzer', 'validore'],
  },
]

/** Bounded, deterministic recall. Reference examples never enter public search or the evidence ledger. */
export function retrieveAgentReference(role: AgentRole, prompt: string, maxChars = 6500): { version: string; ids: string[]; text: string } {
  const limit = Number.isFinite(maxChars) ? Math.max(800, Math.min(8000, Math.floor(maxChars))) : 6500
  const words = new Set(prompt.toLowerCase().match(/[a-z]{3,}/g) ?? [])
  const ranked = AGENT_PLAYBOOKS.filter(book => book.roles.includes(role)).map(book => ({ book,
    score: (book.roles[0] === role ? 20 : 0) + book.keywords.reduce((sum, keyword) => sum + Number(words.has(keyword)), 0),
  })).sort((a, b) => b.score - a.score || a.book.id.localeCompare(b.book.id))
  let text = 'VALIDORE METHOD REFERENCE ' + PLAYBOOK_VERSION + '\nAuthored guidance and synthetic examples, not training/fine-tuning and not evidence about this startup. Never cite example facts as research.\n'
  const ids: string[] = []
  for (const { book } of ranked.slice(0, 3)) {
    const entry = JSON.stringify({ id: book.id, objective: book.objective, method: book.method, example: book.example,
      provenance: book.provenance.map(id => ({ id, ...REFERENCE_SOURCES[id] })),
    })
    if (text.length + entry.length + 1 > limit) continue
    text += entry + '\n'; ids.push(book.id)
  }
  return { version: PLAYBOOK_VERSION, ids, text }
}
