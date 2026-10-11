'use client'
import { useState, useEffect, useMemo } from 'react'
import { toast } from 'sonner'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Legend,
} from 'recharts'
import { ScorecardGrid } from '@/components/ui/ScorecardGrid'
import { RiskRegisterTable, RiskItem } from '@/components/ui/RiskRegisterTable'
import { ActionPlanTable, ActionPlanRow } from '@/components/ui/ActionPlanTable'
import { ExportToolbar } from '@/components/ui/ExportToolbar'
import { DollarSign, Sparkles, TrendingUp, ChevronDown, ChevronUp } from 'lucide-react'
import { PricingReport } from './PricingReport'

// Inline financial formulas (pure functions — no server imports)
const cm = (p: number, vc: number) => p - vc
const breakEven = (fc: number, p: number, vc: number) => vc < p ? fc / (p - vc) : Infinity
const gm = (p: number, vc: number) => p > 0 ? ((p - vc) / p) * 100 : 0
const muPct = (p: number, c: number) => c > 0 ? ((p - c) / c) * 100 : 0
const ltvFn = (margin: number, months: number) => margin * months
const ltvCacFn = (l: number, cac: number) => cac > 0 ? l / cac : 0
const cacPaybackFn = (cac: number, margin: number) => margin > 0 ? cac / margin : Infinity
const fmt = (n: number) => n > 1e6 ? `₹${(n / 1e6).toFixed(1)}M` : n > 1e3 ? `₹${(n / 1e3).toFixed(0)}K` : `₹${n.toFixed(0)}`

const SliderRow = ({ label, value, min, max, step = 1, unit = '', onChange }: {
  label: string; value: number; min: number; max: number; step?: number; unit?: string
  onChange: (v: number) => void
}) => (
  <div className="mb-4">
    <div className="flex justify-between mb-1">
      <label className="text-xs font-medium text-[#0A1628]">{label}</label>
      <span className="text-xs font-semibold text-[#96792b]">{unit}{value.toLocaleString()}</span>
    </div>
    <input type="range" min={min} max={max} step={step} value={value}
      onChange={e => onChange(Number(e.target.value))}
      className="w-full h-1.5 appearance-none cursor-pointer rounded-full"
      style={{ background: `linear-gradient(to right, #C8A860 ${((value - min) / (max - min)) * 100}%, #E8E0D0 0)` }}
    />
  </div>
)

interface SensitivityCell {
  priceChange: number
  volumeChange: number
  profit: number
}

interface ValidationPlanItem {
  week: string
  activity: string
  owner: string
  kpi: string
  expectedOutput: string
}

interface PricingAiAnalysis {
  customerWtpInsights?: string
  customerValueAnalysis?: string
  competitorPrices?: Array<{ name: string; price: string; model?: string; dateChecked: string; source?: string }>
  vanWestendorpInsights?: {
    tooExpensive: string
    expensive: string
    bargain: string
    tooCheap: string
    acceptableRange: string
    label?: string
  }
  pricingModelRecommendation?: string
  recommendedPriceToTest?: string
  validationStepsRequired?: string[]
  thirtyDayValidationPlan?: ValidationPlanItem[]
  riskRegister?: RiskItem[]
  customerWtpScore?: number
  customerValueScore?: number
  competitivePositionScore?: number
  demandPotentialScore?: number
  scalabilityScore?: number
  pricingSimplicityScore?: number
  integrityNote?: string
  pricingProblem?: string
  customerSegments?: { segment: string; size: string; wtp: number; priceElasticity: string }[]
  customerPersonas?: { name: string; description: string; budget: string; decisionFactors: string[] }[]
  wtpQuestionnaire?: { question: string; options: string[]; insight: string }[]
  competitorPricingMatrix?: { competitor: string; price: number; tier: string; features: string[]; positioning: string }[]
  competitivePricingMap?: { label: string; price: number; quality: number; isUs: boolean }[]
  costBreakdown?: { cogs: number; fixedCosts: number; variableCosts: number; targetMargin: number; breakEvenPrice: number }
  pricingModels?: { name: string; description: string; recommendedPrice: number; pros: string[]; cons: string[]; suitabilityScore: number }[]
  psychologicalPricing?: { technique: string; example: string; psychologicalImpact: string; recommendedUse: string }[]
  discountSensitivityTable?: { discountPct: number; expectedVolumeLift: number; netRevenueImpact: number; recommendation: string }[]
  priceElasticity?: { coefficient: number; interpretation: string; elasticityType: string; implications: string[] }
  whatIfAnalysis?: { scenario: string; assumption: string; financialImpact: string; recommendation: string }[]
  pricingDecisionMatrix?: { option: string; score: number; evidence: string; risk: string; verdict: string }[]
  pricingVsVolumeMatrix?: { pricePoint: number; estimatedVolume: number; revenue: number; contributionMargin: number }[]
  [key: string]: unknown
}

interface PricingResult {
  inputs?: unknown
  computedMetrics?: {
    contributionMargin?: number
    contributionMarginPct?: number
    grossMarginPct?: number
    markupPct?: number
    markupNote?: string
    breakEvenUnits?: number
    breakEvenRevenue?: number
    revenue?: number
    operatingProfit?: number
    ltv?: number
    ltvCacRatio?: number
    cacPayback?: number
    discountBreakEven?: number
    label?: string
  }
  scenarios?: Array<{
    label: string
    price: number
    estimatedCustomers: number
    revenue: number
    contributionMargin: number
    profit: number
    breakEvenUnits: number
    label2?: string
  }>
  sensitivityMatrix?: SensitivityCell[][]
  aiAnalysis?: PricingAiAnalysis
  pricingScore?: number
  [key: string]: unknown
}

export default function PricingPage() {
  const [ideas, setIdeas] = useState<Array<{ id: string; name: string }>>([])
  const [selectedIdeaId, setSelectedIdeaId] = useState('')
  const [isPremium, setIsPremium] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [aiResult, setAiResult] = useState<PricingResult | null>(null)

  const [price, setPrice] = useState(1000)
  const [customers, setCustomers] = useState(100)
  const [vc, setVc] = useState(300)
  const [fc, setFc] = useState(50000)
  const [discount, setDiscount] = useState(10)
  const [cac, setCac] = useState(500)
  const [retention, setRetention] = useState(18)
  const [showPowerBIGuide, setShowPowerBIGuide] = useState(false)

  useEffect(() => {
    fetch('/api/ideas').then(r => r.json()).then(d => setIdeas(d.ideas ?? []))
    fetch('/api/me').then(r => r.json()).then(d => {
      const tier = d.user?.tier
      setIsPremium(tier === 'premium' || tier === 'max_premium')
    })
  }, [])

  const metrics = useMemo(() => {
    const margin = cm(price, vc)
    const be = breakEven(fc, price, vc)
    const grossMargin = gm(price, vc)
    const markup = muPct(price, vc)
    const ltv = ltvFn(margin, retention)
    const ratio = ltvCacFn(ltv, cac)
    const payback = cacPaybackFn(cac, margin)
    const revenue = price * customers
    const profit = revenue - vc * customers - fc
    const discountedCm = cm(price * (1 - discount / 100), vc)
    const discountBreakEven = discountedCm > 0 ? (margin * customers) / discountedCm : Infinity
    return { margin, be, grossMargin, markup, ltv, ratio, payback, revenue, profit, discountBreakEven }
  }, [price, customers, vc, fc, discount, cac, retention])

  const priceRangeData = useMemo(() =>
    [0.5, 0.65, 0.8, 0.9, 1.0, 1.1, 1.25, 1.5, 2.0].map(m => {
      const p = Math.round(price * m)
      const est = Math.round(customers / Math.pow(m, 1.5))
      const rev = p * est
      const prof = rev - vc * est - fc
      return { price: p, revenue: Math.round(rev), profit: Math.round(prof), customers: est }
    }), [price, customers, vc, fc])

  const scenarios = useMemo(() => [
    { label: 'Conservative (60%)', mult: 0.6 },
    { label: 'Pessimistic (80%)', mult: 0.8 },
    { label: 'Base (100%)', mult: 1.0 },
    { label: 'Optimistic (120%)', mult: 1.2 },
    { label: 'Best Case (150%)', mult: 1.5 },
  ].map(s => {
    const c2 = Math.round(customers * s.mult)
    const rev = price * c2
    const prof = rev - vc * c2 - fc
    return { ...s, customers: c2, revenue: Math.round(rev), profit: Math.round(prof) }
  }), [price, customers, vc, fc])

  // 0E-1: Live 5x5 Sensitivity Analysis Matrix
  const sensitivityMatrix: SensitivityCell[][] = useMemo(() => {
    if (aiResult?.sensitivityMatrix && Array.isArray(aiResult.sensitivityMatrix) && aiResult.sensitivityMatrix.length === 5) {
      return aiResult.sensitivityMatrix
    }
    return [-20, -10, 0, 10, 20].map(priceChange => {
      return [-20, -10, 0, 10, 20].map(volumeChange => {
        const p = price * (1 + priceChange / 100)
        const v = customers * (1 + volumeChange / 100)
        const currentMargin = p - vc
        const profit = currentMargin * v - fc
        return { priceChange, volumeChange, profit: Math.round(profit) }
      })
    })
  }, [price, customers, vc, fc, aiResult])

  async function runAi() {
    if (!selectedIdeaId) {
      toast.error('Select an idea first')
      return
    }
    setAnalyzing(true)
    try {
      const res = await fetch('/api/pricing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ideaId: selectedIdeaId, sellingPrice: price, expectedCustomers: customers,
          variableCostPerUnit: vc, fixedCostMonthly: fc, discountPercent: discount,
          conversionRatePercent: 3.5, estimatedCac: cac, retentionMonths: retention,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setAiResult(data.result)
        toast.success('AI pricing analysis complete!')
      } else {
        toast.error(data.error ?? 'AI analysis failed')
      }
    } catch {
      toast.error('Network error during AI analysis')
    } finally {
      setAnalyzing(false)
    }
  }

  if (!isPremium) {
    return (
      <div className="max-w-2xl mx-auto mt-20 text-center card-angular p-12">
        <span className="text-4xl mb-4 block">🔒</span>
        <h2 className="text-xl font-light text-[#0A1628] mb-2">Pricing Simulator — Premium Feature</h2>
        <p className="text-sm text-[#1C1C1C] opacity-60 mb-6">
          Interactive pricing simulator with 5 scenarios, sensitivity analysis, and AI competitor pricing insights.
        </p>
        <a
          href="/auth/signup?plan=premium"
          className="inline-block px-8 py-3 text-sm font-medium text-[#0A1628]"
          style={{ background: 'linear-gradient(135deg, #D4AF37, #C8A860, #B8963E)', borderRadius: '2px 12px 2px 12px' }}
        >
          Upgrade to Premium — $29/mo
        </a>
      </div>
    )
  }

  const beNum = isFinite(metrics.be) ? Math.ceil(metrics.be) : null

  // 0E-3: 9-Factor Pricing Scorecard Calculations
  const cmPct = metrics.grossMargin
  const cmScore = Math.min(15, cmPct >= 60 ? 15 : Math.round((cmPct / 60) * 15))
  const beUnits = isFinite(metrics.be) ? metrics.be : Infinity
  const beScore = Math.min(10, beUnits <= customers * 0.5 ? 10 : Math.max(0, Math.round((1 - beUnits / (customers * 2)) * 10)))
  const ltvCac = metrics.ratio
  const cacLtvScore = Math.min(10, ltvCac >= 3 ? 10 : Math.max(0, Math.round((ltvCac / 3) * 10)))

  const factorScores = [
    { label: 'Willingness to Pay', score: aiResult?.aiAnalysis?.customerWtpScore ?? 0, maxScore: 20 },
    { label: 'Customer Value', score: aiResult?.aiAnalysis?.customerValueScore ?? 0, maxScore: 15 },
    { label: 'Contribution Margin', score: cmScore, maxScore: 15 },
    { label: 'Break-Even Feasibility', score: beScore, maxScore: 10 },
    { label: 'LTV : CAC Economics', score: cacLtvScore, maxScore: 10 },
    { label: 'Competitive Moat', score: aiResult?.aiAnalysis?.competitivePositionScore ?? 0, maxScore: 10 },
    { label: 'Market Demand', score: aiResult?.aiAnalysis?.demandPotentialScore ?? 0, maxScore: 10 },
    { label: 'Scalability', score: aiResult?.aiAnalysis?.scalabilityScore ?? 0, maxScore: 5 },
    { label: 'Pricing Simplicity', score: aiResult?.aiAnalysis?.pricingSimplicityScore ?? 0, maxScore: 5 },
  ]

  // 0E-5: 30-Day Validation Plan
  const validationPlan: ActionPlanRow[] = (aiResult?.aiAnalysis?.thirtyDayValidationPlan ?? []).map(p => ({
    week: p.week,
    action: p.activity,
    owner: p.owner,
    kpi: p.kpi,
    expectedOutput: p.expectedOutput,
  }))

  // 0E-6: Pricing Risk Register
  const pricingRisks: RiskItem[] = aiResult?.aiAnalysis?.riskRegister ?? []

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-light text-[#0A1628] mb-1">Smart Pricing Simulator</h1>
          <p className="text-sm text-[#1C1C1C] opacity-60">
            Real-time formula calculations. All projections labeled{' '}
            <span className="text-[#0A1628] bg-amber-200 px-1 py-0.5 rounded font-bold text-[10px]" aria-label="This is an assumption">
              ASSUMPTION
            </span>.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <ExportToolbar
            ideaId={selectedIdeaId}
            deckType="pricing"
            formats={['pdf', 'csv', 'pptx']}
            compact={true}
          />
          <select value={selectedIdeaId} onChange={e => setSelectedIdeaId(e.target.value)}
            className="px-3 py-2 border border-[#E8E0D0] rounded bg-[#FAFAF7] text-sm focus:border-[#C8A860] focus:outline-none">
            <option value="">— Idea for AI analysis —</option>
            {ideas.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
          <button onClick={runAi} disabled={analyzing || !selectedIdeaId}
            className="px-5 py-2 text-sm font-medium text-[#0A1628] disabled:opacity-40 cursor-pointer shadow-xs"
            style={{ background: 'linear-gradient(135deg, #D4AF37, #C8A860, #B8963E)', borderRadius: '2px 10px 2px 10px' }}>
            {analyzing ? '⏳ Analysing…' : '✦ AI Analysis'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* Sliders */}
        <div className="col-span-12 lg:col-span-3 card-angular p-5 bg-[#FAFAF7] h-fit">
          <h2 className="text-xs font-semibold text-[#0A1628] uppercase tracking-wider mb-4">
            Inputs <span className="text-amber-600 font-normal">ASSUMPTION</span>
          </h2>
          <SliderRow label="Selling Price (₹)" value={price} min={100} max={10000} step={50} unit="₹" onChange={setPrice} />
          <SliderRow label="Monthly Customers" value={customers} min={1} max={5000} step={10} onChange={setCustomers} />
          <SliderRow label="Variable Cost/Unit (₹)" value={vc} min={0} max={Math.max(price - 1, 1)} step={10} unit="₹" onChange={setVc} />
          <SliderRow label="Fixed Cost/Month (₹)" value={fc} min={0} max={500000} step={5000} unit="₹" onChange={setFc} />
          <SliderRow label="Discount %" value={discount} min={0} max={50} unit="%" onChange={setDiscount} />
          <SliderRow label="Estimated CAC (₹)" value={cac} min={0} max={10000} step={100} unit="₹" onChange={setCac} />
          <SliderRow label="Retention (months)" value={retention} min={1} max={60} onChange={setRetention} />
        </div>

        {/* Metrics + Charts */}
        <div className="col-span-12 lg:col-span-9 space-y-5">
          {/* 0E-7: KPI cards (9 Cards including Discount Break-Even Volume) */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { l: 'Contribution Margin', v: `₹${metrics.margin.toFixed(0)}`, s: `${metrics.grossMargin.toFixed(1)}% Gross Margin` },
              { l: 'Break-Even Customers', v: beNum !== null ? beNum.toLocaleString() : '∞', s: 'ASSUMPTION' },
              { l: 'Monthly Revenue', v: fmt(metrics.revenue), s: 'ASSUMPTION' },
              { l: 'Monthly Profit', v: fmt(metrics.profit), s: metrics.profit >= 0 ? '✓ Profitable' : '✗ Loss', c: metrics.profit >= 0 ? '#22c55e' : '#ef4444' },
              { l: 'LTV', v: fmt(metrics.ltv), s: `${retention} mo retention (ASSUMPTION)` },
              { l: 'LTV:CAC', v: metrics.ratio.toFixed(2), s: metrics.ratio >= 3 ? '✓ Healthy (≥3)' : '⚠ Low (<3)', c: metrics.ratio >= 3 ? '#22c55e' : '#f97316' },
              { l: 'CAC Payback', v: isFinite(metrics.payback) ? `${metrics.payback.toFixed(1)} mo` : '∞', s: 'ASSUMPTION' },
              { l: 'Markup %', v: `${metrics.markup.toFixed(1)}%`, s: '≠ Gross Margin %' },
              {
                l: 'Discount Break-Even',
                v: isFinite(metrics.discountBreakEven) ? `${Math.ceil(metrics.discountBreakEven).toLocaleString()} units` : '∞',
                s: `Needed at ${discount}% discount (ASSUMPTION)`,
                c: '#C8A860',
              },
            ].map(k => (
              <div key={k.l} className="card-angular p-4 bg-[#FAFAF7]">
                <div className="text-base font-medium mb-0.5" style={{ color: k.c ?? '#0A1628' }}>{k.v}</div>
                <div className="text-xs font-semibold text-[#0A1628]">{k.l}</div>
                <div className="text-[11px] opacity-60 truncate" style={{ color: k.c }}>{k.s}</div>
              </div>
            ))}
          </div>

          {/* Markup ≠ Margin note */}
          <div className="card-angular p-4 border-l-4 border-[#C8A860] bg-[#FAFAF7]">
            <p className="text-xs text-[#1C1C1C] leading-relaxed">
              <span className="font-semibold text-[#96792b]">Markup ≠ Margin — </span>
              Markup ({metrics.markup.toFixed(1)}%) = (Price−Cost)/Cost × 100 <em>(calculated on cost)</em>.{' '}
              Gross Margin ({metrics.grossMargin.toFixed(1)}%) = (Price−Cost)/Price × 100 <em>(calculated on revenue)</em>.{' '}
              Both are distinct figures — use Gross Margin with investors and Markup with procurement/suppliers.
            </p>
          </div>

          {/* Price vs Revenue/Profit chart */}
          <div className="card-angular p-5 bg-[#FAFAF7]">
            <h3 className="text-sm font-semibold text-[#0A1628] mb-1">
              Price → Revenue &amp; Profit <span className="text-[#0A1628] bg-amber-200 px-1 py-0.5 rounded font-bold text-[10px]" aria-label="This is an assumption">ASSUMPTION</span>
            </h3>
            <p className="text-xs text-[#1C1C1C] opacity-40 mb-4">Demand elasticity modelled at 1.5× — validate with real market data.</p>
            <div tabIndex={0} aria-label="Data Chart" role="img" className="w-full">
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={priceRangeData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E8E0D0" />
                  <XAxis dataKey="price" tick={{ fontSize: 10 }} tickFormatter={v => `₹${v}`} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={v => fmt(v as number)} />
                  <Tooltip formatter={(v: unknown) => [fmt(Number(v)), '']} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <ReferenceLine x={price} stroke="#C8A860" strokeDasharray="4 4" />
                  <Line type="monotone" dataKey="revenue" stroke="#C8A860" strokeWidth={2} dot={false} name="Revenue" />
                  <Line type="monotone" dataKey="profit" stroke="#0A1628" strokeWidth={2} dot={false} name="Profit" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Scenarios table */}
          <div className="card-angular p-5 bg-[#FAFAF7]">
            <h3 className="text-sm font-semibold text-[#0A1628] mb-4">
              5 Scenarios <span className="text-[#0A1628] bg-amber-200 px-1 py-0.5 rounded font-bold text-[10px]" aria-label="This is an assumption">ASSUMPTION</span>
            </h3>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#E8E0D0]">
                  {['Scenario', 'Customers', 'Revenue', 'Profit', 'Breakeven?'].map(h => (
                    <th key={h} className={`py-2 font-medium ${h === 'Scenario' ? 'text-left text-[#96792b]' : 'text-right text-[#1C1C1C] opacity-60'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {scenarios.map((s, i) => (
                  <tr key={i} className={`border-b border-[#E8E0D0] ${i === 2 ? 'bg-[#C8A860]/5' : ''}`}>
                    <td className="py-2 font-medium text-[#0A1628]">{s.label}</td>
                    <td className="py-2 text-right">{s.customers.toLocaleString()}</td>
                    <td className="py-2 text-right">{fmt(s.revenue)}</td>
                    <td className="py-2 text-right" style={{ color: s.profit >= 0 ? '#22c55e' : '#ef4444' }}>{fmt(s.profit)}</td>
                    <td className="py-2 text-right font-medium">
                      {beNum !== null
                        ? s.customers >= beNum ? '✓' : '✗'
                        : '✗'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 0E-1: 5×5 Sensitivity Analysis Heatmap */}
          <div className="card-angular p-5 bg-[#FAFAF7]">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-[#0A1628] flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-[#C8A860]" />
                5×5 Price vs Volume Sensitivity Heatmap
              </h3>
              <span className="text-[#0A1628] bg-amber-200 px-1.5 py-0.5 rounded font-bold text-[10px]">
                ASSUMPTION
              </span>
            </div>
            <p className="text-xs text-[#1C1C1C] opacity-60 mb-3">
              Net operating profit (₹) across ±20% price and volume variances. Center cell highlights base plan.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-center border-collapse">
                <thead>
                  <tr>
                    <th className="p-2 text-left font-medium text-[#96792b] bg-[#F5F0E8]/70 border border-[#E8E0D0]">
                      Price \ Vol
                    </th>
                    {[-20, -10, 0, 10, 20].map(v => (
                      <th key={v} className="p-2 font-medium text-[#0A1628] bg-[#F5F0E8]/70 border border-[#E8E0D0]">
                        {v === 0 ? 'Base Vol' : `${v > 0 ? '+' : ''}${v}%`}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sensitivityMatrix.map((row, rIdx) => {
                    const pChange = row[0]?.priceChange ?? 0
                    return (
                      <tr key={rIdx}>
                        <td className="p-2 font-medium text-left text-[#0A1628] bg-[#F5F0E8]/40 border border-[#E8E0D0] whitespace-nowrap">
                          {pChange === 0 ? 'Base Price' : `${pChange > 0 ? '+' : ''}${pChange}%`}
                        </td>
                        {row.map((cell, cIdx) => {
                          const isBase = cell.priceChange === 0 && cell.volumeChange === 0
                          const isProfitable = cell.profit >= 0
                          return (
                            <td
                              key={cIdx}
                              className={`p-2 border transition-colors font-mono text-[11px] ${
                                isBase ? 'ring-2 ring-[#C8A860] font-bold z-10 relative' : ''
                              }`}
                              style={{
                                backgroundColor: isProfitable ? 'rgba(34, 197, 94, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                                color: isProfitable ? '#166534' : '#991b1b',
                                borderColor: '#E8E0D0',
                              }}
                            >
                              {fmt(cell.profit)}
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex items-center gap-4 mt-3 text-[11px] text-[#1C1C1C] opacity-70">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-emerald-100 border border-emerald-400" /> Profitable
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-rose-100 border border-rose-400" /> Operating Loss
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs border-2 border-[#C8A860]" /> Current Base Case
              </span>
            </div>
          </div>

          {/* AI results */}
          {aiResult && (
            <div className="space-y-5">
              {/* 0E-3: 9-Factor Pricing Scorecard */}
              <div className="card-angular p-5 bg-[#FAFAF7]">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-semibold text-[#0A1628] flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-[#C8A860]" /> 9-Factor Pricing Scorecard
                    </h3>
                    <p className="text-xs text-[#1C1C1C] opacity-60">
                      Evaluates unit economics, competitive moat, buyer psychology, and elasticity.
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-3xl font-light text-[#96792b]">
                      {aiResult.pricingScore ?? 0}
                    </span>
                    <span className="text-xs text-[#1C1C1C] opacity-50"> / 100</span>
                  </div>
                </div>
                <ScorecardGrid scores={factorScores} columns={3} />
              </div>

              {/* 0E-2: Van Westendorp Price Sensitivity Meter */}
              {aiResult.aiAnalysis?.vanWestendorpInsights && (
                <div className="card-angular p-5 bg-[#FAFAF7]">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold text-[#0A1628] flex items-center gap-2">
                      <DollarSign className="w-4 h-4 text-[#C8A860]" />
                      Van Westendorp Price Sensitivity Range
                    </h3>
                    <span className="text-[#0A1628] bg-amber-200 px-1.5 py-0.5 rounded font-bold text-[10px]">
                      ASSUMPTION
                    </span>
                  </div>
                  <p className="text-xs text-[#1C1C1C] opacity-60 mb-4">
                    Psychological price barriers modelled from customer personas and competitive benchmarks.
                  </p>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                    <div className="p-3 bg-blue-50/70 border border-blue-200 rounded">
                      <span className="text-[10px] font-bold text-blue-800 uppercase block mb-1">Too Cheap</span>
                      <p className="text-xs text-[#1C1C1C]">{aiResult.aiAnalysis.vanWestendorpInsights.tooCheap}</p>
                    </div>
                    <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded">
                      <span className="text-[10px] font-bold text-emerald-800 uppercase block mb-1">Bargain / Value</span>
                      <p className="text-xs text-[#1C1C1C]">{aiResult.aiAnalysis.vanWestendorpInsights.bargain}</p>
                    </div>
                    <div className="p-3 bg-amber-50/70 border border-amber-200 rounded">
                      <span className="text-[10px] font-bold text-amber-800 uppercase block mb-1">Expensive</span>
                      <p className="text-xs text-[#1C1C1C]">{aiResult.aiAnalysis.vanWestendorpInsights.expensive}</p>
                    </div>
                    <div className="p-3 bg-rose-50/70 border border-rose-200 rounded">
                      <span className="text-[10px] font-bold text-rose-800 uppercase block mb-1">Too Expensive</span>
                      <p className="text-xs text-[#1C1C1C]">{aiResult.aiAnalysis.vanWestendorpInsights.tooExpensive}</p>
                    </div>
                  </div>

                  <div className="p-3 bg-[#C8A860]/10 border border-[#C8A860]/30 rounded flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="text-xs font-semibold text-[#96792b] block">Acceptable Price Corridor</span>
                      <span className="text-sm font-medium text-[#0A1628]">
                        {aiResult.aiAnalysis.vanWestendorpInsights.acceptableRange}
                      </span>
                    </div>
                    <div className="text-xs text-[#1C1C1C] opacity-70">
                      Current Test Price: <span className="font-semibold text-[#0A1628]">₹{price}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* 0E-4: Customer Value Analysis & Strategy */}
              <div className="card-angular p-5 bg-[#FAFAF7]">
                <h3 className="text-sm font-semibold text-[#0A1628] mb-4">Pricing Strategy &amp; Customer Value</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div className="p-3 rounded bg-[#C8A860]/10 border border-[#C8A860]/30">
                    <p className="text-xs font-medium text-[#96792b] mb-1">Recommended Price to Test</p>
                    <p className="text-sm text-[#0A1628] font-medium">
                      {aiResult.aiAnalysis?.recommendedPriceToTest ?? 'N/A'}
                    </p>
                    <p className="text-xs text-amber-600 mt-1">Hypothesis only — not a guaranteed optimum.</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-[#96792b] mb-2">Competitor Benchmark Pricing</p>
                    {(aiResult.aiAnalysis?.competitorPrices ?? []).map((c, i) => (
                      <div key={i} className="flex justify-between text-xs py-1.5 border-b border-[#E8E0D0] last:border-0">
                        <span className="font-medium text-[#0A1628]">{c.name}</span>
                        <span className="text-[#96792b] font-mono">{c.price}</span>
                        <span className="opacity-50 text-[10px]">Checked: {c.dateChecked}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {aiResult.aiAnalysis?.customerValueAnalysis && (
                  <div className="border-t border-[#E8E0D0] pt-4 mt-2">
                    <h4 className="text-xs font-semibold text-[#0A1628] uppercase tracking-wider mb-2">
                      Customer Value Analysis
                    </h4>
                    <p className="text-xs text-[#1C1C1C] leading-relaxed">
                      {aiResult.aiAnalysis.customerValueAnalysis}
                    </p>
                  </div>
                )}

                {aiResult.aiAnalysis?.customerWtpInsights && (
                  <div className="border-t border-[#E8E0D0] pt-4 mt-3">
                    <h4 className="text-xs font-semibold text-[#0A1628] uppercase tracking-wider mb-2">
                      Willingness-to-Pay (WTP) Behavioral Insights
                    </h4>
                    <p className="text-xs text-[#1C1C1C] leading-relaxed">
                      {aiResult.aiAnalysis.customerWtpInsights}
                    </p>
                  </div>
                )}
              </div>

              {/* 0E-5: 30-Day Pricing Validation Plan */}
              {validationPlan.length > 0 && (
                <ActionPlanTable
                  plan={validationPlan}
                  title="30-Day Pricing Validation Plan"
                  badge="PROPOSED_STRATEGY"
                  showExpectedOutput={true}
                />
              )}

              {/* 0E-6: Pricing Risk Register */}
              {pricingRisks.length > 0 && (
                <RiskRegisterTable
                  risks={pricingRisks}
                  title="Pricing Risk Register"
                  badge="ASSUMPTION"
                />
              )}

              {/* 18-Section Pricing Narrative Report */}
              <PricingReport data={aiResult.aiAnalysis} />
            </div>
          )}

          {/* FIX-W5.1: Power BI Integration Guide */}
          <div className="card-angular bg-[#FAFAF7] mt-4">
            <button
              onClick={() => setShowPowerBIGuide(prev => !prev)}
              className="w-full flex items-center justify-between p-5 text-left"
            >
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-[#C8A860]" />
                <span className="text-sm font-semibold text-[#0A1628]">Power BI Integration Guide</span>
                <span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded bg-[#C8A860]/15 text-[#96792b]">
                  AI_ESTIMATE_UNVERIFIED
                </span>
              </div>
              {showPowerBIGuide ? (
                <ChevronUp className="w-4 h-4 text-[#1C1C1C]/50" />
              ) : (
                <ChevronDown className="w-4 h-4 text-[#1C1C1C]/50" />
              )}
            </button>

            {showPowerBIGuide && (
              <div className="px-5 pb-6 space-y-5 border-t border-[#E8E0D0] pt-4">
                <p className="text-xs text-[#1C1C1C]/70">
                  Connect this pricing dataset to Power BI for dynamic dashboards. All figures are{' '}
                  <span className="font-bold text-amber-700">ASSUMPTION</span>-labelled projections — validate with real sales data before board presentations.
                </p>

                {/* DAX Measures */}
                <div>
                  <h4 className="text-xs font-semibold text-[#0A1628] uppercase tracking-wider mb-3">
                    Recommended DAX Measures
                  </h4>
                  <div className="space-y-2">
                    {[
                      {
                        name: 'Contribution Margin %',
                        dax: `CM% = DIVIDE([Selling Price] - [Variable Cost], [Selling Price], 0) * 100`,
                      },
                      {
                        name: 'Break-Even Units',
                        dax: `BreakEven = DIVIDE([Fixed Cost Monthly], [Selling Price] - [Variable Cost], 0)`,
                      },
                      {
                        name: 'LTV : CAC Ratio',
                        dax: `LTV_CAC = DIVIDE([LTV], [Estimated CAC], 0)`,
                      },
                      {
                        name: 'Monthly Profit',
                        dax: `Profit = ([Selling Price] - [Variable Cost]) * [Monthly Customers] - [Fixed Cost Monthly]`,
                      },
                      {
                        name: 'CAC Payback Months',
                        dax: `PaybackMonths = DIVIDE([Estimated CAC], [Selling Price] - [Variable Cost], 0)`,
                      },
                    ].map((m, i) => (
                      <div key={i} className="p-3 bg-white border border-[#E8E0D0] rounded">
                        <div className="text-[10px] font-bold text-[#96792b] uppercase mb-1">{m.name}</div>
                        <code className="text-[11px] text-[#0A1628] font-mono leading-relaxed block">{m.dax}</code>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Slicer Recommendations */}
                <div>
                  <h4 className="text-xs font-semibold text-[#0A1628] uppercase tracking-wider mb-3">
                    Slicer Recommendations
                  </h4>
                  <ul className="space-y-1.5 text-xs text-[#1C1C1C]">
                    {[
                      'Selling Price — Range slicer (₹100–₹10,000) to simulate price points',
                      'Monthly Customers — Volume slicer for demand scenario modelling',
                      'Discount % — Show net revenue impact at various promotional levels',
                      'Scenario Label — Filter by Conservative / Base / Optimistic / Best Case',
                      'Retention Months — LTV sensitivity across customer lifecycle lengths',
                    ].map((s, i) => (
                      <li key={i} className="flex gap-2 items-start">
                        <span className="text-[#C8A860] font-bold flex-shrink-0">•</span>
                        <span>{s}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Sensitivity Heatmap Instructions */}
                <div>
                  <h4 className="text-xs font-semibold text-[#0A1628] uppercase tracking-wider mb-3">
                    Sensitivity Heatmap Instructions
                  </h4>
                  <ol className="space-y-1.5 text-xs text-[#1C1C1C] list-decimal list-inside">
                    <li>Export the 5×5 sensitivity matrix above as CSV via the Export toolbar</li>
                    <li>Import into Power BI using Get Data → Text/CSV</li>
                    <li>Create a Matrix visual with Price Change (rows) × Volume Change (columns)</li>
                    <li>Apply conditional formatting on the Profit field: green = positive, red = negative</li>
                    <li>Add a card visual for the base case (Price Change = 0%, Volume Change = 0%)</li>
                    <li>Set data category to <em>None</em> on numeric columns to prevent aggregation errors</li>
                  </ol>
                  <div className="mt-3 p-3 bg-amber-50/70 border border-amber-200 rounded text-[11px] text-amber-800">
                    <strong>ASSUMPTION:</strong> Sensitivity values use a simplified elasticity model (1.5×). Replace with actual price-demand data from A/B tests before publishing.
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}