'use client'

import React from 'react'
import { RiskRegisterTable } from '@/components/ui/RiskRegisterTable'
import { ActionPlanTable } from '@/components/ui/ActionPlanTable'
import { ScatterPlot2x2 } from '@/components/ui/ScatterPlot2x2'

const Badge = ({ label }: { label: string }) => {
  let color = 'bg-gray-100 text-gray-800 border-gray-200'
  if (label === 'VERIFIED') color = 'bg-blue-100 text-blue-800 border-blue-200'
  if (label === 'ASSUMPTION') color = 'bg-amber-100 text-amber-800 border-amber-200'
  if (label === 'PROJECTION') color = 'bg-purple-100 text-purple-800 border-purple-200'
  if (label === 'AI_ESTIMATE_UNVERIFIED') color = 'bg-orange-100 text-orange-800 border-orange-200'
  
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${color}`}>
      {label}
    </span>
  )
}

const Section = ({ title, badge, children }: { title: string, badge?: string, children: React.ReactNode }) => (
  <section className="mb-8">
    <div className="flex items-center justify-between mb-3 border-b border-[#E8E0D0] pb-2">
      <h3 className="font-bold text-lg text-[#0A1628]">{title}</h3>
      {badge && <Badge label={badge} />}
    </div>
    <div className="text-sm text-[#1C1C1C]/80 whitespace-pre-wrap">
      {children}
    </div>
  </section>
)

export function FullReportNarrative({ report, filters }: { report: any, filters?: any }) {
  if (!report) return null
  const data = report.reportData || report
  
  const isFilterActive = filters && (filters.customerSegment || filters.geography || filters.competitor || filters.researchSource || filters.validationStage);
  
  const showSection = (sectionName: string) => {
    if (!isFilterActive) return true;
    
    const mappings: Record<string, string[]> = {
      customerSegment: ['targetCustomer', 'valueProp', 'pricing'],
      geography: ['tamSamSom', 'unitEconomics', 'financials'],
      competitor: ['competitor', 'marketGap'],
      researchSource: ['customerResearch', 'marketResearch'],
      validationStage: ['problem', 'mvp', 'gtm', 'risk']
    };

    let belongsToAnyFilter = false;
    for (const key of Object.keys(mappings)) {
      if (mappings[key].includes(sectionName)) {
        belongsToAnyFilter = true;
        break;
      }
    }

    if (!belongsToAnyFilter) return true;

    if (filters.customerSegment && mappings.customerSegment.includes(sectionName)) return true;
    if (filters.geography && mappings.geography.includes(sectionName)) return true;
    if (filters.competitor && mappings.competitor.includes(sectionName)) return true;
    if (filters.researchSource && mappings.researchSource.includes(sectionName)) return true;
    if (filters.validationStage && mappings.validationStage.includes(sectionName)) return true;

    return false;
  };

  return (
    <div className="space-y-4 p-8 bg-[#FAFAF7] border border-[#E8E0D0] rounded shadow-sm">
      <h2 className="text-2xl font-semibold text-[#0A1628] mb-6 flex items-center gap-2">
        <span className="text-[#C8A860]">◈</span> Full 21-Section Validation Narrative
      </h2>
      
      {showSection('summary') && (
      <Section title="1. Executive Summary" badge="VERIFIED">
        {data.oneLineConcept || 'Not provided'}
      </Section>
      )}

      {showSection('mvp') && (
      <Section title="2. Startup Idea" badge="ASSUMPTION">
        {data.mvpDescription || 'Not provided'}
      </Section>
      )}

      {showSection('problem') && (
      <Section title="3. Problem" badge="AI_ESTIMATE_UNVERIFIED">
        <ul className="list-disc pl-5 space-y-1">
          <li>Frequency: {data.problemValidation5Factor?.frequency?.score}/10</li>
          <li>Severity: {data.problemValidation5Factor?.severity?.score}/10</li>
          <li>Urgency: {data.problemValidation5Factor?.urgency?.score}/10</li>
          <li>Dissatisfaction: {data.problemValidation5Factor?.dissatisfaction?.score}/10</li>
          <li>Willingness: {data.problemValidation5Factor?.willingnessToSeekSolution?.score}/10</li>
        </ul>
      </Section>
      )}

      {showSection('targetCustomer') && (
      <Section title="4. Target Customer" badge="ASSUMPTION">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(data.personas || []).map((p: any, i: number) => (
            <div key={i} className="p-4 border rounded bg-white">
              <strong>{p.name}</strong> - {p.occupation}<br/>
              <em>{p.jobToBeDone}</em>
            </div>
          ))}
        </div>
      </Section>
      )}

      {showSection('founderAssumptions') && (
      <Section title="5. Founder Hypotheses" badge="ASSUMPTION">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b">
                <th className="py-2">Category</th>
                <th className="py-2">Pre-Research</th>
                <th className="py-2">Post-Research</th>
                <th className="py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {(data.founderAssumptions || []).map((fa: any, i: number) => (
                <tr key={i} className="border-b">
                  <td className="py-2">{fa.category}</td>
                  <td className="py-2">{fa.preResearchBelief}</td>
                  <td className="py-2">{fa.postResearchFinding}</td>
                  <td className="py-2">
                    <span className={`px-2 py-1 text-xs rounded ${fa.validated ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                      {fa.validated ? 'Validated' : 'Invalidated'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
      )}

      {showSection('customerResearch') && (
      <Section title="6. Customer Research" badge="VERIFIED">
        <h4 className="font-bold mb-2">Interview Questions</h4>
        <ul className="list-decimal pl-5 space-y-1">
          {(data.interviewQuestions || []).map((q: any, i: number) => (
            <li key={i}>{q.question} <span className="text-xs text-gray-500">({q.category})</span></li>
          ))}
        </ul>
      </Section>
      )}

      {showSection('marketResearch') && (
      <Section title="7. Market Research" badge="AI_ESTIMATE_UNVERIFIED">
        <h4 className="font-bold mb-2">PESTLE Analysis</h4>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {Object.entries(data.pestleAnalysis || {}).map(([key, vals]: [string, any]) => (
            <div key={key}>
              <strong className="capitalize">{key}</strong>
              <ul className="list-disc pl-4 text-xs mt-1">
                {(vals || []).map((v: string, j: number) => <li key={j}>{v}</li>)}
              </ul>
            </div>
          ))}
        </div>
      </Section>
      )}

      {showSection('tamSamSom') && (
      <Section title="8. TAM-SAM-SOM" badge="PROJECTION">
        <div className="flex gap-4">
          <div><strong>TAM:</strong> {data.tamSamSom?.tam?.value}</div>
          <div><strong>SAM:</strong> {data.tamSamSom?.sam?.value}</div>
          <div><strong>SOM:</strong> {data.tamSamSom?.som?.value}</div>
        </div>
      </Section>
      )}

      {showSection('competitor') && (
      <Section title="9. Competitor Analysis" badge="VERIFIED">
        <div className="h-[400px]">
          <ScatterPlot2x2 
            data={(data.competitorPositioning || []).map((c: any) => ({
              name: c.name, x: c.x, y: c.y, isHighlighted: c.isOurStartup
            }))}
            xLabel="Affordability"
            yLabel="Specialization"
            xMin={0} xMax={100}
          />
        </div>
      </Section>
      )}

      {showSection('marketGap') && (
      <Section title="10. Market Gap" badge="AI_ESTIMATE_UNVERIFIED">
        <h4 className="font-bold mb-2">Porter's Five Forces</h4>
        <ul className="list-disc pl-5 space-y-1">
          {Object.entries(data.portersFiveForces || {}).map(([key, val]: [string, any]) => (
             <li key={key} className="capitalize">
               {key.replace(/([A-Z])/g, ' $1').trim()}: <strong>{val?.level}</strong> - {val?.reasoning}
             </li>
          ))}
        </ul>
      </Section>
      )}

      {showSection('valueProp') && (
      <Section title="11. Value Proposition" badge="VERIFIED">
        <div className="p-4 bg-white border rounded">
          <h4 className="font-bold text-center mb-4">Value Proposition Canvas</h4>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <strong>Customer Profile</strong>
              <ul className="list-disc pl-4 text-xs">
                <li>Jobs: {data.customerJPG?.jobs?.join(', ')}</li>
                <li>Pains: {data.customerJPG?.pains?.join(', ')}</li>
                <li>Gains: {data.customerJPG?.gains?.join(', ')}</li>
              </ul>
            </div>
            <div>
              <strong>Value Map</strong>
              <ul className="list-disc pl-4 text-xs">
                <li>Pain Relievers: {data.customerJPG?.painRelievers?.join(', ')}</li>
                <li>Gain Creators: {data.customerJPG?.gainCreators?.join(', ')}</li>
              </ul>
            </div>
          </div>
        </div>
      </Section>
      )}

      {showSection('mvp') && (
      <Section title="12. MVP" badge="ASSUMPTION">
        <div className="p-4 border rounded bg-white">
          <h4 className="font-bold mb-2">Landing Page Copy</h4>
          <h1 className="text-xl font-bold">{data.landingPageCopy?.headline}</h1>
          <h2 className="text-lg text-gray-600 mb-4">{data.landingPageCopy?.subheadline}</h2>
          <ul className="list-disc pl-5 mb-4">
            {(data.landingPageCopy?.benefits || []).map((b: string, i: number) => <li key={i}>{b}</li>)}
          </ul>
          <button className="bg-blue-600 text-white px-4 py-2 rounded">{data.landingPageCopy?.cta}</button>
        </div>
      </Section>
      )}

      {showSection('pricing') && (
      <Section title="13. Pricing" badge="ASSUMPTION">
        <h4 className="font-bold mb-2">WTP Survey Questions</h4>
        <ul className="list-decimal pl-5 space-y-2">
          {(data.wtpSurveyQuestions || []).map((q: any, i: number) => (
            <li key={i}>
              {q.question} <span className="text-xs text-gray-500">({q.type})</span>
              {q.options && <div className="text-xs ml-2">Options: {q.options.join(', ')}</div>}
            </li>
          ))}
        </ul>
      </Section>
      )}

      {showSection('businessModel') && (
      <Section title="14. Business Model" badge="PROJECTION">
        <div><strong>Revenue Streams:</strong> {data.businessModel || 'Standard SaaS'}</div>
      </Section>
      )}

      {showSection('unitEconomics') && (
  <Section title="15. Unit Economics" badge="PROJECTION">
    <ul className="list-disc pl-5 space-y-1">
      <li>CAC Target: {data.unitEconomics?.cacTarget || data.financialProjections?.cacTarget || 'See pricing analysis'}</li>
      <li>LTV Target: {data.unitEconomics?.ltvTarget || data.financialProjections?.ltvTarget || 'See pricing analysis'}</li>
      <li>LTV:CAC Ratio: {data.unitEconomics?.ltvCacRatio || 'Calculate in Pricing module'}</li>
      <li>Payback Period: {data.unitEconomics?.paybackMonths || 'Calculate in Pricing module'}</li>
    </ul>
  </Section>
)}

      {showSection('financials') && (
  <Section title="16. Financial Feasibility" badge="PROJECTION">
    {data.financialProjections ? (
      <ul className="list-disc pl-5 space-y-1">
        <li>Break-even Month: {data.financialProjections.breakEvenMonth || 'TBD'}</li>
        <li>Capital Required: {data.financialProjections.capitalRequired || 'TBD'}</li>
        <li>Gross Margin Target: {data.financialProjections.grossMarginTarget || 'TBD'}</li>
        <li>Year 1 Revenue Projection: {data.financialProjections.year1Revenue || 'TBD'}</li>
      </ul>
    ) : (
      <p className="text-gray-500 italic">Financial projections available after running the Pricing Simulator module.</p>
    )}
  </Section>
)}

      {showSection('gtm') && (
  <Section title="17. GTM Strategy" badge="ASSUMPTION">
    {data.gtmStrategy ? (
      <div>
        <h4 className="font-bold mb-2">Go-to-Market Channels</h4>
        <ul className="list-disc pl-5 space-y-1">
          {(data.gtmStrategy.channels || data.gtmStrategy.primaryChannels || []).map((ch: string, i: number) => (
            <li key={i}>{ch}</li>
          ))}
        </ul>
        {data.gtmStrategy.approach && <p className="mt-2">{data.gtmStrategy.approach}</p>}
      </div>
    ) : (
      <p className="text-gray-500 italic">GTM strategy details available in the Pitch Deck module.</p>
    )}
  </Section>
)}

      {showSection('risk') && (
      <Section title="18. Risk Analysis" badge="AI_ESTIMATE_UNVERIFIED">
        <RiskRegisterTable risks={data.riskRegister || []} />
      </Section>
      )}

      {showSection('score') && (
      <Section title="19. Validation Score" badge="VERIFIED">
        <div className="text-2xl font-bold">Score: {data.validationScore || data.overallScore || 0}/100</div>
      </Section>
      )}

      {showSection('recommendation') && (
      <Section title="20. Final Recommendation" badge="AI_ESTIMATE_UNVERIFIED">
        <strong>{data.nextStepRecommendation}</strong>
        <p className="mt-2">{data.nextStepRationale}</p>
      </Section>
      )}

      {showSection('actionPlan') && (
      <Section title="21. 30-Day Action Plan" badge="PROJECTION">
        <ActionPlanTable plan={data.actionPlan || []} />
      </Section>
      )}

    </div>
  )
}
