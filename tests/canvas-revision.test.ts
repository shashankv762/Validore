import { describe, expect, it } from 'vitest'
import { manualCanvasRevision } from '@/lib/planning/canvas-revision'
import { CANVAS_KEYS } from '@/lib/planning/evidence'
const entered = Object.fromEntries(CANVAS_KEYS.map(key => [key, key + ' hypothesis'])) as Record<typeof CANVAS_KEYS[number], string>
const parent = { id: 'canvas-v1', ...Object.fromEntries(CANVAS_KEYS.map(key => [key, { content: entered[key], confidenceScore: 50, label: 'SOME_RESEARCH', keyAssumptions: [key + ' assumption'] }])),
  confidenceScores: { overallScore: 50, riskiestAssumption: 'Will the segment pay?', validationExperiments: [
    { id: 'exp-1', assumptionId: 'h-1', canvasKeys: ['problem'], status: 'COMPLETED', observedResult: '2 paid pilots' },
    { id: 'exp-2', canvasKeys: ['channels'], experiment: 'Try a referral offer' },
    { id: 'legacy-exp', experiment: 'Older unbound hypothesis test' },
  ] }, analysisData: { assumptionRegister: [{ id: 'h-1', status: 'TESTED' }], interviewQuestions: ['What changed?'], researchSources: [{ url: 'https://example.test' }], evidenceGaps: ['Verify retention'] } }
describe('manual canvas experiment continuity', () => {
  it('keeps all experiment identities, observations and deeper analysis for unchanged blocks', () => {
    const saved = manualCanvasRevision(parent, entered)
    expect(saved.confidenceScores).toEqual(parent.confidenceScores)
    expect(saved.analysisData).toMatchObject(parent.analysisData)
    expect(saved.editedBlocks).toEqual([])
  })
  it('marks changed dependencies for review while retaining completed history and unaffected experiments', () => {
    const saved = manualCanvasRevision(parent, { ...entered, problem: 'A changed problem hypothesis' })
    expect(saved.blocks.problem).toMatchObject({ confidenceScore: 0, label: 'ASSUMPTION' })
    expect(saved.confidenceScores.validationExperiments[0]).toMatchObject({ id: 'exp-1', status: 'COMPLETED', observedResult: '2 paid pilots', dependencyReview: { state: 'NEEDS_REVIEW', canvasKeys: ['problem'] } })
    expect(saved.confidenceScores.validationExperiments[1]).toEqual(parent.confidenceScores.validationExperiments[1])
    expect(saved.confidenceScores.validationExperiments[2]).toMatchObject({ id: 'legacy-exp', dependencyReview: { state: 'NEEDS_REVIEW' } })
    expect(saved.analysisData).toMatchObject({ assumptionRegister: parent.analysisData.assumptionRegister, interviewQuestions: parent.analysisData.interviewQuestions, researchSources: parent.analysisData.researchSources })
    expect(saved.analysisData.evidenceGaps).toContain('Verify retention')
    expect(parent.confidenceScores.validationExperiments[0]).not.toHaveProperty('dependencyReview')
  })
})
