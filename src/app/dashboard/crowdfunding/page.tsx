'use client'
import { useState, useEffect } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts'

type AnalysisResult = {
  performanceScore: number
  classificationBand: string
  band: string
  disclaimer: string
  recommendation: string
  result: {
    computedMetrics: {
      requiredBackers: number
      requiredVisitors: number
      marketingCostPerBacker: number
    }
    aiAnalysis: {
      scenarios: {
        conservative: { fundingPercent: number; backers: number; amountRaised: number }
        base: { fundingPercent: number; backers: number; amountRaised: number }
        optimistic: { fundingPercent: number; backers: number; amountRaised: number }
      }
      thirtyDayPrelaunchPlan: Array<{
        week: string; activity: string; owner: string; kpi: string; expectedOutput: string
      }>
      riskRegister: Array<{
        risk: string; probability: string; impact: string; riskLevel: string; mitigation: string
      }>
      recommendationReasons: string[]
    }
    benchmark: { avgFundingPct: string | null; totalCount: number; dataLabel: string }
  }
}

const CATEGORIES = ['Technology','Consumer Products','Education','Gaming','Design','Food','Sustainability','Fashion','Social Impact']
const COUNTRIES = ['United States','United Kingdom','India','Canada','Australia','Germany','France']

function bandColor(band: string): string {
  if (band.startsWith('80')) return '#22c55e'
  if (band.startsWith('65')) return '#C8A860'
  if (band.startsWith('50')) return '#f97316'
  return '#ef4444'
}

export default function CrowdfundingPage() {
  const [ideas, setIdeas] = useState<Array<{ id: string; name: string }>>([])
  const [hasAccess, setHasAccess] = useState(false)
  const [tier, setTier] = useState('free')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<AnalysisResult | null>(null)

  const [form, setForm] = useState({
    ideaId: '',
    fundingGoal: 50000,
    projectDescription: '',
    category: 'Technology',
    country: 'United States',
    preLaunchCommunitySize: 0,
    socialFollowers: 1000,
    emailListSize: 0,
    campaignDurationDays: 30,
    rewardTiers: 5,
    lowestReward: 25,
    averageReward: 75,
    highestReward: 500,
    hasVideo: true,
    marketingBudget: 2000,
  })

  useEffect(() => {
    fetch('/api/ideas').then(r => r.json()).then(d => setIdeas(d.ideas ?? []))
    fetch('/api/me').then(r => r.json()).then(d => {
      const t = d.user?.tier ?? 'free'
      const credits = d.user?.crowdfundingCredits ?? 0
      setTier(t)
      setHasAccess(t === 'max_premium' || credits > 0)
    })
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.ideaId) { alert('Select an idea'); return }
    setLoading(true)
    const res = await fetch('/api/crowdfunding', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        projectDescription: (form.projectDescription ||
          ideas.find(i => i.id === form.ideaId)?.name) ?? 'Startup idea',
      }),
    })
    const data = await res.json()
    if (res.ok) {
      setResult(data)
    } else {
      alert(data.error ?? 'Analysis failed')
    }
    setLoading(false)
  }

  const setF = <K extends keyof typeof form>(k: K, v: typeof form[K]) =>
    setForm(f => ({ ...f, [k]: v }))

  if (!hasAccess) {
    return (
      <div className="max-w-2xl mx-auto mt-20">
        <div className="card-angular p-10 text-center">
          <span className="text-4xl block mb-4">🔒</span>
          <h2 className="text-xl font-light text-[#0A1628] mb-2">Crowdfunding Performance Predictor</h2>
          <p className="text-sm text-[#1C1C1C] opacity-60 mb-8">
            10-category campaign scoring, benchmark comparisons (SYNTHETIC DATA), and a 30-day pre-launch plan.
          </p>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="card-angular p-5">
              <p className="text-lg font-light text-[#96792b] mb-1">
                $79<span className="text-sm opacity-60">/mo</span>
              </p>
              <p className="text-sm font-medium text-[#0A1628] mb-3">Max Premium</p>
              <p className="text-xs text-[#1C1C1C] opacity-60 mb-4">Unlimited analyses + all Max Premium features</p>
              <a
                href="/auth/signup?plan=max"
                className="block text-center py-2 text-xs font-medium text-[#0A1628]"
                style={{ background: 'linear-gradient(135deg, #D4AF37, #C8A860, #B8963E)', borderRadius: '2px 8px 2px 8px' }}
              >
                Upgrade to Max Premium
              </a>
            </div>
            <div className="card-angular p-5">
              <p className="text-lg font-light text-[#96792b] mb-1">
                $49<span className="text-sm opacity-60"> one-time</span>
              </p>
              <p className="text-sm font-medium text-[#0A1628] mb-3">Crowdfunding Pack</p>
              <p className="text-xs text-[#1C1C1C] opacity-60 mb-4">1 full analysis — no subscription needed</p>
              <a
                href="/dashboard/credits"
                className="block text-center py-2 text-xs font-medium text-[#1C1C1C] border border-[#E8E0D0] hover:border-[#C8A860]"
                style={{ borderRadius: '2px 8px 2px 8px' }}
              >
                Buy Pack ($49)
              </a>
            </div>
          </div>
          {tier === 'premium' && (
            <p className="text-xs text-[#1C1C1C] opacity-40">
              You&apos;re on Premium. Buy a Crowdfunding Pack or upgrade to Max Premium above.
            </p>
          )}
        </div>
      </div>
    )
  }

  if (result) {
    const color = bandColor(result.band)
    const { scenarios } = result.result.aiAnalysis
    const chartData = [
      { name: 'Conservative', amount: scenarios.conservative.amountRaised, goal: form.fundingGoal },
      { name: 'Base', amount: scenarios.base.amountRaised, goal: form.fundingGoal },
      { name: 'Optimistic', amount: scenarios.optimistic.amountRaised, goal: form.fundingGoal },
    ]

    return (
      <div className="max-w-6xl mx-auto">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-light text-[#0A1628]">Campaign Analysis</h1>
            <p className="text-xs text-amber-600 mt-1">All projections labeled ASSUMPTION. Benchmark = SYNTHETIC DATA.</p>
          </div>
          <button
            onClick={() => setResult(null)}
            className="text-sm text-[#96792b] hover:underline"
          >
            ← New analysis
          </button>
        </div>

        {/* Score + disclaimer */}
        <div className="grid grid-cols-3 gap-6 mb-6">
          <div className="card-angular p-6 text-center">
            <div className="text-5xl font-light mb-2" style={{ color }}>{result.performanceScore}</div>
            <div className="text-xs text-[#1C1C1C] opacity-60 mb-1">Performance Score /100</div>
            <div className="text-sm font-medium" style={{ color }}>{result.classificationBand}</div>
            <div className="mt-3 p-3 rounded text-xs text-amber-700 leading-relaxed bg-amber-50">
              {result.disclaimer}
            </div>
          </div>

          <div className="card-angular p-6 col-span-2">
            <h3 className="text-sm font-semibold text-[#0A1628] mb-4">
              Funding Scenarios <span className="text-[#0A1628] bg-amber-200 px-1 py-0.5 rounded font-bold text-[10px]" aria-label="This is an assumption">ASSUMPTION</span>
            </h3>
            <div tabIndex={0} aria-label="Data Chart" role="img" className="w-full"><ResponsiveContainer width="100%" height={160}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E8E0D0" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `$${(Number(v) / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: unknown) => [`$${Number(v).toLocaleString()}`, '']} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Bar dataKey="goal" fill="#E8E0D0" name="Goal" />
                <Bar dataKey="amount" fill="#C8A860" name="Projected (ASSUMPTION)" />
              </BarChart>
            </ResponsiveContainer></div>
          </div>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            {
              label: 'Required Backers',
              value: result.result.computedMetrics.requiredBackers.toLocaleString(),
              note: '= Goal ÷ Avg Reward',
            },
            {
              label: 'Required Visitors',
              value: result.result.computedMetrics.requiredVisitors.toLocaleString(),
              note: 'At 3.5% conversion (ASSUMPTION)',
            },
            {
              label: 'Category Benchmark',
              value: `${Number(result.result.benchmark.avgFundingPct ?? 0).toFixed(1)}% avg`,
              note: `SYNTHETIC DATA (n=${result.result.benchmark.totalCount})`,
            },
          ].map(m => (
            <div key={m.label} className="card-angular p-4">
              <div className="text-xl font-light text-[#96792b] mb-1">{m.value}</div>
              <div className="text-xs font-medium text-[#0A1628]">{m.label}</div>
              <div className="text-xs text-amber-600 mt-0.5">{m.note}</div>
            </div>
          ))}
        </div>

        {/* Recommendation reasons */}
        <div className="card-angular p-5 mb-6">
          <h3 className="text-sm font-semibold text-[#0A1628] mb-3">
            Recommendation: <span style={{ color }}>{result.recommendation.replace(/_/g, ' ')}</span>
          </h3>
          <ul className="space-y-2">
            {result.result.aiAnalysis.recommendationReasons.map((r, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-[#1C1C1C]">
                <span className="text-[#96792b] flex-shrink-0 mt-0.5">•</span>{r}
              </li>
            ))}
          </ul>
        </div>

        {/* 30-day plan */}
        <div className="card-angular p-5">
          <h3 className="text-sm font-semibold text-[#0A1628] mb-4">
            30-Day Pre-Launch Plan <span className="text-xs text-amber-600 font-normal">PROPOSED_STRATEGY</span>
          </h3>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[#E8E0D0]">
                {['Week','Activity','Owner','KPI','Expected Output'].map(h => (
                  <th key={h} className={`py-2 font-medium ${h === 'Week' ? 'text-left text-[#96792b]' : 'text-left opacity-60'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.result.aiAnalysis.thirtyDayPrelaunchPlan.map((item, i) => (
                <tr key={i} className="border-b border-[#E8E0D0]">
                  <td className="py-2 text-[#96792b] font-medium">{item.week}</td>
                  <td className="py-2">{item.activity}</td>
                  <td className="py-2">{item.owner}</td>
                  <td className="py-2">{item.kpi}</td>
                  <td className="py-2 opacity-70">{item.expectedOutput}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-light text-[#0A1628] mb-1">Crowdfunding Performance Predictor</h1>
        <p className="text-sm text-[#1C1C1C] opacity-60">
          10-category scoring against SYNTHETIC DATA benchmarks. All projections labeled ASSUMPTION.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="card-angular p-8 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          {/* Idea */}
          <div className="col-span-2">
            <label className="block text-xs font-medium text-[#96792b] uppercase tracking-wider mb-1">Select Idea *</label>
            <select
              value={form.ideaId}
              onChange={e => setF('ideaId', e.target.value)}
              required
              className="w-full px-3 py-2 border border-[#E8E0D0] rounded bg-[#FAFAF7] text-sm focus:border-[#C8A860] focus:outline-none"
            >
              <option value="">— Select idea —</option>
              {ideas.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
          </div>

          {/* Funding Goal */}
          <div>
            <label className="block text-xs font-medium text-[#96792b] uppercase tracking-wider mb-1">Funding Goal ($) *</label>
            <input
              type="number" value={form.fundingGoal} min={100} required
              onChange={e => setF('fundingGoal', Number(e.target.value))}
              className="w-full px-3 py-2 border border-[#E8E0D0] rounded bg-[#FAFAF7] text-sm focus:border-[#C8A860] focus:outline-none"
            />
          </div>

          {/* Category */}
          <div>
            <label className="block text-xs font-medium text-[#96792b] uppercase tracking-wider mb-1">Category</label>
            <select
              value={form.category}
              onChange={e => setF('category', e.target.value)}
              className="w-full px-3 py-2 border border-[#E8E0D0] rounded bg-[#FAFAF7] text-sm focus:border-[#C8A860] focus:outline-none"
            >
              {CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>

          {/* Country */}
          <div>
            <label className="block text-xs font-medium text-[#96792b] uppercase tracking-wider mb-1">Country</label>
            <select
              value={form.country}
              onChange={e => setF('country', e.target.value)}
              className="w-full px-3 py-2 border border-[#E8E0D0] rounded bg-[#FAFAF7] text-sm focus:border-[#C8A860] focus:outline-none"
            >
              {COUNTRIES.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>

          {/* Pre-launch community */}
          <div>
            <label className="block text-xs font-medium text-[#96792b] uppercase tracking-wider mb-1">Pre-launch Community Size</label>
            <input
              type="number" value={form.preLaunchCommunitySize} min={0}
              onChange={e => setF('preLaunchCommunitySize', Number(e.target.value))}
              className="w-full px-3 py-2 border border-[#E8E0D0] rounded bg-[#FAFAF7] text-sm focus:border-[#C8A860] focus:outline-none"
            />
          </div>

          {/* Social followers */}
          <div>
            <label className="block text-xs font-medium text-[#96792b] uppercase tracking-wider mb-1">Social Media Followers</label>
            <input
              type="number" value={form.socialFollowers} min={0}
              onChange={e => setF('socialFollowers', Number(e.target.value))}
              className="w-full px-3 py-2 border border-[#E8E0D0] rounded bg-[#FAFAF7] text-sm focus:border-[#C8A860] focus:outline-none"
            />
          </div>

          {/* Email list */}
          <div>
            <label className="block text-xs font-medium text-[#96792b] uppercase tracking-wider mb-1">Email List Size</label>
            <input
              type="number" value={form.emailListSize} min={0}
              onChange={e => setF('emailListSize', Number(e.target.value))}
              className="w-full px-3 py-2 border border-[#E8E0D0] rounded bg-[#FAFAF7] text-sm focus:border-[#C8A860] focus:outline-none"
            />
          </div>

          {/* Duration */}
          <div>
            <label className="block text-xs font-medium text-[#96792b] uppercase tracking-wider mb-1">Campaign Duration (days)</label>
            <input
              type="number" value={form.campaignDurationDays} min={1} max={60}
              onChange={e => setF('campaignDurationDays', Number(e.target.value))}
              className="w-full px-3 py-2 border border-[#E8E0D0] rounded bg-[#FAFAF7] text-sm focus:border-[#C8A860] focus:outline-none"
            />
          </div>

          {/* Avg reward */}
          <div>
            <label className="block text-xs font-medium text-[#96792b] uppercase tracking-wider mb-1">Avg Reward Amount ($)</label>
            <input
              type="number" value={form.averageReward} min={1}
              onChange={e => setF('averageReward', Number(e.target.value))}
              className="w-full px-3 py-2 border border-[#E8E0D0] rounded bg-[#FAFAF7] text-sm focus:border-[#C8A860] focus:outline-none"
            />
          </div>

          {/* Marketing budget */}
          <div>
            <label className="block text-xs font-medium text-[#96792b] uppercase tracking-wider mb-1">Marketing Budget ($)</label>
            <input
              type="number" value={form.marketingBudget} min={0}
              onChange={e => setF('marketingBudget', Number(e.target.value))}
              className="w-full px-3 py-2 border border-[#E8E0D0] rounded bg-[#FAFAF7] text-sm focus:border-[#C8A860] focus:outline-none"
            />
          </div>

          {/* Has video */}
          <div className="col-span-2 flex items-center gap-3">
            <input
              type="checkbox" id="hasVideo" checked={form.hasVideo}
              onChange={e => setF('hasVideo', e.target.checked)}
              className="w-4 h-4 accent-[#C8A860]"
            />
            <label htmlFor="hasVideo" className="text-sm text-[#1C1C1C]">Campaign will have a video</label>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 text-sm font-medium text-[#0A1628] disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg, #D4AF37, #C8A860, #B8963E)', borderRadius: '2px 12px 2px 12px' }}
        >
          {loading ? '⏳ Analysing Campaign…' : '✦ Predict Campaign Performance'}
        </button>
      </form>
    </div>
  )
}