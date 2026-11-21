import { IdeaInputSchema, type IdeaDraft } from './idea-input'
import { z } from 'zod'
import { PUBLIC_RESEARCH_FOCUS_MAX } from './ai/research-brief'

export type BriefSnapshot = { draft: IdeaDraft; step: number; ideaId?: string }
type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem'>
const key = (owner: string) => 'validore:brief:' + owner

export function restoreBrief(storage: Storage, owner: string): BriefSnapshot | null {
  try {
    const value = JSON.parse(storage.getItem(key(owner)) || 'null')
    if (!value?.draft || typeof value.draft !== 'object') return null
    const draft = Object.fromEntries(Object.entries(IdeaInputSchema.shape).flatMap(([field, schema]) => {
      if (field === 'publicResearchFocus' && value.draft[field] === undefined) return []
      const maximum = field === 'publicResearchFocus' ? PUBLIC_RESEARCH_FOCUS_MAX : schema instanceof z.ZodString ? schema.maxLength ?? 4000 : 4000
      return [[field, typeof value.draft[field] === 'string' ? value.draft[field].slice(0, maximum) : '']]
    })) as IdeaDraft
    const ideaId = z.uuid().safeParse(value.ideaId).success ? value.ideaId as string : undefined
    return { draft, ideaId, step: Number.isInteger(value.step) ? Math.max(0, Math.min(ideaId ? 4 : 2, value.step)) : 0 }
  } catch { return null }
}

export function persistBrief(storage: Storage, owner: string, hydratedOwner: string | null, snapshot: BriefSnapshot): boolean {
  if (hydratedOwner !== owner) return false
  try { storage.setItem(key(owner), JSON.stringify(snapshot)); return true } catch { return false }
}
