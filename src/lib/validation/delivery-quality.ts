import { z } from 'zod'
import { STARTUP_WEIGHTS } from '@/lib/scoring'
import type { OutputQualityIssue } from '@/lib/ai/generate'
import type { SearchResult } from '@/lib/ai/search'
import { FullReportSchema, SynthesisAgentSchema, type FullReport } from './schemas'
import { validateCustomerSignals, validateMarketSizingOutput, validateSynthesisJudgment, validateSynthesisPlan } from './agents/quality-auditor'

const nonempty = z.string().trim().min(1)
const contentSchema = z.object({
  decision: SynthesisAgentSchema.shape.decision,
  decisionReasons: z.array(nonempty).min(1), keyRisks: z.array(nonempty).min(1),
  integrityNote: nonempty, nextStepRationale: nonempty,
  actionPlan: z.array(z.object({ week: nonempty, action: nonempty, owner: nonempty, kpi: nonempty,
    hypothesis: nonempty, participantUnit: nonempty, denominator: nonempty, passCriterion: nonempty, decisionOnFailure: nonempty })),
})
const scoreMaximums: Record<string, number> = {
  problemScore: STARTUP_WEIGHTS.problemValidation, customerScore: STARTUP_WEIGHTS.customerValidation,
  marketScore: STARTUP_WEIGHTS.marketOpportunity, competitiveScore: STARTUP_WEIGHTS.competitiveDifferentiation,
  wtpScore: STARTUP_WEIGHTS.willingnessToPay, businessModelScore: STARTUP_WEIGHTS.businessModel,
  financialScore: STARTUP_WEIGHTS.financialFeasibility, executionScore: STARTUP_WEIGHTS.executionFeasibility,
}
const textArray = (value: unknown) => Array.isArray(value) && value.some(item => typeof item === 'string' && item.trim())
const usefulPersona = (value: unknown) => {
  if (!value || typeof value !== 'object') return false
  const persona = value as Record<string, unknown>
  return typeof persona.occupation === 'string' && Boolean(persona.occupation.trim()) && textArray(persona.goals) && textArray(persona.problems)
}

/** Admission checks content rather than treating a successful role label as a
 * delivered result. Reading older saved reports does not call this function. */
export function validationContentIssues(value: unknown, isLite: boolean): OutputQualityIssue[] {
  if (!value || typeof value !== 'object') return [{ field: 'report', expected: 'Return a complete validation report.' }]
  const report = value as Record<string, unknown>
  const parsed = contentSchema.safeParse(report)
  if (!parsed.success) return parsed.error.issues.slice(0, 8).map(issue => ({ field: issue.path.join('.'),
    expected: 'Supply nonempty decision reasoning, risks, integrity limits and sequential experiments with owners, hypotheses, participant units, denominators, pass criteria and failure decisions.' }))
  const issues: OutputQualityIssue[] = []
  if (parsed.data.actionPlan.length < (isLite ? 3 : 4)) issues.push({ field: 'actionPlan', expected: 'Supply at least ' + (isLite ? 3 : 4) + ' feasible sequential experiments.' })
  for (const [field, maximum] of Object.entries(scoreMaximums)) {
    const score = report[field]
    if (typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > maximum) issues.push({ field, expected: 'Keep each finite category score within its rubric maximum.' })
  }
  const personas = isLite ? [report.persona] : Array.isArray(report.personas) ? report.personas : []
  const pestle = report.pestleAnalysis
  const marketContent = pestle && typeof pestle === 'object' && Object.values(pestle).some(textArray)
  if (!personas.some(usefulPersona) && !marketContent) issues.push({ field: isLite ? 'persona' : 'personas',
    expected: 'Preserve a concrete customer problem, customer goals and occupation, or useful market research. Unavailable specialist defaults alone are not a validation.' })
  return issues.slice(0, 8)
}

/** The monolithic fallback uses the same application-authored semantic checks
 * as specialists; schema-shaped empty plans do not bypass model repair. */
export function validateFullValidationOutput(data: FullReport, sources: readonly SearchResult[]): OutputQualityIssue[] {
  return [...validationContentIssues(data, false), ...validateCustomerSignals(data, sources), ...validateMarketSizingOutput(data, sources),
    ...validateSynthesisPlan(data), ...validateSynthesisJudgment(data)]
}

export function hasUsefulValidationCoverage(value: unknown, isLite: boolean): boolean {
  if (validationContentIssues(value, isLite).length) return false
  if (!isLite && !FullReportSchema.safeParse(value).success) return false
  const report = value as { agentTrail?: { agents?: Record<string, string> }; researchSources?: SearchResult[] }
  const agents = report.agentTrail?.agents
  if (!isLite && (validateCustomerSignals(value as FullReport, report.researchSources ?? []).length ||
    validateMarketSizingOutput(value as FullReport, report.researchSources ?? []).length)) return false
  if (!agents || agents.monolithic) {
    if (agents?.monolithic && !['ok', 'partial'].includes(agents.monolithic)) return false
    return isLite || validateFullValidationOutput(value as FullReport, report.researchSources ?? []).length === 0
  }
  if (isLite) return agents.synthesis === 'ok' && (agents.market === 'ok' || agents.customer === 'ok')
  const completed = Object.values(agents).filter(status => status === 'ok').length
  return completed >= 3 && (agents.market === 'ok' || agents.customer === 'ok') &&
    ['synthesis', 'product', 'growth'].some(role => agents[role] === 'ok')
}
