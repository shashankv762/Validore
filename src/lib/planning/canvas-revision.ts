import { CANVAS_KEYS } from './evidence'

type CanvasKey = typeof CANVAS_KEYS[number]
type RecordData = Record<string, unknown>
const record = (value: unknown): RecordData => value && typeof value === 'object' && !Array.isArray(value) ? value as RecordData : {}

/** Retain experiment identities and past observations. Editing a hypothesis
 * requests a dependency review; it does not erase an experiment's history. */
export function manualCanvasRevision(parent: RecordData | null, entered: Record<CanvasKey, string>) {
  const editedBlocks: CanvasKey[] = []
  const blocks = Object.fromEntries(CANVAS_KEYS.map(key => {
    const content = entered[key].trim(); const previous = record(parent?.[key])
    if (parent && previous.content === content) return [key, previous]
    editedBlocks.push(key)
    return [key, { content, confidenceScore: 0, label: 'ASSUMPTION', keyAssumptions: [], evidenceNote: 'Founder-authored content; gather evidence before increasing confidence.' }]
  }))
  const previousScores = record(parent?.confidenceScores)
  const previousAnalysis = record(parent?.analysisData)
  const overallScore = !editedBlocks.length && typeof previousScores.overallScore === 'number' ? previousScores.overallScore
    : Math.round(Object.values(blocks).reduce((sum, block) => sum + (Number(block.confidenceScore) || 0), 0) / CANVAS_KEYS.length)
  const experiments = Array.isArray(previousScores.validationExperiments) ? previousScores.validationExperiments : []
  const validationExperiments = experiments.map(value => {
    const experiment = record(value)
    if (!editedBlocks.length) return value
    // Explicit bindings are authoritative. Legacy unbound experiments stay in
    // the backlog and request review, since their dependency is unknown.
    const bindings = Array.isArray(experiment.canvasKeys) ? experiment.canvasKeys : Array.isArray(experiment.canvasBlocks) ? experiment.canvasBlocks : null
    const affected = bindings ? editedBlocks.filter(key => bindings.includes(key)) : editedBlocks
    return affected.length ? { ...experiment, dependencyReview: { state: 'NEEDS_REVIEW', canvasKeys: affected,
      reason: bindings ? 'A linked canvas hypothesis changed.' : 'Review this experiment against the edited hypotheses; no explicit block bindings were saved.' } } : value
  })
  const gaps = Array.isArray(previousAnalysis.evidenceGaps) ? previousAnalysis.evidenceGaps : []
  return { blocks, editedBlocks, overallScore, confidenceScores: { ...previousScores, overallScore, validationExperiments },
    analysisData: { ...previousAnalysis, sourceCanvasId: parent?.id, editedBlocks,
      evidenceGaps: editedBlocks.length ? [...gaps, 'Edited hypotheses need dependency review and new evidence; existing experiments and observations are retained.'] : gaps,
      manualRevision: { sourceCanvasId: parent?.id, editedBlocks, sectionsNeedReview: editedBlocks.length > 0 } } }
}
