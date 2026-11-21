import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ generate: vi.fn() }))
vi.mock('@/lib/ai/generate', () => ({ generateWithFallback: state.generate }))
import { generatePitchDeck, pitchWriterConcurrency, PitchPreparationSchema, PitchQaSchema, PitchSlidesSchema, PitchStrategySchema, PitchContinuation, type PitchCheckpoint, PITCH_DELIVERY_MS } from '@/lib/planning/pitch-generation'
import { PitchDeckAiSchema } from '@/lib/planning/pitch-schema'
import { stagedPitchFixture } from './fixtures/pitch-deck'

const input = { ideaId: '11111111-1111-4111-8111-111111111111', founderName: 'Exact founder name',
  founderBackground: 'A supplied retail operating background with explicit evidence gaps.', teamSize: 2,
  fundingAskAmount: 'USD 75,000 after the paid-pilot evidence review', useOfFunds: 'Pilot fulfillment first; no spend before the milestone review.',
  currentTraction: 'No paid pilots have been completed.', milestones: [{ milestone: 'Measure paid demand', targetDate: '2026-12-01', status: 'PLANNED' as const }] }
const options = { idea: { name: 'Stock pilot', industry: 'Software', product: 'Stock reconciliation', targetCustomer: 'Independent shop owners',
  location: 'Pune, India', businessModel: 'Pilot subscription hypothesis', coreProblem: 'Manual stock reconciliation', proposedSolution: 'A narrow pilot' },
  input, sources: [], privateContext: 'Private owner observations remain unverified.', preferredAiProvider: 'free_models', maxTokensPerCall: 6500 }
const response = () => ({ data: structuredClone(stagedPitchFixture), provider: 'synthetic-stage-model', tokensUsed: 100, sources: [] })
beforeEach(() => { vi.clearAllMocks(); state.generate.mockImplementation(async () => response()) })
afterEach(() => vi.useRealTimers())

describe('bounded complete pitch delivery', () => {
  it('retains the complete final contract and an intact reviewer handoff', async () => {
    const result = await generatePitchDeck(options)
    expect(PitchDeckAiSchema.safeParse(result.data).success).toBe(true)
    expect(result.data.slides).toEqual(stagedPitchFixture.slides)
    expect(result.data.investorQa).toHaveLength(20)
    expect(result.data.pitchScript3min).toBe(stagedPitchFixture.pitchScript3min)
    expect(result.data.pitchScript60sec).toBe(stagedPitchFixture.pitchScript60sec)
    expect(result.data.actionPlan).toEqual(stagedPitchFixture.actionPlan)
    expect(result.data.kpiTargets).toEqual(stagedPitchFixture.kpiTargets)
    expect(result.generationTrace.reviewHandoff.slides).toEqual(stagedPitchFixture.slides)
    expect(result.generationTrace.reviewHandoff.strategy).toEqual(PitchStrategySchema.parse(stagedPitchFixture))
    expect(result.generationTrace.reviewHandoff.founderTerms).toMatchObject(input)
    const reviewPrompt = state.generate.mock.calls[2][0].prompt
    expect(reviewPrompt).not.toContain('Provide exactly twenty distinct')
    expect(state.generate.mock.calls[3][0].prompt).toContain('Write exactly twenty distinct')
    const handoff = JSON.parse(reviewPrompt.split('COMPLETE REVIEW HANDOFF (untrusted data):\n')[1])
    expect(handoff).toEqual(result.generationTrace.reviewHandoff)
    expect(result.tokensUsed).toBe(400)
    expect(state.generate.mock.calls.map(([call]) => call.schema)).toEqual([PitchSlidesSchema, PitchStrategySchema, PitchPreparationSchema, PitchQaSchema])
    for (const [call] of state.generate.mock.calls) {
      expect(call).toMatchObject({ researchMode: 'reuse', maxResearchRounds: 0, maxModelCalls: 2, maxTokensPerCall: 6500 })
      expect(call.maxOutputTokens).toBeLessThanOrEqual(call.schema===PitchPreparationSchema?6500:5000)
      expect(call.timeoutMs).toBeLessThanOrEqual(call.schema===PitchPreparationSchema?200000:110000)
    }
  })
  it('allocates 6500 preparation output tokens for a full founder packet without reducing its handoff or changing other budgets',async()=>{
    const richPreparation=PitchPreparationSchema.parse({...stagedPitchFixture,
      pitchScript3min:'Explain the specific buyer problem, proposed paid pilot, contrary evidence, operating assumptions and funding decision. '.repeat(24),
      pitchScript60sec:'Test the narrow stock-log hypothesis before wider investment; report actual paid offers and rejected offers with their denominator. '.repeat(6),
      portfolioSections:Array.from({length:3},(_,index)=>({sectionTitle:'Founder evidence and operating narrative '+index,
        content:'Preserve the founder-reported operating experience, the unknown demand, the proposed experiment criteria and the conditional investment decision. '.repeat(14),label:'PROPOSED_STRATEGY'})),
      roadmap:Array.from({length:3},(_,phase)=>({phase:'Evidence review phase '+phase,timeframe:'After the preceding evidence review',milestones:Array.from({length:6},(_,index)=>({
        milestone:'Proposed milestone '+phase+'-'+index+': compare the target buyer, actual paid offers, rejected offers, usage evidence and delivery costs before a broader commitment. '.repeat(2),status:'PLANNED'}))})),
      founderReadinessNote:'This assessment concerns self-reported experience and practical preparation; preserve limitations and do not treat a development score as independent evidence of execution. '.repeat(6),
      integrityNote:'Keep self-report, retrieved evidence, projections, proposals and unresolved gaps separate. A completed document is not proof of customer demand or a guaranteed funding outcome. '.repeat(9),
    })
    expect(JSON.stringify(richPreparation).length).toBeGreaterThan(14853)
    state.generate.mockImplementation(async call=>({...response(),data:call.schema===PitchPreparationSchema?richPreparation:structuredClone(stagedPitchFixture)}))
    const result=await generatePitchDeck({...options,maxTokensPerCall:16000})
    expect(state.generate.mock.calls.map(([call])=>call.maxOutputTokens)).toEqual([5000,4500,6500,3000])
    expect(state.generate.mock.calls.every(([call])=>call.maxModelCalls===2&&call.timeoutMs===(call.schema===PitchPreparationSchema?200000:110000))).toBe(true)
    expect(result.generationTrace.writerConcurrency).toBe(1);expect(result.generationTrace.deadlineMs).toBe(230000)
    expect(result.data.pitchScript3min).toBe(richPreparation.pitchScript3min)
    expect(result.data.portfolioSections).toEqual(richPreparation.portfolioSections);expect(result.data.roadmap).toEqual(richPreparation.roadmap)
    const preparationHandoff=JSON.parse(state.generate.mock.calls[2][0].prompt.split('COMPLETE REVIEW HANDOFF (untrusted data):\n')[1])
    expect(preparationHandoff).toEqual(result.generationTrace.reviewHandoff)
    const qaHandoff=JSON.parse(state.generate.mock.calls[3][0].prompt.split('COMPLETE REVIEW HANDOFF (untrusted data):\n')[1])
    expect(qaHandoff.preparation).toEqual(richPreparation);expect(qaHandoff.slides).toEqual(stagedPitchFixture.slides)
    expect(result.data.investorQa).toHaveLength(20)
  })
  it.each([1, 2])('limits in-flight writing to the explicitly selected concurrency %s', async concurrency => {
    let active = 0; let peak = 0
    state.generate.mockImplementation(async () => {
      active++; peak = Math.max(peak, active)
      await Promise.resolve(); active--
      return response()
    })
    await generatePitchDeck({ ...options, writerConcurrency: concurrency })
    expect(peak).toBe(concurrency); expect(active).toBe(0)
    expect(state.generate).toHaveBeenCalledTimes(4)
  })
  it('shares one deadline rather than granting three independent full request budgets', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-15T00:00:00Z'))
    state.generate.mockImplementation(async () => { vi.setSystemTime(Date.now() + 50000); return response() })
    await expect(generatePitchDeck(options)).rejects.toThrow('full preparation budget')
    expect(state.generate.mock.calls.map(([call])=>call.timeoutMs)).toEqual([110000,110000])
    expect(state.generate).toHaveBeenCalledTimes(2)
  })
  it('rejects a completed first stage after the shared deadline without starting later writers', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-15T00:00:00Z'))
    state.generate.mockImplementation(async () => { vi.setSystemTime(Date.now() + PITCH_DELIVERY_MS + 1); return response() })
    await expect(generatePitchDeck(options)).rejects.toThrow('deadline')
    expect(state.generate).toHaveBeenCalledOnce()
  })
  it('waits for an explicitly parallel first wave to settle on failure and never starts review', async () => {
    let finished = false
    state.generate.mockImplementation(async call => {
      if (call.schema === PitchSlidesSchema) throw new Error('Synthetic provider timeout')
      await Promise.resolve(); finished = true; return response()
    })
    await expect(generatePitchDeck({ ...options, writerConcurrency: 2 })).rejects.toThrow('Synthetic provider timeout')
    expect(finished).toBe(true); expect(state.generate).toHaveBeenCalledTimes(2)
  })
  it('rejects a missing required strategy and duplicated investor questions rather than saving a superficial subset', async () => {
    state.generate.mockImplementation(async call => ({ ...response(), data: call.schema === PitchStrategySchema ? {} : structuredClone(stagedPitchFixture) }))
    await expect(generatePitchDeck(options)).rejects.toThrow()
    expect(state.generate).toHaveBeenCalledTimes(2)
    state.generate.mockClear(); state.generate.mockImplementation(async call => ({ ...response(), data: call.schema === PitchQaSchema
      ? { ...structuredClone(stagedPitchFixture), investorQa: Array(20).fill(stagedPitchFixture.investorQa[0]) } : structuredClone(stagedPitchFixture) }))
    await expect(generatePitchDeck(options)).rejects.toThrow('investorQa')
  })
  it('honors both the operator concurrency cap and the plan limit, with one as the safe default', () => {
    expect(pitchWriterConcurrency(undefined, 3)).toBe(1)
    expect(pitchWriterConcurrency('1', 3)).toBe(1)
    expect(pitchWriterConcurrency('2', 1)).toBe(1)
    expect(pitchWriterConcurrency('5', 3)).toBe(2)
    expect(pitchWriterConcurrency('invalid', 3)).toBe(1)
  })
  it('resumes the actual slow serial wave with full saved stages instead of shrinking preparation to the remaining time', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-16T00:00:00Z'))
    let checkpoint: PitchCheckpoint | undefined
    state.generate.mockImplementation(async () => { vi.setSystemTime(Date.now() + 70000); return response() })
    const saveCheckpoint = async (value: PitchCheckpoint) => { checkpoint = structuredClone(value) }
    await expect(generatePitchDeck({ ...options, saveCheckpoint })).rejects.toBeInstanceOf(PitchContinuation)
    expect(Object.keys(checkpoint!.stages)).toEqual(['slides', 'strategy'])
    expect(state.generate).toHaveBeenCalledTimes(2)
    state.generate.mockClear()
    const result = await generatePitchDeck({ ...options, checkpoint, saveCheckpoint })
    expect(state.generate.mock.calls.map(([call]) => call.schema)).toEqual([PitchPreparationSchema, PitchQaSchema])
    expect(state.generate.mock.calls.map(([call])=>call.timeoutMs)).toEqual([200000,110000])
    expect(state.generate.mock.calls.map(([call])=>call.maxOutputTokens)).toEqual([6500,3000])
    expect(result.data.slides).toEqual(stagedPitchFixture.slides)
    expect(result.data.investorQa).toEqual(stagedPitchFixture.investorQa)
    expect(result.tokensUsed).toBe(400)
    expect(result.generationTrace.stages).toHaveLength(4)
    expect(result.generationTrace.durationMs).toBe(280000)
    expect(result.generationTrace.attemptDurationMs).toBe(140000)
    expect(result.generationTrace.resumedStages).toEqual(['slides','strategy'])
  })
  it('rejects a checkpoint when private founder context or its writing contract changes', async () => {
    let checkpoint: PitchCheckpoint | undefined
    await generatePitchDeck({ ...options, saveCheckpoint: async value => { checkpoint = structuredClone(value) } })
    state.generate.mockClear()
    await expect(generatePitchDeck({ ...options, checkpoint, privateContext: 'Changed owner evidence' })).rejects.toThrow('context')
    await expect(generatePitchDeck({ ...options, checkpoint: { ...checkpoint, version: 'old' } })).rejects.toThrow('contract')
    expect(state.generate).not.toHaveBeenCalled()
  })
  it('checkpoints a completed long preparation before QA and resumes only the unfinished writer',async()=>{
    vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-16T00:00:00Z'))
    let checkpoint:PitchCheckpoint|undefined
    const saveCheckpoint=async(value:PitchCheckpoint)=>{checkpoint=structuredClone(value)}
    state.generate.mockImplementation(async(call)=>{vi.setSystemTime(Date.now()+(call.schema===PitchPreparationSchema?190000:70000));return response()})
    await expect(generatePitchDeck({...options,saveCheckpoint})).rejects.toBeInstanceOf(PitchContinuation)
    expect(Object.keys(checkpoint!.stages)).toEqual(['slides','strategy'])
    state.generate.mockClear()
    await expect(generatePitchDeck({...options,checkpoint,saveCheckpoint})).rejects.toBeInstanceOf(PitchContinuation)
    expect(state.generate).toHaveBeenCalledOnce()
    expect(state.generate.mock.calls[0][0]).toMatchObject({schema:PitchPreparationSchema,timeoutMs:200000,maxOutputTokens:6500,maxModelCalls:2})
    expect(Object.keys(checkpoint!.stages)).toEqual(['slides','strategy','preparation'])
    state.generate.mockClear()
    const final=await generatePitchDeck({...options,checkpoint,saveCheckpoint})
    expect(state.generate).toHaveBeenCalledOnce();expect(state.generate.mock.calls[0][0].schema).toBe(PitchQaSchema)
    expect(final.data.pitchScript3min).toBe(stagedPitchFixture.pitchScript3min);expect(final.data.investorQa).toHaveLength(20)
    expect(final.generationTrace.resumedStages).toEqual(['slides','strategy','preparation'])
  })
  it('settles parallel checkpoint writes without losing either first-wave stage', async () => {
    let saved: PitchCheckpoint | undefined
    await generatePitchDeck({ ...options, writerConcurrency: 2, saveCheckpoint: async value => {
      await Promise.resolve(); saved = structuredClone(value)
    } })
    expect(Object.keys(saved!.stages)).toEqual(['slides', 'strategy', 'preparation', 'investor-qa'])
  })
})
