'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowUpRight, Check, Coins, Loader2, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { useAccount, notifyAccountUpdated } from '@/components/AccountProvider'
import { CREDIT_PACKAGES, type CreditPackageType } from '@/lib/credit-packages'
import { CREDIT_ACTIONS, PLAN_CATALOG, formatUsd } from '@/lib/plans'
import { actionAllowance, creditEntryDescription, creditOverview } from '@/lib/account-usage'
import { RewardedCredits } from '@/components/RewardedCredits'

type LedgerItem = { id: string; createdAt: string; transactionType: string; amount: number; description: string | null }
type Purchase = { id: string; creditType: string; quantity: number; status: string; createdAt: string }
type CreditHistory = { ownerId: string | null; version: string | null; entries: LedgerItem[]; purchases: Purchase[]; error: string | null; loading: boolean }
const EMPTY_HISTORY: CreditHistory = { ownerId: null, version: null, entries: [], purchases: [], error: null, loading: true }
const date = (value: string | null) => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'
const PACK_ORDER: CreditPackageType[] = ['credit_topup', 'crowdfunding', 'pitch_deck', 'bundle']

function CreditsContent() {
  const account = useAccount()
  const router = useRouter()
  const params = useSearchParams()
  const user = account.data?.user
  const [buying, setBuying] = useState<CreditPackageType | null>(null)
  const [historyState, setHistory] = useState<CreditHistory>(EMPTY_HISTORY)
  const [refreshing, setRefreshing] = useState(false)
  const [historyRefresh, setHistoryRefresh] = useState(0)
  const ownerId = user?.id
  // A focus refresh with identical balances need not download both histories.
  const historyVersion = [user?.creditBalance, user?.purchasedCredits, user?.rewardCredits, user?.crowdfundingCredits,
    user?.pitchDeckCredits, user?.creditsUsedThisCycle, user?.tier, historyRefresh].join(':')
  const history = historyState.ownerId === ownerId ? historyState : EMPTY_HISTORY
  const loadingHistory = Boolean(ownerId && (history.loading || history.version !== historyVersion))
  const available = Boolean(account.data?.billing.credits)
  const overview = user ? creditOverview(user) : null

  useEffect(() => {
    if (!ownerId) return
    const controller = new AbortController()
    const load = async (url: string) => {
      const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]) })
      if (!response.ok) throw new Error('History unavailable')
      return response.json()
    }
    void Promise.allSettled([load('/api/credits/ledger?limit=50'), load('/api/credits/purchase')]).then(([ledger, purchases]) => {
      if (controller.signal.aborted) return
      setHistory(previous => ({
        ownerId, version: historyVersion,
        entries: ledger.status === 'fulfilled' && Array.isArray(ledger.value.entries) ? ledger.value.entries : previous.ownerId === ownerId ? previous.entries : [],
        purchases: purchases.status === 'fulfilled' && Array.isArray(purchases.value.purchases) ? purchases.value.purchases : previous.ownerId === ownerId ? previous.purchases : [],
        error: ledger.status === 'rejected' || purchases.status === 'rejected' ? 'Some credit history could not be refreshed. Please try again.' : null,
        loading: false,
      }))
    })
    return () => controller.abort()
  }, [ownerId, historyVersion])

  useEffect(() => {
    if (params.get('success') === 'true') {
      toast.info('Payment confirmation is processing. Your balance updates after confirmation.')
      notifyAccountUpdated()
      const timer = window.setInterval(notifyAccountUpdated, 4_000)
      const end = window.setTimeout(() => { window.clearInterval(timer); router.replace('/dashboard/credits') }, 32_000)
      return () => { window.clearInterval(timer); window.clearTimeout(end) }
    }
    if (params.get('canceled') === 'true') { toast.info('Checkout was cancelled.'); router.replace('/dashboard/credits') }
  }, [params, router])

  const reload = async () => { setRefreshing(true); try { await account.refresh(); setHistoryRefresh(value => value + 1) } finally { setRefreshing(false) } }
  const purchase = async (creditType: CreditPackageType) => {
    if (!available || buying) return
    setBuying(creditType)
    try {
      const response = await fetch('/api/credits/purchase', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ creditType, quantity: 1, provider: 'stripe' }), signal: AbortSignal.timeout(25_000) })
      const data = await response.json()
      if (!response.ok || !data.url) throw new Error(data.error || 'Checkout is unavailable. Please try again.')
      window.location.assign(data.url)
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Checkout is unavailable. Please try again.') }
    finally { setBuying(null) }
  }

  return <div className="space-y-8 pb-12">
    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#E5E7EB] pb-6">
      <div><span className="inline-flex items-center gap-2 text-xs font-medium text-[#89620B]"><Coins size={15} aria-hidden="true" /> Your research allowance</span>
        <h1 className="mt-2 text-3xl font-light tracking-tight">Credits</h1><p className="mt-2 max-w-xl text-sm text-[#53616A]">See your balance, plan your next analysis, and add credits when you need them.</p></div>
      <button type="button" onClick={reload} disabled={refreshing || account.loading || loadingHistory} className="inline-flex min-h-11 items-center gap-2 rounded border border-[#D7DCE2] bg-white px-4 text-sm disabled:opacity-50"><RefreshCw size={15} aria-hidden="true" className={refreshing || loadingHistory ? 'animate-spin' : ''} />Refresh balance</button>
    </div>
    {account.error && <p role="alert" className="rounded border border-amber-300 bg-amber-50 p-4 text-sm">{account.error}</p>}
    {!user && <p role="status" className="text-sm text-[#53616A]">{account.loading ? 'Loading your balance…' : 'Refresh to load your account.'}</p>}
    {user && overview && <>
      <section className="card-angular grid gap-8 bg-[#FBF8F0] p-6 sm:p-8 md:grid-cols-2">
        <div><p className="text-sm text-[#53616A]">Credits available</p><p className="mt-2 text-5xl font-light tabular-nums">{overview.total.toLocaleString()}</p>
          <p className="mt-4 text-sm">{PLAN_CATALOG[user.tier].name} · {formatUsd(PLAN_CATALOG[user.tier].monthlyPriceUsd)}{user.tier === 'free' ? '' : '/month'}</p>
          <Link href="/dashboard/settings" className="mt-2 inline-flex min-h-11 items-center gap-2 text-sm underline underline-offset-4">Manage plan<ArrowUpRight size={14} aria-hidden="true" /></Link></div>
        <div className="space-y-4"><div className="flex items-baseline justify-between gap-3 text-sm"><span>Plan credits remaining</span><strong className="tabular-nums">{overview.monthlyRemaining.toLocaleString()} / {overview.allocation.toLocaleString()}</strong></div>
          <progress max={overview.allocation} value={overview.monthlySpent} aria-label="Plan credits used" className="h-2 w-full accent-[#89620B]" />
          <p className="text-xs text-[#53616A]">Renews {date(user.creditResetAt)}. Unused plan credits reset each cycle.</p>
          <div className="border-t border-[#E4DECF] pt-4 text-sm"><strong className="tabular-nums">{overview.purchasedRemaining.toLocaleString()}</strong> purchased credits · carry forward</div>
          <div className="text-sm"><strong className="tabular-nums">{overview.rewardRemaining.toLocaleString()}</strong> earned ad credits · carry forward</div>
          <p className="text-xs text-[#53616A]">Module credits: {user.crowdfundingCredits} crowdfunding · {user.pitchDeckCredits} pitch deck.</p></div>
      </section>
      <RewardedCredits key={user.id} ownerId={user.id} emailVerified={user.emailVerified} />
      <section className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-medium">What you can run</h2><p className="mt-1 text-xs text-[#53616A]">Each row is a separate estimate using your current balance. Plan and validation limits apply.</p></div>
        <Link href="/dashboard/usage" className="inline-flex min-h-11 items-center gap-2 text-sm">View usage<ArrowUpRight size={16} aria-hidden="true" /></Link></div>
        <div className="overflow-x-auto rounded border border-[#E5E7EB] bg-white"><table className="w-full min-w-[540px] text-left text-sm"><thead className="bg-[#F7F8FA] text-xs text-[#53616A]"><tr><th scope="col" className="p-4">Analysis</th><th scope="col" className="p-4">Cost per run</th><th scope="col" className="p-4">Access</th><th scope="col" className="p-4 text-right">Available runs</th></tr></thead>
          <tbody className="divide-y divide-[#E5E7EB]">{CREDIT_ACTIONS.map(item => { const allowance = actionAllowance(user, item.key); return <tr key={item.key}>
            <td className="p-4 font-medium">{item.name}</td><td className="p-4 tabular-nums">{allowance.unit === 'module credit' ? '1 module credit' : `${item.cost} credits`}</td>
            <td className="p-4 text-xs text-[#53616A]">{item.access}</td><td className="p-4 text-right tabular-nums">{allowance.permitted ? allowance.runs.toLocaleString() : 'Requires access'}</td>
          </tr> })}</tbody></table></div>
        <p className="text-xs text-[#53616A]">A module credit pays for one run of that module. Max Premium uses universal credits for its included tools. PDF and Word validation downloads are included.</p>
        <p className="text-xs text-[#53616A]">Plan credits are used first, then earned credits, then purchased credits. On the Free plan, each additional Lite validation beyond the two included runs uses 50 earned credits only. Reopening a saved report and downloading it do not spend more credits.</p>
      </section>
    </>}
    <section className="space-y-4"><div><h2 className="font-medium">Add to your workspace</h2><p className="mt-1 text-sm text-[#53616A]">One-time purchases in USD. Your plan stays the same.</p></div>
      {!account.loading && !available && <p role="status" className="rounded border border-[#E5E7EB] bg-white p-4 text-sm text-[#53616A]">Credit purchases are coming soon. You can use the credits already included in your plan.</p>}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{PACK_ORDER.map(key => { const pack = CREDIT_PACKAGES[key]; return <article key={key} className="card-angular flex flex-col bg-white p-5">
        <h3 className="font-medium">{pack.name}</h3><p className="mt-4 text-3xl font-light tabular-nums">{formatUsd(pack.amountUsd)}<span className="ml-2 text-xs text-[#53616A]">once</span></p>
        <p className="mb-5 mt-3 flex-1 text-sm leading-relaxed text-[#53616A]">{key === 'credit_topup' ? `${CREDIT_PACKAGES.credit_topup.credits.universalCredits.toLocaleString()} universal credits. Purchased credits carry forward; feature and validation limits still apply.` : key === 'bundle' ? 'One crowdfunding analysis and one pitch deck, with their included exports.' : key === 'crowdfunding' ? 'One campaign feasibility analysis, without a subscription upgrade.' : 'One investor pitch deck, with PPTX export.'}</p>
        <button type="button" onClick={() => purchase(key)} disabled={Boolean(buying) || !available || !user} className="inline-flex min-h-11 items-center justify-center gap-2 rounded bg-[#141923] px-3 text-sm text-white disabled:cursor-not-allowed disabled:opacity-50">{buying === key ? <Loader2 size={16} aria-hidden="true" className="animate-spin" /> : <Check size={15} aria-hidden="true" />}{available ? 'Buy for ' + formatUsd(pack.amountUsd) : 'Coming soon'}</button>
      </article> })}</div>
    </section>
    <section className="space-y-4"><h2 className="font-medium">Credit history</h2>
      {history.error && <p role="alert" className="text-sm text-amber-900">{history.error}</p>}
      <div className="overflow-x-auto rounded border border-[#E5E7EB] bg-white"><table className="w-full min-w-[560px] text-left text-sm"><thead className="bg-[#F7F8FA] text-xs text-[#53616A]"><tr><th scope="col" className="p-4">Date</th><th scope="col" className="p-4">Activity</th><th scope="col" className="p-4 text-right">Change</th><th scope="col" className="p-4">Details</th></tr></thead>
        <tbody className="divide-y divide-[#E5E7EB]">{history.loading ? <tr><td colSpan={4} className="p-8 text-center text-[#53616A]">{user ? 'Loading history…' : 'Load your account to view history.'}</td></tr> : history.entries.length ? history.entries.map(item => <tr key={item.id}>
          <td className="whitespace-nowrap p-4 text-[#53616A]">{date(item.createdAt)}</td><td className="p-4 capitalize">{item.transactionType.toLowerCase().replaceAll('_', ' ')}</td>
          <td className={'whitespace-nowrap p-4 text-right tabular-nums ' + (item.amount > 0 ? 'text-emerald-800' : 'text-[#141923]')}>{item.amount > 0 ? '+' : ''}{item.amount.toLocaleString()} {item.transactionType.endsWith('_PACK') ? 'runs' : 'credits'}</td>
          <td className="max-w-sm break-words p-4 text-xs text-[#53616A]">{creditEntryDescription(item.description)}</td>
        </tr>) : <tr><td colSpan={4} className="p-8 text-center text-[#53616A]">No recorded credit transactions yet.</td></tr>}</tbody></table></div>
      <p className="text-xs text-[#53616A]">Showing the latest 50 transactions. Credit balances refresh after each analysis and when you return to this workspace.</p>
    </section>
    {history.purchases.length > 0 && <section className="space-y-4"><h2 className="font-medium">Purchase history</h2><div className="overflow-x-auto rounded border border-[#E5E7EB] bg-white"><table className="w-full min-w-[440px] text-left text-sm"><thead className="bg-[#F7F8FA] text-xs text-[#53616A]"><tr><th scope="col" className="p-4">Date</th><th scope="col" className="p-4">Package</th><th scope="col" className="p-4">Quantity</th><th scope="col" className="p-4">Status</th></tr></thead><tbody className="divide-y divide-[#E5E7EB]">{history.purchases.map(item => <tr key={item.id}><td className="p-4">{date(item.createdAt)}</td><td className="p-4">{CREDIT_PACKAGES[item.creditType as CreditPackageType]?.name ?? item.creditType}</td><td className="p-4 tabular-nums">{item.quantity}</td><td className="p-4 capitalize">{item.status}</td></tr>)}</tbody></table></div></section>}
  </div>
}

export default function CreditsPage() {
  return <Suspense fallback={<p role="status" className="p-8 text-sm text-[#53616A]">Loading credits…</p>}><CreditsContent /></Suspense>
}
