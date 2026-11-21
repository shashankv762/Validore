import { db } from '@/db'
import { leanCanvases, users } from '@/db/schema'
import { and, desc, eq } from 'drizzle-orm'
import { deductCredits, type CreditTransaction } from './credits'
import { nextCanvasVersion } from './canvas-versions'
import { isActiveAccount, isOwnerAccount } from './admin-access'
import { lockPlanningIdea, PlanningRequestError } from './planning/requests'

type CanvasData = Omit<typeof leanCanvases.$inferInsert, 'id' | 'ideaId' | 'userId' | 'version' | 'createdAt'>

export async function saveCanvasVersion(userId: string, ideaId: string, data: CanvasData, cost = 0, onSaved?: (transaction: CreditTransaction, canvas: typeof leanCanvases.$inferSelect) => Promise<void>) {
  return db.transaction(async tx => {
    // Both manual and AI writes serialize with the existing credit operations.
    const [owner] = await tx.select({ id: users.id, isAdmin: users.isAdmin, accountStatus: users.accountStatus }).from(users).where(eq(users.id, userId)).for('update')
    if (!owner || !isActiveAccount(owner)) return { kind: 'missing' as const }
    await lockPlanningIdea(tx, userId, ideaId)
    const metadata = data.analysisData && typeof data.analysisData === 'object' ? data.analysisData as Record<string, unknown> : {}
    const parentId = typeof metadata.sourceCanvasId === 'string' ? metadata.sourceCanvasId : null
    // Read the recent history through Drizzle's relational query API. Besides
    // avoiding a second round-trip, this keeps the latest-version lookup and
    // the four-version cap based on the same snapshot after the idea lock.
    // (The lightweight test transaction exposes this API as well.)
    const recentCanvases = await tx.query.leanCanvases.findMany({
      where: and(eq(leanCanvases.ideaId, ideaId), eq(leanCanvases.userId, userId)),
      columns: { id: true, version: true },
      orderBy: [desc(leanCanvases.version)],
      limit: 4,
    })
    const latest = recentCanvases[0]
    const revision = metadata.manualRevision as { editedBlocks?: unknown[] } | undefined
    if (parentId && revision?.editedBlocks?.length === 0) {
      const [parent] = await tx.select().from(leanCanvases).where(and(eq(leanCanvases.id, parentId), eq(leanCanvases.userId, userId), eq(leanCanvases.ideaId, ideaId)))
      if (!parent) throw new PlanningRequestError('The selected parent canvas is no longer available.', 404)
      const parentMetadata = parent.analysisData as Record<string, unknown> | null
      if (JSON.stringify(metadata.sourceReport ?? null) === JSON.stringify(parentMetadata?.sourceReport ?? null)) {
        if (onSaved) await onSaved(tx, parent)
        return { kind: 'saved' as const, canvas: parent, unchanged: true }
      }
    }
    const version = nextCanvasVersion(recentCanvases, isOwnerAccount(owner))
    if (version === null) return { kind: 'limit' as const }
    if (cost > 0 && !await deductCredits(userId, cost, 'LEAN_CANVAS', ideaId, undefined, tx)) return { kind: 'credits' as const }
    const [canvas] = await tx.insert(leanCanvases).values({ ...data, userId, ideaId, version,
      analysisData: { ...metadata, lineage: { parentCanvasId: parentId, latestCanvasIdAtSave: latest?.id ?? null,
        branch: Boolean(latest && latest.id !== parentId), version } },
    }).returning()
    if (onSaved) await onSaved(tx, canvas)
    return { kind: 'saved' as const, canvas }
  })
}
