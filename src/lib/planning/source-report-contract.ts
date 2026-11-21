import { z } from 'zod'

export const SourceReportIdSchema = z.string().uuid().nullish()
export const SOURCE_REPORT_CONTEXT_MAX_CHARS = 128_000
export const SourceReportSnapshotSchema = z.object({
  version: z.literal('validation-planning-v1'), reportId: z.string().uuid(), ideaId: z.string().uuid(),
  status: z.enum(['complete','partial']), mode: z.enum(['lite','full']), score: z.number().finite().min(0).max(100).nullable(),
  reportCreatedAt: z.string().nullable(), capturedAt: z.string(), contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  briefProvenance: z.enum(['captured_with_report','unavailable_in_legacy_report']),
  originalBrief: z.record(z.string(), z.unknown()).nullable(),
  findings: z.record(z.string(), z.unknown()),
  coverage: z.object({ suppliedFields: z.array(z.string()), omittedFields: z.array(z.string()),
    columnPayloadConflicts:z.array(z.object({field:z.string(),columnValue:z.unknown(),payloadValue:z.unknown()})).optional(),
    sourceCount: z.number().int().min(0), suppliedSourceCount: z.number().int().min(0),
    sourceExcerpts: z.number().int().min(0), metadataOnlySources: z.number().int().min(0), notices: z.array(z.string()),
    experimentCriteria: z.object({ planCount:z.number().int().min(0),fullySpecifiedPlans:z.number().int().min(0),
      gaps:z.array(z.object({ index:z.number().int().min(0),missingFields:z.array(z.string()) })) }).optional() }),
  researchSources: z.array(z.object({ title: z.string(), url: z.string().url(), fetchedAt: z.string(),
    dataBundleVersion:z.string().optional(),
    retrievalKind: z.enum(['snippet','page','memory','open-data']), suppliedAs: z.enum(['saved_content','saved_excerpt','metadata_only']) })).max(30),
  interpretation: z.string(),
})
export type SourceReportSnapshot = z.infer<typeof SourceReportSnapshotSchema>

export type SourceReportOption = { id: string; score: number | null; status: 'complete' | 'partial'; mode: 'full' | 'lite'; createdAt: string | null }
