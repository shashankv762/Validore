import { z } from 'zod'
import { and, desc, eq } from 'drizzle-orm'
import { db } from '@/db'
import { users, ideas, validationReports, leanCanvases, pricingSimulations, crowdfundingAnalyses, pitchDecks } from '@/db/schema'
import { buildReportDocument, humanize, type ReportDocument } from './document'
import { isActiveAccount } from '../admin-access'
import { savedExportIdea } from './idea-context'

const Query = z.object({
  reportId: z.uuid().optional(), ideaId: z.uuid().optional(), canvasId: z.uuid().optional(), deckId: z.uuid().optional(),
  simulationId: z.uuid().optional(), analysisId: z.uuid().optional(),
  module: z.enum(['validation', 'canvas', 'pricing', 'crowdfunding', 'pitch']).optional(),
})
type Loaded = { document: ReportDocument; filename: string; canvasFields?: Array<{ name: string; content: string }> } | { error: string; status: number }
const CANVAS_FIELDS = ['problem', 'solution', 'uvp', 'unfairAdvantage', 'customerSegments', 'keyMetrics', 'channels', 'costStructure', 'revenueStreams'] as const

export async function loadExportDocument(search: URLSearchParams, supabaseId: string): Promise<Loaded> {
  const parsed = Query.safeParse(Object.fromEntries(search))
  if (!parsed.success) return { error: 'Provide a valid report, idea or document reference.', status: 400 }
  const { reportId, ideaId, canvasId, deckId, simulationId, analysisId } = parsed.data
  const kind = parsed.data.module || (canvasId ? 'canvas' : deckId ? 'pitch' : simulationId ? 'pricing' : analysisId ? 'crowdfunding' : 'validation')
  if ((!reportId && !ideaId && !deckId && !simulationId && !analysisId) || [reportId, canvasId, deckId, simulationId, analysisId].filter(Boolean).length > 1 || (reportId && kind !== 'validation') || (canvasId && (kind !== 'canvas' || !ideaId)) || (deckId && kind !== 'pitch') || (simulationId && kind !== 'pricing') || (analysisId && kind !== 'crowdfunding'))
    return { error: 'Select one report or document to download.', status: 400 }
  const owner = await db.query.users.findFirst({ where: eq(users.supabaseId, supabaseId) })
  if (!owner || !isActiveAccount(owner)) return { error: 'Account not found.', status: 404 }
  let record: Record<string, unknown> | undefined
  if (kind === 'validation') record = await db.query.validationReports.findFirst({
    where: and(eq(validationReports.userId, owner.id), reportId ? eq(validationReports.id, reportId) : eq(validationReports.ideaId, ideaId!)),
    orderBy: [desc(validationReports.createdAt)],
  })
  else if (kind === 'canvas') record = await db.query.leanCanvases.findFirst({
    where: and(eq(leanCanvases.userId, owner.id), eq(leanCanvases.ideaId, ideaId!), canvasId ? eq(leanCanvases.id, canvasId) : undefined),
    orderBy: [desc(leanCanvases.version)],
  })
  else if (kind === 'pricing') record = await db.query.pricingSimulations.findFirst({
    where: and(eq(pricingSimulations.userId, owner.id), simulationId ? eq(pricingSimulations.id, simulationId) : undefined, ideaId ? eq(pricingSimulations.ideaId, ideaId) : undefined), orderBy: [desc(pricingSimulations.createdAt)],
  })
  else if (kind === 'crowdfunding') record = await db.query.crowdfundingAnalyses.findFirst({
    where: and(eq(crowdfundingAnalyses.userId, owner.id), analysisId ? eq(crowdfundingAnalyses.id, analysisId) : undefined, ideaId ? eq(crowdfundingAnalyses.ideaId, ideaId) : undefined), orderBy: [desc(crowdfundingAnalyses.createdAt)],
  })
  else if (kind === 'pitch') record = await db.query.pitchDecks.findFirst({
    where: and(eq(pitchDecks.userId, owner.id), deckId ? eq(pitchDecks.id, deckId) : eq(pitchDecks.ideaId, ideaId!)), orderBy: [desc(pitchDecks.createdAt)],
  })
  if (!record || record.userId !== owner.id || ideaId && record.ideaId !== ideaId) return { error: 'This document was not found in your workspace.', status: 404 }
  const idea = await db.query.ideas.findFirst({ where: and(eq(ideas.id, String(record.ideaId)), eq(ideas.userId, owner.id)) })
  const prefix = kind === 'canvas' ? 'lean-canvas' : 'validore-' + kind
  // Preserve scalar Canvas content for CSV. A display line such as
  // "Content: =1+1" is not a substitute for the founder's original value.
  const canvasFields = kind === 'canvas' ? CANVAS_FIELDS.flatMap(key => {
    const value = record[key]
    const content = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>).content : value
    return typeof content === 'string' ? [{ name: humanize(key), content }] : []
  }) : undefined
  return { document: buildReportDocument(record, savedExportIdea(record, idea ?? null), kind), filename: prefix + '-' + String(record.id).replace(/[^a-zA-Z0-9-]/g, '').slice(0, 64), canvasFields }
}
