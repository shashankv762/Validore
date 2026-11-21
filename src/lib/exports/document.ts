import { isIncompleteResearch } from './completeness'
import { TEMPLATE_VERSION } from './design'
import type { LayoutBlock } from './design'

export type DocumentLine = { text: string; kind: 'text' | 'label' | 'bullet' | 'field' }
export type DocumentSection = { title: string; lines: DocumentLine[]; breakBefore?: boolean; blocks?: LayoutBlock[] }
export type ReportDocument = { title: string; subtitle: string; date: string; partial: boolean; sections: DocumentSection[];
  design?: { version: string; paper: 'a4' | 'a3'; orientation: 'portrait' | 'landscape'; example?: boolean; workbook?: boolean } }

const TITLES: Record<string, string> = {
  overallScore: 'Validation score', decision: 'Recommendation', decisionReasons: 'Why this recommendation',
  oneLineConcept: 'The idea in one sentence', founderAssumptions: 'Founder assumptions', keyEvidence: 'Evidence and sources',
  keyRisks: 'Key risks', actionPlan: 'Your action plan', persona: 'Customer profile', personas: 'Customer profiles',
  competitors: 'Competition', tamSamSom: 'Market sizing', tamEstimate: 'Total addressable market', samEstimate: 'Serviceable market', somEstimate: 'Initial obtainable market',
  unitEconomicsAssumptions: 'Financial assumptions', computedUnitEconomics: 'Calculated unit economics', financialProjection: '12-month illustrative projection', financialReview: 'Financial scenarios and sensitivity',
  problemValidation5Factor: 'Problem assessment', customerJPG: 'Customer jobs, pains and gains', interviewQuestions: 'Customer interview guide',
  competitorPositioning: 'Competitive positioning', landingPageCopy: 'Proposed landing page copy', wtpSurveyQuestions: 'Willingness-to-pay questions',
  pestleAnalysis: 'Market environment', portersFiveForces: 'Industry forces', riskRegister: 'Risk register',
  moscowFeatures: 'Feature priorities', swot: 'Strengths, weaknesses, opportunities and threats', researchSources: 'Research source register',
  uvp: 'Unique value proposition', uvpOptions: 'Value proposition options', selectedUvp: 'Selected value proposition',
  customerSegments: 'Customer segments', revenueStreams: 'Revenue streams', costStructure: 'Cost structure', unfairAdvantage: 'Unfair advantage',
  integrityNote: 'Evidence limits', qualityAudit: 'Citation review', agentTrail: 'Research team activity',
  evidenceReview: 'Source review', checks: 'Source checks', gaps: 'Evidence gaps', assessment: 'Source assessment',
  customerSignals: 'Customer reviews and recorded evidence', decisionAudit: 'Recommendation consistency review',
  scoreCoverage: 'Score coverage and unreviewed criteria', evaluatedMaximum: 'Maximum score actually reviewed', evaluatedScore: 'Score from reviewed criteria', missingCategories: 'Unreviewed categories',
  calculationAssumptions: 'Calculation assumptions', evidenceGaps: 'Evidence to collect', warnings: 'Scenario limitations',
  sourceUrls: 'Evidence sources', sourceType: 'Source type', sampleSize: 'Observed sample size', count: 'Observed records', limitation: 'Evidence limitation',
  mvpDescription: 'Minimum viable product', nextStepRecommendation: 'Recommended next step', nextStepRationale: 'Next-step rationale',
  kpi: 'KPI', tam: 'Total addressable market', sam: 'Serviceable market', som: 'Initial obtainable market',
  validated: 'Validated through direct testing', label: 'Evidence status', fetchedAt: 'Retrieved at',
  estimatedCACMonthly: 'Acquisition cost per new customer',
  estimatedMonthlyGrowthRate: 'Monthly new-customer growth fraction',
  estimatedChurnRate: 'Monthly customer churn fraction',
  GO: 'Go', NO_GO: 'Do not proceed', MODIFY: 'Refine the concept', TEST_FURTHER: 'Test further',
}
const EVIDENCE_LABELS: Record<string, string> = { AI_ESTIMATE_UNVERIFIED: 'AI estimate (unverified)', ASSUMPTION: 'Assumption', PROJECTION: 'Projection', PROPOSED_STRATEGY: 'Proposed strategy', VERIFIED: 'Reported as verified; review the source', WEAK: 'Weak', MODERATE: 'Moderate', STRONGER: 'Stronger' }
const PRIVATE_FIELDS = new Set(['id', 'userId', 'ideaId', 'jobId', 'shareToken', 'provider', 'tokensUsed', 'aiProvider', 'createdAt', 'updatedAt', 'reportData', 'isLite', 'status', 'planningContext', 'runManifest',
  'supabaseId', 'requestId', 'requestHash', 'idempotencyKey', 'researchBudgetId', 'encryptedOpenrouterKey', 'customOpenRouterKey', 'apiKey', 'accessToken', 'refreshToken'])
const SCORE_FIELDS = [
  ['problemScore', 'Problem', 20], ['customerScore', 'Customer', 20], ['marketScore', 'Market', 15],
  ['competitiveScore', 'Competition', 10], ['wtpScore', 'Willingness to pay', 15], ['businessModelScore', 'Business model', 10],
  ['financialScore', 'Financial feasibility', 5], ['executionScore', 'Execution', 5],
] as const
const VALIDATION_ORDER = ['decisionReasons', 'oneLineConcept', 'founderAssumptions', 'tamSamSom', 'tamEstimate', 'samEstimate', 'somEstimate',
  'pestleAnalysis', 'persona', 'personas', 'problemValidation5Factor', 'customerJPG', 'customerSignals', 'competitors', 'competitorPositioning', 'portersFiveForces',
  'selectedUvp', 'uvpOptions', 'moscowFeatures', 'mvpDescription', 'unitEconomicsAssumptions', 'computedUnitEconomics', 'financialProjection', 'financialReview',
  'keyRisks', 'swot', 'riskRegister', 'actionPlan', 'nextStepRecommendation', 'nextStepRationale', 'interviewQuestions', 'wtpSurveyQuestions',
  'landingPageCopy', 'keyEvidence', 'evidenceReview', 'qualityAudit', 'decisionAudit', 'scoreCoverage', 'integrityNote', 'researchSources', 'agentTrail']

export function humanize(value: string): string {
  return TITLES[value] || value.replace(/([a-z\d])([A-Z])/g, '$1 $2').replace(/[_-]/g, ' ').replace(/^./, first => first.toUpperCase())
}
const safeText = (value: unknown) => String(value).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '').slice(0, 16000)
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
type DocumentBudget = { characters: number; lines: number; truncated: boolean }
const newBudget = (): DocumentBudget => ({ characters: 180_000, lines: 2000, truncated: false })

const NULL_METRICS = new Set(['breakEvenUnits', 'breakEvenRevenue', 'breakEvenPrice', 'minimumViableGoal',
  'requiredVisitors', 'ltvCacRatio', 'cacPayback', 'cashRunway', 'discountBreakEven', 'discountVolumeLiftRequired'])

export function documentLines(value: unknown, budget = newBudget()): DocumentLine[] {
  const lines: DocumentLine[] = []
  const append = (text: string, kind: DocumentLine['kind']) => {
    if (budget.lines <= 0 || budget.characters <= 0) { budget.truncated = true; return }
    const bounded = text.slice(0, budget.characters)
    if (bounded.length < text.length) budget.truncated = true
    budget.lines--
    budget.characters -= bounded.length
    lines.push({ text: bounded, kind })
  }
  const visit = (item: unknown, label = '', depth = 0, collection = '') => {
    if (item === null && NULL_METRICS.has(label)) {
      append(humanize(label) + ': Unavailable or not attainable with the recorded inputs', 'text')
      return
    }
    if (item === undefined || item === null || item === '') return
    if (depth > 8 || budget.lines <= 0 || budget.characters <= 0) { budget.truncated = true; return }
    if (typeof item !== 'object') {
      if (String(item).length > 16000) budget.truncated = true
      const text = typeof item === 'boolean' ? (item ? 'Yes' : 'No') : safeText(typeof item === 'string' ? EVIDENCE_LABELS[item] ?? item : item)
      append(label ? humanize(label) + ': ' + text : text, 'text')
    } else if (Array.isArray(item)) {
      if (label) append(humanize(label), 'label')
      if (item.length > 100) budget.truncated = true
      item.slice(0, 100).forEach((entry, index) => {
        if (entry !== null && typeof entry === 'object') {
          if (item.length > 1) append(String(index + 1) + '.', 'label')
          visit(entry, '', depth + 1, label || collection)
        } else if (entry != null) {
          if (String(entry).length > 16000) budget.truncated = true
          append(safeText(entry), 'bullet')
        }
      })
    } else {
      if (label) append(humanize(label), 'label')
      const entries = Object.entries(item)
      if (entries.length > 100) budget.truncated = true
      // Domain evidence states are meaningful report content. Do not expose
      // arbitrary job/record status merely because it uses the same key.
      const itemRecord = item as Record<string, unknown>
      const milestoneStatus = typeof itemRecord.milestone === 'string' && ['PLANNED', 'ACHIEVED'].includes(String(itemRecord.status))
      const assumptionStatus = typeof itemRecord.assumption === 'string' && ['validated', 'invalidated', 'untested', 'tested'].includes(String(itemRecord.status))
      const checklistStatus = collection === 'preLaunchChecklist' && typeof itemRecord.item === 'string' && ['done', 'in_progress', 'pending'].includes(String(itemRecord.status))
      entries.slice(0, 100).forEach(([key, entry]) => { if (!PRIVATE_FIELDS.has(key) || (key === 'status' && (milestoneStatus || assumptionStatus || checklistStatus))) visit(entry, key, depth + 1, collection) })
    }
  }
  visit(value)
  return lines.length ? lines : [{ text: 'Not available in this report.', kind: 'text' }]
}

export function buildReportDocument(record: Record<string, unknown>, idea: Record<string, unknown> | null, kind: string): ReportDocument {
  const data = object(record.reportData)
  const sections: DocumentSection[] = []
  const budget = newBudget()
  const brief = idea ? Object.fromEntries(['industry', 'product', 'targetCustomer', 'location', 'businessModel', 'coreProblem', 'proposedSolution'].filter(key => idea[key]).map(key => [key, idea[key]])) : {}
  if (Object.keys(brief).length) sections.push({ title: 'Your idea', lines: documentLines(brief, budget) })
  if (kind === 'validation') {
    sections.unshift({ title: 'Decision brief', lines: [
      { text: 'Recommendation: ' + humanize(String(record.decision ?? data.decision ?? 'Review the findings')), kind: 'label' },
      ...documentLines({ decisionReasons: record.decisionReasons ?? data.decisionReasons, nextStepRecommendation: record.nextStepRecommendation ?? data.nextStepRecommendation,
        nextStepRationale: record.nextStepRationale ?? data.nextStepRationale, evidenceGaps: data.evidenceGaps, integrityNote: data.integrityNote }, budget),
    ] })
    sections.push({ title: 'Assessment', lines: [
      { text: 'Overall score: ' + (record.overallScore ?? data.overallScore ?? 'Not available') + ' / 100', kind: 'label' },
      { text: 'Recommendation: ' + humanize(String(record.decision ?? data.decision ?? 'Review the findings')), kind: 'text' },
      ...SCORE_FIELDS.filter(([key]) => record[key] != null || data[key] != null).map(([key, title, maximum]) => ({ text: title + ': ' + (record[key] ?? data[key]) + ' / ' + maximum, kind: 'text' as const })),
    ] })
  }
  const payload = { ...data, ...Object.fromEntries(Object.entries(record).filter(([key, value]) => !PRIVATE_FIELDS.has(key) && value != null)) }
  // Keep authoritative saved sections; omit technical identifiers and duplicate scores.
  const omit = new Set([...PRIVATE_FIELDS, 'planningContext', 'runManifest', 'overallScore', 'decision', ...(kind === 'validation' ? ['decisionReasons', 'nextStepRecommendation', 'nextStepRationale', 'evidenceGaps', 'integrityNote'] : []), ...SCORE_FIELDS.map(([key]) => key)])
  const keys = [...new Set([...(kind === 'validation' ? VALIDATION_ORDER : []), ...Object.keys(payload)])]
  for (const key of keys) {
    if (omit.has(key) || payload[key] == null || payload[key] === '') continue
    if (sections.length >= 100 || budget.lines <= 0 || budget.characters <= 0) { budget.truncated = true; break }
    let value = payload[key]
    if (key === 'agentTrail') {
      const trail = object(value)
      value = { specialists: trail.agents, tools: Array.isArray(trail.tools) ? trail.tools.map(item => {
        const event = object(item)
        return { specialist: event.agent, tool: event.tool, task: event.summary, result: event.status }
      }) : [] }
    }
    if (key === 'researchSources' && Array.isArray(value)) {
      if (value.length > 100) budget.truncated = true
      const entries = value.slice(0, 100).map((source, index) => {
        const sourceLines = documentLines(source, budget)
        return { label: 'Source ' + (index + 1), lines: sourceLines }
      })
      sections.push({ title: humanize(key), lines: entries.flatMap(entry => [{ text: entry.label, kind: 'label' as const }, ...entry.lines]),
        blocks: [{ kind: 'table', headers: ['Reference', 'Original source, passage and limits'], widths: [0.15, 0.85],
          rows: entries.map(entry => [entry.label, entry.lines.map(line => line.text).join('\n')]) }] })
    } else sections.push({ title: humanize(key), lines: documentLines(value, budget) })
  }
  if (budget.truncated) sections.push({ title: 'Document size limit', lines: [{ kind: 'text', text: 'This unusually large report exceeds the document limit. Some content is abbreviated; refer to the saved report for the remaining findings.' }] })
  sections.push({ title: 'How to use this report', lines: [{ kind: 'text', text: 'This is AI-assisted decision support. Assumptions and projections are not proof of demand, actual revenue, or a guarantee of success. Retrieved sources establish citation provenance; review the original source and test important assumptions with customers.' }] })
  const date = record.createdAt ? new Date(String(record.createdAt)) : new Date()
  return {
    title: typeof idea?.name === 'string' ? idea.name.slice(0, 120) : 'Your startup',
    subtitle: ({ validation: 'Startup validation report', canvas: 'Lean Canvas report', pricing: 'Pricing analysis', crowdfunding: 'Crowdfunding analysis', pitch: 'Pitch deck and speaker notes' } as Record<string, string>)[kind] || 'Startup report',
    date: Number.isNaN(date.getTime()) ? 'Date unavailable' : new Intl.DateTimeFormat('en-GB', { dateStyle: 'long', timeZone: 'UTC' }).format(date),
    partial: isIncompleteResearch(record), sections,
    design: { version: TEMPLATE_VERSION, paper: 'a4', orientation: 'portrait', workbook: false },
  }
}
