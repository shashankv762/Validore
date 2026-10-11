'use client'
import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts'
import { ScorecardGrid } from '@/components/ui/ScorecardGrid'
import { RiskRegisterTable, RiskItem } from '@/components/ui/RiskRegisterTable'
import { ActionPlanTable, ActionPlanRow } from '@/components/ui/ActionPlanTable'
import { ExportToolbar } from '@/components/ui/ExportToolbar'
import { Check, AlertTriangle, Megaphone, Gift, TrendingUp, ShieldAlert, Target, Rocket } from 'lucide-react'
import { CrowdfundingReport } from './CrowdfundingReport'

interface RewardTier {
  tier: string
  price: string
  value: string
  backerEstimate: string
  label?: string
}

interface MarketingChannel {
  channel: string
  estimatedReach: string
  costEstimate: string
  priority: 'high' | 'medium' | 'low' | string
  label?: string
}

interface PrelaunchPlanItem {
  week: string
  activity: string
  owner: string
  kpi: string
  expectedOutput: string
}

interface AiCampaignData {
  problemProductAppealScore?: number
  fundingGoalFeasibilityScore?: number
  preLaunchAudienceScore?: number
  campaignPageQualityScore?: number
  rewardStrategyScore?: number
  pricingEconomicsScore?: number
  marketingReadinessScore?: number
  founderCredibilityScore?: number
  earlyMomentumPlanScore?: number
  operationalReadinessScore?: number
  recommendation?: string
  recommendationReasons?: string[]
  keyStrengths?: string[]
  keyWeaknesses?: string[]
  rewardTierAnalysis?: RewardTier[]
  marketingChannels?: MarketingChannel[]
  thirtyDayPrelaunchPlan?: PrelaunchPlanItem[]
  riskRegister?: RiskItem[]
  scenarios?: {
    conservative: { fundingPercent: number; backers: number; amountRaised: number }
    base: { fundingPercent: number; backers: number; amountRaised: number }
    optimistic: { fundingPercent: number; backers: number; amountRaised: number }
  }
  integrityNote?: string
  preLaunchReadinessScore?: number
  firstDayTarget?: number
  firstWeekTarget?: number
  founderAssumptions?: string[]
  fundingBands?: { range: string; probability: number; tips: string[] }[]
  goalBands?: { goalMultiple: string; successRate: number; insight: string }[]
  backerSegments?: { segment: string; percentage: number; avgPledge: number; motivation: string }[]
  rewardEconomics?: { tier: string; cost: number; revenue: number; roi: number; recommendation: string }[]
  campaignDurationAnalysis?: { duration: string; successRate: number; avgFunded: number; insight: string }[]
  categoryBenchmark?: { medianGoal: number; medianFunded: number; medianBackers: number; successRate: number; top25PercentFunded: number }
  campaignPageScorecard?: { titleClarity: number; videoQuality: number; imageQuality: number; descriptionDepth: number; rewardStructure: number; socialProof: number; totalScore: number }
  campaignStoryScorecard?: { problemClarity: number; solutionCompelling: number; teamCredibility: number; useOfFunds: number; callToAction: number; totalScore: number }
  earlyMomentumAnalysis?: { targetFirstDay: number; targetFirstWeek: number; momentumStrategy: string[]; earlyBirdRecommendation: string }
  marketingFunnel?: { awareness: { channels: string[]; estimatedReach: number }; consideration: { tactics: string[] }; conversion: { cta: string; urgencyTactics: string[] } }
  socialProofAnalysis?: { currentStrengths: string[]; gaps: string[]; recommendations: string[] }
  preLaunchChecklist?: { item: string; status: 'done' | 'in_progress' | 'pending'; impact: 'high' | 'medium' | 'low'; daysToComplete: number }[]
  [key: string]: unknown
}

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
    ai?: AiCampaignData
    aiAnalysis?: AiCampaignData
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
  const [interactiveFunding, setInteractiveFunding] = useState(100)

  // FIX-10: 5-slider independent funding simulator state
  const [simPledge, setSimPledge] = useState(50)
  const [simVisitors, setSimVisitors] = useState(5000)
  const [simConversion, setSimConversion] = useState(3)
  const [simAdBudget, setSimAdBudget] = useState(2000)
  const [simGoal, setSimGoal] = useState(25000)

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
    if (!form.ideaId) {
      toast.error('Please select an idea first')
      return
    }
    setLoading(true)
    try {
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
        toast.success('Crowdfunding analysis completed!')
      } else {
        toast.error(data.error ?? 'Analysis failed')
      }
    } catch {
      toast.error('Network error. Failed to run crowdfunding analysis.')
    } finally {
      setLoading(false)
    }
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
    // Defensive normalization between result.result.ai and result.result.aiAnalysis
    const rawAi = (result.result as Record<string, unknown>).ai ?? (result.result as Record<string, unknown>).aiAnalysis ?? {}
    const ai = rawAi as AiCampaignData

    const scenarios = ai.scenarios ?? {
      conservative: { fundingPercent: 50, backers: 200, amountRaised: form.fundingGoal * 0.5 },
      base: { fundingPercent: 100, backers: 400, amountRaised: form.fundingGoal },
      optimistic: { fundingPercent: 180, backers: 720, amountRaised: form.fundingGoal * 1.8 },
    }

    const chartData = [
      { name: 'Conservative', amount: scenarios.conservative?.amountRaised ?? 0, goal: form.fundingGoal },
      { name: 'Base', amount: scenarios.base?.amountRaised ?? 0, goal: form.fundingGoal },
      { name: 'Optimistic', amount: scenarios.optimistic?.amountRaised ?? 0, goal: form.fundingGoal },
    ]

    // 0B-5: 10 Category Scores
    const categoryScores = [
      { label: 'Problem & Product Appeal', score: ai.problemProductAppealScore ?? 0, maxScore: 15 },
      { label: 'Funding Goal Feasibility', score: ai.fundingGoalFeasibilityScore ?? 0, maxScore: 15 },
      { label: 'Pre-Launch Audience', score: ai.preLaunchAudienceScore ?? 0, maxScore: 15 },
      { label: 'Campaign Page Quality', score: ai.campaignPageQualityScore ?? 0, maxScore: 10 },
      { label: 'Reward Tier Strategy', score: ai.rewardStrategyScore ?? 0, maxScore: 10 },
      { label: 'Pricing Economics', score: ai.pricingEconomicsScore ?? 0, maxScore: 10 },
      { label: 'Marketing Readiness', score: ai.marketingReadinessScore ?? 0, maxScore: 10 },
      { label: 'Founder Credibility', score: ai.founderCredibilityScore ?? 0, maxScore: 5 },
      { label: 'Early Momentum Plan', score: ai.earlyMomentumPlanScore ?? 0, maxScore: 5 },
      { label: 'Operational Readiness', score: ai.operationalReadinessScore ?? 0, maxScore: 5 },
    ]

    // 0B-4: Strengths & Weaknesses
    const strengths = Array.isArray(ai.keyStrengths) ? ai.keyStrengths : []
    const weaknesses = Array.isArray(ai.keyWeaknesses) ? ai.keyWeaknesses : []

    // 0B-2: Reward Tiers
    const rewardTiers = Array.isArray(ai.rewardTierAnalysis) ? ai.rewardTierAnalysis : []

    // 0B-3: Marketing Channels
    const marketingChannels = Array.isArray(ai.marketingChannels) ? ai.marketingChannels : []

    // 0B-1: Risk Register
    const riskRegister: RiskItem[] = Array.isArray(ai.riskRegister) ? ai.riskRegister : []

    // Pre-launch Plan
    const prelaunchPlan: ActionPlanRow[] = Array.isArray(ai.thirtyDayPrelaunchPlan)
      ? ai.thirtyDayPrelaunchPlan.map((p: PrelaunchPlanItem) => ({
          week: p.week,
          action: p.activity,
          owner: p.owner,
          kpi: p.kpi,
          expectedOutput: p.expectedOutput,
        }))
      : []

    const recommendationReasons = Array.isArray(ai.recommendationReasons) ? ai.recommendationReasons : []

    const marketingCostPerBacker = result.result.computedMetrics?.marketingCostPerBacker ?? 0

    return (
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-light text-[#0A1628]">Campaign Performance Predictor</h1>
            <p className="text-xs text-amber-600 mt-1">
              All projections labeled ASSUMPTION. Category benchmarks labeled SYNTHETIC DATA.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <ExportToolbar
              ideaId={form.ideaId}
              deckType="crowdfunding"
              formats={['pdf', 'csv', 'pptx']}
              compact={true}
            />
            <button
              onClick={() => setResult(null)}
              className="text-sm text-[#96792b] hover:underline"
            >
              ← New analysis
            </button>
          </div>
        </div>

        {/* Score + Funding Scenarios */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="card-angular p-6 text-center flex flex-col justify-between">
            <div>
              <div className="text-5xl font-light mb-2" style={{ color }}>{result.performanceScore}</div>
              <div className="text-xs text-[#1C1C1C] opacity-60 mb-1">Performance Score / 100</div>
              <div className="text-sm font-medium" style={{ color }}>{result.classificationBand}</div>
            </div>
            <div className="mt-4 p-3 rounded text-xs text-amber-700 leading-relaxed bg-amber-50 border border-amber-200">
              {result.disclaimer}
            </div>
          </div>

          <div className="card-angular p-6 md:col-span-2">
            <h3 className="text-sm font-semibold text-[#0A1628] mb-4 flex items-center justify-between">
              <span>Funding Scenarios</span>
              <span className="text-[#0A1628] bg-amber-200 px-2 py-0.5 rounded font-bold text-[10px]" aria-label="This is an assumption">
                ASSUMPTION
              </span>
            </h3>
            <div tabIndex={0} aria-label="Data Chart" role="img" className="w-full">
              <ResponsiveContainer width="100%" height={170}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E8E0D0" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `$${(Number(v) / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: unknown) => [`$${Number(v).toLocaleString()}`, '']} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Bar dataKey="goal" fill="#E8E0D0" name="Goal" />
                  <Bar dataKey="amount" fill="#C8A860" name="Projected (ASSUMPTION)" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* FIX-10: 5-Slider Interactive Funding Simulator */}
        <div className="card-angular p-6 bg-[#FAFAF7]">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold">Interactive Funding Simulator</h3>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-stone-100 text-stone-600 border border-stone-200">PROJECTION</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            {[
              { label: 'Average Pledge ($)', value: simPledge, set: setSimPledge, min: 5, max: 500, step: 5, display: `$${simPledge}` },
              { label: 'Target Visitors', value: simVisitors, set: setSimVisitors, min: 100, max: 100000, step: 100, display: simVisitors.toLocaleString() },
              { label: 'Page Conversion %', value: simConversion, set: setSimConversion, min: 0.1, max: 20, step: 0.1, display: `${simConversion}%` },
              { label: 'Ad Budget ($)', value: simAdBudget, set: setSimAdBudget, min: 0, max: 50000, step: 500, display: `$${simAdBudget.toLocaleString()}` },
              { label: 'Funding Goal ($)', value: simGoal, set: setSimGoal, min: 1000, max: 1000000, step: 1000, display: `$${simGoal.toLocaleString()}` },
            ].map(s => (
              <div key={s.label}>
                <label className="text-xs font-medium text-stone-600 mb-1 flex justify-between">
                  <span>{s.label}</span>
                  <span className="text-[#96792b] font-semibold">{s.display}</span>
                </label>
                <input
                  type="range"
                  min={s.min} max={s.max} step={s.step}
                  value={s.value}
                  onChange={e => s.set(Number(e.target.value))}
                  className="w-full accent-[#C8A860]"
                />
              </div>
            ))}
          </div>
          {(() => {
            const simBackers = Math.round(simVisitors * (simConversion / 100))
            const simRevenue = simBackers * simPledge
            const simSurplus = simRevenue - simGoal
            const simCostPerBacker = simBackers > 0 ? simAdBudget / simBackers : 0
            const simROAS = simAdBudget > 0 ? simRevenue / simAdBudget : 0
            const simFundingPct = simGoal > 0 ? (simRevenue / simGoal) * 100 : 0
            return (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {[
                  { label: 'Estimated Backers', value: simBackers.toLocaleString(), color: 'text-[#96792b]' },
                  { label: 'Projected Revenue', value: `$${simRevenue.toLocaleString()}`, color: 'text-[#96792b]' },
                  { label: 'Surplus / Shortfall', value: `${simSurplus >= 0 ? '+' : ''}$${simSurplus.toLocaleString()}`, color: simSurplus >= 0 ? 'text-green-600' : 'text-red-500' },
                  { label: 'Cost Per Backer', value: `$${simCostPerBacker.toFixed(2)}`, color: 'text-[#96792b]' },
                  { label: 'ROAS', value: `${simROAS.toFixed(2)}x`, color: 'text-[#96792b]' },
                  { label: 'Funding % of Goal', value: `${simFundingPct.toFixed(1)}%`, color: simFundingPct >= 100 ? 'text-green-600' : 'text-[#96792b]' },
                ].map(m => (
                  <div key={m.label} className="p-4 bg-white border border-[#E8E0D0] text-center">
                    <div className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-stone-100 text-stone-600 border border-stone-200 mb-2 inline-block">PROJECTION</div>
                    <div className={`text-xl font-light mb-1 ${m.color}`}>{m.value}</div>
                    <div className="text-xs font-medium text-[#0A1628]">{m.label}</div>
                  </div>
                ))}
              </div>
            )
          })()}
        </div>


        {/* 0B-6: 4 Metrics row including Marketing Cost Per Backer */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            {
              label: 'Required Backers',
              value: (result.result.computedMetrics?.requiredBackers ?? 0).toLocaleString(),
              note: '= Goal ÷ Avg Reward',
              badge: 'PROJECTION',
            },
            {
              label: 'Required Visitors',
              value: (result.result.computedMetrics?.requiredVisitors ?? 0).toLocaleString(),
              note: 'At 3.5% conversion (ASSUMPTION)',
              badge: 'ASSUMPTION',
            },
            {
              label: 'Marketing Cost / Backer',
              value: `$${marketingCostPerBacker.toFixed(2)}`,
              note: '= Budget ÷ Req. Backers',
              badge: 'ASSUMPTION',
            },
            {
              label: 'Category Benchmark',
              value: `${Number(result.result.benchmark?.avgFundingPct ?? 0).toFixed(1)}% avg`,
              note: `SYNTHETIC DATA (n=${result.result.benchmark?.totalCount ?? 0})`,
              badge: 'SYNTHETIC DATA',
            },
          ].map(m => (
            <div key={m.label} className="card-angular p-4 bg-[#FAFAF7] border border-[#E8E0D0]">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-stone-100 text-stone-600 border border-stone-200">
                  {m.badge}
                </span>
              </div>
              <div className="text-xl font-light text-[#96792b] mb-1">{m.value}</div>
              <div className="text-xs font-medium text-[#0A1628]">{m.label}</div>
              <div className="text-[11px] text-stone-500 mt-0.5">{m.note}</div>
            </div>
          ))}
        </div>

        {/* New KPI Cards (Pre-launch Readiness, 24h Target, 7d Target) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="card-angular p-4 bg-white border border-[#E8E0D0]">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Rocket className="w-4 h-4 text-[#96792b]" />
                <span className="text-xs font-semibold text-[#0A1628]">Pre-Launch Readiness</span>
              </div>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-orange-100 text-orange-800 border border-orange-200">
                AI_ESTIMATE_UNVERIFIED
              </span>
            </div>
            <div className="text-2xl font-light text-[#96792b] mb-1">{ai.preLaunchReadinessScore || 0}/100</div>
          </div>
          
          <div className="card-angular p-4 bg-white border border-[#E8E0D0]">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Target className="w-4 h-4 text-[#96792b]" />
                <span className="text-xs font-semibold text-[#0A1628]">First 24h Target</span>
              </div>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200">
                ASSUMPTION
              </span>
            </div>
            <div className="text-2xl font-light text-[#96792b] mb-1">${(ai.firstDayTarget || 0).toLocaleString()}</div>
          </div>

          <div className="card-angular p-4 bg-white border border-[#E8E0D0]">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Target className="w-4 h-4 text-[#96792b]" />
                <span className="text-xs font-semibold text-[#0A1628]">First 7d Target</span>
              </div>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200">
                ASSUMPTION
              </span>
            </div>
            <div className="text-2xl font-light text-[#96792b] mb-1">${(ai.firstWeekTarget || 0).toLocaleString()}</div>
          </div>
        </div>

        {/* 0B-5: 10-Category Score Breakdown Cards */}
        <div className="card-angular p-6 bg-[#FAFAF7]">
          <ScorecardGrid
            scores={categoryScores}
            columns={5}
            title="10-Category Campaign Readiness Breakdown"
            subtitle="Weighted performance evaluation across critical campaign vectors (100 Pts Total)"
            badge="PROJECTION"
          />
        </div>

        {/* Recommendation reasons */}
        <div className="card-angular p-5">
          <h3 className="text-sm font-semibold text-[#0A1628] mb-3">
            Recommendation: <span style={{ color }}>{result.recommendation.replace(/_/g, ' ')}</span>
          </h3>
          <ul className="space-y-2">
            {recommendationReasons.map((r, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-[#1C1C1C]">
                <span className="text-[#96792b] flex-shrink-0 mt-0.5">•</span>{r}
              </li>
            ))}
          </ul>
        </div>

        {/* 0B-4: Key Strengths & Weaknesses */}
        {(strengths.length > 0 || weaknesses.length > 0) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="card-angular p-6 bg-white border-l-4 border-emerald-500 border-y border-r border-[#E8E0D0]">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="w-5 h-5 text-emerald-600" />
                <h3 className="text-sm font-semibold uppercase tracking-wider text-emerald-800">
                  Key Campaign Strengths
                </h3>
              </div>
              <ul className="space-y-2 text-xs text-[#1C1C1C]">
                {strengths.map((s, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
                    <span className="leading-relaxed">{s}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="card-angular p-6 bg-white border-l-4 border-rose-500 border-y border-r border-[#E8E0D0]">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="w-5 h-5 text-rose-600" />
                <h3 className="text-sm font-semibold uppercase tracking-wider text-rose-800">
                  Critical Weaknesses &amp; Vulnerabilities
                </h3>
              </div>
              <ul className="space-y-2 text-xs text-[#1C1C1C]">
                {weaknesses.map((w, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <ShieldAlert className="w-4 h-4 text-rose-600 mt-0.5 flex-shrink-0" />
                    <span className="leading-relaxed">{w}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* 0B-2: Reward Tier Strategy Analysis */}
        {rewardTiers.length > 0 && (
          <div className="card-angular p-6 bg-[#FAFAF7]">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-[#0A1628] flex items-center gap-2">
                <Gift className="w-4 h-4 text-[#C8A860]" /> Reward Tier Strategy Analysis
              </h3>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded border border-amber-200 bg-amber-50 text-amber-800">
                ASSUMPTION
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {rewardTiers.map((tierItem, idx) => (
                <div key={idx} className="p-4 bg-white border border-[#E8E0D0] rounded shadow-xs flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-[#0A1628]">{tierItem.tier}</span>
                      <span className="text-sm font-mono font-bold text-[#96792b]">{tierItem.price}</span>
                    </div>
                    <p className="text-xs text-stone-600 leading-relaxed mb-3">{tierItem.value}</p>
                  </div>
                  <div className="pt-2 border-t border-[#E8E0D0] flex items-center justify-between text-[11px]">
                    <span className="text-stone-500">Est. Backers:</span>
                    <span className="font-medium text-[#0A1628]">{tierItem.backerEstimate}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 0B-3: Marketing Channel Breakdown */}
        {marketingChannels.length > 0 && (
          <div className="card-angular p-6 bg-[#FAFAF7]">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-[#0A1628] flex items-center gap-2">
                <Megaphone className="w-4 h-4 text-[#C8A860]" /> Marketing Channel Breakdown
              </h3>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded border border-amber-200 bg-amber-50 text-amber-800">
                ASSUMPTION
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#E8E0D0] bg-[#F5F0E8]/70">
                    <th className="py-2.5 px-3 font-semibold text-[#0A1628]">Channel</th>
                    <th className="py-2.5 px-3 font-semibold text-[#0A1628]">Estimated Reach</th>
                    <th className="py-2.5 px-3 font-semibold text-[#0A1628]">Cost Estimate</th>
                    <th className="py-2.5 px-3 font-semibold text-[#0A1628]">Priority</th>
                  </tr>
                </thead>
                <tbody>
                  {marketingChannels.map((ch, idx) => {
                    const pri = (ch.priority || 'medium').toLowerCase()
                    const priClass =
                      pri === 'high'
                        ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                        : pri === 'low'
                        ? 'bg-stone-100 text-stone-700 border-stone-200'
                        : 'bg-amber-100 text-amber-800 border-amber-200'
                    return (
                      <tr key={idx} className="border-b border-[#E8E0D0] last:border-0 hover:bg-[#F5F0E8]/40">
                        <td className="py-2.5 px-3 font-medium text-[#0A1628]">{ch.channel}</td>
                        <td className="py-2.5 px-3 text-stone-600">{ch.estimatedReach}</td>
                        <td className="py-2.5 px-3 font-mono font-medium text-[#96792b]">{ch.costEstimate}</td>
                        <td className="py-2.5 px-3">
                          <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded border ${priClass}`}>
                            {ch.priority}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 30-Day Pre-launch Plan */}
        {prelaunchPlan.length > 0 && (
          <ActionPlanTable
            plan={prelaunchPlan}
            title="30-Day Pre-Launch Action Plan"
            badge="PROPOSED_STRATEGY"
            showExpectedOutput={true}
          />
        )}

        {/* 0B-1: Campaign Risk Register */}
        {riskRegister.length > 0 && (
          <RiskRegisterTable
            risks={riskRegister}
            title="Campaign Risk Register"
            badge="ASSUMPTION"
          />
        )}

        <CrowdfundingReport data={ai} />
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
          className="w-full py-3 text-sm font-medium text-[#0A1628] disabled:opacity-50 cursor-pointer"
          style={{ background: 'linear-gradient(135deg, #D4AF37, #C8A860, #B8963E)', borderRadius: '2px 12px 2px 12px' }}
        >
          {loading ? '⏳ Analysing Campaign…' : '✦ Predict Campaign Performance'}
        </button>
      </form>
    </div>
  )
}