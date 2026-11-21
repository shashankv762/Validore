import { z } from 'zod'

export const PlanningArtifactSelectionSchema = z.object({
  sourceCanvasId: z.uuid().nullish(), sourcePricingId: z.uuid().nullish(), sourceCampaignId: z.uuid().nullish(),
  parentCanvasId: z.uuid().nullish(),
})
export type PlanningArtifactSelection = z.infer<typeof PlanningArtifactSelectionSchema>
export const PlanningArtifactSnapshotSchema = z.object({
  module: z.enum(['lean-canvas', 'pricing', 'crowdfunding']), id: z.uuid(), ideaId: z.uuid(),
  version: z.number().int().positive().nullable(), createdAt: z.string().nullable(),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/), data: z.record(z.string(), z.unknown()),
})
export const PlanningContextSnapshotSchema = z.object({
  version: z.literal('planning-context-v1'), capturedAt: z.string(),
  founderContext: z.string().max(128_000), founderContextHash: z.string().regex(/^[a-f0-9]{64}$/),
  artifacts: z.array(PlanningArtifactSnapshotSchema).max(4), parentCanvasId: z.uuid().nullable(),
  selection: PlanningArtifactSelectionSchema,
})
export type PlanningContextSnapshot = z.infer<typeof PlanningContextSnapshotSchema>
export type PlanningArtifactSnapshot = z.infer<typeof PlanningArtifactSnapshotSchema>
