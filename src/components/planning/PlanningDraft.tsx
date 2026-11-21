'use client'
import { useEffect, useRef, useState } from 'react'
import { readModuleDraft, removeModuleDraft, writeModuleDraft, type ModuleDraft } from '@/lib/planning/module-draft'

/** Saves only user edits. Opening a saved artifact never overwrites a draft. */
export function usePlanningDraft<T extends object>({ module, ownerId, ideaId, ideas, value, onRestore }: {
  module: string; ownerId?: string; ideaId: string; ideas: { id: string; name: string }[]; value: T; onRestore: (value: T, ideaId: string) => void
}) {
  const scope = `${module}:${ownerId ?? ''}:${ideaId}`
  const serialized = JSON.stringify(value)
  const allowed = ideas.map(idea => idea.id).join(',')
  const edited = useRef<string | null>(null)
  const restored = useRef<string | null>(null)
  const [state, setState] = useState<{ scope: string; pending: ModuleDraft<T> | null; status: 'loading' | 'ready' | 'saved' | 'unavailable' }>({ scope: '', pending: null, status: 'loading' })
  const pending = state.scope === scope ? state.pending : null
  useEffect(() => {
    if (!ownerId) return
    let active = true
    const timer = setTimeout(() => {
      if (!active) return
      if (restored.current === scope) { restored.current = null; return }
      try {
        const draft = readModuleDraft<T>(window.localStorage, module, ownerId, ideaId, allowed.split(','))
        if (draft && Object.entries(JSON.parse(serialized)).some(([key, reference]) => {
          const saved = (draft.value as Record<string, unknown>)[key]
          return reference === null ? saved !== null && typeof saved !== 'string' : Array.isArray(reference) ? !Array.isArray(saved)
            : typeof saved !== typeof reference || typeof saved === 'number' && !Number.isFinite(saved) || saved === null
        })) throw new Error('Invalid saved draft')
        setState({ scope, pending: draft, status: 'ready' })
      } catch { setState({ scope, pending: null, status: 'unavailable' }) }
    }, 0)
    return () => { active = false; clearTimeout(timer) }
    // Read only on account/idea change; form edits must not reopen a restore prompt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, module, ownerId, ideaId, allowed])
  useEffect(() => {
    if (!ownerId || !ideaId || edited.current !== scope || pending) return
    let active = true
    const timer = setTimeout(() => {
      if (!active || edited.current !== scope) return
      edited.current = null
      try {
        writeModuleDraft(window.localStorage, module, ownerId, ideaId, JSON.parse(serialized))
        setState({ scope, pending: null, status: 'saved' })
      } catch { setState({ scope, pending: null, status: 'unavailable' }) }
    }, 0)
    return () => { active = false; clearTimeout(timer) }
  }, [serialized, scope, module, ownerId, ideaId, pending])
  return {
    pending, status: state.scope === scope ? state.status : ownerId && ideaId ? 'loading' : 'ready',
    ideaName: ideas.find(idea => idea.id === pending?.ideaId)?.name ?? 'this idea',
    markEdited: () => { if (ownerId && ideaId) edited.current = scope },
    restore: () => {
      if (!pending || !ownerId) return
      const nextScope = `${module}:${ownerId}:${pending.ideaId}`
      restored.current = nextScope
      edited.current = nextScope
      onRestore(pending.value, pending.ideaId)
      setState({ scope: nextScope, pending: null, status: 'saved' })
    },
    discard: () => {
      if (!pending || !ownerId) return
      try { removeModuleDraft(window.localStorage, module, ownerId, pending.ideaId); setState({ scope, pending: null, status: 'ready' }) }
      catch { setState({ scope, pending: null, status: 'unavailable' }) }
    },
  }
}
export function PlanningDraftNotice({ draft, disabled = false }: { draft: ReturnType<typeof usePlanningDraft>; disabled?: boolean }) {
  return <div className="my-4 border-y border-[#E5E7EB] py-3 text-sm leading-relaxed text-[#657081]" aria-label="Draft recovery">
      {draft.pending ? <>
      <p>Draft available for <strong className="font-medium text-[#141923]">{draft.ideaName}</strong>, saved {new Date(draft.pending.savedAt).toLocaleString()}. Restoring replaces the current form.</p>
      <div className="mt-1 flex flex-wrap gap-x-5"><button type="button" disabled={disabled} onClick={draft.restore} className="min-h-11 underline underline-offset-4 text-[#141923]">Restore draft</button><button type="button" disabled={disabled} onClick={draft.discard} className="min-h-11 underline underline-offset-4">Discard stored draft</button></div>
      </> : <p role="status">{draft.status === 'loading' ? 'Checking this browser for an unfinished draft…' : draft.status === 'unavailable' ? 'Browser storage is unavailable. Keep this page open or copy your inputs before leaving.' : draft.status === 'saved' ? 'Draft saved in this browser for your account and idea.' : 'Edits are saved in this browser for your account and selected idea.'} Drafts stay on this device. Saved results are separate.</p>}
  </div>
}
