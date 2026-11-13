'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useAccount } from './AccountProvider'
import { normalizeSavedModuleRecord } from '@/lib/saved-module-result'

type Entry = { id: string; ideaId: string; name: string | null; score: number | null; createdAt: string | null }
type History = { ownerId: string; records: Entry[]; hasMore: boolean; page: number; error: string | null }

export function useSavedModuleHistory(module: 'pricing' | 'crowdfunding' | 'pitch-deck', onLoaded: (record: Record<string, any>) => void) {
  const { data } = useAccount()
  const ownerId = data?.user.id
  const search = useSearchParams()
  const pathname = usePathname()
  const router = useRouter()
  const selected = search.get('saved')
  const callback = useRef(onLoaded)
  useEffect(() => { callback.current = onLoaded }, [onLoaded])
  const [history, setHistory] = useState<History | null>(null)
  const [page, setPage] = useState(1)
  const [attempt, setAttempt] = useState(0)
  const [detailAttempt, setDetailAttempt] = useState(0)
  const [detail, setDetail] = useState<{ ownerId: string; id: string; error: string | null } | null>(null)
  const endpoint = '/api/' + module
  useEffect(() => {
    if (!ownerId) return
    const controller = new AbortController()
    void fetch(endpoint + '?page=' + page, { cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) })
      .then(async response => { const body = await response.json(); if (!response.ok) throw new Error(body.error || 'Saved work unavailable'); return body })
      .then(body => { if (!controller.signal.aborted) setHistory({ ownerId, records: Array.isArray(body.records) ? body.records : [], page, hasMore: Boolean(body.hasMore), error: null }) })
      .catch(error => { if (!controller.signal.aborted) setHistory({ ownerId, records: [], page, hasMore: false, error: error instanceof Error ? error.message : 'Saved work unavailable' }) })
    return () => controller.abort()
  }, [ownerId, endpoint, page, attempt])
  useEffect(() => {
    if (!ownerId || !selected) return
    const controller = new AbortController()
    void fetch(endpoint + '?id=' + encodeURIComponent(selected), { cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]) })
      .then(async response => { const body = await response.json(); if (!response.ok || !body.record) throw new Error(body.error || 'Saved result unavailable'); return body.record })
      .then(record => { if (!controller.signal.aborted) { callback.current(normalizeSavedModuleRecord(module, record)); setDetail({ ownerId, id: selected, error: null }) } })
      .catch(error => { if (!controller.signal.aborted) setDetail({ ownerId, id: selected, error: error instanceof Error ? error.message : 'Saved result unavailable' }) })
    return () => controller.abort()
  }, [ownerId, selected, endpoint, detailAttempt, module])
  const current = history?.ownerId === ownerId ? history : null
  const currentDetail = detail?.ownerId === ownerId && detail?.id === selected ? detail : null
  return {
    records: current?.records ?? [], page, hasMore: current?.hasMore ?? false,
    loading: Boolean(ownerId && (!current || current.page !== page)),
    opening: Boolean(ownerId && selected && !currentDetail),
    error: currentDetail?.error || current?.error || null,
    retry: () => { setAttempt(value => value + 1); setDetailAttempt(value => value + 1) }, setPage,
    open: (id: string) => router.replace(pathname + '?saved=' + encodeURIComponent(id), { scroll: false }),
    clear: () => router.replace(pathname, { scroll: false }),
    refresh: () => setAttempt(value => value + 1),
  }
}

export function SavedModuleHistory({ history, disabled = false }: { history: ReturnType<typeof useSavedModuleHistory>; disabled?: boolean }) {
  return <section className="card-angular mb-6 p-5" aria-label="Saved results">
    <h2 className="text-base font-medium mb-2">Saved results</h2>
    <p className="text-xs text-slate-600 mb-3">Reopen your saved work without using credits.</p>
    {history.error && <p role="alert" className="text-sm text-red-700 mb-3">{history.error} <button type="button" onClick={history.retry} className="underline" disabled={disabled}>Try again</button></p>}
    {history.loading || history.opening ? <p role="status" className="text-sm">{history.opening ? 'Opening your saved result…' : 'Loading saved results…'}</p> : history.records.length ? <ul className="divide-y divide-slate-200">
      {history.records.map(entry => <li key={entry.id}><button type="button" disabled={disabled} onClick={() => history.open(entry.id)} className="w-full min-h-11 py-3 flex flex-wrap items-center justify-between gap-2 text-left text-sm">
        <span>{entry.name || 'Startup idea'}</span><span className="text-xs text-slate-600">{entry.createdAt && Number.isFinite(Date.parse(entry.createdAt)) ? new Date(entry.createdAt).toLocaleDateString() : 'Date unavailable'} · {entry.score ?? '—'}/100</span>
      </button></li>)}
    </ul> : <p className="text-sm text-slate-600">Your completed results will appear here.</p>}
    {(history.page > 1 || history.hasMore) && <div className="mt-3 flex justify-between text-xs">
      <button type="button" disabled={disabled || history.loading || history.page <= 1} onClick={() => history.setPage(history.page - 1)} className="underline disabled:opacity-40">Newer results</button>
      <button type="button" disabled={disabled || history.loading || !history.hasMore} onClick={() => history.setPage(history.page + 1)} className="underline disabled:opacity-40">Older results</button>
    </div>}
  </section>
}
