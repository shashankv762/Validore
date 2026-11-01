import { z } from 'zod'
import { and, desc, eq } from 'drizzle-orm'
import { db } from '@/db'
import { users, ideas, validationReports, leanCanvases, pricingSimulations, crowdfundingAnalyses, pitchDecks } from '@/db/schema'
import { buildReportDocument, type ReportDocument } from './document'

const Query = z.object({
  reportId: z.uuid().optional(), ideaId: z.uuid().optional(), canvasId: z.uuid().optional(), deckId: z.uuid().optional(),
  module: z.enum(['validation', 'canvas', 'pricing', 'crowdfunding', 'pitch']).optional(),
})
type Loaded = { document: ReportDocument; filename: string } | { error: string; status: number }

export async function loadExportDocument(search: URLSearchParams, supabaseId: string): Promise<Loaded> {
  const parsed = Query.safeParse(Object.fromEntries(search))
  if (!parsed.success) return { error: 'Provide a valid report, idea or document reference.', status: 400 }
  const { reportId, ideaId, canvasId, deckId } = parsed.data
  const kind = parsed.data.module || (canvasId ? 'canvas' : deckId ? 'pitch' : 'validation')
  if ((!reportId && !ideaId && !deckId) || (reportId && (kind !== 'validation' || canvasId || deckId)) || (canvasId && (kind !== 'canvas' || !ideaId)) || (deckId && kind !== 'pitch'))
    return { error: 'Select one report or document to download.', status: 400 }
  const owner = await db.query.users.findFirst({ where: eq(users.supabaseId, supabaseId) })
  if (!owner) return { error: 'Account not found.', status: 404 }
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
    where: and(eq(pricingSimulations.userId, owner.id), eq(pricingSimulations.ideaId, ideaId!)), orderBy: [desc(pricingSimulations.createdAt)],
  })
  else if (kind === 'crowdfunding') record = await db.query.crowdfundingAnalyses.findFirst({
    where: and(eq(crowdfundingAnalyses.userId, owner.id), eq(crowdfundingAnalyses.ideaId, ideaId!)), orderBy: [desc(crowdfundingAnalyses.createdAt)],
  })
  else if (kind === 'pitch') record = await db.query.pitchDecks.findFirst({
    where: and(eq(pitchDecks.userId, owner.id), deckId ? eq(pitchDecks.id, deckId) : eq(pitchDecks.ideaId, ideaId!)), orderBy: [desc(pitchDecks.createdAt)],
  })
  if (!record || record.userId !== owner.id) return { error: 'This document was not found in your workspace.', status: 404 }
  const idea = await db.query.ideas.findFirst({ where: and(eq(ideas.id, String(record.ideaId)), eq(ideas.userId, owner.id)) })
  const prefix = kind === 'canvas' ? 'lean-canvas' : 'validore-' + kind
  return { document: buildReportDocument(record, idea ?? null, kind), filename: prefix + '-' + String(record.id).replace(/[^a-zA-Z0-9-]/g, '').slice(0, 64) }
}
