import { createHash } from 'node:crypto'
import { and, desc, eq } from 'drizzle-orm'
import { db } from '@/db'
import { leanCanvases, pricingSimulations, crowdfundingAnalyses } from '@/db/schema'
import { loadFounderContext } from '@/lib/interview/context'
import { CANVAS_KEYS } from './evidence'
import { planningOwnerContext, type SelectedPlanningReport } from './source-report'
import { PlanningContextSnapshotSchema, type PlanningArtifactSelection, type PlanningArtifactSnapshot, type PlanningContextSnapshot } from './context-contract'

export class PlanningContextError extends Error {
  constructor(message: string, readonly status = 409, readonly code = 'planning_inputs_changed') { super(message) }
}
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, canonical(entry)])) : value
export const planningContextHash = (value: unknown) => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex')
const pick = (value: Record<string, unknown>, fields: readonly string[]) => Object.fromEntries(fields.filter(key => value[key] !== undefined).map(key => [key, value[key]]))
const date = (value: unknown) => value instanceof Date ? value.toISOString() : typeof value === 'string' ? value : null

/** Capture useful domain data only, avoiding recursive dependency snapshots,
 * owner identifiers and provider traces. Old calculations remain unchanged. */
export function capturePlanningArtifact(module: PlanningArtifactSnapshot['module'], row: Record<string, unknown>): PlanningArtifactSnapshot {
  const metadata = object(module === 'lean-canvas' ? row.analysisData : row.reportData)
  const data = module === 'lean-canvas' ? {
    ...pick(row, [...CANVAS_KEYS, 'confidenceScores', 'validationScore', 'changeReason', 'evidenceSummary']),
    analysis: pick(metadata, ['assumptionRegister', 'problemStatement', 'interviewQuestions', 'segmentPrioritization', 'alternativeSolutions', 'ratMatrix', 'buildMeasureLearnCycles', 'pivotAnalysis', 'ifThenRules', 'revision', 'ideaSnapshot', 'researchSources', 'evidenceGaps']),
  } : pick(metadata, ['inputs', 'computedMetrics', 'calculationAssumptions', 'scenarios', 'sensitivityMatrix', 'volumeScenarios', 'ai', 'aiAnalysis', 'scoreReview', 'researchSources', 'evidenceGaps', 'warnings', 'ideaSnapshot'])
  return { module, id: String(row.id), ideaId: String(row.ideaId), version: module === 'lean-canvas' ? Number(row.version) : null,
    createdAt: date(row.createdAt), contentHash: planningContextHash(data), data }
}
async function loadArtifact(reader: Pick<typeof db, 'select'>, userId: string, ideaId: string, module: PlanningArtifactSnapshot['module'], id: string) {
  const table = module === 'lean-canvas' ? leanCanvases : module === 'pricing' ? pricingSimulations : crowdfundingAnalyses
  const [row] = await reader.select().from(table).where(and(eq(table.id, id), eq(table.userId, userId), eq(table.ideaId, ideaId))).limit(1)
  if (!row) throw new PlanningContextError('A selected planning version is unavailable for this idea in your workspace.', 404)
  return capturePlanningArtifact(module, row)
}
export async function capturePlanningContext(userId: string, ideaId: string, module: string, selection: PlanningArtifactSelection): Promise<PlanningContextSnapshot> {
  const artifacts: PlanningArtifactSnapshot[] = []
  const append = async (type: PlanningArtifactSnapshot['module'], id: string | null | undefined) => {
    if (id && !artifacts.some(item => item.module === type && item.id === id)) artifacts.push(await loadArtifact(db, userId, ideaId, type, id))
  }
  let parentCanvasId = selection.parentCanvasId ?? null
  if (module === 'lean-canvas' && selection.parentCanvasId === undefined) {
    const [latest] = await db.select({ id: leanCanvases.id }).from(leanCanvases).where(and(eq(leanCanvases.userId, userId), eq(leanCanvases.ideaId, ideaId))).orderBy(desc(leanCanvases.version)).limit(1)
    parentCanvasId = latest?.id ?? null
  }
  await append('lean-canvas', parentCanvasId)
  await append('lean-canvas', selection.sourceCanvasId)
  await append('pricing', selection.sourcePricingId)
  await append('crowdfunding', selection.sourceCampaignId)
  const founderContext = await loadFounderContext(ideaId, userId)
  const snapshot = PlanningContextSnapshotSchema.parse({ version: 'planning-context-v1', capturedAt: new Date().toISOString(), founderContext,
    founderContextHash: planningContextHash(founderContext), artifacts, parentCanvasId, selection })
  if (Buffer.byteLength(JSON.stringify(snapshot), 'utf8') > 200_000) throw new PlanningContextError('The selected planning context exceeds the supported handoff size. Select fewer upstream versions.', 413)
  return snapshot
}
export async function assertPlanningContextUnchanged(reader: Pick<typeof db, 'select'>, userId: string, ideaId: string, context?: PlanningContextSnapshot | null) {
  if (!context) return
  for (const artifact of context.artifacts) {
    const current = await loadArtifact(reader, userId, ideaId, artifact.module, artifact.id)
    if (current.contentHash !== artifact.contentHash) throw new PlanningContextError('A selected planning version changed during this run. Start a new run with the revised version.')
  }
}
export function planningContextPrompt(context: PlanningContextSnapshot, report?: SelectedPlanningReport | null) {
  const founder = planningOwnerContext(context.founderContext, report)
  const result = context.artifacts.length ? JSON.stringify({ ownerContext: founder, selectedPlanningArtifacts: context.artifacts,
    instruction: 'These are exact private saved versions. Preserve their units, evidence labels, contrary findings and experiment outcomes. Saved AI interpretations are not customer observations. Current explicit module inputs govern its calculations; disclose differences from prior versions. Never send this data to public research or shared caches.' }) : founder
  if (result.length > 128_000) throw new PlanningContextError('The combined planning handoff exceeds the supported size. Select fewer upstream versions.', 413)
  return result
}
