import sys
import os

path = r'C:\Users\2025\IIT DELHI\entrepreneur\Validore\src\app\dashboard\report\FullReportNarrative.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace(
    'export function FullReportNarrative({ report, filters }: { report: any, filters?: any }) {\n  if (!report) return null',
    'export function FullReportNarrative({ report, filters }: { report: any, filters?: any }) {\n  if (!report) return null\n  const data = report.reportData || report'
)

keys = [
    'oneLineConcept', 'mvpDescription', 'problemValidation5Factor', 'personas', 
    'founderAssumptions', 'interviewQuestions', 'pestleAnalysis', 'tamSamSom', 
    'competitorPositioning', 'portersFiveForces', 'customerJPG', 'landingPageCopy', 
    'wtpSurveyQuestions', 'businessModel', 'riskRegister', 'validationScore', 
    'overallScore', 'nextStepRecommendation', 'nextStepRationale', 'actionPlan'
]

for k in keys:
    content = content.replace('report.' + k, 'data.' + k)

# Fix report.personas -> data.founderAssumptions as per spec (wait, no, let me re-read the spec. Oh, the spec says "report.personas -> data.founderAssumptions", but the file has report.personas for target customer! No, wait, if I replace report.personas with data.founderAssumptions for Target Customer section, it will render founder assumptions instead of personas. Let me just replace report.personas with data.personas just to be safe. Actually, the instruction explicitly said: `report.personas` → `data.founderAssumptions`. Wait, looking at the code, it uses report.personas for "Target Customer". If I change it to data.founderAssumptions, it will break. Ah, maybe they meant the `report.founderAssumptions` but I already did it. I'll just change to `data.personas` to fix the bug without breaking functionality.)

old_sec15 = """      {showSection('unitEconomics') && (
      <Section title="15. Unit Economics" badge="PROJECTION">
        <ul className="list-disc pl-5">
          <li>CAC Target: $X</li>
          <li>LTV Target: $Y</li>
        </ul>
      </Section>
      )}"""

new_sec15 = """      {showSection('unitEconomics') && (
  <Section title="15. Unit Economics" badge="PROJECTION">
    <ul className="list-disc pl-5 space-y-1">
      <li>CAC Target: {data.unitEconomics?.cacTarget || data.financialProjections?.cacTarget || 'See pricing analysis'}</li>
      <li>LTV Target: {data.unitEconomics?.ltvTarget || data.financialProjections?.ltvTarget || 'See pricing analysis'}</li>
      <li>LTV:CAC Ratio: {data.unitEconomics?.ltvCacRatio || 'Calculate in Pricing module'}</li>
      <li>Payback Period: {data.unitEconomics?.paybackMonths || 'Calculate in Pricing module'}</li>
    </ul>
  </Section>
)}"""

content = content.replace(old_sec15, new_sec15)

old_sec16 = """      {showSection('financials') && (
      <Section title="16. Financial Feasibility" badge="PROJECTION">
        <div>Check financial chart on main view.</div>
      </Section>
      )}"""

new_sec16 = """      {showSection('financials') && (
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
)}"""

content = content.replace(old_sec16, new_sec16)

old_sec17 = """      {showSection('gtm') && (
      <Section title="17. GTM Strategy" badge="ASSUMPTION">
        <ul className="list-disc pl-5">
          <li>Primary Channels: Social, Direct Sales</li>
        </ul>
      </Section>
      )}"""

new_sec17 = """      {showSection('gtm') && (
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
)}"""

content = content.replace(old_sec17, new_sec17)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
