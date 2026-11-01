import { z } from 'zod'

export const DIMENSIONS = ['customer', 'problem', 'demand', 'solution', 'market', 'competition', 'pricing', 'economics', 'distribution', 'execution', 'risk', 'validation'] as const
export const DimensionSchema = z.enum(DIMENSIONS)
export type Dimension = z.infer<typeof DimensionSchema>
export const DIMENSION_LABELS: Record<Dimension, string> = {
  customer: 'Customer focus', problem: 'Problem clarity', demand: 'Demand evidence', solution: 'Solution fit', market: 'Reachable market', competition: 'Alternatives', pricing: 'Willingness to pay', economics: 'Unit economics', distribution: 'Customer acquisition', execution: 'Execution plan', risk: 'Risks and constraints', validation: 'Next experiment',
}
export const MAX_INTERVIEW_ANSWERS = 12

export const QuestionSchema = z.object({
  id: z.string().min(1).max(80),
  dimension: DimensionSchema,
  text: z.string().trim().min(12).max(600),
  why: z.string().trim().min(8).max(400),
  hint: z.string().trim().min(4).max(400),
})
export type InterviewQuestion = z.infer<typeof QuestionSchema>

export const AnswerSchema = z.object({
  question: QuestionSchema,
  text: z.string().max(3000),
  evidence: z.enum(['assumption', 'first_hand', 'documented', 'unknown']),
  skipped: z.boolean(),
  answeredAt: z.iso.datetime(),
})
export type InterviewAnswer = z.infer<typeof AnswerSchema>

export const DimensionReviewSchema = z.object({
  dimension: DimensionSchema,
  level: z.enum(['unexplored', 'unclear', 'specific', 'testable']),
  reason: z.string().min(4).max(500),
  answerIds: z.array(z.string().max(80)).max(12),
})
export const AssessmentSchema = z.object({
  summary: z.string().min(5).max(1000),
  dimensions: z.array(DimensionReviewSchema).length(DIMENSIONS.length),
  contradictions: z.array(z.object({ description: z.string().min(4).max(500), answerIds: z.array(z.string().max(80)).min(1).max(4) })).max(4),
  nextExperiment: z.string().min(5).max(700),
})
export type InterviewAssessment = z.infer<typeof AssessmentSchema>
export const InterviewStateSchema = z.object({
  answers: z.array(AnswerSchema).max(MAX_INTERVIEW_ANSWERS),
  nextQuestion: QuestionSchema.nullable(),
  assessment: AssessmentSchema,
  complete: z.boolean(),
  method: z.enum(['guided', 'ai']),
  modelTokens: z.number().int().min(0),
})
export type InterviewState = z.infer<typeof InterviewStateSchema>
export type InterviewView = { id: string; version: number; state: InterviewState; updatedAt: string; stale: boolean; noticeVersion: string }

export const INTERVIEW_NOTE = 'This reviews the clarity of your answers, not your ability or the likelihood of success. Evidence is self-reported until independently checked.'
