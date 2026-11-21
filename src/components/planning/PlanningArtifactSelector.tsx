'use client'
import { useEffect, useId, useState } from 'react'
import { useAccount } from '@/components/AccountProvider'

type ArtifactModule = 'lean-canvas' | 'pricing' | 'crowdfunding'
type Artifact = { id: string; module: ArtifactModule; createdAt: string | null; version?: number }
const labels: Record<ArtifactModule, string> = { 'lean-canvas': 'Lean Canvas', pricing: 'Pricing analysis', crowdfunding: 'Campaign analysis' }
const date = (value: string | null) => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleDateString() : 'Date unavailable'

export function PlanningArtifactSelector({ ideaId, module, value, onChange, disabled = false, label }: {
  ideaId: string; module: ArtifactModule; value: string; onChange: (id: string) => void; disabled?: boolean; label?: string
}) {
  const { data } = useAccount(); const selectId = useId(); const ownerId = data?.user.id
  const [pagination, setPagination] = useState({ scope: '', page: 1 })
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<{ scope: string; records: Artifact[]; hasMore: boolean; page: number; attempt: number; error: string | null } | null>(null)
  const scope = `${ownerId ?? ''}:${ideaId}:${module}`; const current = state?.scope === scope ? state : null
  const page = pagination.scope === scope ? pagination.page : 1
  useEffect(() => {
    if (!ownerId || !ideaId) return
    const controller = new AbortController()
    const base = `/api/planning/artifacts?ideaId=${encodeURIComponent(ideaId)}&module=${module}`
    const read = async (url: string) => {
      const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) })
      const body = await response.json(); if (!response.ok) throw new Error(body.error ?? 'Saved versions unavailable')
      return { records: Array.isArray(body.records) ? body.records as Artifact[] : [], hasMore: Boolean(body.hasMore) }
    }
    void read(base + '&page=' + page).then(async ({ records, hasMore }) => {
      if (value && !records.some(record => record.id === value)) records.unshift(...(await read(base + '&id=' + encodeURIComponent(value))).records)
      if (!controller.signal.aborted) setState({ scope, records, hasMore, page, attempt, error: null })
    }).catch(error => { if (!controller.signal.aborted) setState({ scope, records: [], hasMore: false, page, attempt, error: error instanceof Error ? error.message : 'Saved versions unavailable' }) })
    return () => controller.abort()
  }, [scope, ownerId, ideaId, module, value, page, attempt])
  const selected = current?.records.find(record => record.id === value)
  const loading = Boolean(ownerId && ideaId && (!current || current.page !== page || current.attempt !== attempt))
  return <div className="mt-4 border-t border-[#E5E7EB] pt-4">
    <label htmlFor={selectId} className="mb-2 block text-sm font-medium text-[#141923]">{label ?? `Use a saved ${labels[module].toLowerCase()} (optional)`}</label>
    <select id={selectId} value={value} disabled={disabled || !ideaId || loading} onChange={event => onChange(event.target.value)} className="min-h-11 w-full rounded border border-[#E5E7EB] bg-white px-3 py-2 text-sm text-[#141923]">
      <option value="">Continue without a linked version</option>
      {value && !selected && <option value={value}>Selected saved version</option>}
      {(current?.records ?? []).map(record => <option key={record.id} value={record.id}>{labels[module]}{record.version ? ` v${record.version}` : ''} · {date(record.createdAt)}</option>)}
    </select>
    <p className="mt-2 text-xs leading-relaxed text-[#657081]">Only saved versions for this idea are listed. The selected snapshot and its limits are retained with your result.</p>
    {!ideaId ? <p className="mt-2 text-xs text-[#657081]">Choose an idea to see its saved planning versions.</p> : loading ? <p role="status" className="mt-2 text-xs text-[#657081]">Loading saved versions…</p>
      : current?.error ? <p role="alert" className="mt-2 text-sm text-[#991B1B]">{current.error} <button type="button" disabled={disabled} onClick={() => setAttempt(value => value + 1)} className="underline underline-offset-4">Try again</button></p>
      : !current?.records.length && <p className="mt-2 text-xs text-[#657081]">No saved {labels[module].toLowerCase()} versions for this idea.</p>}
    {(page > 1 || current?.hasMore) && <nav aria-label={`${labels[module]} version pages`} className="mt-3 flex flex-wrap gap-x-5 text-xs">
      <button type="button" disabled={disabled || loading || page <= 1} onClick={() => setPagination({ scope, page: page - 1 })} className="min-h-11 underline underline-offset-4 disabled:opacity-40">Newer versions</button>
      <button type="button" disabled={disabled || loading || !current?.hasMore} onClick={() => setPagination({ scope, page: page + 1 })} className="min-h-11 underline underline-offset-4 disabled:opacity-40">Older versions</button>
    </nav>}
  </div>
}
