import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import type { z } from 'zod'
import { FULL_AGENT_ROLES, LITE_AGENT_ROLES } from '../../src/lib/ai/roles'
import type { SearchResult } from '../../src/lib/ai/search'
import type { FullReport, EvidenceReview } from '../../src/lib/validation/schemas'
import { hasExactSourceExcerpt, validateCustomerSignals, validateMarketSizingOutput, validateSynthesisPlan, validatePlanningBasis, validateSynthesisHandoffClaims, hasReviewedBlockingEvidence, type DecisionAudit } from '../../src/lib/validation/agents/quality-auditor'
import type { HandoffAudit, ScoreSummary } from '../../src/lib/validation/agents/handoffs'
import { computeUnitEconomics, buildFinancialProjection } from '../../src/lib/financial'

/** Bind resumed provider work to its actual source/data revision, not just Git HEAD. */
export async function acceptanceFingerprint(root: string): Promise<string> {
  const paths: string[] = []
  const visit = async (path: string) => {
    for (const entry of await readdir(join(root, path), { withFileTypes: true })) {
      const next = join(path, entry.name)
      if (entry.isDirectory()) await visit(next)
      else if (/\.(?:ts|json|mjs)$/.test(entry.name) && !/\.test\.ts$/.test(entry.name)) paths.push(next)
    }
  }
  for (const directory of ['src/lib/ai', 'src/lib/validation', 'src/lib/customer-feedback', 'src/lib/interview', 'src/lib/planning', 'src/data/market', 'scripts/lib']) await visit(directory)
  paths.push('src/lib/financial.ts', 'src/lib/scoring.ts', 'package.json', 'package-lock.json', 'scripts/verify-validation.ts', 'scripts/verify-ai-providers.ts', 'scripts/verify-ai-providers.mjs')
  const hash = createHash('sha256')
  for (const path of paths.sort()) hash.update(relative(root, join(root, path)).replaceAll('\\', '/') + '\0').update(await readFile(join(root, path))).update('\0')
  return hash.digest('hex')
}

/** A new attempt immediately supersedes a previous pass, including on total failure. */
export async function recordAcceptanceAttempt<T>({ path, mirrorPaths = [], metadata, run }: {
  path: string
  mirrorPaths?: string[]
  metadata: Record<string, unknown>
  run: () => Promise<{ result: T; summary: Record<string, unknown> & { passed: boolean } }>
}) {
  const started = Date.now()
  const write = async (summary: Record<string, unknown>, result: T | null) => {
    const body = JSON.stringify({ summary: { ...metadata, ...summary, checkedAt: new Date().toISOString(), elapsedSeconds: Math.round((Date.now() - started) / 1000) }, result }, null, 2)
    await Promise.all([...new Set([path, ...mirrorPaths])].map(async target => {
      await mkdir(dirname(target), { recursive: true })
      await writeFile(target, body)
    }))
  }
  await write({ status: 'running', passed: false }, null)
  try {
    const value = await run()
    await write({ ...value.summary, status: value.summary.passed ? 'passed' : 'failed' }, value.result)
    return value.summary
  } catch (error) {
    // Error messages can contain provider response bodies; only a fixed failure
    // category enters the durable artifact. Detailed safe diagnostics are separate.
    const summary = { passed: false, status: 'failed', failure: 'The workflow did not produce an acceptance result.' }
    await write(summary, null)
    throw error
  }
}

/** Acceptance verifies completeness, provenance and arithmetic; it is not a claim-accuracy ranking. */
export function evaluateValidationAcceptance(value: unknown, mode: 'lite' | 'full', schema: z.ZodType): string[] {
  const issues: string[] = []
  if (!value || typeof value !== 'object') return ['No report was produced.']
  const report = value as Record<string, unknown>
  const parsed = schema.safeParse(report)
  if (!parsed.success) return ['The final report does not satisfy its output schema.']
  const roles = mode === 'full' ? FULL_AGENT_ROLES : LITE_AGENT_ROLES
  const agents = (report.agentTrail as { agents?: Record<string, string> } | undefined)?.agents ?? {}
  if (Object.keys(agents).length !== roles.length || roles.some(role => agents[role] !== 'ok')) issues.push('Every required specialist must complete successfully.')
  const sources = (report.researchSources ?? []) as SearchResult[]
  const evidence = (report.keyEvidence ?? []) as FullReport['keyEvidence']
  const known = new Map(sources.map(source => [source.url, source]))
  const isRead = (source?: SearchResult) => source?.retrievalKind === 'page' || source?.retrievalKind === 'open-data'
  if (!evidence.some(item => item.link && isRead(known.get(item.link)) && item.strength !== 'WEAK' && hasExactSourceExcerpt(item, known.get(item.link)))) issues.push('At least one reported observation must cite an exact passage from a successfully read page or official dataset.')
  if (evidence.some(item => item.label === 'VERIFIED' || item.link && !known.has(item.link) || item.strength !== 'WEAK' && (!isRead(known.get(item.link ?? '')) || !hasExactSourceExcerpt(item, known.get(item.link ?? ''))))) issues.push('Evidence labels, exact supporting excerpts and source provenance must remain consistent.')
  const scoreFields = ['problemScore', 'customerScore', 'marketScore', 'competitiveScore', 'wtpScore', 'businessModelScore', 'financialScore', 'executionScore']
  if (scoreFields.reduce((sum, field) => sum + Number(report[field]), 0) !== report.overallScore) issues.push('The overall score must equal the eight category scores.')
  const handoffAudit = report.handoffAudit as HandoffAudit | undefined
  const scoreSummary = report.scoreSummary as ScoreSummary | undefined
  const suppliedScoreFields = mode === 'full' ? scoreFields.filter(field => field !== 'executionScore')
    : ['problemScore', 'customerScore', 'wtpScore', 'marketScore']
  if (!handoffAudit || handoffAudit.version !== 3 || !Array.isArray(handoffAudit.missingCriticalFields) || handoffAudit.missingCriticalFields.length ||
      suppliedScoreFields.some(field => handoffAudit.knownScores?.[field] !== report[field]) ||
      mode === 'full' && (!handoffAudit.productPlanProvided || !handoffAudit.growthPlanProvided)) {
    issues.push('The final reviewer must receive the actual specialist scores and retained product/experiment essentials.')
  }
  if (!scoreSummary || suppliedScoreFields.some(field => scoreSummary.scores?.[field]?.score !== report[field]) ||
      scoreSummary.knownSubtotal !== suppliedScoreFields.reduce((sum, field) => sum + Number(report[field]), 0)) {
    issues.push('The explicit score summary must preserve the supplied specialist scores and computed subtotal.')
  }
  if (handoffAudit?.knownScores) issues.push(...validateSynthesisHandoffClaims({
    decisionReasons: report.decisionReasons as string[], integrityNote: String(report.integrityNote ?? ''), nextStepRationale: String(report.nextStepRationale ?? ''),
  }, handoffAudit).map(issue => issue.field + ': ' + issue.expected))
  const decisionAudit = report.decisionAudit as DecisionAudit | undefined
  if (report.decision === 'NO_GO' && (!hasReviewedBlockingEvidence({ evidence, review: report.evidenceReview as EvidenceReview | undefined, sources }) ||
      decisionAudit?.originalDecision === 'TEST_FURTHER')) issues.push('NO_GO requires an explicit original-source blocking finding, not a low score, assumptions or ordinary competitor pages.')
  if (/^The decision was aligned with the final weighted score band\.?$/i.test(String(report.nextStepRationale ?? '').trim())) {
    issues.push('The next-step rationale must retain a useful proposed test instead of a generic score-band correction.')
  }
  issues.push(...validateCustomerSignals(report as Pick<FullReport, 'customerSignals'>, sources).map(issue => issue.field + ': ' + issue.expected))
  if (mode === 'full') {
    const full = report as unknown as FullReport
    issues.push(...validateMarketSizingOutput(full, sources).map(issue => issue.field + ': ' + issue.expected))
    issues.push(...validateSynthesisPlan(full).map(issue => issue.field + ': ' + issue.expected))
    issues.push(...validatePlanningBasis(full, full.unitEconomicsAssumptions).map(issue => issue.field + ': ' + issue.expected))
    if (full.founderAssumptions.some(item => item.validated)) issues.push('Desk research must not mark founder hypotheses as experimentally validated.')
    if (!isDeepStrictEqual(report.computedUnitEconomics, computeUnitEconomics(full.unitEconomicsAssumptions))) issues.push('Saved unit economics must match the deterministic calculation.')
    if (!isDeepStrictEqual(report.financialProjection, buildFinancialProjection(full.unitEconomicsAssumptions))) issues.push('The full financial projection must match the deterministic calculation.')
  } else {
    const steps = report.actionPlan as { action: string; kpi: string }[]
    if (steps.some(step => !step.action.trim() || !step.kpi.trim())) issues.push('Every proposed experiment needs a concrete action and measurable KPI.')
  }
  return issues
}
