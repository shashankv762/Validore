import type { EvidenceItem, FullReport, EvidenceReview, PlanningBasis } from '../schemas'
import type { SearchResult } from '@/lib/ai/search'
import type { AgentRole } from '@/lib/ai/roles'
import type { OutputQualityIssue } from '@/lib/ai/generate'
import type { HandoffAudit } from './handoffs'
import type { UnitAssumptions } from '@/lib/financial'

const CONTEXTUAL_INDICATORS = ['SP.POP.TOTL', 'NY.GDP.MKTP.CD', 'NY.GDP.PCAP.CD', 'IT.NET.USER.ZS', 'FP.CPI.TOTL.ZG', 'NY.GDP.MKTP.KD.ZG', 'SP.URB.TOTL.IN.ZS', 'SL.UEM.TOTL.ZS']

function httpUrl(value?: string): string | null {
  if (!value) return null
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.href : null }
  catch { return null }
}

/** Unsupported sizing must not become an input to the finance or review agents. */
export function auditMarketSizing(sizing: FullReport['tamSamSom'] | undefined, sources: SearchResult[]): FullReport['tamSamSom'] {
  const cited = httpUrl(sizing?.tam.source)
  const readSource = (source: SearchResult) => source.retrievalKind === 'page' || source.retrievalKind === 'open-data'
  const inputs = sizing?.tam.inputs
  const normalize = (value: string) => value.replace(/\s+/g, ' ').trim()
  const annualCadence = (value: string) => /\b(?:annual(?:ly)?|yearly|per\s+(?:year|annum)|a\s+year|each\s+year)\b|\/\s*(?:yr|year)\b/i.test(value)
  const supportedInputs = inputs && [inputs.customerCount, inputs.annualSpend].every(input => sources.some(source => {
    if (httpUrl(source.url) !== httpUrl(input.source) || !readSource(source) || CONTEXTUAL_INDICATORS.includes(source.indicator ?? '') ||
      CONTEXTUAL_INDICATORS.some(code => source.url.includes('/indicator/' + code))) return false
    if (typeof source.value === 'number' && source.value === input.value) return true
    const excerpt = input.evidenceExcerpt
    if (!excerpt || !normalize(source.content).includes(normalize(excerpt))) return false
    if ('currency' in input) {
      // A recurring monthly/weekly price cannot be multiplied by customer
      // count as though it were an annual value. Require the cited passage to
      // state its annual cadence explicitly.
      if (!annualCadence(excerpt)) return false
      const statedCurrencies = excerpt.match(/\b(?:USD|INR|EUR|GBP|CAD|AUD|SGD|JPY|CNY|BRL)\b/gi) ?? []
      if (statedCurrencies.length && !statedCurrencies.some(value => value.toUpperCase() === input.currency)) return false
      if (excerpt.includes('£') && input.currency !== 'GBP' || excerpt.includes('₹') && input.currency !== 'INR' || excerpt.includes('€') && input.currency !== 'EUR') return false
    }
    const numbers = normalize(excerpt).replace(/,/g, '').match(/(?<![\p{L}\p{N}.])[-+]?\d+(?:\.\d+)?(?:e[-+]?\d+)?(?![\p{L}\p{N}.])/giu) ?? []
    return numbers.some(value => Number(value) === input.value)
  }))
  if (sizing && cited && supportedInputs && inputs && sources.some(source => httpUrl(source.url) === cited && readSource(source))) {
    const value = inputs.customerCount.value * inputs.annualSpend.value
    if (Number.isFinite(value)) {
      const amount = (text: string) => {
        const match = /\b(USD|INR|EUR|GBP|CAD|AUD|SGD|JPY|CNY|BRL)\s*([\d,]+(?:\.\d+)?)\s*([KMB])?\b/i.exec(text) ??
          /([$₹€£])\s*([\d,]+(?:\.\d+)?)\s*([KMB])?\b/i.exec(text)
        if (!match) return null
        const currency = /^[A-Z]{3}$/i.test(match[1]) ? match[1].toUpperCase() : ({ '$': 'USD', '₹': 'INR', '€': 'EUR', '£': 'GBP' } as Record<string, string>)[match[1]]
        const number = Number(match[2].replace(/,/g, '')) * ({ K: 1_000, M: 1_000_000, B: 1_000_000_000 }[match[3]?.toUpperCase() as 'K' | 'M' | 'B'] ?? 1)
        return Number.isFinite(number) ? { currency, value: number } : null
      }
      const currency = inputs.annualSpend.currency
      const samAmount = amount(sizing.sam.value)
      const somAmount = amount(sizing.som.value)
      const sam = samAmount?.currency === currency ? samAmount.value : null
      const som = somAmount?.currency === currency ? somAmount.value : null
      const inconsistent = Boolean(samAmount && samAmount.currency !== currency || somAmount && somAmount.currency !== currency) ||
        sam !== null && sam > value || som !== null && (sam !== null && som > sam || sam === null && som > value)
      return { ...sizing, tam: { ...sizing.tam, value: `${currency} ${value.toLocaleString(currency === 'INR' ? 'en-IN' : 'en-US', { maximumFractionDigits: 2 })}`,
        method: `${inputs.customerCount.value.toLocaleString('en-US')} ${inputs.customerCount.unit} × ${currency} ${inputs.annualSpend.value.toLocaleString('en-US')} annual spend. ${sizing.tam.method}` },
        ...(inconsistent ? { sam: { ...sizing.sam, value: 'Not established', method: 'The proposed serviceable market exceeds the supported total addressable market or is inconsistent with the stated currency. Recalculate SAM from the supported TAM and a documented segment.' },
          som: { ...sizing.som, value: 'Not established', method: 'The proposed obtainable market exceeds its supported ceiling or cannot be reconciled with the stated currency. Estimate reachable customers and revenue from a constrained acquisition and delivery plan.' } } : {}) }
    }
  }
  return {
    tam: { value: 'Not established', source: '', label: 'PROJECTION', method: 'A retrieved source for the target customer count and annual spending is missing. Establish both inputs before sizing this product\'s market.' },
    sam: { value: 'Not established', label: 'PROJECTION', method: 'Define the serviceable customer segment and geography once the addressable-market inputs are established.' },
    som: { value: 'Not established', label: 'PROJECTION', method: 'Estimate reachable customers and annual revenue from a tested acquisition plan and delivery capacity.' },
  }
}

export function validateMarketSizingOutput(data: Pick<FullReport, 'tamSamSom'>, sources: readonly SearchResult[]): OutputQualityIssue[] {
  if (/^not established\b/i.test(data.tamSamSom.tam.value)) return []
  if (auditMarketSizing(data.tamSamSom, [...sources]).tam.value === 'Not established') return [{ field: 'tamSamSom.tam',
    expected: 'Use Not established when eligible buyer count or annual spending lacks a successfully read source and exact evidenceExcerpt. Otherwise supply both numerical inputs with units, currency, source URL and exact source passages. National population, GDP, internet adoption and aggregate growth are context, not startup buyer/spend inputs.' }]
  return []
}

/** These agents conduct desk research, not customer interviews or experiments. */
export function auditFounderAssumptions(assumptions: FullReport['founderAssumptions']): FullReport['founderAssumptions'] {
  return assumptions.map(assumption => ({ ...assumption, validated: false }))
}

export const DESK_RESEARCH_NOTE = 'Desk research only: these agents have not conducted customer interviews or experiments. Founder hypotheses still require direct testing.'

export function auditSourceReview(review: EvidenceReview, sources: SearchResult[]): EvidenceReview {
  const known = new Map(sources.map(source => [httpUrl(source.url), source]))
  return { ...review, checks: review.checks.map(check => {
    const url = httpUrl(check.url)
    const source = url ? known.get(url) : undefined
    if (source && source.retrievalKind !== 'page' && source.retrievalKind !== 'open-data') return { ...check, url: source.url, assessment: 'inconclusive' as const,
      rationale: 'Only a search excerpt or dated memory was supplied. Read the original source before assessing this claim.' }
    if (url && source) return { ...check, url,
      ...(check.assessment !== 'inconclusive' && !supportsSourceReviewClaim(check, source) ? { assessment: 'inconclusive' as const,
        rationale: 'The retrieved passage does not substantiate this assessment. Treat the claim as unverified until a relevant source passage is identified.' } : {}),
      ...(check.decisionRelevance === 'blocking' && !supportsBlockingCheck(check, source) ? { decisionRelevance: 'material' as const } : {}) }
    return { ...check, url: '', assessment: 'inconclusive' as const,
      rationale: 'The cited source was not retrieved. This claim remains unverified.' }
  }) }
}

function normalizeEvidenceText(value: string) {
  return value.normalize('NFKC').replace(/\s+/g, ' ').trim().toLocaleLowerCase()
}

const claimStopWords = new Set(['about', 'after', 'also', 'been', 'being', 'could', 'does', 'from', 'have', 'into', 'more',
  'only', 'other', 'over', 'same', 'some', 'such', 'than', 'that', 'their', 'them', 'there', 'these', 'they', 'this',
  'those', 'through', 'under', 'very', 'were', 'what', 'when', 'where', 'which', 'while', 'will', 'with', 'would',
  'claim', 'claims', 'evidence', 'source', 'report', 'according', 'states', 'shows', 'indicates'])
function claimTokens(value: string) {
  return new Set(value.normalize('NFKC').toLocaleLowerCase().match(/[\p{L}\p{N}]{4,}/gu)?.filter(token => !claimStopWords.has(token)) ?? [])
}
function claimMatchesExcerpt(claim: string, excerpt: string) {
  const expected = claimTokens(claim)
  if (!expected.size) return false
  const observed = claimTokens(excerpt)
  const overlap = [...expected].filter(token => observed.has(token)).length
  return overlap >= Math.min(2, expected.size) && overlap / expected.size >= 0.25
}

export function hasExactSourceExcerpt(item: EvidenceItem, source?: SearchResult): boolean {
  const excerpt = item.evidenceExcerpt?.trim()
  return Boolean(excerpt && excerpt.length >= 20 && source &&
    (source.retrievalKind === 'page' || source.retrievalKind === 'open-data') &&
    normalizeEvidenceText(source.content).includes(normalizeEvidenceText(excerpt)))
}

/** A citation URL proves provenance only. Upgrade a claim when a substantial
 * exact passage from the retrieved original text accompanies it. */
function supportsSourceReviewClaim(check: EvidenceReview['checks'][number], source: SearchResult): boolean {
  const excerpt = check.evidenceExcerpt?.trim()
  return Boolean(excerpt && excerpt.length >= 20 && claimMatchesExcerpt(check.claim, excerpt) &&
    (source.retrievalKind === 'page' || source.retrievalKind === 'open-data') &&
    normalizeEvidenceText(source.content).includes(normalizeEvidenceText(excerpt)))
}

function supportsBlockingCheck(check: EvidenceReview['checks'][number], source?: SearchResult): boolean {
  const normalize = (value: string) => value.replace(/\s+/g, ' ').trim()
  const excerpt = check.evidenceExcerpt?.trim()
  return check.decisionRelevance === 'blocking' && check.assessment === 'contradicts' && Boolean(excerpt && excerpt.length >= 20 &&
    claimMatchesExcerpt(check.claim, excerpt) &&
    source && (source.retrievalKind === 'page' || source.retrievalKind === 'open-data') &&
    !CONTEXTUAL_INDICATORS.some(code => source.url.includes('/indicator/' + code) || source.indicator === code) &&
    normalize(source.content).includes(normalize(excerpt)))
}

/** A read competitor page or a loss under invented assumptions is not an
 * observed blocking outcome. The source reviewer must identify the blocker
 * explicitly and supply a passage from its original retrieved text. */
export function hasReviewedBlockingEvidence(context: {
  evidence?: EvidenceItem[]; review?: EvidenceReview; sources?: readonly SearchResult[];
}): boolean {
  return (Array.isArray(context.review?.checks) ? context.review.checks : []).some(check => {
    const url = httpUrl(check.url)
    const source = context.sources?.find(value => httpUrl(value.url) === url)
    return Boolean(url && (context.evidence ?? []).some(item => httpUrl(item.link) === url && item.strength !== 'WEAK' &&
      hasExactSourceExcerpt(item, source) && claimMatchesExcerpt(item.claim, item.evidenceExcerpt ?? '')) &&
      supportsBlockingCheck(check, source))
  })
}

/** A deterministic supervisor checks citation provenance without another paid AI call. */
export function auditEvidence(evidence: EvidenceItem[], sources: SearchResult[]) {
  const known = new Map(sources.map(source => [httpUrl(source.url), source]).filter(([url]) => url !== null) as [string, SearchResult][])
  let unmatched = 0
  const keyEvidence = evidence.map(item => {
    const link = httpUrl(item.link)
    const source = link ? known.get(link) : undefined
    if (!source) {
      unmatched++
      return { ...item, link: '', source: '', publication: '', fetchedAt: undefined,
        strength: 'WEAK' as const, label: 'AI_ESTIMATE_UNVERIFIED' as const }
    }
    const hasSupportingPassage = hasExactSourceExcerpt(item, source)
    return { ...item, link: source.url, source: source.source, fetchedAt: source.fetchedAt,
      strength: item.strength === 'WEAK' || !hasSupportingPassage ? 'WEAK' as const : 'MODERATE' as const,
      label: item.label === 'VERIFIED' || !item.label ? 'AI_ESTIMATE_UNVERIFIED' as const : item.label }
  })
  return { keyEvidence, qualityAudit: { citationsChecked: evidence.length, unmatchedCitations: unmatched,
    note: 'Source passages were matched exactly to the cited retrieved content. This establishes passage provenance, not that every inference is proven.' } }
}

export function validateCustomerSignals(data: Pick<FullReport, 'customerSignals'>, sources: readonly SearchResult[]): OutputQualityIssue[] {
  const issues: OutputQualityIssue[] = []
  for (const [index, observation] of (data.customerSignals?.observations ?? []).entries()) {
    if (observation.count !== null && observation.sampleSize !== null && observation.count > observation.sampleSize) issues.push({ field: 'customerSignals.observations.' + index + '.count', expected: 'The observed count cannot exceed the stated sample size. Preserve supplied actual denominators; use null for unknown counts.' })
    if (observation.sourceType === 'assumption' && (observation.count !== null || observation.sampleSize !== null)) issues.push({ field: 'customerSignals.observations.' + index + '.count', expected: 'A proposed hypothesis has no observed customer count or denominator. Use null for both.' })
    if (observation.sourceType === 'public_review') {
      const uniqueUrls = [...new Set(observation.sourceUrls.map(url => httpUrl(url)))]
      if (uniqueUrls.length !== observation.sourceUrls.length) issues.push({ field: 'customerSignals.observations.' + index + '.sourceUrls', expected: 'Do not repeat one source URL to multiply its review count. Count each cited page once.' })
      const reviewSources = uniqueUrls.map(url => sources.find(source => httpUrl(source.url) === url && source.retrievalKind === 'page'))
      const samples = reviewSources.map(source => { try {
        const value = JSON.parse(source?.content ?? '')
        const supportedKind = value.kind === 'public_review_markup' || value.kind === 'public_review_feed'
        return supportedKind && Array.isArray(value.reviews) && value.reviews.length > 0 &&
          value.reviews.every((review: unknown) => review && typeof review === 'object' && !Array.isArray(review) &&
            'content' in review && typeof review.content === 'string' && review.content.trim().length >= 3)
          ? value.reviews.length : null
      } catch { return null } })
      if (!reviewSources.length || samples.some(count => count === null)) issues.push({ field: 'customerSignals.observations.' + index + '.sourceUrls', expected: 'Public-review observations require exact sources from actual extracted Review records, not arbitrary readable paragraphs or aggregate stars. Use the public-review tool or label an unsupported hypothesis as an assumption with null counts.' })
      const available = samples.reduce<number>((sum, count) => sum + (count ?? 0), 0)
      if (observation.count !== null && observation.count > available) issues.push({ field: 'customerSignals.observations.' + index + '.count', expected: 'The reported count cannot exceed actual extracted reviews from the cited pages, even when the sample denominator is unknown.' })
      if (observation.sampleSize !== null && observation.sampleSize > available) issues.push({ field: 'customerSignals.observations.' + index + '.sampleSize', expected: 'The sample denominator cannot exceed the actual extracted reviews from the cited pages. Do not invent review counts.' })
    }
    if (!observation.limitation.trim()) issues.push({ field: 'customerSignals.observations.' + index + '.limitation', expected: 'Explain source, selection and representativeness limits; public reviews do not establish demand for this startup.' })
  }
  return issues
}

export function validateProductPlan(data: Pick<FullReport, 'uvpOptions' | 'selectedUvp' | 'mvpDescription' | 'oneLineConcept'>): OutputQualityIssue[] {
  const issues: OutputQualityIssue[] = []
  const options = data.uvpOptions.map(value => value.trim().toLowerCase())
  if (options.some(value => !value) || new Set(options).size !== 3) issues.push({ field: 'uvpOptions', expected: 'Provide exactly three distinct, concrete value propositions for this customer; do not repeat empty or generic options.' })
  if (!options.includes(data.selectedUvp.trim().toLowerCase())) issues.push({ field: 'selectedUvp', expected: 'Choose one of the three proposed value propositions so the canvas, MVP and pitch stay consistent.' })
  if (!data.mvpDescription?.trim() || !data.oneLineConcept?.trim()) issues.push({ field: 'mvpDescription', expected: 'Explain the focused MVP and the concept in clear nonempty language consistent with the selected value proposition.' })
  return issues
}

export function validateGrowthPlan(data: Pick<FullReport, 'actionPlan'>): OutputQualityIssue[] {
  const issues: OutputQualityIssue[] = []
  if (data.actionPlan.length < 4 || data.actionPlan.some(step => !step.action.trim() || !step.owner.trim() || !step.kpi.trim())) issues.push({ field: 'actionPlan', expected: 'Give at least four feasible sequential proposed milestones with an action, responsible owner and measurable KPI, including a test of the weakest commercial assumption.' })
  if (data.actionPlan.some(step => !step.hypothesis?.trim() || !step.participantUnit?.trim() || !step.denominator?.trim() ||
      !step.passCriterion?.trim() || !step.decisionOnFailure?.trim())) issues.push({ field: 'actionPlan', expected: 'For every proposed experiment state hypothesis, participantUnit, denominator, passCriterion and decisionOnFailure. Keep founders, organizations and cohorts distinct. Interviews or email signups cannot pass a payment hypothesis; propose a real paid commitment test. Thresholds are planned criteria, not observed results.' })
  return issues
}

export function validatePlanningBasis(data: { planningBasis?: PlanningBasis; actionPlan?: FullReport['actionPlan'] },
  finance?: UnitAssumptions, expected?: PlanningBasis): OutputQualityIssue[] {
  const basis = data.planningBasis
  const issues: OutputQualityIssue[] = []
  if (!basis) return [{ field: 'planningBasis', expected: 'Provide the shared proposed offer, cohort, participant unit, overall program horizon and utility phase.' }]
  if (expected && JSON.stringify(basis) !== JSON.stringify(expected)) issues.push({ field: 'planningBasis',
    expected: 'Copy the supplied product planningBasis exactly. Do not silently change the offer, currency, cohort, participant unit or program horizon. Describe paid subsets and additional comparison samples explicitly in each experiment denominator.' })
  if (basis.utilityWeeks > basis.programWeeks) issues.push({ field: 'planningBasis.utilityWeeks', expected: 'The utility phase belongs inside the shared overall program, not a competing completion promise.' })
  if (basis.offer.basis === 'finance_base' && (!finance || basis.offer.amount !== finance.estimatedSellingPrice ||
      basis.offer.currency !== (finance.currency ?? 'USD') || basis.offer.period !== 'month')) {
    issues.push({ field: 'planningBasis.offer', expected: 'Use the exact finance-base amount/currency and monthly unit, or explicitly name a different offer as named_variant with its rationale and relationship to the base scenario. Do not silently change price or period.' })
  }
  if (basis.offer.basis === 'named_variant' && (!basis.offer.variantRationale.trim() || basis.offer.amount === null || basis.offer.currency === null)) {
    issues.push({ field: 'planningBasis.offer', expected: 'A named price/period experiment needs an explicit amount, currency and reason for differing from the finance base; it remains a proposed test, not established pricing.' })
  }
  if (finance && basis.offer.currency !== null && basis.offer.currency !== (finance.currency ?? 'USD')) {
    issues.push({ field: 'planningBasis.offer.currency', expected: 'Keep the finance-base currency. No exchange conversion or foreign-currency cost assumptions were supplied.' })
  }
  if (basis.offer.basis === 'not_established' && (basis.offer.amount !== null || basis.offer.currency !== null || basis.offer.period !== 'not_established')) {
    issues.push({ field: 'planningBasis.offer', expected: 'An unestablished offer must use null amount/currency and not_established period. Otherwise declare a named proposed variant.' })
  }
  for (const [index, step] of (data.actionPlan ?? []).entries()) {
    const week = /\bweeks?\s*(\d{1,2})(?:\s*[-–]\s*(\d{1,2}))?/i.exec(step.week)
    if (week && Math.max(Number(week[1]), Number(week[2] ?? week[1])) > basis.programWeeks) issues.push({ field: 'actionPlan.' + index + '.week', expected: 'Keep milestones within the shared planningBasis programWeeks; distinguish the shorter utility phase from the full follow-up horizon.' })
    if (step.participantUnit?.trim() !== basis.participantUnit) issues.push({ field: 'actionPlan.' + index + '.participantUnit', expected: 'Use the exact shared participantUnit. Put paid-subset, retained-cohort or new comparison-sample details in denominator; do not silently switch the unit of analysis.' })
  }
  return issues
}

export function validateSynthesisJudgment(data: Pick<FullReport, 'decisionReasons' | 'integrityNote' | 'nextStepRationale' | 'founderAssumptions'>): OutputQualityIssue[] {
  const issues: OutputQualityIssue[] = []
  if (data.decisionReasons.length < 2 || data.decisionReasons.some(reason => !reason.trim())) issues.push({ field: 'decisionReasons', expected: 'Give concrete, nonempty reasons tied to this buyer, the supplied evidence and its limits. Unknown buying behavior must remain a hypothesis, not a claimed negative observation.' })
  if (!data.integrityNote.trim() || !data.nextStepRationale.trim()) issues.push({ field: 'integrityNote', expected: 'Explain what is observed, assumed and still missing, then identify the next decision-changing test in nextStepRationale.' })
  if (!data.founderAssumptions.length || data.founderAssumptions.some(item => !item.assumption.trim() || !item.preResearchBelief.trim() || !item.postResearchFinding.trim()) ||
      new Set(data.founderAssumptions.map(item => item.id)).size !== data.founderAssumptions.length) issues.push({ field: 'founderAssumptions', expected: 'Give distinct critical founder hypotheses with unique IDs, the original belief and a nonempty evidence-limited finding. Preserve uncertainty and identify direct testing needs.' })
  return issues
}

/** Detect the observed failure where the judge claimed complete scores/plans
 * were omitted. Genuine missing evidence or omitted ancillary detail is not
 * the same claim and must remain reportable. */
export function validateSynthesisHandoffClaims(data: Pick<FullReport, 'decisionReasons' | 'integrityNote' | 'nextStepRationale'>,
  audit?: HandoffAudit): OutputQualityIssue[] {
  if (!audit) return []
  const text = [...data.decisionReasons, data.integrityNote, data.nextStepRationale].join('\n')
  const absent = '(?:omitted|missing|unavailable|not (?:supplied|provided))(?=$|[.,;:]|\\s+(?:from|in|because|so|preventing)\\b)'
  const issues: OutputQualityIssue[] = []
  if (Object.keys(audit.knownScores).length >= 7 && new RegExp('(?:specialist|upstream|agent)\\s+(?:sub[- ]?scores|scores)\\s+(?:are|were|have been)\\s+' + absent, 'im').test(text)) {
    issues.push({ field: 'decisionReasons', expected: 'The explicit score summary supplies all seven upstream scores and their subtotal. Do not claim those scores were omitted. Use that summary and add only your execution score; missing demand evidence is a separate issue.' })
  }
  const plan = '(?:value proposition|MVP|product plan|growth plan|action plan|sequential experiments)'
  if (audit.productPlanProvided && audit.growthPlanProvided &&
      new RegExp(plan + '(?:(?:,\\s*|\\s+and\\s+)' + plan + ')*\\s+(?:is|are|was|were|has been|have been)\\s+' + absent, 'im').test(text)) {
    issues.push({ field: 'decisionReasons', expected: 'The handoffs supply the selected value proposition, MVP and experiment actions/pass criteria/failure decisions. Review those retained essentials; do not say the plans are absent. You may identify genuinely omitted ancillary detail and untested assumptions.' })
  }
  return issues
}

export function validateSynthesisPlan(data: Pick<FullReport, 'uvpOptions' | 'selectedUvp' | 'actionPlan' | 'mvpDescription' | 'oneLineConcept'>): OutputQualityIssue[] {
  return [...validateProductPlan(data), ...validateGrowthPlan(data)]
}

export type ReviewableDecision = Pick<FullReport, 'decision' | 'decisionReasons' | 'nextStepRecommendation' | 'nextStepRationale'> & {
  actionPlan?: readonly { action: string; kpi: string; passCriterion?: string; decisionOnFailure?: string }[];
}
export type DecisionAudit = { policyVersion: string; scoreBand: FullReport['decision']; originalDecision: FullReport['decision']; finalDecision: FullReport['decision']; missingAgents: AgentRole[]; issues: string[] }

/** Concept scores and evidence completeness are separate. Unknown is never proof of failure. */
export function reconcileDecision<T extends ReviewableDecision>(report: T, overallScore: number, context: {
  agents?: Partial<Record<AgentRole | 'monolithic', 'ok' | 'failed' | 'partial'>>
  evidence?: EvidenceItem[]
  review?: EvidenceReview
  sources?: readonly SearchResult[]
}): T & { decisionAudit: DecisionAudit } {
  const scoreBand: FullReport['decision'] = overallScore >= 75 ? 'GO' : overallScore >= 55 ? 'MODIFY' : overallScore >= 40 ? 'TEST_FURTHER' : 'NO_GO'
  const missingAgents = Object.entries(context.agents ?? {}).filter(([role, status]) => role !== 'monolithic' && status !== 'ok').map(([role]) => role as AgentRole)
  const issues: string[] = []
  const contradicted = (context.review?.checks ?? []).filter(check => check.assessment === 'contradicts')
  const hasReadEvidence = (context.evidence ?? []).some(item => {
    const url = httpUrl(item.link)
    const source = url ? context.sources?.find(value => httpUrl(value.url) === url) : undefined
    return Boolean(url && item.strength !== 'WEAK' && !CONTEXTUAL_INDICATORS.some(code => url.includes('/indicator/' + code)) &&
      hasExactSourceExcerpt(item, source))
  })
  const hasBlockingEvidence = hasReviewedBlockingEvidence(context)
  // Score bands describe the rubric, not a second judge that can turn unknown
  // customer demand into a negative commercial observation.
  let decision: FullReport['decision'] = report.decision
  if (missingAgents.length) {
    decision = 'TEST_FURTHER'; issues.push('Specialist work is incomplete: ' + missingAgents.join(', ') + '. Missing work is uncertainty, not negative evidence.')
  } else if (!hasReadEvidence) {
    decision = 'TEST_FURTHER'; issues.push('No reviewed evidence supports the commercial conclusion. The score describes a concept hypothesis, not validated demand.')
  } else if (report.decision === 'GO') {
    decision = 'TEST_FURTHER'; issues.push('A high concept score does not establish product-specific willingness to pay. Complete a direct commercial test before a GO decision.')
  } else if (report.decision === 'NO_GO' && !hasBlockingEvidence) {
    decision = 'TEST_FURTHER'; issues.push('No original-source blocking finding establishes fundamental failure. A low score, ordinary competitor pages and assumed financial losses identify hypotheses to test, not observed customer rejection.')
  }
  if (contradicted.length) {
    if (!(decision === 'NO_GO' && hasBlockingEvidence)) decision = 'TEST_FURTHER'
    issues.push('The source review found contradictory evidence. Resolve claim-source and segment differences before committing. Only an explicitly reviewed blocking finding can support NO_GO.')
  }
  if (scoreBand === 'NO_GO' && decision === 'TEST_FURTHER' && !issues.length) issues.push('The low concept score reflects limited support or untested assumptions. The evidence-limited TEST_FURTHER judgment is retained.')
  const cautious = decision === 'TEST_FURTHER' || decision === 'NO_GO'
  const firstTest = report.actionPlan?.[0]
  const saferRationale = firstTest
    ? 'Before committing, complete this proposed test: ' + firstTest.action + ' Proceed only if: ' + (firstTest.passCriterion || firstTest.kpi) + (firstTest.decisionOnFailure ? ' If it fails: ' + firstTest.decisionOnFailure : '')
    : 'Resolve the weakest problem, customer and financial assumptions before committing to the current plan.'
  return { ...report, decision, decisionReasons: [...report.decisionReasons],
    ...(cautious ? { nextStepRecommendation: 'MORE_VALIDATION' as const,
      nextStepRationale: report.nextStepRecommendation === 'MORE_VALIDATION' && report.nextStepRationale.trim() ? report.nextStepRationale : saferRationale } : {}),
    // Keep policy notes separate. Appending them to the model's valid five
    // reasons previously broke the final Lite schema and erased useful advice.
    decisionAudit: { policyVersion: '2026-11-20.1', scoreBand, originalDecision: report.decision, finalDecision: decision, missingAgents, issues },
  }
}
