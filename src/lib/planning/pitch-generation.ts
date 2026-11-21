import { z } from 'zod'
import { createHash } from 'node:crypto'
import { generateWithFallback, type GenerateResult, type GenerateOptions } from '@/lib/ai/generate'
import { deduplicateSources, type SearchResult } from '@/lib/ai/search'
import { planningMethod } from './knowledge'
import { validatePitchOutput } from './evidence'
import { PitchDeckAiSchema, PitchDeckInputSchema, SlideSchema } from './pitch-schema'
import { canonicalPitchFunding, validatePitchFunding } from './pitch-funding'

export const PITCH_DELIVERY_MS = 230_000
const STAGE_MAX_MS = 110_000
const PREPARATION_MAX_MS = 200_000
const text = z.string().trim().min(5).max(800)
const short = z.string().trim().min(3).max(250)
const list = z.array(short).min(1).max(6)
const phase = z.object({ name: short, channels: list, budget: text, timeline: short })
const action = z.object({ action: text, owner: short, deadline: short })

// The delivered contract below is unchanged. Writer schemas divide its work
// and impose tighter local bounds to keep each complete response manageable.
export const PitchSlidesSchema = z.object({ slides: z.array(SlideSchema.extend({
  title: SlideSchema.shape.title.max(120), content: SlideSchema.shape.content.max(600),
  keyPoints: SlideSchema.shape.keyPoints.max(5), speakerNotes: SlideSchema.shape.speakerNotes.max(1600),
  sourceUrls: SlideSchema.shape.sourceUrls.unwrap().max(3).optional(),
})).length(12) })

export const PitchPreparationSchema = PitchDeckAiSchema.pick({
  pitchScript3min: true, pitchScript60sec: true,
  problemClarityScore: true, solutionStrengthScore: true, customerEvidenceScore: true, marketOpportunityScore: true,
  businessModelScore: true, competitivePositioningScore: true, gtmStrategyScore: true, financialLogicScore: true,
  teamExecutionScore: true, presentationQualityScore: true, founderReadinessScore: true, founderReadinessNote: true,
  portfolioSections: true, roadmap: true, integrityNote: true,
})
export const PitchQaSchema = PitchDeckAiSchema.pick({ investorQa: true })

export const PitchStrategySchema = PitchDeckAiSchema.pick({
  entrepreneurialSkillsMatrix: true, customerJourney: true, valuePropositionCanvas: true, moscowFeatures: true,
  competitorMatrix: true, positioningMap: true, swot: true, pestleAnalysis: true, useOfFundsBreakdown: true,
  gtmStrategy: true, salesFunnel: true, brandStrategy: true, kpiTargets: true, riskRegister: true, actionPlan: true,
}).extend({
  entrepreneurialSkillsMatrix: z.array(z.object({ skill: short, selfRating: z.number().min(0).max(10), evidence: text, gap: text })).min(3).max(6),
  customerJourney: z.array(z.object({ stage: short, touchpoint: text, emotion: short, opportunity: text })).min(3).max(6),
  valuePropositionCanvas: z.object({ customerJobs: list, pains: list, gains: list, products: list, painRelievers: list, gainCreators: list }),
  moscowFeatures: z.object({ must: list, should: list, could: list, wont: list }),
  swot: z.object({ strengths: list, weaknesses: list, opportunities: list, threats: list }),
  pestleAnalysis: z.object({ political: list, economic: list, social: list, technological: list, legal: list, environmental: list }),
  gtmStrategy: z.object({ phase1: phase, phase2: phase }),
  brandStrategy: z.object({ positioning: text, voiceTone: short, visualIdentity: text, tagline: short }),
  kpiTargets: z.array(z.object({ metric: short, current: text, target: text, timeline: short })).min(2).max(6),
  riskRegister: z.array(z.object({ risk: text, severity: z.enum(['high','medium','low']), likelihood: z.enum(['high','medium','low']), mitigation: text })).min(2).max(6),
  actionPlan: z.object({ thirtyDay: z.array(action).min(2).max(5), ninetyDay: z.array(action).min(2).max(5) }),
})

type PitchIdea = { name: string; industry: string; product: string; targetCustomer: string; location: string; businessModel: string; coreProblem: string; proposedSolution: string; publicResearchFocus?: string | null }
type PitchStage = 'slides' | 'strategy' | 'preparation' | 'investor-qa'
type StageTrace = { stage: PitchStage; provider: string; tokensUsed: number; durationMs: number; allocatedMs: number; sourceCount: number }
export type PitchGenerationOptions = {
  idea: PitchIdea; input: z.infer<typeof PitchDeckInputSchema>; sources: SearchResult[]; privateContext: string;
  preferredAiProvider?: string | null; customOpenRouterKey?: string | null; maxTokensPerCall?: number; writerConcurrency?: number;
  checkpoint?: unknown; saveCheckpoint?: (checkpoint: PitchCheckpoint) => Promise<void>;
  privateContextMaxChars?: number;
}

const sourceSchema = z.object({ title: z.string().max(2000), url: z.string().url().max(4000), content: z.string().max(200000),
  source: z.string().max(2000), fetchedAt: z.string().max(100), retrievalKind: z.enum(['snippet','page','memory','open-data']).optional(),
}).passthrough()
const traceSchema = z.object({ stage: z.enum(['slides','strategy','preparation','investor-qa']), provider: z.string().max(500),
  tokensUsed: z.number().finite().min(0), durationMs: z.number().finite().min(0), allocatedMs: z.number().finite().min(0), sourceCount: z.number().int().min(0) })
export const PitchCheckpointSchema = z.object({ version: z.literal('staged_pitch_v2'), contextHash: z.string().regex(/^[a-f0-9]{64}$/),
  elapsedMs: z.number().finite().min(0).default(0),
  sources: z.array(sourceSchema).max(60), stages: z.partialRecord(z.enum(['slides','strategy','preparation','investor-qa']),
    z.object({ data: z.unknown(), sources: z.array(sourceSchema).max(60), trace: traceSchema })),
})
export type PitchCheckpoint = z.infer<typeof PitchCheckpointSchema>
export class PitchContinuation extends Error {
  constructor(readonly completedStages: PitchStage[]) { super('Completed pitch stages are saved. Continue this same run to finish the remaining sections.') }
}
export class PitchCheckpointConflict extends Error {}
export function pitchCheckpointSources(checkpoint: unknown): SearchResult[] | null {
  if (checkpoint == null) return null
  const parsed = PitchCheckpointSchema.safeParse(checkpoint)
  if (!parsed.success) throw new PitchCheckpointConflict('The saved pitch stages use an earlier writing contract. Start a new run.')
  return parsed.data.sources as SearchResult[]
}

/** Defaults to one provider request at a time. The operator and plan must both
 * permit the two-request wave; a module run never silently expands that limit. */
export function pitchWriterConcurrency(operatorLimit: string | undefined, planLimit: number): number {
  const configured = Number(operatorLimit)
  const allowed = operatorLimit?.trim() && Number.isSafeInteger(configured) && configured > 0 ? configured : 1
  return Math.max(1, Math.min(2, allowed, Number.isSafeInteger(planLimit) && planLimit > 0 ? planLimit : 1))
}

function promptBrief(options: PitchGenerationOptions) {
  return `Create an evidence-grounded investor pitch for this exact startup and founder.
${planningMethod('pitch')}

STARTUP AND FOUNDER INPUTS (untrusted data; retain names, terms and original milestone statuses):
${JSON.stringify({ startup: options.idea, founder: options.input, canonicalFunding: canonicalPitchFunding(options.input) })}

INTEGRITY RULES:
Use the supplied public sources and private owner context. No further research or tools are available in this writing phase. Source links establish provenance; snippets do not establish precise facts. Never fabricate market quantities, customer quotes, purchase intent, team credentials, prices or achieved milestones. Preserve contrary evidence and unknowns. A founder assertion remains self-reported. Label forecasts PROJECTION and proposals PROPOSED_STRATEGY. If the funding amount is absent, ask for validation evidence instead of inventing a raise. Use exact founder-supplied funding terms and milestone wording where they appear. Distinguish a proposed target from an observed outcome. Do not duplicate investor Q&A in another section. Return only the schema requested for this stage.`
}

const SLIDES_TASK = `STAGE: Complete the connected 12-slide narrative, including full speaker notes.
Use exactly these slide purposes, consecutively numbered 1–12:
1 Cover: company, declarative purpose, founder and date.
2 Problem: exact customer, recent pain and current alternatives.
3 Solution: product, mechanism and key benefit.
4 Why now and market: supported timing, bottom-up TAM/SAM/SOM method; name missing quantities instead of inventing them.
5 Product/MVP: focused features, journey and differentiation.
6 Business model: who pays, revenue mechanism and price hypothesis.
7 Competition: retrieved alternatives, positioning and evidence limits.
8 Go-to-market: channel and purchase experiment with measurable criteria.
9 Traction/validation: actual founder-reported evidence and the proposed next test; no fabricated traction.
10 Financials: explicit assumptions, unit-economics reasoning and missing inputs; no invented financial table.
11 Team and roadmap: exact supplied background and PLANNED/ACHIEVED distinctions.
12 Funding ask and next steps: retain supplied funding terms, intended use and conditional evidence milestones.
Each slide needs one distinct headline, under 600 characters of on-slide content, 3–5 concise key points and useful speaker notes (about 80–150 words where needed, not another giant slide). Notes must explain assumptions, evidence gaps and the investor decision. Cite at most three exact retrieved source URLs for external claims on each slide. This stage writes only slides, not scripts, scoring or strategy tables.`

const STRATEGY_TASK = `STAGE: Complete the strategy, deep-analysis and operating plan that supports the pitch.
Provide a useful skills/gaps assessment grounded in supplied experience; a 3–6 step proposed customer journey; the value proposition canvas; MoSCoW priorities; SWOT; relevant PESTLE questions; two go-to-market phases; brand positioning; measurable KPI targets; 2–6 specific risks; and practical 30/90-day actions with owners and dates. These are hypotheses and plans, not completed work. Use "Not measured" for unknown current KPIs and describe the experiment needed.
Keep entries concise but decision-specific: prefer 2–4 short items per list and one actionable sentence per prose field. Qualitative sections are required; an empty object is not a strategy. Competitor prices, use-of-funds amounts, numeric positioning and funnel counts are optional only when the supplied evidence or founder inputs support them. Omit unsupported numeric fields rather than inventing data. Use-of-funds allocation percentages must sum to 100 when supplied. Do not write slides, pitch scripts, scoring, portfolio or investor Q&A in this stage.`

const PREPARATION_TASK = `STAGE: Prepare the founder and review the complete pitch using the intact handoff below.
Write an approximately three-minute pitch (roughly 330-450 words) and a 60-second pitch (roughly 100-140 words) that follow the supplied slide narrative. Ground them in the slides, strategy, supplied founder terms and actual evidence; do not introduce new traction or numbers. Investor questions and answers are written by a separate writer; do not duplicate them here.
Provide a clear portfolio narrative and a practical roadmap that preserves founder-reported milestone statuses; proposed additions remain PLANNED. Retain supplied funding ask and use-of-funds conditions. Review all ten weighted quality criteria against the delivered slides/strategy, using the schema's maximum points. Do not reward a missing or assumed customer result as verified evidence. Explain the founder readiness score as developmental, not a diagnosis. Include an integrity note distinguishing self-report, sourced facts, projections, proposals and unresolved gaps. This stage must retain every slide headline and the critical strategy fields in the review handoff; no arbitrary truncation or summary may erase findings.`

const QA_TASK = `STAGE: Write exactly twenty distinct, substantive investor questions and honest answers of about 40-60 words each. Cover customers/payment, market evidence, alternatives, moat, economics, acquisition, execution, funding and disconfirming evidence. Use the intact slides, strategy and preparation handoff. Retain founder terms and unresolved evidence; never introduce new traction or numbers. Every question should address a different investor concern. Return only investorQa; scripts, scoring and other sections are already complete.`

export async function generatePitchDeck(options: PitchGenerationOptions) {
  const started = Date.now(); const deadline = started + PITCH_DELIVERY_MS
  const concurrency = options.writerConcurrency === 2 ? 2 : 1
  const brief = promptBrief(options)
  const contextHash = createHash('sha256').update([brief, SLIDES_TASK, STRATEGY_TASK, PREPARATION_TASK, QA_TASK, options.privateContext].join('\n')).digest('hex')
  let checkpoint: PitchCheckpoint = { version: 'staged_pitch_v2', contextHash, elapsedMs: 0, sources: options.sources, stages: {} }
  if (options.checkpoint != null) {
    const parsed = PitchCheckpointSchema.safeParse(options.checkpoint)
    if (!parsed.success || parsed.data.contextHash !== contextHash) throw new PitchCheckpointConflict('The founder context or writing contract changed. Start a new pitch run for the updated inputs.')
    checkpoint = parsed.data
  }
  const previousElapsedMs = checkpoint.elapsedMs
  const resumedStages = Object.keys(checkpoint.stages)
  const trace: StageTrace[] = []
  let checkpointWrites = Promise.resolve()
  const save = async () => {
    if (!options.saveCheckpoint) return
    checkpointWrites = checkpointWrites.then(() => {
      checkpoint.elapsedMs = previousElapsedMs + Date.now() - started
      return options.saveCheckpoint!(structuredClone(checkpoint))
    })
    await checkpointWrites
  }
  // Freeze the research snapshot once. Resuming a run does not silently change
  // citations or introduce new findings into already reviewed slides.
  await save()
  const shared: Omit<GenerateOptions<unknown>, 'schema' | 'prompt'> = {
    researchMode: 'reuse', maxResearchRounds: 0, maxModelCalls: 2,
    privateContext: options.privateContext, sources: checkpoint.sources as SearchResult[], temperature: 0,
    preferredAiProvider: options.preferredAiProvider, customOpenRouterKey: options.customOpenRouterKey,
    maxTokensPerCall: options.maxTokensPerCall,
    privateContextMaxChars: options.privateContextMaxChars,
  }
  const budget = (stage:PitchStage) => {
    const remaining = deadline - Date.now()
    const stageMaximum = stage==='preparation' ? PREPARATION_MAX_MS : STAGE_MAX_MS
    // With durable storage, begin each writer with its complete bounded budget.
    // Returning 202 releases the lease; the next request resumes these stages.
    if (remaining < stageMaximum + 2000) {
      if(options.saveCheckpoint) throw new PitchContinuation(Object.keys(checkpoint.stages) as PitchStage[])
      if(stage==='preparation') throw new Error('The full preparation budget cannot fit this request. Retry with a durable planning run key.')
    }
    if (remaining < 1000) throw new Error('Pitch delivery deadline exhausted before its next stage')
    return Math.min(stageMaximum, remaining)
  }
  const write = async <T>(stage: PitchStage, schema: z.ZodType<T>, prompt: string, maxOutputTokens: number,
    validateOutput?: GenerateOptions<T>['validateOutput']): Promise<GenerateResult<T>> => {
    const restored = checkpoint.stages[stage]
    if (restored) {
      const data = schema.parse(restored.data)
      const issues = validateOutput?.(data, restored.sources as SearchResult[]) ?? []
      if (issues.length) throw new PitchCheckpointConflict('A saved pitch stage no longer satisfies its evidence contract. Start a new run.')
      trace.push(restored.trace)
      return { data, provider: restored.trace.provider, tokensUsed: restored.trace.tokensUsed, sources: restored.sources as SearchResult[] }
    }
    const allocatedMs = budget(stage); const stageStarted = Date.now()
    if (process.env.AI_DIAGNOSTICS === 'true') console.info('[pitch] Writing stage', { stage, allocatedMs, maxOutputTokens, writerConcurrency: concurrency })
    let result: GenerateResult<T>
    try {
      result = await generateWithFallback({ ...shared, prompt: brief + '\n\n' + prompt, schema,
        timeoutMs: allocatedMs, maxOutputTokens, validateOutput })
    } catch (error) {
      if (process.env.AI_DIAGNOSTICS === 'true') console.warn('[pitch] Stage unavailable', { stage, durationMs: Date.now() - stageStarted,
        type: error instanceof Error ? error.name : 'UnknownError' })
      throw error
    }
    const data = schema.parse(result.data)
    const stageSources = result.sources ?? checkpoint.sources as SearchResult[]
    const issues = validateOutput?.(data, stageSources) ?? []
    if (issues.length) throw new Error('Pitch stage failed its evidence contract: ' + issues.map(issue => issue.field).join(', '))
    const stageTrace = { stage, provider: result.provider, tokensUsed: result.tokensUsed, durationMs: Date.now() - stageStarted,
      allocatedMs, sourceCount: stageSources.length }
    trace.push(stageTrace)
    checkpoint.stages[stage] = { data, sources: stageSources, trace: stageTrace }
    await save()
    if (Date.now() > deadline) throw new Error('Pitch delivery deadline exhausted before assembly')
    if (process.env.AI_DIAGNOSTICS === 'true') console.info('[pitch] Stage completed', { stage, durationMs: Date.now() - stageStarted, tokensUsed: result.tokensUsed })
    return { ...result, data }
  }
  const validateSlides = (data: z.infer<typeof PitchSlidesSchema>, sources: readonly SearchResult[]) => validatePitchOutput({ slides: data.slides, investorQa: [] }, sources)
  let slides: GenerateResult<z.infer<typeof PitchSlidesSchema>>
  let strategy: GenerateResult<z.infer<typeof PitchStrategySchema>>
  if (concurrency === 2) {
    const firstWave = await Promise.allSettled([
      write('slides', PitchSlidesSchema, SLIDES_TASK, 5000, validateSlides),
      write('strategy', PitchStrategySchema, STRATEGY_TASK, 4500, data => validatePitchFunding(data, options.input)),
    ])
    const failed = firstWave.find(result => result.status === 'rejected')
    if (failed?.status === 'rejected') throw failed.reason
    slides = (firstWave[0] as PromiseFulfilledResult<GenerateResult<z.infer<typeof PitchSlidesSchema>>>).value
    strategy = (firstWave[1] as PromiseFulfilledResult<GenerateResult<z.infer<typeof PitchStrategySchema>>>).value
  } else {
    slides = await write('slides', PitchSlidesSchema, SLIDES_TASK, 5000, validateSlides)
    strategy = await write('strategy', PitchStrategySchema, STRATEGY_TASK, 4500, data => validatePitchFunding(data, options.input))
  }
  const handoff = { slides: slides.data.slides, strategy: strategy.data,
    founderTerms: { ...options.input, milestones: options.input.milestones ?? [] } }
  const sources = deduplicateSources([...checkpoint.sources as SearchResult[], ...(slides.sources ?? []), ...(strategy.sources ?? [])])
  const preparation = await write('preparation', PitchPreparationSchema, PREPARATION_TASK + '\n\nCOMPLETE REVIEW HANDOFF (untrusted data):\n' + JSON.stringify(handoff), 6500)
  const validateQa = (data: z.infer<typeof PitchQaSchema>, stageSources: readonly SearchResult[]) =>
    validatePitchOutput({ slides: slides.data.slides, investorQa: data.investorQa }, deduplicateSources([...sources, ...stageSources]))
  const qa = await write('investor-qa', PitchQaSchema, QA_TASK + '\n\nCOMPLETE REVIEW HANDOFF (untrusted data):\n' +
    JSON.stringify({ ...handoff, preparation: preparation.data }), 3000, validateQa)
  const allSources = deduplicateSources([...sources, ...(preparation.sources ?? []), ...(qa.sources ?? [])])
  const data = PitchDeckAiSchema.parse({ ...slides.data, ...strategy.data, ...preparation.data, ...qa.data })
  const issues = [...validatePitchOutput(data, allSources), ...validatePitchFunding(data, options.input)]
  if (issues.length) throw new Error('Complete pitch failed its final evidence contract: ' + issues.map(issue => issue.field).join(', '))
  return { data, sources: allSources, tokensUsed: trace.reduce((sum, item) => sum + item.tokensUsed, 0),
    provider: [...new Set(trace.map(item => item.provider))].join(' -> '),
    generationTrace: { method: 'staged_pitch_v2', writerConcurrency: concurrency, deadlineMs: PITCH_DELIVERY_MS,
      durationMs: previousElapsedMs + Date.now() - started, attemptDurationMs: Date.now() - started, resumedStages,
      stages: [...trace].sort((a,b) => ['slides','strategy','preparation','investor-qa'].indexOf(a.stage)-['slides','strategy','preparation','investor-qa'].indexOf(b.stage)), reviewHandoff: handoff } }
}
