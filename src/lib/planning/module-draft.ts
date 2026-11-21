type DraftStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
export type ModuleDraft<T> = { ideaId: string; savedAt: string; value: T }
export const moduleDraftKey = (module: string, ownerId: string, ideaId: string) => `validore:draft:v1:${module}:${ownerId}:${ideaId}`
const latestKey = (module: string, ownerId: string) => moduleDraftKey(module, ownerId, 'latest')

export function readModuleDraft<T>(storage: DraftStorage, module: string, ownerId: string, ideaId: string, allowedIdeas: string[]): ModuleDraft<T> | null {
  const selected = ideaId || storage.getItem(latestKey(module, ownerId)) || ''
  if (!allowedIdeas.includes(selected)) return null
  const raw = storage.getItem(moduleDraftKey(module, ownerId, selected))
  if (!raw || raw.length > 100_000) return null
  const draft = JSON.parse(raw)
  if (draft?.ideaId !== selected || typeof draft.savedAt !== 'string' || !Number.isFinite(Date.parse(draft.savedAt)) ||
      !draft.value || typeof draft.value !== 'object' || Array.isArray(draft.value)) return null
  return draft
}
export function writeModuleDraft<T>(storage: DraftStorage, module: string, ownerId: string, ideaId: string, value: T) {
  const draft: ModuleDraft<T> = { ideaId, value, savedAt: new Date().toISOString() }
  const raw = JSON.stringify(draft)
  if (raw.length > 100_000) throw new Error('Draft exceeds browser storage limit')
  storage.setItem(moduleDraftKey(module, ownerId, ideaId), raw)
  storage.setItem(latestKey(module, ownerId), ideaId)
  return draft
}
export function removeModuleDraft(storage: DraftStorage, module: string, ownerId: string, ideaId: string) {
  storage.removeItem(moduleDraftKey(module, ownerId, ideaId))
  if (storage.getItem(latestKey(module, ownerId)) === ideaId) storage.removeItem(latestKey(module, ownerId))
}
