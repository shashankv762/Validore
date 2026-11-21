import { createHash, randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/db'
import { ideas, users, planningModuleRequests, leanCanvases, pitchDecks, crowdfundingAnalyses, pricingSimulations } from '@/db/schema'
import type { CreditTransaction } from '@/lib/credits'
import { isActiveAccount } from '@/lib/admin-access'
import { readJsonBody, boundedBody, RequestBodyError } from '@/lib/api-security'
import { getCampaignClassificationBand } from '@/lib/scoring'
import { SourceReportIdSchema, SourceReportSnapshotSchema, type SourceReportSnapshot } from './source-report-contract'
import { loadSelectedPlanningReport, assertPlanningSourceUnchanged, PlanningSourceReportError, type SelectedPlanningReport } from './source-report'
import { PlanningArtifactSelectionSchema, PlanningContextSnapshotSchema, type PlanningArtifactSelection, type PlanningContextSnapshot } from './context-contract'
import { assertPlanningContextUnchanged, capturePlanningContext } from './context'
import { assertExecutionCapacity, ExecutionCapacityError } from '@/lib/execution-admission'

export type PlanningModule = 'lean-canvas' | 'pitch-deck' | 'crowdfunding' | 'pricing'
export const PLANNING_LEASE_MS = 15 * 60_000
export class PlanningRequestError extends Error {
  constructor(message: string, readonly status = 409, readonly retryAfter?: number, readonly code = 'planning_request_conflict') { super(message) }
}
export type PlanningLease = { id: string; userId: string; token: string; sourceReport?: SelectedPlanningReport | null; contextSnapshot?: PlanningContextSnapshot }
export type PlanningIdeaBinding = { userId:string;ideaId:string;fingerprint:string }
export type PlanningRun = { lease: PlanningLease | null; replay: Record<string, unknown> | null; stageData?: unknown; sourceReport?: SelectedPlanningReport | null; ideaBinding?:PlanningIdeaBinding; selection?: PlanningArtifactSelection; contextSnapshot?: PlanningContextSnapshot }
const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, canonical(entry)])) : value
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex')
const ideaFields = ['name', 'industry', 'product', 'targetCustomer', 'location', 'businessModel', 'coreProblem', 'proposedSolution'] as const
function planningBrief(idea: Record<string, unknown>) {
  return { ...Object.fromEntries(ideaFields.map(field => [field,idea[field]])),
    ...(typeof idea.publicResearchFocus === 'string' && idea.publicResearchFocus.trim() ? { publicResearchFocus: idea.publicResearchFocus } : {}) }
}
export function planningIdeaSnapshot(idea: Record<string, unknown>) {
  const brief = planningBrief(idea)
  return { ...brief, briefFingerprint: hash(brief), capturedAt: new Date().toISOString() }
}
/** Bind the exact idea instance supplied to research/writers for every run,
 * including legacy requests without a durable retry lease. */
export function bindPlanningIdea(run:PlanningRun,userId:string,idea:Record<string,unknown>) {
  const binding={userId,ideaId:String(idea.id),fingerprint:hash(planningBrief(idea))}
  if(run.ideaBinding&&(run.ideaBinding.userId!==binding.userId||run.ideaBinding.ideaId!==binding.ideaId||run.ideaBinding.fingerprint!==binding.fingerprint)) throw new PlanningRequestError('Your idea brief changed before this run started. Start a new run with the updated brief.',409,undefined,'planning_inputs_changed')
  run.ideaBinding=binding
}
export async function assertPlanningIdeaUnchanged(tx:CreditTransaction,binding:PlanningIdeaBinding) {
  const idea=await lockPlanningIdea(tx,binding.userId,binding.ideaId)
  if(hash(planningBrief(idea))!==binding.fingerprint) throw new PlanningRequestError('Your idea brief changed during this run. Its result and charge were canceled. Start a new run with the updated brief.',409,undefined,'planning_inputs_changed')
}

/** Call after taking the account lock, in the result/debit transaction. */
export async function lockPlanningIdea(tx: CreditTransaction, userId: string, ideaId: string) {
  const [idea] = await tx.select().from(ideas).where(and(eq(ideas.id, ideaId), eq(ideas.userId, userId))).for('update')
  if (!idea || idea.isActive === false) throw new PlanningRequestError('This idea is no longer active in your workspace. No result or charge was saved.', 404)
  if (idea.isReadOnly) throw new PlanningRequestError('This idea is read-only. Choose an editable idea before creating a planning result.', 403)
  return idea
}

async function replayResult(module: PlanningModule, userId: string, ideaId: string, id: string): Promise<Record<string, unknown>> {
  if (module === 'lean-canvas') {
    const canvas = await db.query.leanCanvases.findFirst({ where: and(eq(leanCanvases.id, id), eq(leanCanvases.userId, userId), eq(leanCanvases.ideaId, ideaId)) })
    if (canvas) return { canvas, reused: true, creditsCharged: 0 }
  } else if (module === 'pitch-deck') {
    const result = await db.query.pitchDecks.findFirst({ where: and(eq(pitchDecks.id, id), eq(pitchDecks.userId, userId), eq(pitchDecks.ideaId, ideaId)) })
    if (result) return { deckId: result.id, qualityScore: result.qualityScore, founderReadinessScore: result.founderReadinessScore, result, reused: true, creditsCharged: 0 }
  } else if (module === 'pricing') {
    const saved = await db.query.pricingSimulations.findFirst({ where: and(eq(pricingSimulations.id, id), eq(pricingSimulations.userId, userId), eq(pricingSimulations.ideaId, ideaId)) })
    if (saved) return { simulationId: saved.id, result: saved.reportData, reused: true, creditsCharged: 0 }
  } else {
    const saved = await db.query.crowdfundingAnalyses.findFirst({ where: and(eq(crowdfundingAnalyses.id, id), eq(crowdfundingAnalyses.userId, userId), eq(crowdfundingAnalyses.ideaId, ideaId)) })
    if (saved) {
      const data = saved.reportData as Record<string, unknown> | null
      const band = getCampaignClassificationBand(saved.performanceScore ?? 0)
      return { analysisId: saved.id, performanceScore: saved.performanceScore, classificationBand: data?.classificationBand ?? band.label,
        band: band.band, disclaimer: data?.disclaimer ?? band.disclaimer, recommendation: saved.recommendation, result: saved.reportData, reused: true, creditsCharged: 0 }
    }
  }
  throw new PlanningRequestError('The saved result for this run is unavailable. No new run or charge was made.', 410)
}
async function capturedSourceForReplay(tx: CreditTransaction,module:PlanningModule,userId:string,ideaId:string,resultId:string):Promise<SourceReportSnapshot|null> {
  let metadata: unknown
  if (module==='lean-canvas') {
    const [saved]=await tx.select({metadata:leanCanvases.analysisData}).from(leanCanvases).where(and(eq(leanCanvases.id,resultId),eq(leanCanvases.userId,userId),eq(leanCanvases.ideaId,ideaId)))
    if(!saved) throw new PlanningRequestError('The saved result for this run is unavailable. No new run or charge was made.',410)
    metadata=saved.metadata
  } else {
    const table=module==='pricing'?pricingSimulations:module==='crowdfunding'?crowdfundingAnalyses:pitchDecks
    const [saved]=await tx.select({metadata:table.reportData}).from(table).where(and(eq(table.id,resultId),eq(table.userId,userId),eq(table.ideaId,ideaId)))
    if(!saved) throw new PlanningRequestError('The saved result for this run is unavailable. No new run or charge was made.',410)
    metadata=saved.metadata
  }
  const value=metadata&&typeof metadata==='object'?(metadata as Record<string,unknown>).sourceReport:null
  if(value==null) return null
  const parsed=SourceReportSnapshotSchema.safeParse(value)
  if(!parsed.success||parsed.data.ideaId!==ideaId) throw new PlanningRequestError('The captured source identity for this saved result is unavailable. Reopen it from saved results.',409,undefined,'planning_inputs_changed')
  return parsed.data
}

/** Legacy callers do not create registry rows. Keyed callers bind the raw
 * canonical payload and the owned idea brief before any model/credit work. */
export async function beginPlanningRequest(request: Request, userId: string, module: PlanningModule): Promise<PlanningRun> {
  const suppliedKey = request.headers.get('Idempotency-Key')
  if (suppliedKey !== null && !z.uuid().safeParse(suppliedKey).success) throw new PlanningRequestError('Use a UUID Idempotency-Key for this planning run.', 400)
  const isManual = new URL(request.url).pathname.endsWith('/lean-canvas/manual')
  // Legacy callers still have no cross-request deduplication promise, but an
  // internal lease makes their running work count toward shared admission.
  const key = suppliedKey ?? (isManual ? null : randomUUID())
  let body: unknown
  // Legacy unkeyed handlers accepted JSON bodies without a JSON content-type.
  // Preserve that behavior while applying the same bounded read to selection.
  try { body = suppliedKey === null ? JSON.parse(await boundedBody(request.clone(),131_072)) : await readJsonBody(request.clone(), 131_072) }
  catch (error) { if (error instanceof RequestBodyError) throw new PlanningRequestError(error.message, error.status); if(error instanceof SyntaxError) throw new PlanningRequestError('Invalid JSON request.',400); throw error }
  const parsed = PlanningArtifactSelectionSchema.extend({ ideaId: z.uuid(), sourceReportId: SourceReportIdSchema }).safeParse(body)
  if (!parsed.success) throw new PlanningRequestError('A valid idea reference is required.', 400)
  const ideaId = parsed.data.ideaId
  const selection = PlanningArtifactSelectionSchema.parse(parsed.data)
  if (key === null) return { lease: null, replay: null, selection, sourceReport: await loadSelectedPlanningReport(userId,ideaId,parsed.data.sourceReportId) }
  const claim = await db.transaction(async tx => {
    // Lock order matches debit and canvas transactions, preventing a lease
    // takeover from racing a previous worker's successful commit.
    const [account] = await tx.select().from(users).where(eq(users.id, userId)).for('update')
    if (!account || !isActiveAccount(account)) throw new PlanningRequestError('This account is not active.', 403)
    const [idea] = await tx.select().from(ideas).where(and(eq(ideas.id, ideaId), eq(ideas.userId, userId))).for('update')
    if (!idea) throw new PlanningRequestError('Idea not found.', 404)
    const ideaFingerprint = hash(planningBrief(idea))
    const ideaBinding={userId,ideaId,fingerprint:ideaFingerprint}
    const [existing] = await tx.select().from(planningModuleRequests).where(and(eq(planningModuleRequests.userId, userId), eq(planningModuleRequests.requestKey, key))).limit(1)
    if (existing?.status==='completed'&&existing.resultId) {
      if(existing.module!==module||existing.ideaId!==ideaId||existing.ideaFingerprint!==ideaFingerprint) throw new PlanningRequestError('This run key belongs to different inputs or an earlier idea brief. Start a new run for changed inputs.',409,undefined,'planning_inputs_changed')
      // A completed retry reopens the captured artifact. Later source edits or
      // removal must not reinterpret an uncertain delivery or charge it again.
      const captured=parsed.data.sourceReportId?await capturedSourceForReplay(tx,module,userId,ideaId,existing.resultId):null
      const replayHash=hash({module,operation:new URL(request.url).pathname,body,
        ...(captured?{sourceReportHash:captured.contentHash,sourceSnapshotVersion:captured.version}:{})})
      if(existing.payloadHash!==replayHash||parsed.data.sourceReportId&&captured?.reportId.toLowerCase()!==parsed.data.sourceReportId.toLowerCase()) throw new PlanningRequestError('This run key belongs to different planning inputs or a different selected report. Start a new run for changed inputs.',409,undefined,'planning_inputs_changed')
      return {savedId:existing.resultId,lease:null,sourceReport:null,ideaBinding}
    }
    let sourceReport: SelectedPlanningReport | null
    try { sourceReport = await loadSelectedPlanningReport(userId,ideaId,parsed.data.sourceReportId,tx) }
    catch (error) {
      if (existing && error instanceof PlanningSourceReportError) throw new PlanningRequestError('The selected validation report changed or is unavailable. Start a new run or reopen the saved result.',409,undefined,'planning_inputs_changed')
      throw error
    }
    const payloadHash = hash({ module, operation: new URL(request.url).pathname, body,
      ...(sourceReport ? { sourceReportHash: sourceReport.snapshot.contentHash, sourceSnapshotVersion: sourceReport.snapshot.version } : {}) })
    if (existing) {
      if (existing.module !== module || existing.ideaId !== ideaId || existing.payloadHash !== payloadHash || existing.ideaFingerprint !== ideaFingerprint) {
        throw new PlanningRequestError('This run key belongs to different inputs or an earlier idea brief. Start a new run for the changed inputs.', 409, undefined, 'planning_inputs_changed')
      }
      if (existing.status === 'pending' && existing.leaseExpiresAt.getTime() > Date.now()) {
        throw new PlanningRequestError('This planning run is still in progress. Retry the same run later or reopen it from saved results.', 409,
          Math.max(1, Math.ceil((existing.leaseExpiresAt.getTime() - Date.now()) / 1000)))
      }
    }
    if (idea.isActive === false) throw new PlanningRequestError('This idea is no longer active in your workspace.', 404)
    if (idea.isReadOnly) throw new PlanningRequestError('This idea is read-only. Choose an editable idea before creating a planning result.', 403)
    if (!isManual) {
      try { await assertExecutionCapacity(tx, { excludePlanningRequestId: existing?.id }) }
      catch (error) {
        if (error instanceof ExecutionCapacityError) throw new PlanningRequestError(error.message, error.status, error.retryAfter, 'execution_capacity')
        throw error
      }
    }
    const token = randomUUID(); const leaseExpiresAt = new Date(Date.now() + PLANNING_LEASE_MS)
    if (existing) {
      if (sourceReport) sourceReport.snapshot.capturedAt = existing.createdAt.toISOString()
      await tx.update(planningModuleRequests).set({ status: 'pending', leaseToken: token, leaseExpiresAt, updatedAt: new Date(), resultId: null }).where(eq(planningModuleRequests.id, existing.id))
      const contextSnapshot = existing.contextSnapshot == null ? undefined : PlanningContextSnapshotSchema.parse(existing.contextSnapshot)
      await assertPlanningContextUnchanged(tx, userId, ideaId, contextSnapshot)
      return { savedId: null, lease: { id: existing.id, userId, token, sourceReport, contextSnapshot }, stageData: existing.stageData, sourceReport,ideaBinding,contextSnapshot }
    }
    const [row] = await tx.insert(planningModuleRequests).values({ userId, ideaId, requestKey: key, module, payloadHash, ideaFingerprint,
      status: 'pending', leaseToken: token, leaseExpiresAt }).returning({ id: planningModuleRequests.id, createdAt: planningModuleRequests.createdAt })
    if (sourceReport) sourceReport.snapshot.capturedAt = row.createdAt.toISOString()
    return { savedId: null, lease: { id: row.id, userId, token, sourceReport }, sourceReport,ideaBinding }
  })
  return { lease: claim.lease, replay: claim.savedId ? await replayResult(module, userId, ideaId, claim.savedId) : null,
    stageData: 'stageData' in claim ? claim.stageData : undefined, sourceReport: claim.sourceReport,ideaBinding:claim.ideaBinding,
    selection, contextSnapshot: 'contextSnapshot' in claim ? claim.contextSnapshot : undefined }
}

/** Freeze owner notebook/interview and selected module versions before any AI
 * call. A retry reuses the exact captured context, even after new notes arrive. */
export async function preparePlanningContext(run: PlanningRun, userId: string, ideaId: string, module: PlanningModule) {
  if (run.contextSnapshot) return run.contextSnapshot
  const snapshot = await capturePlanningContext(userId, ideaId, module, run.selection ?? {})
  if (run.lease) {
    const lease = run.lease
    await db.transaction(async tx => {
      const [account] = await tx.select().from(users).where(eq(users.id, userId)).for('update')
      if (!account || !isActiveAccount(account)) throw new PlanningRequestError('This account is not active.', 403)
      await lockPlanningIdea(tx, userId, ideaId)
      if (run.ideaBinding) await assertPlanningIdeaUnchanged(tx, run.ideaBinding)
      await assertPlanningContextUnchanged(tx, userId, ideaId, snapshot)
      const updated = await tx.update(planningModuleRequests).set({ contextSnapshot: snapshot, updatedAt: new Date() }).where(and(
        eq(planningModuleRequests.id, lease.id), eq(planningModuleRequests.userId, userId),
        eq(planningModuleRequests.leaseToken, lease.token), eq(planningModuleRequests.status, 'pending'),
      )).returning({ id: planningModuleRequests.id })
      if (!updated.length) throw new PlanningRequestError('This planning run was replaced by a retry. Its earlier context was not saved.')
    })
    lease.contextSnapshot = snapshot
  }
  run.contextSnapshot = snapshot
  return snapshot
}

/** Checkpoints contain private writer output. Only the current worker may
 * publish one, after the same account → idea locks used by final delivery. */
export async function checkpointPlanningRequest(lease: PlanningLease, stageData: unknown) {
  if (Buffer.byteLength(JSON.stringify(stageData), 'utf8') > 500_000) throw new PlanningRequestError('This pitch exceeds the supported saved-stage size. No credits were charged.', 413)
  await db.transaction(async tx => {
    const [account] = await tx.select().from(users).where(eq(users.id, lease.userId)).for('update')
    if (!account || !isActiveAccount(account)) throw new PlanningRequestError('This account is not active.', 403)
    const [run] = await tx.select().from(planningModuleRequests).where(and(eq(planningModuleRequests.id, lease.id), eq(planningModuleRequests.userId, lease.userId))).limit(1)
    if (!run) throw new PlanningRequestError('This planning run is no longer available.', 409)
    const idea = await lockPlanningIdea(tx, lease.userId, run.ideaId)
    if (hash(planningBrief(idea)) !== run.ideaFingerprint) throw new PlanningRequestError('Your idea brief changed during this run. Start a new run with the updated brief.', 409, undefined, 'planning_inputs_changed')
    await assertPlanningSourceUnchanged(tx,lease.userId,run.ideaId,lease.sourceReport)
    await assertPlanningContextUnchanged(tx, lease.userId, run.ideaId, lease.contextSnapshot)
    const updated = await tx.update(planningModuleRequests).set({ stageData, updatedAt: new Date() }).where(and(
      eq(planningModuleRequests.id, lease.id), eq(planningModuleRequests.userId, lease.userId),
      eq(planningModuleRequests.leaseToken, lease.token), eq(planningModuleRequests.status, 'pending'),
    )).returning({ id: planningModuleRequests.id })
    if (!updated.length) throw new PlanningRequestError('This pitch was replaced by a retry. Its older stage was not saved.', 409)
  })
}

/** Must run inside the same transaction as debit + result insert. A replaced
 * worker throws here, rolling back its result and charge together. */
export async function completePlanningRequest(tx: CreditTransaction, lease: PlanningLease | null, resultId: string,ideaBinding?:PlanningIdeaBinding) {
  if (!lease) {
    if(!ideaBinding) throw new PlanningRequestError('This run did not capture its idea inputs. Its result and charge were canceled.',409,undefined,'planning_inputs_changed')
    await assertPlanningIdeaUnchanged(tx,ideaBinding);return
  }
  const [run] = await tx.select().from(planningModuleRequests).where(and(eq(planningModuleRequests.id, lease.id), eq(planningModuleRequests.userId, lease.userId))).limit(1)
  if (!run) throw new PlanningRequestError('This planning run is no longer available. Its result and charge were canceled.', 409)
  // The brief can change while the provider is working. Check it under the
  // same account → idea lock order as beginPlanningRequest, inside the result
  // transaction, so an old brief cannot commit a new result or debit.
  const idea = await lockPlanningIdea(tx, lease.userId, run.ideaId)
  if (!idea || hash(planningBrief(idea)) !== run.ideaFingerprint) {
    throw new PlanningRequestError('Your idea brief changed during this run. Its result and charge were canceled. Start a new run with the updated brief.', 409, undefined, 'planning_inputs_changed')
  }
  await assertPlanningSourceUnchanged(tx,lease.userId,run.ideaId,lease.sourceReport)
  await assertPlanningContextUnchanged(tx, lease.userId, run.ideaId, lease.contextSnapshot)
  const updated = await tx.update(planningModuleRequests).set({ status: 'completed', resultId, stageData: null, updatedAt: new Date() })
    .where(and(eq(planningModuleRequests.id, lease.id), eq(planningModuleRequests.userId, lease.userId), eq(planningModuleRequests.leaseToken, lease.token), eq(planningModuleRequests.status, 'pending'))).returning({ id: planningModuleRequests.id })
  if (!updated.length) throw new PlanningRequestError('This run was replaced by a retry. Its extra result and charge were canceled.', 409)
}

export async function failPlanningRequest(lease: PlanningLease | null) {
  if (!lease) return
  try {
    await db.update(planningModuleRequests).set({ status: 'failed', updatedAt: new Date() })
      .where(and(eq(planningModuleRequests.id, lease.id), eq(planningModuleRequests.userId, lease.userId), eq(planningModuleRequests.leaseToken, lease.token), eq(planningModuleRequests.status, 'pending')))
  } catch { console.warn('[planning-request] Pending retry lease will expire; completion identity remains protected') }
}
