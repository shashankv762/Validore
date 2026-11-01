'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Activity, ArrowUpRight, Coins, Cpu, RefreshCw } from 'lucide-react'
import { useAccount } from '@/components/AccountProvider'
import { creditOverview } from '@/lib/account-usage'
import { PLAN_CATALOG } from '@/lib/plans'
import type { UsageSnapshot } from '@/lib/usage-types'

const date = (value: string | null) => value ? new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Not scheduled'
const labels: Record<string, string> = { pending: 'Queued', running: 'Researching', complete: 'Complete', partial: 'Partial report', failed: 'Failed' }
type UsageState = { ownerId: string; accountUpdatedAt: number | null; data: UsageSnapshot | null; error: string | null }

export default function UsagePage() {
  const account = useAccount()
  const [snapshot, setSnapshot] = useState<UsageState | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const user = account.data?.user
  const ownerId = user?.id
  const current = snapshot?.ownerId === ownerId ? snapshot : null
  const usage = current?.data ?? null
  const error = current?.error ?? null
  const loadingUsage = Boolean(ownerId && (!current || current.accountUpdatedAt !== account.updatedAt))

  useEffect(() => {
    if (!ownerId) return
    const controller = new AbortController()
    void fetch('/api/usage', { cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20_000)]) })
      .then(async response => { if (!response.ok) throw new Error('Usage could not be loaded. Please try again.'); return response.json() as Promise<UsageSnapshot> })
      .then(data => { if (!controller.signal.aborted) setSnapshot({ ownerId, accountUpdatedAt: account.updatedAt, data, error: null }) })
      .catch(() => {
        if (!controller.signal.aborted) setSnapshot(previous => ({ ownerId, accountUpdatedAt: account.updatedAt,
          data: previous?.ownerId === ownerId ? previous.data : null,
          error: 'Usage could not be loaded. Your existing reports are still available.',
        }))
      })
    return () => controller.abort()
  }, [ownerId, account.updatedAt])

  const reload = async () => {
    setRefreshing(true)
    try { await account.refresh() } finally { setRefreshing(false) }
  }
  const overview = user ? creditOverview(user) : null
  const largest = Math.max(1, ...(usage?.activity.map(item => item.credits) ?? []))

  return <div className="space-y-8 pb-12">
    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#E5E7EB] pb-6">
      <div><span className="inline-flex items-center gap-2 text-xs font-medium text-[#89620B]"><Activity size={15} aria-hidden="true" /> Your workspace activity</span>
        <h1 className="mt-2 text-3xl font-light tracking-tight">Usage</h1>
        <p className="mt-2 max-w-xl text-sm text-[#53616A]">Follow your research activity, credit spending, and recorded AI token usage.</p></div>
      <button type="button" onClick={reload} disabled={refreshing || account.loading || loadingUsage} className="inline-flex min-h-11 items-center gap-2 rounded border border-[#D7DCE2] bg-white px-4 text-sm disabled:opacity-50">
        <RefreshCw size={15} aria-hidden="true" className={refreshing || loadingUsage ? 'animate-spin' : ''} />Refresh
      </button>
    </div>
    {(error || account.error) && <p role="alert" className="rounded border border-amber-300 bg-amber-50 p-4 text-sm">{error || account.error}</p>}
    {(!user || (!usage && !error)) && <p role="status" className="text-sm text-[#53616A]">{account.error && !user ? 'Refresh to load your account.' : 'Loading your usage…'}</p>}
    {user && overview && <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { title: 'Available credits', value: overview.total.toLocaleString(), note: PLAN_CATALOG[user.tier].name + ' plan', icon: Coins },
          { title: 'Credits spent this cycle', value: user.creditsUsedThisCycle.toLocaleString(), note: 'After recorded refunds', icon: Activity },
          { title: 'Validation runs', value: usage ? usage.validations.total.toLocaleString() : '—', note: usage ? `${usage.validations.active} in progress · ${usage.validations.failed} failed` : 'Loading activity', icon: Activity },
          { title: 'Recorded validation tokens', value: usage ? usage.validations.tokens.toLocaleString() : '—', note: 'Input and output reported by providers', icon: Cpu },
        ].map(({ title, value, note, icon: Icon }) => <section key={title} className="card-angular bg-white p-5">
          <div className="flex items-center justify-between gap-2 text-xs text-[#53616A]"><h2>{title}</h2><Icon size={16} aria-hidden="true" /></div>
          <p className="mt-4 text-3xl font-light tabular-nums">{value}</p><p className="mt-2 text-xs text-[#53616A]">{note}</p>
        </section>)}
      </div>
      <section className="card-angular bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-4"><div><h2 className="font-medium">Your credit allowance</h2>
          <p className="mt-1 text-sm text-[#53616A]">{overview.monthlyRemaining.toLocaleString()} of {overview.allocation.toLocaleString()} plan credits remaining. Renews {date(user.creditResetAt)}.</p></div>
          <Link href="/dashboard/credits" className="inline-flex min-h-11 items-center gap-2 text-sm font-medium">Manage credits<ArrowUpRight size={16} aria-hidden="true" /></Link></div>
        <progress aria-label="Plan credits used" max={overview.allocation} value={overview.monthlySpent} className="mt-5 h-2 w-full accent-[#89620B]" />
        <p className="mt-3 text-xs text-[#53616A]">{overview.purchasedRemaining.toLocaleString()} purchased credits carry forward. Module credits: {user.crowdfundingCredits} crowdfunding · {user.pitchDeckCredits} pitch deck.</p>
      </section>
    </>}
    {usage && <>
      <section className="card-angular bg-white p-6">
        <h2 className="font-medium">Credit spending by activity</h2>
        <p className="mt-1 text-xs text-[#53616A]">{date(usage.period.start)} – {date(usage.period.end)}. Debits before refunds; module credits are counted separately.</p>
        {usage.activity.length ? <div className="mt-6 grid gap-5 sm:grid-cols-2">{usage.activity.map(item => <div key={item.action}>
          <div className="flex justify-between gap-4 text-sm"><span className="capitalize">{item.action.toLowerCase().replaceAll('_', ' ')}</span><span className="tabular-nums">{item.credits.toLocaleString()} credits</span></div>
          <div className="mt-2 h-2 overflow-hidden rounded bg-[#EDF0F3]"><div className="h-full rounded bg-[#89620B]" style={{ width: `${item.credits / largest * 100}%` }} /></div>
          <p className="mt-1 text-xs text-[#53616A]">{item.transactions} {item.transactions === 1 ? 'transaction' : 'transactions'}</p>
        </div>)}</div> : <p className="mt-5 text-sm text-[#53616A]">No universal credits spent in this cycle yet.</p>}
      </section>
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-medium">Recent validations</h2><Link href="/dashboard/reports" className="inline-flex min-h-11 items-center gap-2 text-sm">View reports<ArrowUpRight size={16} aria-hidden="true" /></Link></div>
        <div className="overflow-x-auto rounded border border-[#E5E7EB] bg-white"><table className="w-full min-w-[560px] text-left text-sm">
          <thead className="bg-[#F7F8FA] text-xs text-[#53616A]"><tr><th scope="col" className="p-4">Idea</th><th scope="col" className="p-4">Research</th><th scope="col" className="p-4">Status</th><th scope="col" className="p-4 text-right">Tokens</th><th scope="col" className="p-4">Started</th></tr></thead>
          <tbody className="divide-y divide-[#E5E7EB]">{usage.recentJobs.length ? usage.recentJobs.map(job => <tr key={job.id}>
            <td className="max-w-64 break-words p-4 font-medium">{job.ideaName}</td><td className="p-4">{job.isLite ? 'Lite' : 'Full'}</td>
            <td className="p-4"><span className={'rounded px-2 py-1 text-xs ' + (job.status === 'failed' ? 'bg-rose-50 text-rose-800' : job.status === 'complete' ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-900')}>{labels[job.status] || job.status}</span></td>
            <td className="p-4 text-right tabular-nums">{job.tokensUsed ? job.tokensUsed.toLocaleString() : '—'}</td><td className="whitespace-nowrap p-4 text-[#53616A]">{date(job.createdAt)}</td>
          </tr>) : <tr><td colSpan={5} className="p-8 text-center text-[#53616A]">Your first validation will appear here. <Link href="/dashboard" className="underline">Explore an idea</Link>.</td></tr>}</tbody>
        </table></div>
        <p className="text-xs leading-relaxed text-[#53616A]">Token counts cover recorded validation runs, including their research and report calls. Other tools and unreported provider usage are not included. Credits are the app allowance, not a token-to-dollar conversion.</p>
        <p className="text-xs text-[#53616A]">Updated {new Date(usage.updatedAt).toLocaleTimeString()}.</p>
      </section>
    </>}
  </div>
}
