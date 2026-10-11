'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import {
  Rocket,
  Presentation,
  Check,
  CreditCard,
  Clock,
  Loader2,
  RefreshCw,
  AlertTriangle,
  Coins,
  X,
} from 'lucide-react'

interface UserData {
  id?: string
  email?: string
  tier?: 'free' | 'premium' | 'max_premium' | string
  crowdfundingCredits: number
  pitchDeckCredits: number
  validationsThisMonth: number
  creditBalance?: number
  purchasedCredits?: number
  creditsUsedThisCycle?: number
  creditResetAt?: string | null
  currentPeriodEnd?: string | null
  isFoundingMember?: boolean
}

interface PurchaseRecord {
  id: string
  creditType: string
  quantity: number
  amountUsd: number
  status: string
  stripePaymentIntentId?: string | null
  razorpayOrderId?: string | null
  createdAt: string
}

interface LedgerItem {
  id: string
  date: string
  action: string
  amount: number
  balanceAfter: number
  reference: string
  status: string
}

const ACTION_COSTS = [
  {
    action: 'Lite Validation',
    cost: 50,
    tierBadge: 'Free / Lite',
    description: 'Fast single-prompt preliminary market viability scan',
  },
  {
    action: 'Deep 40-Section Validation',
    cost: 300,
    tierBadge: 'Pro / Max',
    description: 'Autonomous 40-section intelligence dossier with live search citations',
  },
  {
    action: 'AI Lean Canvas Automation',
    cost: 200,
    tierBadge: 'Pro / Max',
    description: 'Multi-block hypothesis synthesis & riskiest assumption testing',
  },
  {
    action: 'Crowdfunding Predictor',
    cost: 500,
    tierBadge: 'Max / $49 Pack',
    description: 'Backer demand forecasting & 10-category synthetic benchmark analysis',
  },
  {
    action: 'Pitch Deck Builder',
    cost: 800,
    tierBadge: 'Max / $49 Pack',
    description: 'Institutional 12-slide deck, founder scripts, & 20 investor Q&As',
  },
  {
    action: 'Pricing Simulator',
    cost: 250,
    tierBadge: 'Pro / Max',
    description: 'Van Westendorp sensitivity analysis & price elasticity modeling',
  },
]

function CreditsContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [user, setUser] = useState<UserData>({
    crowdfundingCredits: 0,
    pitchDeckCredits: 0,
    validationsThisMonth: 0,
    tier: 'free',
    isFoundingMember: false,
  })
  const [purchases, setPurchases] = useState<PurchaseRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [buyingPackage, setBuyingPackage] = useState<string | null>(null)
  const [demoModalOpen, setDemoModalOpen] = useState(false)
  const [pendingDemoPackage, setPendingDemoPackage] = useState<string | null>(null)

  const [daysUntilReset, setDaysUntilReset] = useState(30)

  const reloadData = () => {
    setLoading(true)
    fetch('/api/credits/purchase')
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (data?.user) {
          setUser(prev => ({ ...prev, ...data.user }))
          const targetStr = data.user.creditResetAt || data.user.currentPeriodEnd
          if (targetStr) {
            const target = new Date(targetStr).getTime()
            const diff = Math.ceil((target - Date.now()) / (1000 * 60 * 60 * 24))
            if (diff > 0) setDaysUntilReset(diff)
          }
        }
        if (Array.isArray(data?.purchases)) {
          setPurchases(data.purchases)
        }
        setLoading(false)
      })
      .catch(() => {
        fetch('/api/me')
          .then(r => (r.ok ? r.json() : null))
          .then(meData => {
            if (meData?.user) {
              setUser(meData.user)
            }
            setLoading(false)
          })
          .catch(() => setLoading(false))
      })
  }

  // Load data on mount without synchronous setState in effect
  useEffect(() => {
    fetch('/api/credits/purchase')
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (data?.user) {
          setUser(prev => ({ ...prev, ...data.user }))
          const targetStr = data.user.creditResetAt || data.user.currentPeriodEnd
          if (targetStr) {
            const target = new Date(targetStr).getTime()
            const diff = Math.ceil((target - Date.now()) / (1000 * 60 * 60 * 24))
            if (diff > 0) setDaysUntilReset(diff)
          }
        }
        if (Array.isArray(data?.purchases)) {
          setPurchases(data.purchases)
        }
        setLoading(false)
      })
      .catch(() => {
        fetch('/api/me')
          .then(r => (r.ok ? r.json() : null))
          .then(meData => {
            if (meData?.user) {
              setUser(meData.user)
            }
            setLoading(false)
          })
          .catch(() => setLoading(false))
      })
  }, [])

  // Handle URL feedback parameters (?success=true or ?canceled=true)
  useEffect(() => {
    const success = searchParams.get('success')
    const canceled = searchParams.get('canceled')

    if (success === 'true') {
      toast.success('Payment completed! Your compute credits have been added to your balance.')
      router.replace('/dashboard/credits')
    } else if (canceled === 'true') {
      toast.info('Checkout cancelled. No charges were made to your payment method.')
      router.replace('/dashboard/credits')
    }
  }, [searchParams, router])

  // Credit calculations
  const tierAllocation =
    user.tier === 'max_premium' ? 4500 : user.tier === 'premium' ? 1500 : 100

  const monthlyUsed =
    user.creditsUsedThisCycle ?? Math.min(tierAllocation, (user.validationsThisMonth || 0) * 300)

  const monthlyRemaining = Math.max(0, tierAllocation - monthlyUsed)

  const purchasedBonus =
    user.purchasedCredits ??
    (user.crowdfundingCredits * 500 + user.pitchDeckCredits * 800)

  const totalAvailableCredits =
    user.creditBalance !== undefined && user.creditBalance !== null
      ? user.creditBalance + (user.purchasedCredits ?? 0)
      : monthlyRemaining + purchasedBonus

  const monthlyUsagePercent = Math.min(
    100,
    Math.round((monthlyUsed / tierAllocation) * 100)
  )

  async function handlePurchase(creditType: 'crowdfunding' | 'pitch_deck' | 'bundle' | 'credit_topup') {
    try {
      setBuyingPackage(creditType)
      const res = await fetch('/api/credits/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creditType,
          quantity: 1,
          provider: 'stripe',
        }),
      })

      const data = await res.json()

      if (res.ok && data.url) {
        toast.info('Redirecting to secure Stripe Checkout...')
        window.location.href = data.url
      } else if (res.status === 503 || !data.configured) {
        // Stripe unconfigured in dev/demo mode: open graceful demo modal
        setPendingDemoPackage(creditType)
        setDemoModalOpen(true)
      } else {
        toast.error(data.error || 'Failed to initiate checkout. Please try again.')
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Network error'
      toast.error(`Checkout error: ${msg}`)
    } finally {
      setBuyingPackage(null)
    }
  }

  const simulateDemoPurchase = () => {
    if (pendingDemoPackage === 'credit_topup') {
      setUser(prev => ({
        ...prev,
        purchasedCredits: (prev.purchasedCredits || 0) + 2000,
      }))
      toast.success('Demo Top-Up: Added 2,000 bonus credits to your account!')
    } else if (pendingDemoPackage === 'crowdfunding') {
      setUser(prev => ({
        ...prev,
        purchasedCredits: (prev.purchasedCredits || 0) + 500,
        crowdfundingCredits: prev.crowdfundingCredits + 1,
      }))
      toast.success('Demo Top-Up: Added 1 Crowdfunding run credit (500 credits)!')
    } else if (pendingDemoPackage === 'pitch_deck') {
      setUser(prev => ({
        ...prev,
        purchasedCredits: (prev.purchasedCredits || 0) + 800,
        pitchDeckCredits: prev.pitchDeckCredits + 1,
      }))
      toast.success('Demo Top-Up: Added 1 Pitch Deck run credit (800 credits)!')
    }
    setDemoModalOpen(false)
    setPendingDemoPackage(null)
  }

  const [ledgerEntries, setLedgerEntries] = useState<any[]>([])
  const [ledgerLoading, setLedgerLoading] = useState(true)

  useEffect(() => {
    fetch('/api/credits/ledger?limit=50')
      .then(r => r.json())
      .then(data => setLedgerEntries(data.entries || []))
      .catch(() => setLedgerEntries([]))
      .finally(() => setLedgerLoading(false))
  }, [])

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr)
      return d.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    } catch {
      return dateStr
    }
  }

  return (
    <div className="space-y-10 pb-16">
      {/* Low-Credit Warning Banner */}
      {totalAvailableCredits < 100 && (
        <div className="p-4 bg-amber-500/15 border border-amber-500/40 rounded-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0 text-amber-700">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-amber-900">
                Running Low on Compute Credits ({totalAvailableCredits} credits remaining)
              </h4>
              <p className="text-xs text-amber-800/80 mt-0.5">
                Deep validation engines require at least 50 credits. Buy a top-up pack to keep building without interruption.
              </p>
            </div>
          </div>
          <button
            onClick={() => handlePurchase('bundle')}
            disabled={buyingPackage !== null}
            className="px-4 py-2 text-xs font-semibold bg-[#0A1628] text-[#FAFAF7] hover:bg-[#C8A860] hover:text-[#0A1628] rounded transition-colors whitespace-nowrap self-stretch sm:self-auto"
          >
            Buy Top-Up Pack ($49)
          </button>
        </div>
      )}

      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#E8E0D0] pb-6">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-xs font-medium bg-[#C8A860]/15 text-[#96792b] mb-2 uppercase tracking-wider">
            <Coins className="w-3.5 h-3.5" />
            <span>Compute Credit Economy</span>
          </div>
          <h1 className="text-3xl font-light text-[#0A1628] tracking-tight">Credits & Usage</h1>
          <p className="text-sm text-[#1C1C1C]/70 mt-1 max-w-2xl">
            Credits burn proportionally to computational weight. Universal credits never expire and roll over indefinitely.
          </p>
        </div>
        <button
          onClick={reloadData}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3 py-2 text-xs text-[#0A1628] hover:text-[#96792b] border border-[#E8E0D0] bg-[#FAFAF7] rounded transition-colors self-start md:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Balance</span>
        </button>
      </div>

      {/* Hero Balance Card */}
      <section className="card-angular p-8 bg-gradient-to-br from-[#FAFAF7] via-[#F7F4EC] to-[#EFE7D8] border-2 border-[#C8A860]/40 shadow-sm relative overflow-hidden">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8 relative z-10">
          <div className="space-y-4 max-w-md">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-[#1C1C1C]/60">
                Total Available Compute Credits
              </span>
              <div className="text-5xl font-light font-mono text-[#0A1628] mt-1 flex items-baseline gap-2">
                <span>{loading ? '—' : totalAvailableCredits.toLocaleString()}</span>
                <span className="text-sm font-sans font-normal text-[#1C1C1C]/60">credits</span>
              </div>
            </div>

            {/* Purchased Credits Callout */}
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#C8A860]/20 text-[#0A1628] text-xs font-medium border border-[#C8A860]/30">
              <span>🎁</span>
              <span>
                <strong>{purchasedBonus.toLocaleString()}</strong> bonus credits (never expire)
              </span>
            </div>
          </div>

          <div className="flex-1 max-w-lg space-y-4">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[#1C1C1C]/70 font-medium">Monthly Allocation Used</span>
              <span className="font-mono text-[#0A1628]">
                {monthlyUsed.toLocaleString()} / {tierAllocation.toLocaleString()} credits ({monthlyUsagePercent}%)
              </span>
            </div>

            {/* Visual Progress Bar */}
            <div className="w-full bg-[#E8E0D0] h-3 rounded-full overflow-hidden p-0.5">
              <div
                className="bg-gradient-to-r from-[#C8A860] to-[#0A1628] h-full rounded-full transition-all duration-500"
                style={{ width: `${monthlyUsagePercent}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-xs text-[#1C1C1C]/65 pt-1">
              <span className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-[#C8A860]" />
                <span>Resets in <strong>{daysUntilReset} days</strong></span>
              </span>
              <span>
                Tier: <strong className="capitalize">{user.tier?.replace('_', ' ') || 'Free'}</strong>
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* 6-Row Credit Cost Guide with Dynamic Calculator */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[#1C1C1C]/60">
              Credit Cost Guide & Run Projection
            </h2>
            <p className="text-sm text-[#0A1628] mt-0.5">
              Computational cost per action with your real-time remaining run allowance
            </p>
          </div>
        </div>

        <div className="overflow-x-auto border border-[#E8E0D0] rounded bg-[#FAFAF7]">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-[#EFE7D8]/60 border-b border-[#E8E0D0] text-[#0A1628] font-semibold">
                <th className="py-3 px-4">Action</th>
                <th className="py-3 px-4">Credit Cost</th>
                <th className="py-3 px-4 hidden md:table-cell">Computational Scope</th>
                <th className="py-3 px-4 text-right">You Can Run</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E8E0D0]">
              {ACTION_COSTS.map(item => {
                const runs = Math.floor(totalAvailableCredits / item.cost)
                return (
                  <tr key={item.action} className="hover:bg-[#F5F0E8]/50 transition-colors">
                    <td className="py-3.5 px-4 font-medium text-[#0A1628]">
                      <div>{item.action}</div>
                      <span className="text-[10px] text-[#96792b] font-medium bg-[#C8A860]/10 px-1.5 py-0.5 rounded md:hidden mt-0.5 inline-block">
                        {item.tierBadge}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-mono font-medium text-[#0A1628]">
                      <span className="px-2 py-0.5 bg-[#0A1628]/5 rounded border border-[#E8E0D0]">
                        {item.cost} cr
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-[#1C1C1C]/70 hidden md:table-cell">
                      {item.description}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <span
                        className={`font-mono font-semibold px-2.5 py-1 rounded-full ${
                          runs > 0
                            ? 'bg-emerald-500/10 text-emerald-800 border border-emerald-500/20'
                            : 'bg-rose-500/10 text-rose-800 border border-rose-500/20'
                        }`}
                      >
                        {runs} {runs === 1 ? 'more run' : 'more runs'}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* 3 Credit Pack Purchase CTAs */}
      <section className="space-y-4">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[#1C1C1C]/60">
            Modular Credit Store
          </h2>
          <p className="text-lg font-light text-[#0A1628] mt-0.5">
            Purchase on-demand packs with instant activation (Credits never expire)
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
          {/* Card 1: Credit Top-Up Pack (FEATURED) */}
          <div className="card-angular p-6 flex flex-col justify-between bg-[#FAFAF7] border-2 border-[#C8A860] relative shadow-md transform md:-translate-y-1">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#C8A860] text-[#0A1628] text-[10px] uppercase font-bold tracking-widest px-3 py-0.5 rounded shadow-sm">
              ★ Universal Value • Best Choice
            </div>

            <div>
              <div className="w-10 h-10 rounded bg-[#C8A860]/15 flex items-center justify-center text-[#96792b] mb-4">
                <Coins className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-normal text-[#0A1628]">Credit Top-Up Pack</h3>
              <p className="text-xs text-[#1C1C1C]/70 mt-1 min-h-[32px]">
                Universal compute credits for any module. Rollover indefinitely.
              </p>

              <div className="my-6">
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-mono font-light text-[#0A1628]">$49</span>
                  <span className="text-xs text-[#1C1C1C]/60">USD one-time</span>
                </div>
                <div className="text-xs text-[#96792b] font-medium mt-1">
                  2,000 Universal Credits (Never Expire)
                </div>
              </div>

              <ul className="space-y-2.5 text-xs text-[#1C1C1C]/80 mb-6">
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-[#96792b] shrink-0 mt-0.5" />
                  <span>2,000 credits applied immediately</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-[#96792b] shrink-0 mt-0.5" />
                  <span>Never expire — rollover month to month</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-[#96792b] shrink-0 mt-0.5" />
                  <span>Run ~6 Deep Validations or 4 Crowdfunding analyses</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-[#96792b] shrink-0 mt-0.5" />
                  <span>Priority compute queue routing</span>
                </li>
              </ul>
            </div>

            <button
              onClick={() => handlePurchase('credit_topup')}
              disabled={buyingPackage !== null}
              className="w-full py-2.5 px-4 rounded text-xs font-semibold text-[#0A1628] bg-[#C8A860] hover:bg-[#b09048] transition-colors flex items-center justify-center gap-2 disabled:opacity-50 shadow-sm"
            >
              {buyingPackage === 'credit_topup' ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Preparing Checkout…</span>
                </>
              ) : (
                <>
                  <CreditCard className="w-3.5 h-3.5" />
                  <span>Buy Top-Up Pack ($49)</span>
                </>
              )}
            </button>
          </div>

          {/* Card 2: Crowdfunding Analysis Pack */}
          <div className="card-angular p-6 flex flex-col justify-between bg-[#FAFAF7] border border-[#E8E0D0] hover:border-[#C8A860]/60 transition-all">
            <div>
              <div className="w-10 h-10 rounded bg-[#0A1628]/5 flex items-center justify-center text-[#96792b] mb-4">
                <Rocket className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-normal text-[#0A1628]">Crowdfunding Analysis</h3>
              <p className="text-xs text-[#1C1C1C]/70 mt-1 min-h-[32px]">
                Complete backer demand forecasting & campaign readiness scan.
              </p>

              <div className="my-6">
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-mono font-light text-[#0A1628]">$49</span>
                  <span className="text-xs text-[#1C1C1C]/60">USD one-time</span>
                </div>
                <div className="text-xs text-[#96792b] font-medium mt-1">
                  Unlocks 1 Full Crowdfunding Run
                </div>
              </div>

              <ul className="space-y-2.5 text-xs text-[#1C1C1C]/80 mb-6">
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-[#96792b] shrink-0 mt-0.5" />
                  <span>10-category feasibility scorecard (/100)</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-[#96792b] shrink-0 mt-0.5" />
                  <span>30-day prelaunch execution timeline</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-[#96792b] shrink-0 mt-0.5" />
                  <span>Benchmarked against 300+ synthetic campaigns</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-[#96792b] shrink-0 mt-0.5" />
                  <span>Reward tier & backer conversion optimization</span>
                </li>
              </ul>
            </div>

            <button
              onClick={() => handlePurchase('crowdfunding')}
              disabled={buyingPackage !== null}
              className="w-full py-2.5 px-4 rounded text-xs font-medium text-[#0A1628] bg-[#E8E0D0] hover:bg-[#C8A860] transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {buyingPackage === 'crowdfunding' ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Preparing Checkout…</span>
                </>
              ) : (
                <>
                  <CreditCard className="w-3.5 h-3.5" />
                  <span>Buy Crowdfunding Pack ($49)</span>
                </>
              )}
            </button>
          </div>

          {/* Card 3: Pitch Deck Pack */}
          <div className="card-angular p-6 flex flex-col justify-between bg-[#FAFAF7] border border-[#E8E0D0] hover:border-[#C8A860]/60 transition-all">
            <div>
              <div className="w-10 h-10 rounded bg-[#0A1628]/5 flex items-center justify-center text-[#96792b] mb-4">
                <Presentation className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-normal text-[#0A1628]">Pitch Deck Pack</h3>
              <p className="text-xs text-[#1C1C1C]/70 mt-1 min-h-[32px]">
                Institutional investor presentation generator with editable PPTX.
              </p>

              <div className="my-6">
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-mono font-light text-[#0A1628]">$49</span>
                  <span className="text-xs text-[#1C1C1C]/60">USD one-time</span>
                </div>
                <div className="text-xs text-[#96792b] font-medium mt-1">
                  Unlocks 1 Full Pitch Deck Run
                </div>
              </div>

              <ul className="space-y-2.5 text-xs text-[#1C1C1C]/80 mb-6">
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-[#96792b] shrink-0 mt-0.5" />
                  <span>12 institutional investor slides + speaker notes</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-[#96792b] shrink-0 mt-0.5" />
                  <span>3-min & 60-sec founder pitch scripts</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-[#96792b] shrink-0 mt-0.5" />
                  <span>20 investor defense Q&As</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-[#96792b] shrink-0 mt-0.5" />
                  <span>Editable Microsoft PowerPoint (.pptx) download</span>
                </li>
              </ul>
            </div>

            <button
              onClick={() => handlePurchase('pitch_deck')}
              disabled={buyingPackage !== null}
              className="w-full py-2.5 px-4 rounded text-xs font-medium text-[#0A1628] bg-[#E8E0D0] hover:bg-[#C8A860] transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {buyingPackage === 'pitch_deck' ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Preparing Checkout…</span>
                </>
              ) : (
                <>
                  <CreditCard className="w-3.5 h-3.5" />
                  <span>Buy Pitch Deck Pack ($49)</span>
                </>
              )}
            </button>
          </div>
        </div>
      </section>

      {/* Credit Ledger / History Table */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[#1C1C1C]/60">
              Audit Trail & Transaction History
            </h2>
            <p className="text-sm text-[#0A1628] mt-0.5">
              Verified record of credit top-ups, usage debits, and allocations
            </p>
          </div>
        </div>

        <div className="overflow-x-auto border border-[#E8E0D0] rounded bg-[#FAFAF7]">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-[#EFE7D8]/60 border-b border-[#E8E0D0] text-[#0A1628] font-semibold">
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Action</th>
                <th className="py-3 px-4">Credits</th>
                <th className="py-3 px-4">Balance After</th>
                <th className="py-3 px-4">Related Reference</th>
                <th className="py-3 px-4 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E8E0D0]">
              {ledgerLoading ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-[#1C1C1C]/60">
                    Loading ledger...
                  </td>
                </tr>
              ) : ledgerEntries.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-[#1C1C1C]/60">
                    No credit transactions yet. Credits never expire.
                  </td>
                </tr>
              ) : (
                ledgerEntries.map(item => {
                  const isCredit = item.amount > 0
                  return (
                    <tr key={item.id} className="hover:bg-[#F5F0E8]/50 transition-colors">
                      <td className="py-3.5 px-4 font-mono text-[#1C1C1C]/70">
                        {formatDate(item.date)}
                      </td>
                      <td className="py-3.5 px-4 font-medium text-[#0A1628]">
                        <span className="font-mono text-[11px]">{item.action}</span>
                      </td>
                      <td className="py-3.5 px-4 font-mono font-semibold">
                        <span
                          className={
                            isCredit
                              ? 'text-emerald-700 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20'
                              : 'text-rose-700 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20'
                          }
                        >
                          {isCredit ? `+${item.amount.toLocaleString()}` : item.amount.toLocaleString()}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-[#0A1628]">
                        {item.balanceAfter.toLocaleString()} cr
                      </td>
                      <td className="py-3.5 px-4 text-[#1C1C1C]/70">
                        {item.reference}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <span className="inline-block px-2 py-0.5 text-[10px] uppercase font-semibold rounded bg-[#C8A860]/15 text-[#96792b]">
                          {item.status}
                        </span>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Demo Modal when Stripe is unconfigured */}
      {demoModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0A1628]/60 backdrop-blur-sm p-4">
          <div className="card-angular p-6 bg-[#FAFAF7] max-w-md w-full shadow-xl border border-[#E8E0D0] relative">
            <button
              onClick={() => setDemoModalOpen(false)}
              className="absolute top-4 right-4 text-[#1C1C1C]/40 hover:text-[#0A1628]"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-[#C8A860]/20 flex items-center justify-center text-[#96792b]">
                <CreditCard className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-[#0A1628]">Stripe Checkout Mode</h3>
                <p className="text-xs text-[#1C1C1C]/60">Development Gateway Feedback</p>
              </div>
            </div>
            <p className="text-xs text-[#1C1C1C]/80 leading-relaxed mb-6">
              Stripe API secret key is not configured in this active environment. In production, this button connects directly to Stripe Checkout to process the $49 payment and instantly credit your balance.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setDemoModalOpen(false)}
                className="px-4 py-2 text-xs font-medium border border-[#E8E0D0] text-[#0A1628] rounded hover:bg-[#E8E0D0]"
              >
                Close
              </button>
              <button
                onClick={simulateDemoPurchase}
                className="px-4 py-2 text-xs font-semibold bg-[#0A1628] text-[#FAFAF7] hover:bg-[#C8A860] hover:text-[#0A1628] rounded transition-colors"
              >
                Simulate Successful Top-Up
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function CreditsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[50vh] flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-[#C8A860]" />
        </div>
      }
    >
      <CreditsContent />
    </Suspense>
  )
}