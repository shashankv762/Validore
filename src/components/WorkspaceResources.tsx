'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useAccount } from './AccountProvider'

type ResourceState = {
  ownerId: string | null
  ideas: { id: string; name: string }[]
  loading: boolean
  error: string | null
}

export function useWorkspaceResources() {
  const account = useAccount()
  const ownerId = account.data?.user.id
  const [state, setState] = useState<ResourceState>({ ownerId: null, ideas: [], loading: true, error: null })
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (!ownerId) return
    const requestOwnerId = ownerId
    const controller = new AbortController()
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)])
    async function load() {
      try {
        const response = await fetch('/api/ideas', { signal, cache: 'no-store' })
        if (response.status === 401) throw new Error('Your session has expired. Sign in again to continue.')
        if (!response.ok) throw new Error('Your workspace could not be loaded. Please try again.')
        const ideas = await response.json()
        if (!controller.signal.aborted) setState({ ownerId: requestOwnerId, ideas: ideas.ideas ?? [], loading: false, error: null })
      } catch (error) {
        if (!controller.signal.aborted) setState({ ownerId: requestOwnerId, ideas: [], loading: false,
          error: error instanceof Error && !['AbortError', 'TimeoutError', 'TypeError'].includes(error.name)
            ? error.message : 'Your workspace could not be loaded. Check your connection and try again.' })
      }
    }
    void load()
    return () => controller.abort()
  }, [ownerId, attempt])
  const current = state.ownerId === ownerId
  return { ideas: current ? state.ideas : [], user: account.data?.user ?? null,
    loading: account.loading || Boolean(ownerId && (!current || state.loading)),
    error: (current ? state.error : null) || (account.data ? null : account.error),
    retry: () => { void account.refresh(); setState(current => ({ ...current, loading: true, error: null })); setAttempt(current => current + 1) } }
}

export function WorkspaceResourceStatus({ loading, error, retry }: { loading: boolean; error: string | null; retry: () => void }) {
  if (loading) return <div className="workspace-loading" role="status"><Loader2 className="animate-spin" size={18} /> Loading your workspace…</div>
  return <div className="card-angular mx-auto max-w-xl p-8 text-center" role="alert">
    <h1 className="text-xl font-medium mb-3">Workspace unavailable</h1>
    <p className="text-sm text-slate-600 leading-relaxed">{error}</p>
    <button type="button" onClick={retry} className="mt-5 min-h-11 rounded-md bg-[#141923] px-5 text-sm text-white">Try again</button>
  </div>
}
