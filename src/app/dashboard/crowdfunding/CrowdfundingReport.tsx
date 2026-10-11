import React from 'react'

const Badge = ({ label }: { label: string }) => {
  let color = 'bg-gray-100 text-gray-800 border-gray-200'
  if (label === 'VERIFIED') color = 'bg-blue-100 text-blue-800 border-blue-200'
  if (label === 'ASSUMPTION') color = 'bg-amber-100 text-amber-800 border-amber-200'
  if (label === 'PROJECTION') color = 'bg-purple-100 text-purple-800 border-purple-200'
  if (label === 'AI_ESTIMATE_UNVERIFIED') color = 'bg-orange-100 text-orange-800 border-orange-200'
  if (label === 'SYNTHETIC DATA') color = 'bg-rose-100 text-rose-800 border-rose-200'
  
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

export function CrowdfundingReport({ data }: { data: any }) {
  if (!data) return null;

  return (
    <div className="space-y-8 mt-8">
      <h2 className="text-xl font-light text-[#0A1628] border-b border-[#E8E0D0] pb-2">Deep Campaign Analysis</h2>
      
      <Section title="1. Founder Assumptions" badge="ASSUMPTION">
        <ul className="list-disc pl-5 space-y-1">
          {(data.founderAssumptions || []).map((a: string, i: number) => <li key={i}>{a}</li>)}
        </ul>
      </Section>
      
      <Section title="2. Funding Probability Bands" badge="PROJECTION">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(data.fundingBands || []).map((b: any, i: number) => (
            <div key={i} className="p-3 bg-[#FAFAF7] border border-[#E8E0D0]">
              <div className="font-bold">{b.range} (Prob: {b.probability}%)</div>
              <ul className="list-disc pl-5 mt-2 text-xs">
                {(b.tips || []).map((t: string, j: number) => <li key={j}>{t}</li>)}
              </ul>
            </div>
          ))}
        </div>
      </Section>
      
      <Section title="3. Goal Multiple Analysis" badge="SYNTHETIC DATA">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b bg-[#F5F0E8]/70">
                <th className="py-2 px-2">Goal Multiple</th>
                <th className="py-2 px-2">Success Rate</th>
                <th className="py-2 px-2">Insight</th>
              </tr>
            </thead>
            <tbody>
              {(data.goalBands || []).map((g: any, i: number) => (
                <tr key={i} className="border-b">
                  <td className="py-2 px-2 font-mono">{g.goalMultiple}</td>
                  <td className="py-2 px-2">{g.successRate}%</td>
                  <td className="py-2 px-2 text-stone-600">{g.insight}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
      
      <Section title="4. Backer Segments" badge="ASSUMPTION">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {(data.backerSegments || []).map((b: any, i: number) => (
            <div key={i} className="p-3 bg-white border border-[#E8E0D0] shadow-sm">
              <div className="font-bold text-[#96792b]">{b.segment} ({b.percentage}%)</div>
              <div className="text-xs mt-1">Avg Pledge: ${b.avgPledge}</div>
              <div className="text-xs mt-2 italic text-stone-600">{b.motivation}</div>
            </div>
          ))}
        </div>
      </Section>
      
      <Section title="5. Reward Economics" badge="PROJECTION">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b bg-[#F5F0E8]/70">
                <th className="py-2 px-2">Tier</th>
                <th className="py-2 px-2">Cost</th>
                <th className="py-2 px-2">Revenue</th>
                <th className="py-2 px-2">ROI</th>
                <th className="py-2 px-2">Recommendation</th>
              </tr>
            </thead>
            <tbody>
              {(data.rewardEconomics || []).map((r: any, i: number) => (
                <tr key={i} className="border-b">
                  <td className="py-2 px-2 font-bold">{r.tier}</td>
                  <td className="py-2 px-2">${r.cost}</td>
                  <td className="py-2 px-2">${r.revenue}</td>
                  <td className="py-2 px-2">{r.roi}%</td>
                  <td className="py-2 px-2 text-stone-600">{r.recommendation}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
      
      <Section title="6. Campaign Duration Analysis" badge="SYNTHETIC DATA">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(data.campaignDurationAnalysis || []).map((c: any, i: number) => (
            <div key={i} className="p-3 bg-[#FAFAF7] border border-[#E8E0D0]">
              <div className="font-bold">{c.duration}</div>
              <div className="text-xs mt-1">Success Rate: {c.successRate}% | Avg Funded: {c.avgFunded}%</div>
              <div className="text-xs mt-2 text-stone-600">{c.insight}</div>
            </div>
          ))}
        </div>
      </Section>
      
      <Section title="7. Category Benchmark" badge="SYNTHETIC DATA">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-3 bg-white border border-[#E8E0D0]">
            <div className="text-xs text-stone-500">Median Goal</div>
            <div className="font-mono text-lg text-[#96792b]">${data.categoryBenchmark?.medianGoal}</div>
          </div>
          <div className="p-3 bg-white border border-[#E8E0D0]">
            <div className="text-xs text-stone-500">Median Funded</div>
            <div className="font-mono text-lg text-[#96792b]">${data.categoryBenchmark?.medianFunded}</div>
          </div>
          <div className="p-3 bg-white border border-[#E8E0D0]">
            <div className="text-xs text-stone-500">Median Backers</div>
            <div className="font-mono text-lg text-[#96792b]">{data.categoryBenchmark?.medianBackers}</div>
          </div>
          <div className="p-3 bg-white border border-[#E8E0D0]">
            <div className="text-xs text-stone-500">Success Rate</div>
            <div className="font-mono text-lg text-[#96792b]">{data.categoryBenchmark?.successRate}%</div>
          </div>
        </div>
      </Section>
      
      <Section title="8. Campaign Page Scorecard" badge="AI_ESTIMATE_UNVERIFIED">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {Object.entries(data.campaignPageScorecard || {}).map(([k, v]) => (
            k !== 'totalScore' && (
              <div key={k} className="flex justify-between items-center p-2 border-b border-[#E8E0D0]">
                <span className="capitalize text-xs">{k.replace(/([A-Z])/g, ' $1').trim()}</span>
                <span className="font-bold">{String(v)}/10</span>
              </div>
            )
          ))}
          <div className="col-span-full text-right font-bold text-[#96792b]">
            Total Score: {data.campaignPageScorecard?.totalScore}/50
          </div>
        </div>
      </Section>
      
      <Section title="9. Campaign Story Scorecard" badge="AI_ESTIMATE_UNVERIFIED">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {Object.entries(data.campaignStoryScorecard || {}).map(([k, v]) => (
            k !== 'totalScore' && (
              <div key={k} className="flex justify-between items-center p-2 border-b border-[#E8E0D0]">
                <span className="capitalize text-xs">{k.replace(/([A-Z])/g, ' $1').trim()}</span>
                <span className="font-bold">{String(v)}/10</span>
              </div>
            )
          ))}
          <div className="col-span-full text-right font-bold text-[#96792b]">
            Total Score: {data.campaignStoryScorecard?.totalScore}/50
          </div>
        </div>
      </Section>
      
      <Section title="10. Early Momentum Analysis" badge="PROJECTION">
        <div className="p-4 bg-[#FAFAF7] border border-[#E8E0D0] mb-4">
          <div className="font-bold text-[#0A1628] mb-2">Momentum Strategy</div>
          <ul className="list-disc pl-5 text-sm">
            {(data.earlyMomentumAnalysis?.momentumStrategy || []).map((s: string, i: number) => <li key={i}>{s}</li>)}
          </ul>
          <div className="mt-4 pt-4 border-t border-[#E8E0D0]">
            <div className="font-bold text-sm">Early Bird Recommendation:</div>
            <div className="text-sm mt-1">{data.earlyMomentumAnalysis?.earlyBirdRecommendation}</div>
          </div>
        </div>
      </Section>
      
      <Section title="11. Marketing Funnel" badge="ASSUMPTION">
        <div className="space-y-4">
          <div className="p-3 bg-white border border-[#E8E0D0]">
            <div className="font-bold text-[#96792b]">Awareness (Est Reach: {data.marketingFunnel?.awareness?.estimatedReach})</div>
            <div className="text-xs mt-1">Channels: {data.marketingFunnel?.awareness?.channels?.join(', ')}</div>
          </div>
          <div className="p-3 bg-white border border-[#E8E0D0]">
            <div className="font-bold text-[#96792b]">Consideration</div>
            <div className="text-xs mt-1">Tactics: {data.marketingFunnel?.consideration?.tactics?.join(', ')}</div>
          </div>
          <div className="p-3 bg-white border border-[#E8E0D0]">
            <div className="font-bold text-[#96792b]">Conversion</div>
            <div className="text-xs mt-1">CTA: {data.marketingFunnel?.conversion?.cta}</div>
            <div className="text-xs mt-1">Urgency Tactics: {data.marketingFunnel?.conversion?.urgencyTactics?.join(', ')}</div>
          </div>
        </div>
      </Section>
      
      <Section title="12. Social Proof Analysis" badge="AI_ESTIMATE_UNVERIFIED">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-3 bg-white border border-[#E8E0D0]">
            <div className="font-bold text-emerald-700">Strengths</div>
            <ul className="list-disc pl-5 mt-2 text-xs">
              {(data.socialProofAnalysis?.currentStrengths || []).map((s: string, i: number) => <li key={i}>{s}</li>)}
            </ul>
          </div>
          <div className="p-3 bg-white border border-[#E8E0D0]">
            <div className="font-bold text-rose-700">Gaps</div>
            <ul className="list-disc pl-5 mt-2 text-xs">
              {(data.socialProofAnalysis?.gaps || []).map((s: string, i: number) => <li key={i}>{s}</li>)}
            </ul>
          </div>
          <div className="p-3 bg-[#FAFAF7] border border-[#E8E0D0] md:col-span-2">
            <div className="font-bold">Recommendations</div>
            <ul className="list-disc pl-5 mt-2 text-xs">
              {(data.socialProofAnalysis?.recommendations || []).map((s: string, i: number) => <li key={i}>{s}</li>)}
            </ul>
          </div>
        </div>
      </Section>
      
      <Section title="13. Pre-Launch Checklist" badge="PROPOSED_STRATEGY">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b bg-[#F5F0E8]/70">
                <th className="py-2 px-2">Item</th>
                <th className="py-2 px-2">Status</th>
                <th className="py-2 px-2">Impact</th>
                <th className="py-2 px-2">Days to Complete</th>
              </tr>
            </thead>
            <tbody>
              {(data.preLaunchChecklist || []).map((c: any, i: number) => (
                <tr key={i} className="border-b">
                  <td className="py-2 px-2">{c.item}</td>
                  <td className="py-2 px-2">
                    <span className="px-2 py-0.5 rounded bg-gray-100 uppercase">{c.status}</span>
                  </td>
                  <td className="py-2 px-2 uppercase">{c.impact}</td>
                  <td className="py-2 px-2">{c.daysToComplete}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
      
      {/* 14, 15, 16, 17 are included in the KPI cards which we will put in the page directly or we can add them here */}
    </div>
  )
}
