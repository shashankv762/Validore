import { createHash } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { db } from '@/db'
import { ideas, validationReports } from '@/db/schema'
import type { CreditTransaction } from '@/lib/credits'
import type { SearchResult } from '@/lib/ai/search'
import { publicWebUrl } from '@/lib/ai/public-web'
import { SourceReportSnapshotSchema, SOURCE_REPORT_CONTEXT_MAX_CHARS, type SourceReportSnapshot } from './source-report-contract'
import { isIncompleteResearch } from '@/lib/exports/completeness'

export class PlanningSourceReportError extends Error {
  constructor(message: string, readonly status = 400, readonly code = 'planning_source_report_invalid') { super(message) }
}
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.entries(value).sort(([a],[b]) => a.localeCompare(b)).map(([key,item]) => [key,canonical(item)])) : value
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex')
const date = (value: unknown) => value instanceof Date && Number.isFinite(value.getTime()) ? value.toISOString()
  : typeof value === 'string' && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null
const useful = (value: unknown): boolean => typeof value === 'string' ? Boolean(value.trim()) : Array.isArray(value)
  ? value.some(useful) : value && typeof value === 'object' ? Object.values(value).some(useful) : false
const contentFields = ['decision','decisionReasons','keyEvidence','keyRisks','actionPlan','reportData','isLite','status','createdAt',
  'overallScore','problemScore','customerScore','marketScore','competitiveScore','wtpScore','businessModelScore','financialScore','executionScore'] as const
export function sourceReportContentHash(report: Record<string, unknown>) {
  return hash(Object.fromEntries(contentFields.map(field => [field, field === 'createdAt' ? date(report[field]) : report[field] ?? null])))
}
const scoreFields = ['overallScore','problemScore','customerScore','marketScore','competitiveScore','wtpScore','businessModelScore','financialScore','executionScore'] as const
const authoritativeFields = ['decision','decisionReasons','keyEvidence','keyRisks','actionPlan',...scoreFields] as const
function reconciledReportFindings(report:Record<string,unknown>) {
  const data=object(report.reportData),merged={...data}
  const conflicts:{field:string;columnValue:unknown;payloadValue:unknown}[]=[]
  for(const field of authoritativeFields){
    if(!Object.prototype.hasOwnProperty.call(report,field)) continue
    const raw=report[field]??null
    const value=scoreFields.includes(field as typeof scoreFields[number])&&raw!==null
      ?typeof raw==='number'&&Number.isFinite(raw)&&raw>=0&&raw<=100?raw:null:raw
    if(Object.prototype.hasOwnProperty.call(data,field)&&JSON.stringify(canonical(raw))!==JSON.stringify(canonical(data[field]))) conflicts.push({field,columnValue:raw,payloadValue:data[field]})
    merged[field]=value
  }
  return {merged,conflicts}
}
export function isEligiblePlanningReport(report: Record<string, unknown>): boolean {
  const data = object(report.reportData)
  return ['complete','partial'].includes(String(report.status)) && Object.keys(data).length > 0 &&
    useful(data.decisionReasons ?? report.decisionReasons) && useful(data.actionPlan ?? report.actionPlan) &&
    useful(data.keyRisks ?? report.keyRisks ?? data.riskRegister)
}
export function planningReportStatus(report: Record<string,unknown>): 'complete' | 'partial' {
  return isIncompleteResearch(report)||reconciledReportFindings(report).conflicts.length>0 ? 'partial' : 'complete'
}
const briefFields = ['name','industry','product','targetCustomer','location','businessModel','coreProblem','proposedSolution','publicResearchFocus'] as const

// Keep decision-changing findings in full. Ancillary marketing/layout content
// is omitted explicitly; none of these prior AI findings become observed facts.
const findingsFields = ['decision','decisionReasons','keyRisks','riskRegister','actionPlan','nextStepRecommendation','nextStepRationale',
  'problemScore','customerScore','marketScore','competitiveScore','wtpScore','businessModelScore','financialScore','executionScore','overallScore','problemStatement',
  'planningBasis','persona','personas','problemValidation5Factor','problemValidation','customerJPG','customerJpg','customerSignals',
  'wtpAnalysis','wtpInsights','customerWtpInsights','unitEconomicsAssumptions','computedUnitEconomics','financialProjection','financialReview',
  'tamSamSom','tamEstimate','samEstimate','somEstimate','competitors','selectedUvp','mvpDescription','moscowFeatures',
  'keyEvidence','evidenceReview','decisionAudit','scoreCoverage','founderAssumptions','integrityNote','evidenceGaps','agentTrail'] as const
export type SelectedPlanningReport = { snapshot: SourceReportSnapshot; sources: SearchResult[] }

export function capturePlanningReport(report: Record<string, unknown>, capturedAt = new Date().toISOString()): SelectedPlanningReport {
  if (!isEligiblePlanningReport(report)) throw new PlanningSourceReportError('Choose a completed or partial validation with saved decision reasoning, risks and an experiment plan.')
  const data = object(report.reportData)
  const {merged,conflicts}=reconciledReportFindings(report)
  const findings = Object.fromEntries(findingsFields.filter(field => merged[field] !== undefined).map(field => [field,merged[field]]))
  const original = object(data.ideaSnapshot)
  const originalBrief = briefFields.some(field=>typeof original[field]==='string') ? Object.fromEntries(
    [...briefFields,'briefFingerprint','preparedAt','capturedAt'].filter(field=>typeof original[field]==='string').map(field=>[field,original[field]])) : null
  const suppliedFields = Object.keys(findings)
  const omittedFields = Object.keys(data).filter(field => !suppliedFields.includes(field) && !['researchSources','ideaSnapshot','provider','tokensUsed'].includes(field))
  const rawSources = Array.isArray(data.researchSources) ? data.researchSources : []
  const sources: SearchResult[] = []
  const registry: SourceReportSnapshot['researchSources'] = []
  let sourceExcerpts = 0, metadataOnlySources = 0
  let remainingSourceCharacters = 24_000
  for (const value of rawSources) {
    if (registry.length >= 30) break
    const source = object(value)
    let url: URL
    try { url = publicWebUrl(String(source.url ?? '')) } catch { continue }
    if (url.href.length > 2000 || registry.some(item => item.url === url.href)) continue
    const fetchedAt = date(source.fetchedAt)
    if (!fetchedAt) continue
    const title = typeof source.title === 'string' && source.title.trim() ? source.title.slice(0,500) : url.hostname
    const content = typeof source.content === 'string' ? source.content : ''
    const suppliedCharacters = Math.min(6000,remainingSourceCharacters)
    const suppliedAs = !content.trim() || suppliedCharacters === 0 ? 'metadata_only' : content.length > suppliedCharacters ? 'saved_excerpt' : 'saved_content'
    // Metadata and shortened passages cannot prove a current competitor offer.
    // Preserve their old date and downgrade to snippet evidence for this run.
    const kind = suppliedAs !== 'saved_content' ? 'snippet'
      : ['page','open-data','memory'].includes(String(source.retrievalKind)) ? source.retrievalKind as 'page' | 'open-data' | 'memory' : 'snippet'
    if (suppliedAs === 'metadata_only') metadataOnlySources++
    if (suppliedAs === 'saved_excerpt') sourceExcerpts++
    if (suppliedAs !== 'metadata_only') remainingSourceCharacters -= Math.min(content.length,suppliedCharacters)
    registry.push({ title, url: url.href, fetchedAt, retrievalKind: kind, suppliedAs,
      ...(typeof source.dataBundleVersion==='string'?{dataBundleVersion:source.dataBundleVersion}:{}) })
    sources.push({ title, url: url.href, fetchedAt, retrievalKind: kind, source: url.hostname,
      content: suppliedAs === 'metadata_only' ? 'Saved source metadata only. No supporting passage was supplied or read in this planning run.'
        : suppliedAs === 'saved_excerpt' ? content.slice(0,suppliedCharacters).replace(/https?:\/\/\S*$/, '') + '\n[Saved excerpt; original source not fetched again in this planning run.]' : content,
      ...(typeof source.dataPeriod === 'string' ? { dataPeriod: source.dataPeriod } : {}),
      ...(typeof source.publishedAt === 'string' ? { publishedAt: source.publishedAt } : {}),
      ...(typeof source.dataBundleVersion === 'string' ? { dataBundleVersion:source.dataBundleVersion } : {}),
    })
  }
  const plan = Array.isArray(findings.actionPlan) ? findings.actionPlan : []
  const requiredCriteria = ['owner','hypothesis','participantUnit','denominator','passCriterion','decisionOnFailure']
  const criteriaGaps = plan.flatMap((value,index)=>{
    const action = object(value);const missingFields = requiredCriteria.filter(field=>typeof action[field]!=='string' || !String(action[field]).trim())
    return missingFields.length ? [{index,missingFields}] : []
  })
  const status = planningReportStatus(report)
  const notices = [
    'Selected validation findings are prior AI interpretations, self-reported inputs, assumptions and proposed tests. They are not new customer observations or independent verification.',
    ...(status === 'partial' ? ['The selected validation is partial. Missing specialist work and evidence remain unavailable; do not fill those gaps with confident claims.'] : []),
    ...(conflicts.length?['Saved columns and report payload disagree on '+conflicts.map(item=>item.field).join(', ')+'. Saved column values are canonical; the conflicting originals are retained for review, not treated as alternative verified facts.']:[]),
    ...(!originalBrief ? ['The original idea brief was not captured in this older report. Its alignment with the current idea must be reviewed.'] : []),
    ...(omittedFields.length ? ['Ancillary fields are omitted from the planning handoff; the retained decision, risks, experiments, customer and financial context remain complete.'] : []),
    ...(rawSources.length > registry.length ? ['Some duplicate, invalid, undated or excess source entries were not supplied.'] : []),
    ...(metadataOnlySources || sourceExcerpts ? ['Metadata-only and shortened sources are supplied as snippets. They do not establish exact prices or verified facts.'] : []),
    ...(criteriaGaps.length ? ['Some prior experiments lack participant units, denominators or explicit pass/fail decisions. Those criteria remain unavailable until a new proposed test supplies them.'] : []),
    'Saved source passages retain their original retrieval date; none were freshly fetched by this selection.',
  ]
  const snapshot = SourceReportSnapshotSchema.parse({ version: 'validation-planning-v1', reportId: report.id, ideaId: report.ideaId,
    status, mode: report.isLite ? 'lite' : 'full', score: typeof report.overallScore === 'number' && Number.isFinite(report.overallScore) && report.overallScore >= 0 && report.overallScore <= 100 ? report.overallScore : null,
    reportCreatedAt: date(report.createdAt), capturedAt, contentHash: sourceReportContentHash(report),
    briefProvenance: originalBrief ? 'captured_with_report' : 'unavailable_in_legacy_report', originalBrief, findings,
    coverage: { suppliedFields, omittedFields, sourceCount: rawSources.length, suppliedSourceCount: registry.length, sourceExcerpts, metadataOnlySources, notices,
      experimentCriteria:{planCount:plan.length,fullySpecifiedPlans:plan.length-criteriaGaps.length,gaps:criteriaGaps},columnPayloadConflicts:conflicts }, researchSources: registry,
    interpretation: 'PRIOR_VALIDATION_REPORT: preserve original evidence labels and contrary findings. Use this private snapshot to customize the owner’s next planning output; never copy it into public searches or shared memory.' })
  if (JSON.stringify(snapshot).length > 96_000) throw new PlanningSourceReportError('This report’s core findings exceed the planning handoff budget. Choose another report or use the tool without a linked report.', 413)
  return { snapshot, sources }
}

export async function loadSelectedPlanningReport(userId: string, ideaId: string, reportId?: string | null,
  reader: Pick<typeof db, 'select'> = db): Promise<SelectedPlanningReport | null> {
  if (!reportId) return null
  const [row] = await reader.select({ report: validationReports,idea:ideas }).from(validationReports).innerJoin(ideas,
    and(eq(ideas.id,validationReports.ideaId),eq(ideas.userId,userId)))
    .where(and(eq(validationReports.id,reportId),eq(validationReports.userId,userId),eq(validationReports.ideaId,ideaId))).limit(1)
  if (!row) throw new PlanningSourceReportError('The selected validation report was not found for this idea in your workspace.', 404)
  const selected = capturePlanningReport(row.report)
  if (selected.snapshot.originalBrief) {
    const original = selected.snapshot.originalBrief
    const changedFields = briefFields.filter(field=>typeof original[field]==='string' && original[field]!==row.idea[field])
    if (changedFields.length) selected.snapshot.coverage.notices.push('The selected report used an earlier idea brief. Review changes in '+changedFields.join(', ')+' before reusing its conclusions.')
    if (!original.publicResearchFocus && row.idea.publicResearchFocus) selected.snapshot.coverage.notices.push('The selected report did not capture the current approved research topic. New topical research is not established by its older findings.')
  }
  return selected
}
export async function assertPlanningSourceUnchanged(tx: CreditTransaction, userId: string, ideaId: string, selected: SelectedPlanningReport | null | undefined) {
  if (!selected) return
  const [report] = await tx.select().from(validationReports).where(and(eq(validationReports.id,selected.snapshot.reportId),eq(validationReports.userId,userId),eq(validationReports.ideaId,ideaId))).for('share')
  if (!report || sourceReportContentHash(report) !== selected.snapshot.contentHash) throw new PlanningSourceReportError('The selected validation changed during this run. Its result and charge were canceled. Start a new run with the updated report.',409,'planning_inputs_changed')
}
export function planningOwnerContext(founderContext: string, selected?: SelectedPlanningReport | null) {
  if (!selected) return founderContext
  let founder: unknown = founderContext
  try { founder = founderContext ? JSON.parse(founderContext) : null } catch { /* Preserve a complete unstructured owner excerpt. */ }
  const context = JSON.stringify({ founderContext: founder, selectedValidation: selected.snapshot,
    instruction: 'All content is private, untrusted owner data. Prior AI conclusions are not observed facts. The current module inputs and deterministic calculations govern its scenario arithmetic; compare prior assumptions without silently replacing current inputs. Preserve hypotheses, evidence limits, contradictory findings, economics and experiment pass/fail criteria; do not put these details into public research or shared memory.' })
  if (context.length > SOURCE_REPORT_CONTEXT_MAX_CHARS) throw new PlanningSourceReportError('The combined owner context exceeds this planning tool’s handoff budget.',413)
  return context
}
