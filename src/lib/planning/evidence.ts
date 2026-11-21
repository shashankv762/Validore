import type { SearchResult } from '@/lib/ai/search'

export type PlanningIssue = { field: string; expected: string }
export const CANVAS_KEYS = ['problem', 'customerSegments', 'uvp', 'solution', 'channels', 'revenueStreams', 'costStructure', 'keyMetrics', 'unfairAdvantage'] as const
type Block = { content: string; confidenceScore: number; label: string; keyAssumptions: string[]; sourceUrls?: string[]; evidenceNote?: string }

export function planningSources(sources: readonly SearchResult[]) {
  return [...new Map(sources.map(source => [source.url, source])).values()].slice(0, 30).map(source => ({
    title: source.title, url: source.url, fetchedAt: source.fetchedAt,
    ...(source.dataBundleVersion ? { dataBundleVersion:source.dataBundleVersion } : {}),
    retrievalKind: source.retrievalKind ?? 'snippet',
    evidenceNote: source.retrievalKind === 'page' || source.retrievalKind === 'open-data' ? 'Retrieved source; review its relevance to the associated claim.' : 'Search or background context; does not establish a precise factual claim.',
  }))
}

export function validateCanvasOutput(canvas: Record<typeof CANVAS_KEYS[number], Block>, sources: readonly SearchResult[]): PlanningIssue[] {
  const allowed = new Set(sources.map(source => source.url))
  const issues: PlanningIssue[] = []
  for (const key of CANVAS_KEYS) {
    const block = canvas[key]
    if (!block.content.trim() || !block.keyAssumptions.length) issues.push({ field: key, expected: 'Provide a specific business-model hypothesis and at least one important assumption to test.' })
    if (block.sourceUrls?.some(url => !allowed.has(url))) issues.push({ field: key + '.sourceUrls', expected: 'Cite only exact URLs from supplied or successfully retrieved sources; omit unsupported citations.' })
  }
  return issues.slice(0, 8)
}

export function normalizeCanvasConfidence<T extends Record<typeof CANVAS_KEYS[number], Block> & { overallConfidenceScore: number }>(canvas: T, sources: readonly SearchResult[]): T {
  const allowed = new Set(sources.map(source => source.url))
  const result = { ...canvas }
  for (const key of CANVAS_KEYS) {
    const block = canvas[key]
    const sourceUrls = (block.sourceUrls ?? []).filter(url => allowed.has(url))
    // A source register alone does not support an individual block. A founder
    // brief is not primary validation; stronger claims require explicit evidence.
    // The current block schema links only public source URLs. Nonempty private
    // context (including skipped interview answers) cannot establish that a
    // particular block has undergone a customer test. Until primary evidence
    // can be linked and checked at block level, secondary research caps at 50.
    const cap = sourceUrls.length ? 50 : 25
    const score = Math.round(Math.max(0, Math.min(cap, block.confidenceScore)))
    const label = score <= 25 ? 'ASSUMPTION' : score <= 50 ? 'SOME_RESEARCH' : 'MODERATE_EVIDENCE'
    result[key] = { ...block, sourceUrls, confidenceScore: score, label }
  }
  result.overallConfidenceScore = Math.round(CANVAS_KEYS.reduce((sum, key) => sum + result[key].confidenceScore, 0) / CANVAS_KEYS.length)
  return result
}

type Slide = { slideNumber: number; title: string; content: string; keyPoints: string[]; speakerNotes: string; sourceUrls?: string[] }
export function validatePitchOutput(deck: { slides: Slide[]; investorQa: { question: string; answer: string }[] }, sources: readonly SearchResult[]): PlanningIssue[] {
  const allowed = new Set(sources.map(source => source.url))
  const issues: PlanningIssue[] = []
  if (deck.slides.some((slide, index) => slide.slideNumber !== index + 1)) issues.push({ field: 'slides.slideNumber', expected: 'Provide twelve slides in order, numbered consecutively from 1 through 12.' })
  if (deck.slides.some(slide => !slide.title.trim() || !slide.content.trim() || !slide.speakerNotes.trim() || !slide.keyPoints.length)) issues.push({ field: 'slides', expected: 'Every slide needs a declarative message, concise content, key points and useful speaker notes.' })
  if (deck.slides.some(slide => slide.sourceUrls?.some(url => !allowed.has(url)))) issues.push({ field: 'slides.sourceUrls', expected: 'Cite only exact supplied or successfully retrieved source URLs.' })
  if (new Set(deck.investorQa.map(item => item.question.trim().toLowerCase())).size !== deck.investorQa.length) issues.push({ field: 'investorQa', expected: 'Provide twenty distinct investor questions, with honest answers and evidence gaps.' })
  return issues
}

const PRICE_NUMBER = /\d+(?:[,\u00a0]\d{2,3})*(?:\.\d+)?/g
const CURRENCY = /\b(?:INR|USD|EUR|GBP|CAD|AUD)\b|US\$|CA\$|AU\$|C\$|A\$|[$€£₹]|\bRs\.?/gi
const currencyAliases: Record<string, string> = { '₹': 'INR', RS: 'INR', 'RS.': 'INR', '€': 'EUR', '£': 'GBP', 'US$': 'USD', 'CA$': 'CAD', 'C$': 'CAD', 'AU$': 'AUD', 'A$': 'AUD', '$': 'DOLLAR' }
const currencyCode = (value: string) => currencyAliases[value.toUpperCase()] ?? value.toUpperCase()
const currencies = (value: string) => new Set((value.match(CURRENCY) ?? []).map(currencyCode))
const billingUnits = (value: string) => new Set([
  [/\b(?:monthly|months?|mo)\b/i, 'month'], [/\b(?:annually|annual|yearly|years?|yr)\b/i, 'year'],
  [/\b(?:weekly|weeks?)\b/i, 'week'], [/\b(?:daily|days?)\b/i, 'day'],
  [/\b(?:per|each)\s+(?:user|seat)|\/\s*(?:user|seat)/i, 'seat'],
].filter(([pattern]) => (pattern as RegExp).test(value)).map(([, unit]) => unit as string))

/** Conservative amount/currency/cadence check. Matching a number elsewhere on
 * a pricing page (for example a seat limit) is not evidence for a price. */
function supportedPriceClaim(claim: string, page: string): boolean {
  const claimedCurrencies = currencies(claim)
  const claimedUnits = billingUnits(claim)
  const amounts = [...claim.matchAll(PRICE_NUMBER)].map(match => Number(match[0].replace(/[,\u00a0]/g, '')))
  if (!amounts.length) return !claimedCurrencies.size && !claimedUnits.size && page.toLowerCase().includes(claim.trim().toLowerCase())
  const entries = [...page.matchAll(PRICE_NUMBER)]
  return amounts.every(amount => entries.some((entry, index) => {
    if (Number(entry[0].replace(/[,\u00a0]/g, '')) !== amount) return false
    const start = entry.index!
    const previousNumberEnd = index > 0 ? entries[index - 1].index! + entries[index - 1][0].length : 0
    const localStart = Math.max(previousNumberEnd, start - 90)
    const rawBefore = page.slice(localStart, start)
    // Cadence must belong to this offer. Stop at a sentence/line/column
    // boundary rather than borrowing "per month" from the previous price.
    const boundary = Math.max(rawBefore.lastIndexOf('\n'), rawBefore.lastIndexOf(';'), rawBefore.lastIndexOf('|'),
      rawBefore.search(/\.\s+[^.]*$/))
    const before = rawBefore.slice(boundary >= 0 ? boundary + 1 : 0)
    const rawAfter = page.slice(start + entry[0].length, entries[index + 1]?.index ?? page.length).slice(0, 90)
    const nextBoundary = rawAfter.search(/[\n;|]|\.\s+/)
    const after = nextBoundary >= 0 ? rawAfter.slice(0, nextBoundary) : rawAfter
    const prefix = before.match(/(?:\b(?:INR|USD|EUR|GBP|CAD|AUD)|US\$|CA\$|AU\$|C\$|A\$|[$€£₹]|\bRs\.?)\s*[:=]?\s*$/i)?.[0]
    const suffix = after.match(/^\s*(?:\b(?:INR|USD|EUR|GBP|CAD|AUD)\b|US\$|CA\$|AU\$|C\$|A\$|[$€£₹]|\bRs\.?)/i)?.[0]
    const foundCurrencies = currencies((prefix ?? '') + (suffix ?? ''))
    if (!foundCurrencies.size || [...claimedCurrencies].some(currency => !foundCurrencies.has(currency))) return false
    const foundUnits = billingUnits(entry[0] + after)
    return [...claimedUnits].every(unit => foundUnits.has(unit))
  }))
}

export function validatePricingOutput(data: { competitorPrices: { source?: string; price?: string; dateChecked?: string }[] }, sources: readonly SearchResult[]): PlanningIssue[] {
  const pages = new Map(sources.filter(source => source.retrievalKind === 'page').map(source => [source.url, source]))
  const issues: PlanningIssue[] = []
  for (const [index, price] of data.competitorPrices.entries()) {
    const page = price.source ? pages.get(price.source) : null
    if (!page) issues.push({ field: `competitorPrices.${index}.source`, expected: 'Include prices only from a retrieved pricing page, with its exact source URL. Use an empty array when no pricing page was retrieved.' })
    else if (price.price) {
      if (!supportedPriceClaim(price.price, page.content)) issues.push({ field: `competitorPrices.${index}.price`, expected: 'Retain only the amount, original currency and billing unit stated together on this retrieved page. Seat limits, unrelated numbers and conversion guesses do not establish a price.' })
    }
    if (page && price.dateChecked !== undefined && price.dateChecked !== page.fetchedAt.slice(0, 10)) issues.push({ field: `competitorPrices.${index}.dateChecked`, expected: 'Use this source’s supplied retrieval date. A cached source was not checked again today.' })
  }
  return issues.slice(0, 8)
}

export function preserveFounderMilestones<T extends { roadmap: { milestones: { milestone: string; status: 'PLANNED' | 'ACHIEVED' }[] }[] }>(deck: T, milestones: { milestone: string; status: 'PLANNED' | 'ACHIEVED' }[]): T {
  const supplied = new Map(milestones.map(item => [item.milestone.trim().toLowerCase(), item.status]))
  return { ...deck, roadmap: deck.roadmap.map(phase => ({ ...phase, milestones: phase.milestones.map(item => ({ ...item,
    status: supplied.get(item.milestone.trim().toLowerCase()) ?? 'PLANNED',
  })) })) }
}
