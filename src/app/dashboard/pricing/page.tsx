'use client'
import { useState, useEffect, useMemo } from 'react'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Legend,
} from 'recharts'

// Inline financial formulas (pure functions — no server imports)
const cm = (p: number, vc: number) => p - vc
const breakEven = (fc: number, p: number, vc: number) => vc < p ? fc / (p - vc) : Infinity
const gm = (p: number, vc: number) => p > 0 ? ((p - vc) / p) * 100 : 0
const muPct = (p: number, c: number) => c > 0 ? ((p - c) / c) * 100 : 0
const ltvFn = (margin: number, months: number) => margin * months
const ltvCacFn = (l: number, cac: number) => cac > 0 ? l / cac : 0
const cacPaybackFn = (cac: number, margin: number) => margin > 0 ? cac / margin : Infinity
const fmt = (n: number) => n > 1e6 ? `₹${(n / 1e6).toFixed(1)}M` : n > 1e3 ? `₹${(n / 1e3).toFixed(0)}K` : `₹${n.toFixed(0)}`

export default function PricingPage() {
  const [ideas, setIdeas] = useState<Array<{ id: string; name: string }>>([])
  const [selectedIdeaId, setSelectedIdeaId] = useState('')
  const [isPremium, setIsPremium] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [aiResult, setAiResult] = useState<Record<string, unknown> | null>(null)

  const [price, setPrice] = useState(1000)
  const [customers, setCustomers] = useState(100)
  const [vc, setVc] = useState(300)
  const [fc, setFc] = useState(50000)
  const [discount, setDiscount] = useState(10)
  const [cac, setCac] = useState(500)
  const [retention, setRetention] = useState(18)

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

  async function runAi() {
    if (!selectedIdeaId) { alert('Select an idea first'); return }
    setAnalyzing(true)
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
    if (res.ok) setAiResult(data.result)
    else alert(data.error ?? 'AI analysis failed')
    setAnalyzing(false)
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

  const beNum = isFinite(metrics.be) ? Math.ceil(metrics.be) : null

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-8 flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-light text-[#0A1628] mb-1">Smart Pricing Simulator</h1>
          <p className="text-sm text-[#1C1C1C] opacity-60">
            Real-time formula calculations. All projections labeled <span className="text-[#0A1628] bg-amber-200 px-1 py-0.5 rounded font-bold text-[10px]" aria-label="This is an assumption">ASSUMPTION</span>.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select value={selectedIdeaId} onChange={e => setSelectedIdeaId(e.target.value)}
            className="px-3 py-2 border border-[#E8E0D0] rounded bg-[#FAFAF7] text-sm focus:border-[#C8A860] focus:outline-none">
            <option value="">— Idea for AI analysis —</option>
            {ideas.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
          <button onClick={runAi} disabled={analyzing || !selectedIdeaId}
            className="px-5 py-2 text-sm font-medium text-[#0A1628] disabled:opacity-40"
            style={{ background: 'linear-gradient(135deg, #D4AF37, #C8A860, #B8963E)', borderRadius: '2px 10px 2px 10px' }}>
            {analyzing ? '⏳ Analysing…' : '✦ AI Analysis'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* Sliders */}
        <div className="col-span-3 card-angular p-5">
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
        <div className="col-span-9 space-y-5">
          {/* KPI cards */}
          <div className="grid grid-cols-4 gap-3">
            {[
              { l: 'Contribution Margin', v: `₹${metrics.margin.toFixed(0)}`, s: `${metrics.grossMargin.toFixed(1)}% Gross Margin` },
              { l: 'Break-Even Customers', v: beNum !== null ? beNum.toLocaleString() : '∞', s: 'ASSUMPTION' },
              { l: 'Monthly Revenue', v: fmt(metrics.revenue), s: 'ASSUMPTION' },
              { l: 'Monthly Profit', v: fmt(metrics.profit), s: metrics.profit >= 0 ? '✓ Profitable' : '✗ Loss', c: metrics.profit >= 0 ? '#22c55e' : '#ef4444' },
              { l: 'LTV', v: fmt(metrics.ltv), s: `${retention} mo retention (ASSUMPTION)` },
              { l: 'LTV:CAC', v: metrics.ratio.toFixed(2), s: metrics.ratio >= 3 ? '✓ Healthy (≥3)' : '⚠ Low (<3)', c: metrics.ratio >= 3 ? '#22c55e' : '#f97316' },
              { l: 'CAC Payback', v: isFinite(metrics.payback) ? `${metrics.payback.toFixed(1)} mo` : '∞', s: 'ASSUMPTION' },
              { l: 'Markup %', v: `${metrics.markup.toFixed(1)}%`, s: '≠ Gross Margin %' },
            ].map(k => (
              <div key={k.l} className="card-angular p-4">
                <div className="text-base font-light mb-0.5" style={{ color: k.c ?? '#C8A860' }}>{k.v}</div>
                <div className="text-xs font-medium text-[#0A1628]">{k.l}</div>
                <div className="text-xs opacity-50" style={{ color: k.c }}>{k.s}</div>
              </div>
            ))}
          </div>

          {/* Markup ≠ Margin note */}
          <div className="card-angular p-4 border-l-4 border-[#C8A860]">
            <p className="text-xs text-[#1C1C1C]">
              <span className="font-semibold text-[#96792b]">Markup ≠ Margin — </span>
              Markup ({metrics.markup.toFixed(1)}%) = (Price−Cost)/Cost × 100 <em>(calculated on cost)</em>.{' '}
              Gross Margin ({metrics.grossMargin.toFixed(1)}%) = (Price−Cost)/Price × 100 <em>(calculated on revenue)</em>.{' '}
              Both are different figures — use the right one when speaking to investors vs suppliers.
            </p>
          </div>

          {/* Price vs Revenue/Profit chart */}
          <div className="card-angular p-5">
            <h3 className="text-sm font-semibold text-[#0A1628] mb-1">
              Price → Revenue & Profit <span className="text-[#0A1628] bg-amber-200 px-1 py-0.5 rounded font-bold text-[10px]" aria-label="This is an assumption">ASSUMPTION</span>
            </h3>
            <p className="text-xs text-[#1C1C1C] opacity-40 mb-4">Demand elasticity modelled at 1.5× — validate with real data.</p>
            <div tabIndex={0} aria-label="Data Chart" role="img" className="w-full"><ResponsiveContainer width="100%" height={200}>
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
            </ResponsiveContainer></div>
          </div>

          {/* Scenarios table */}
          <div className="card-angular p-5">
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
                    <td className="py-2 text-right">
                      {beNum !== null
                        ? s.customers >= beNum ? '✓' : '✗'
                        : '✗'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* AI results */}
          {aiResult && (
            <div className="card-angular p-5">
              <h3 className="text-sm font-semibold text-[#0A1628] mb-4">AI Pricing Insights</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 rounded" style={{ background: '#C8A86010', borderRadius: '2px 8px 2px 8px' }}>
                  <p className="text-xs font-medium text-[#96792b] mb-1">Recommended Price to Test</p>
                  <p className="text-sm text-[#0A1628]">
                    {(aiResult.aiAnalysis as Record<string, string> | undefined)?.recommendedPriceToTest ?? 'N/A'}
                  </p>
                  <p className="text-xs text-amber-600 mt-1">Hypothesis only — not a guaranteed optimum.</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-[#96792b] mb-2">Competitor Pricing</p>
                  {((aiResult.aiAnalysis as Record<string, unknown> | undefined)?.competitorPrices as Array<{name:string;price:string;dateChecked:string}> ?? []).map((c, i) => (
                    <div key={i} className="flex justify-between text-xs py-1 border-b border-[#E8E0D0]">
                      <span className="font-medium">{c.name}</span>
                      <span className="text-[#96792b]">{c.price}</span>
                      <span className="opacity-40">Checked: {c.dateChecked}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}