import { db } from '@/db'
import { leanCanvases, users } from '@/db/schema'
import { and, desc, eq } from 'drizzle-orm'
import { deductCredits } from './credits'
import { nextCanvasVersion } from './canvas-versions'
import { isActiveAccount, isOwnerAccount } from './admin-access'

type CanvasData = Omit<typeof leanCanvases.$inferInsert, 'id' | 'ideaId' | 'userId' | 'version' | 'createdAt'>

export async function saveCanvasVersion(userId: string, ideaId: string, data: CanvasData, cost = 0) {
  return db.transaction(async tx => {
    // Both manual and AI writes serialize with the existing credit operations.
    const [owner] = await tx.select({ id: users.id, isAdmin: users.isAdmin, accountStatus: users.accountStatus }).from(users).where(eq(users.id, userId)).for('update')
    if (!owner || !isActiveAccount(owner)) return { kind: 'missing' as const }
    const versions = await tx.query.leanCanvases.findMany({
      where: and(eq(leanCanvases.ideaId, ideaId), eq(leanCanvases.userId, userId)),
      columns: { version: true }, orderBy: [desc(leanCanvases.version)], limit: 4,
    })
    const version = nextCanvasVersion(versions, isOwnerAccount(owner))
    if (version === null) return { kind: 'limit' as const }
    if (cost > 0 && !await deductCredits(userId, cost, 'LEAN_CANVAS', ideaId, undefined, tx)) return { kind: 'credits' as const }
    const [canvas] = await tx.insert(leanCanvases).values({ ...data, userId, ideaId, version }).returning()
    return { kind: 'saved' as const, canvas }
  })
}
