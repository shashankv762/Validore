'use client'
import { useEffect, useId, useState } from 'react'
import { useAccount } from '@/components/AccountProvider'
import type { SourceReportOption } from '@/lib/planning/source-report-contract'

const displayDate = (value: string | null) => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleDateString() : 'Date unavailable'
export function SourceReportSelector({ ideaId,value,onChange,disabled=false }: { ideaId:string;value:string;onChange:(id:string)=>void;disabled?:boolean }) {
  const { data } = useAccount(); const ownerId = data?.user.id; const selectId = useId()
  const [pagination,setPagination] = useState({scope:'',page:1}); const [attempt,setAttempt] = useState(0)
  const [state,setState] = useState<{ scope:string;records:SourceReportOption[];hasMore:boolean;page:number;error:string|null } | null>(null)
  const scope = `${ownerId ?? ''}:${ideaId}`
  const page = pagination.scope === scope ? pagination.page : 1
  const current = state?.scope === scope ? state : null
  useEffect(() => {
    if (!ownerId || !ideaId) return
    const controller = new AbortController(); const signal = AbortSignal.any([controller.signal,AbortSignal.timeout(15000)])
    const base = '/api/planning/reports?ideaId='+encodeURIComponent(ideaId)
    const read = async (url:string) => {
      const response = await fetch(url,{ cache:'no-store',signal }); const body = await response.json()
      if (!response.ok) throw new Error(body.error ?? 'Saved validations unavailable')
      return body
    }
    void read(base+'&page='+page).then(async body => {
      const records:SourceReportOption[] = Array.isArray(body.records) ? body.records : []
      if (value && !records.some(record => record.id === value)) {
        const chosen = await read(base+'&id='+encodeURIComponent(value))
        records.unshift(...chosen.records)
      }
      if (!controller.signal.aborted) setState({ scope,records,hasMore:Boolean(body.hasMore),page,error:null })
    }).catch(error => { if (!controller.signal.aborted) setState({ scope,records:[],hasMore:false,page,error:error instanceof Error ? error.message : 'Saved validations unavailable' }) })
    return () => controller.abort()
  },[scope,ownerId,ideaId,page,attempt,value])
  const selected = current?.records.find(record => record.id === value)
  const loading = Boolean(ownerId && ideaId && (!current || current.page !== page))
  return <div className="border-t border-[#E5E7EB] pt-4 mt-4">
    <label htmlFor={selectId} className="mb-2 block text-sm font-medium text-[#141923]">Use a saved validation report (optional)</label>
    <select id={selectId} value={value} disabled={disabled || !ideaId} onChange={event => onChange(event.target.value)}
      className="w-full min-h-11 rounded border border-[#E5E7EB] bg-white px-3 py-2 text-sm text-[#141923]">
      <option value="">Continue without a linked report</option>
      {value && !selected && <option value={value}>Selected report · {value.slice(0,8)}</option>}
      {(current?.records ?? []).map(record => <option key={record.id} value={record.id}>
        {record.mode === 'lite' ? 'Lite' : 'Full'} · {displayDate(record.createdAt)} · {record.status === 'partial' ? 'Partial' : 'Complete'} · {record.score === null ? 'Score unavailable' : record.score+'/100'}
      </option>)}
    </select>
    <p className="mt-2 text-xs leading-relaxed text-[#657081]">Choose the report whose findings should guide this run. Prior AI assessments remain assumptions and interpretations; the report is shared privately with the planning writer.</p>
    {selected?.status === 'partial' && <p className="mt-2 text-sm leading-relaxed text-[#89620B]">This report is partial. Missing evidence and specialist work will remain disclosed in the planning output.</p>}
    {!ideaId ? <p className="mt-2 text-xs text-[#657081]">Choose an idea to see its saved validations.</p> : loading ? <p role="status" className="mt-2 text-xs text-[#657081]">Loading saved validations…</p>
      : current?.error ? <p role="alert" className="mt-2 text-sm text-[#991B1B]">{current.error} <button type="button" disabled={disabled} onClick={()=>setAttempt(value=>value+1)} className="underline underline-offset-4">Try again</button></p>
      : !current?.records.length && <p className="mt-2 text-xs text-[#657081]">No eligible saved validations for this idea. You can run this tool without one.</p>}
    {(page>1 || current?.hasMore) && <div className="mt-3 flex gap-5 text-xs">
      <button type="button" disabled={disabled || loading || page<=1} onClick={()=>setPagination({scope,page:page-1})} className="underline underline-offset-4 disabled:opacity-40">Newer validations</button>
      <button type="button" disabled={disabled || loading || !current?.hasMore} onClick={()=>setPagination({scope,page:page+1})} className="underline underline-offset-4 disabled:opacity-40">Older validations</button>
    </div>}
  </div>
}
