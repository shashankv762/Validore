import React from 'react'
import { ScatterPlot2x2 } from '@/components/ui/ScatterPlot2x2'

const Badge = ({ label }: { label: string }) => {
  let color = 'bg-gray-100 text-gray-800 border-gray-200'
  if (label === 'VERIFIED') color = 'bg-blue-100 text-blue-800 border-blue-200'
  if (label === 'ASSUMPTION') color = 'bg-amber-100 text-amber-800 border-amber-200'
  if (label === 'PROJECTION') color = 'bg-purple-100 text-purple-800 border-purple-200'
  if (label === 'AI_ESTIMATE_UNVERIFIED') color = 'bg-orange-100 text-orange-800 border-orange-200'
  if (label === 'SYNTHETIC DATA') color = 'bg-rose-100 text-rose-800 border-rose-200'
  if (label === 'PROPOSED_STRATEGY') color = 'bg-emerald-100 text-emerald-800 border-emerald-200'
  
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${color}`}>
      {label}
    </span>
  )
}

const Section = ({ title, badge, children }: { title: string, badge?: string, children: React.ReactNode }) => (
  <div className="mb-6 card-angular p-6 bg-white border border-[#E8E0D0]">
    <div className="flex items-center justify-between mb-4 pb-2 border-b border-[#E8E0D0]">
      <h3 className="text-sm font-bold text-[#0A1628] uppercase tracking-wider">{title}</h3>
      {badge && <Badge label={badge} />}
    </div>
    <div className="text-sm text-[#1C1C1C] leading-relaxed space-y-4">
      {children}
    </div>
  </div>
)

export function PricingReport({ data }: { data: any }) {
  if (!data) return null;
  return (
    <div className="space-y-8 mt-8">
      <h2 className="text-xl font-light text-[#0A1628] mb-4 border-b border-[#E8E0D0] pb-2">Pricing Strategy Report</h2>
      
      <Section title="1. Pricing Problem" badge="AI_ESTIMATE_UNVERIFIED">
        <p className="text-xs text-[#1C1C1C] leading-relaxed">{data.pricingProblem}</p>
      </Section>

      <Section title="2. Customer Segments" badge="ASSUMPTION">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {data.customerSegments?.map((s: any, i: number) => (
            <div key={i} className="border p-3 text-xs">
              <div className="font-bold">{s.segment}</div>
              <div>Size: {s.size}</div>
              <div>WTP: ${s.wtp}</div>
              <div>Elasticity: {s.priceElasticity}</div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="3. Customer Personas" badge="AI_ESTIMATE_UNVERIFIED">
        <div className="grid grid-cols-1 gap-4">
          {data.customerPersonas?.map((p: any, i: number) => (
            <div key={i} className="border p-3 text-xs bg-[#FAFAF7]">
              <div className="font-bold text-[#96792b]">{p.name}</div>
              <div className="text-stone-600 mb-1">{p.description}</div>
              <div><b>Budget:</b> {p.budget}</div>
              <div><b>Decision Factors:</b> {p.decisionFactors?.join(', ')}</div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="4. WTP Questionnaire" badge="PROPOSED_STRATEGY">
        <div className="space-y-2 text-xs">
          {data.wtpQuestionnaire?.map((q: any, i: number) => (
            <div key={i} className="border p-2 bg-[#FAFAF7]">
              <div className="font-semibold">Q: {q.question}</div>
              <div className="pl-4 text-stone-600 italic">Options: {q.options?.join(' | ')}</div>
              <div className="text-emerald-700 mt-1">Insight: {q.insight}</div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="5. Competitor Pricing Matrix" badge="SYNTHETIC DATA">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead><tr className="border-b bg-[#F5F0E8]/70"><th className="p-2">Competitor</th><th className="p-2">Price</th><th className="p-2">Tier</th><th className="p-2">Features</th><th className="p-2">Positioning</th></tr></thead>
            <tbody>
              {data.competitorPricingMatrix?.map((c: any, i: number) => (
                <tr key={i} className="border-b"><td className="p-2">{c.competitor}</td><td className="p-2">${c.price}</td><td className="p-2">{c.tier}</td><td className="p-2">{c.features?.join(', ')}</td><td className="p-2">{c.positioning}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="6. Competitive Pricing Map" badge="AI_ESTIMATE_UNVERIFIED">
        {data.competitivePricingMap && (
          <ScatterPlot2x2 
            data={(data.competitivePricingMap || []).map((p: any) => ({
              name: p.label,
              x: p.quality,
              y: p.price,
              isHighlighted: p.isUs
            }))}
            title="Price vs Quality Positioning"
            xLabel="Quality / Value Score"
            yLabel="Price Point"
          />
        )}
      </Section>

      <Section title="7. Cost Breakdown" badge="PROJECTION">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-xs">
          <div className="border p-2 bg-[#FAFAF7]"><b>COGS:</b> ${data.costBreakdown?.cogs}</div>
          <div className="border p-2 bg-[#FAFAF7]"><b>Fixed Costs:</b> ${data.costBreakdown?.fixedCosts}</div>
          <div className="border p-2 bg-[#FAFAF7]"><b>Variable:</b> ${data.costBreakdown?.variableCosts}</div>
          <div className="border p-2 bg-[#FAFAF7]"><b>Target Margin:</b> {data.costBreakdown?.targetMargin}%</div>
          <div className="border p-2 bg-[#FAFAF7]"><b>Break-Even Price:</b> ${data.costBreakdown?.breakEvenPrice}</div>
        </div>
      </Section>

      <Section title="8. Pricing Models" badge="PROPOSED_STRATEGY">
        <div className="grid gap-4">
          {data.pricingModels?.map((m: any, i: number) => (
            <div key={i} className="border p-3 text-xs bg-[#FAFAF7]">
              <div className="font-bold flex justify-between"><span>{m.name}</span><span className="text-emerald-700">Suitability: {m.suitabilityScore}/100</span></div>
              <div className="text-stone-600 mb-2">{m.description}</div>
              <div className="mb-1"><b>Recommended Price:</b> ${m.recommendedPrice}</div>
              <div className="grid grid-cols-2 gap-2 mt-2">
                <div className="bg-emerald-50 p-2 rounded"><b>Pros:</b> {m.pros?.join(', ')}</div>
                <div className="bg-rose-50 p-2 rounded"><b>Cons:</b> {m.cons?.join(', ')}</div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="9. Psychological Pricing" badge="PROPOSED_STRATEGY">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          {data.psychologicalPricing?.map((p: any, i: number) => (
            <div key={i} className="border p-3 bg-[#FAFAF7]">
              <div className="font-bold text-[#96792b]">{p.technique}</div>
              <div className="mt-1"><b>Example:</b> {p.example}</div>
              <div className="mt-1"><b>Impact:</b> {p.psychologicalImpact}</div>
              <div className="mt-1"><b>Use Case:</b> {p.recommendedUse}</div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="10. Discount Sensitivity Table" badge="PROJECTION">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead><tr className="border-b bg-[#F5F0E8]/70"><th className="p-2">Discount Pct</th><th className="p-2">Volume Lift</th><th className="p-2">Revenue Impact</th><th className="p-2">Recommendation</th></tr></thead>
            <tbody>
              {data.discountSensitivityTable?.map((d: any, i: number) => (
                <tr key={i} className="border-b"><td className="p-2">{d.discountPct}%</td><td className="p-2">{d.expectedVolumeLift}%</td><td className="p-2">${d.netRevenueImpact}</td><td className="p-2">{d.recommendation}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="11. Price Elasticity" badge="ASSUMPTION">
        <div className="text-xs space-y-2">
          <div><b>Coefficient:</b> {data.priceElasticity?.coefficient}</div>
          <div><b>Type:</b> <span className="uppercase font-bold">{data.priceElasticity?.elasticityType}</span></div>
          <div><b>Interpretation:</b> {data.priceElasticity?.interpretation}</div>
          <div><b>Implications:</b> {data.priceElasticity?.implications?.join(', ')}</div>
        </div>
      </Section>

      <Section title="12. What-If Analysis" badge="PROJECTION">
        <div className="grid gap-2 text-xs">
          {data.whatIfAnalysis?.map((w: any, i: number) => (
            <div key={i} className="border p-2 bg-[#FAFAF7]">
              <div className="font-bold text-[#96792b]">{w.scenario}</div>
              <div className="mt-1"><b>Assumption:</b> {w.assumption}</div>
              <div className="mt-1"><b>Impact:</b> {w.financialImpact}</div>
              <div className="mt-1"><b>Recommendation:</b> {w.recommendation}</div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="13. Pricing Decision Matrix" badge="AI_ESTIMATE_UNVERIFIED">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead><tr className="border-b bg-[#F5F0E8]/70"><th className="p-2">Option</th><th className="p-2">Score</th><th className="p-2">Evidence</th><th className="p-2">Risk</th><th className="p-2">Verdict</th></tr></thead>
            <tbody>
              {data.pricingDecisionMatrix?.map((d: any, i: number) => (
                <tr key={i} className="border-b"><td className="p-2">{d.option}</td><td className="p-2">{d.score}</td><td className="p-2">{d.evidence}</td><td className="p-2 uppercase">{d.risk}</td><td className="p-2">{d.verdict}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="14. Pricing Vs Volume Matrix" badge="PROJECTION">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead><tr className="border-b bg-[#F5F0E8]/70"><th className="p-2">Price Point</th><th className="p-2">Est. Volume</th><th className="p-2">Revenue</th><th className="p-2">Margin</th></tr></thead>
            <tbody>
              {data.pricingVsVolumeMatrix?.map((p: any, i: number) => (
                <tr key={i} className="border-b"><td className="p-2">${p.pricePoint}</td><td className="p-2">{p.estimatedVolume}</td><td className="p-2">${p.revenue}</td><td className="p-2">${p.contributionMargin}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="15. Customer WTP Insights" badge="ASSUMPTION">
        <p className="text-xs text-[#1C1C1C] leading-relaxed">{data.customerWtpInsights}</p>
      </Section>

      <Section title="16. Customer Value Analysis" badge="AI_ESTIMATE_UNVERIFIED">
        <p className="text-xs text-[#1C1C1C] leading-relaxed">{data.customerValueAnalysis}</p>
      </Section>

      <Section title="17. Van Westendorp Insights" badge="PROJECTION">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
          <div className="p-2 border bg-[#FAFAF7]"><b>Too Expensive:</b><br/>{data.vanWestendorpInsights?.tooExpensive}</div>
          <div className="p-2 border bg-[#FAFAF7]"><b>Expensive:</b><br/>{data.vanWestendorpInsights?.expensive}</div>
          <div className="p-2 border bg-[#FAFAF7]"><b>Bargain:</b><br/>{data.vanWestendorpInsights?.bargain}</div>
          <div className="p-2 border bg-[#FAFAF7]"><b>Too Cheap:</b><br/>{data.vanWestendorpInsights?.tooCheap}</div>
          <div className="p-2 border bg-amber-50 col-span-full"><b>Acceptable Range:</b> {data.vanWestendorpInsights?.acceptableRange}</div>
        </div>
      </Section>

      <Section title="18. Validation Steps Required" badge="PROPOSED_STRATEGY">
        <ul className="list-disc pl-4 text-xs space-y-1 mb-4">
          {data.validationStepsRequired?.map((v: string, i: number) => (
            <li key={i}>{v}</li>
          ))}
        </ul>
        {data.thirtyDayValidationPlan && (
          <div className="mb-4 mt-4">
            <h4 className="font-bold text-xs mb-2 text-[#96792b]">30-Day Validation Plan</h4>
            <div className="grid gap-2">
              {data.thirtyDayValidationPlan.map((p: any, i: number) => (
                <div key={i} className="border p-3 text-xs bg-[#FAFAF7]">
                  <div className="font-bold">{p.week}</div>
                  <div className="mt-1">{p.activity} <span className="opacity-60">({p.owner})</span></div>
                  <div className="mt-1 text-stone-600">KPI: {p.kpi} | Expected: {p.expectedOutput}</div>
                </div>
              ))}
            </div>
          </div>
        )}
        {data.riskRegister && (
          <div className="mt-4">
            <h4 className="font-bold text-xs mb-2 text-[#96792b]">Risk Register</h4>
            <div className="grid gap-2">
              {data.riskRegister.map((r: any, i: number) => (
                <div key={i} className="border p-3 text-xs bg-[#FAFAF7]">
                  <div className="font-bold">{r.risk}</div>
                  <div className="mt-1 grid grid-cols-2 gap-2">
                    <div><b>Prob:</b> {r.probability}</div>
                    <div><b>Impact:</b> {r.impact}</div>
                  </div>
                  <div className="mt-1 text-emerald-700"><b>Mitigation:</b> {r.mitigation}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Section>
    </div>
  )
}
