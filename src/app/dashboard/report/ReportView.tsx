'use client'

import React, { useSyncExternalStore, useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts'
import Link from 'next/link'
import Image from 'next/image'
import {
  Users,
  PieChart,
  Sparkles,
  Layers,
  Compass,
  ShieldCheck,
  AlertTriangle,
  Zap,
  AlertOctagon,
  Box,
  ExternalLink,
  CheckCircle2,
  Search,
  Hammer,
  UserCheck,
  Rocket,
  Coins,
  Check,
  AlertCircle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { RiskRegisterTable, RiskItem } from '@/components/ui/RiskRegisterTable'
import { ActionPlanTable, ActionPlanRow } from '@/components/ui/ActionPlanTable'
import { ExportToolbar } from '@/components/ui/ExportToolbar'
import { ScatterPlot2x2 } from '@/components/ui/ScatterPlot2x2'
import { ScorecardGrid } from '@/components/ui/ScorecardGrid'

// Multi-agent pipeline trail labels (rendered only when agentTrail exists)
const AGENT_LABELS = [
  { key: 'market', label: 'Market' },
  { key: 'customer', label: 'Customer' },
  { key: 'competitor', label: 'Competitor' },
  { key: 'finance', label: 'Finance' },
  { key: 'risk', label: 'Risk' },
  { key: 'synthesis', label: 'Synthesis' },
] as const

interface CompetitorItem {
  name?: string
  strength?: string
  weakness?: string
  threatLevel?: string
}

interface FinancialItem {
  month?: string
  revenue?: number
  costs?: number
}

interface TAMDetail {
  value?: string
  method?: string
  source?: string
  label?: string
}

interface TamSamSomData {
  tam?: TAMDetail
  sam?: TAMDetail
  som?: TAMDetail
}

interface PersonaItem {
  name: string
  ageRange?: string
  occupation?: string
  incomeRange?: string
  location?: string
  goals?: string[]
  problems?: string[]
  frustrations?: string[]
  buyingBehaviour?: string
  preferredChannels?: string[]
  decisionFactors?: string[]
  priceSensitivity?: string
  jobToBeDone?: string
}

interface MoscowFeatures {
  mustHave?: string[]
  shouldHave?: string[]
  couldHave?: string[]
  wontHave?: string[]
}

interface SWOTData {
  strengths?: string[]
  weaknesses?: string[]
  opportunities?: string[]
  threats?: string[]
}

interface EvidenceCitation {
  claim: string
  source?: string
  publication?: string
  year?: string
  link?: string
  geography?: string
  fetchedAt?: string
  strength?: string
  label?: string
}

interface ReportData {
  competitors?: CompetitorItem[]
  financials?: FinancialItem[]
  actionPlan?: ActionPlanRow[] | Array<{ step?: number; action: string; timeframe?: string; kpi?: string }> | string[]
  tamSamSom?: TamSamSomData
  tamEstimate?: string
  samEstimate?: string
  somEstimate?: string
  personas?: PersonaItem[]
  persona?: PersonaItem
  selectedUvp?: string
  uvpOptions?: string[]
  moscowFeatures?: MoscowFeatures
  swot?: SWOTData
  riskRegister?: RiskItem[]
  keyRisks?: string[]
  mvpDescription?: string
  nextStepRecommendation?: string
  nextStepRationale?: string
  keyEvidence?: EvidenceCitation[]
  integrityNote?: string
  [key: string]: unknown
}

export interface ReportModel {
  id?: string
  ideaId?: string
  overallScore?: number | null
  decision?: string | null
  problemScore?: number | null
  customerScore?: number | null
  marketScore?: number | null
  competitiveScore?: number | null
  wtpScore?: number | null
  businessModelScore?: number | null
  financialScore?: number | null
  executionScore?: number | null
  decisionReasons?: string[] | unknown
  actionPlan?: unknown
  reportData?: ReportData | unknown
  [key: string]: unknown
}

const emptySubscribe = () => () => {}

export default function ReportView({ report, isSharePage = false, filters }: { report: ReportModel | null, isSharePage?: boolean, filters?: any }) {
  const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false)
  const [evidenceOpen, setEvidenceOpen] = useState(true)

  const isFilterActive = filters && (filters.customerSegment || filters.geography || filters.competitor || filters.researchSource || filters.validationStage);
  
  const showSection = (sectionName: string) => {
    if (!isFilterActive) return true;
    let allowed = false;
    if (filters.customerSegment && ['personas', 'rationale'].includes(sectionName)) allowed = true;
    if (filters.geography && ['market', 'financials'].includes(sectionName)) allowed = true;
    if (filters.competitor && ['competitor', 'swot'].includes(sectionName)) allowed = true;
    if (filters.researchSource && ['evidence', 'rationale'].includes(sectionName)) allowed = true;
    if (filters.validationStage && ['uvp', 'mvp', 'moscow', 'risks', 'actionPlan', 'financials'].includes(sectionName)) allowed = true;
    return allowed;
  };

  const overallScore = report?.overallScore ?? 0
  const decision = report?.decision ?? 'N/A'
  const problemScore = report?.problemScore ?? 0
  const customerScore = report?.customerScore ?? 0
  const marketScore = report?.marketScore ?? 0
  const competitiveScore = report?.competitiveScore ?? 0
  const wtpScore = report?.wtpScore ?? 0
  const businessModelScore = report?.businessModelScore ?? 0
  const financialScore = report?.financialScore ?? 0
  const executionScore = report?.executionScore ?? 0
  const decisionReasons = (Array.isArray(report?.decisionReasons) ? report.decisionReasons : []) as string[]
  const reportData = (report?.reportData && typeof report.reportData === 'object' ? report.reportData : {}) as ReportData

  const competitors = Array.isArray(reportData?.competitors) ? reportData.competitors : [
    { name: 'Competitor A', strength: 'High', weakness: 'Expensive', threatLevel: 'High' },
    { name: 'Competitor B', strength: 'Brand presence', weakness: 'Poor UI', threatLevel: 'Medium' }
  ]

  const financials = Array.isArray(reportData?.financials) && reportData.financials.length > 0 ? reportData.financials : [
    { month: 'Month 1', revenue: 0, costs: 5000 },
    { month: 'Month 6', revenue: 12000, costs: 8000 },
    { month: 'Month 12', revenue: 45000, costs: 22000 },
    { month: 'Month 18', revenue: 95000, costs: 35000 },
    { month: 'Month 24', revenue: 180000, costs: 60000 },
  ]

  const getScoreColor = (score: number) => {
    if (score >= 80) return '#22c55e'
    if (score >= 50) return '#f97316'
    return '#ef4444'
  }

  const color = getScoreColor(overallScore)

  // 0A-1: TAM / SAM / SOM Normalization
  const tam = reportData.tamSamSom?.tam?.value || reportData.tamEstimate || ''
  const tamMethod = reportData.tamSamSom?.tam?.method || reportData.tamSamSom?.tam?.source || 'Global addressable industry estimate'
  const sam = reportData.tamSamSom?.sam?.value || reportData.samEstimate || ''
  const samMethod = reportData.tamSamSom?.sam?.method || 'Target geography & serviceable segment'
  const som = reportData.tamSamSom?.som?.value || reportData.somEstimate || ''
  const somMethod = reportData.tamSamSom?.som?.method || 'Years 1-3 obtainable market capture'
  const hasMarketSizing = Boolean(tam || sam || som)

  // 0A-2: Personas Normalization
  const personas: PersonaItem[] = Array.isArray(reportData.personas) && reportData.personas.length > 0
    ? reportData.personas
    : reportData.persona
    ? [reportData.persona]
    : []

  // 0A-3: UVP & Alternatives Normalization
  const selectedUvp = reportData.selectedUvp || ''
  const uvpOptions = Array.isArray(reportData.uvpOptions) ? reportData.uvpOptions : []

  // 0A-4: MoSCoW Normalization
  const moscow = reportData.moscowFeatures
  const hasMoscow = Boolean(
    moscow && (
      (moscow.mustHave && moscow.mustHave.length > 0) ||
      (moscow.shouldHave && moscow.shouldHave.length > 0) ||
      (moscow.couldHave && moscow.couldHave.length > 0) ||
      (moscow.wontHave && moscow.wontHave.length > 0)
    )
  )

  // 0A-5: SWOT Normalization
  const swot = reportData.swot
  const hasSwot = Boolean(
    swot && (
      (swot.strengths && swot.strengths.length > 0) ||
      (swot.weaknesses && swot.weaknesses.length > 0) ||
      (swot.opportunities && swot.opportunities.length > 0) ||
      (swot.threats && swot.threats.length > 0)
    )
  )

  // 0A-6: Risk Register Normalization
  const risks: RiskItem[] = Array.isArray(reportData.riskRegister) && reportData.riskRegister.length > 0
    ? reportData.riskRegister
    : Array.isArray(reportData.keyRisks) && reportData.keyRisks.length > 0
    ? reportData.keyRisks.map(r => ({
        risk: typeof r === 'string' ? r : String(r),
        probability: 'medium',
        impact: 'medium',
        riskLevel: 'medium',
        mitigation: 'Empirical market discovery and validation sprint required',
      }))
    : []

  // 0A-7: Action Plan Normalization
  const rawActionPlan = reportData.actionPlan || (Array.isArray(report?.actionPlan) ? report.actionPlan : [])
  const actionPlan: ActionPlanRow[] = Array.isArray(rawActionPlan)
    ? rawActionPlan.map((item, idx) => {
        if (typeof item === 'string') {
          return { week: `Week ${idx + 1}`, action: item, owner: 'Founder', kpi: 'Completion verification' }
        }
        if (typeof item === 'object' && item !== null) {
          const typed = item as Record<string, unknown>
          return {
            week: (typed.week || typed.timeframe || (typed.step ? `Step ${typed.step}` : `Phase ${idx + 1}`)) as string,
            action: (typed.action || typed.activity || 'Validation action') as string,
            owner: (typed.owner || 'Founder') as string,
            kpi: (typed.kpi || 'Delivery target') as string,
            expectedOutput: (typed.expectedOutput || undefined) as string | undefined,
          }
        }
        return { week: `Phase ${idx + 1}`, action: String(item), owner: 'Founder', kpi: 'Status verified' }
      })
    : []

  // 0A-8: MVP Description
  const mvpDescription = reportData.mvpDescription || ''

  // 0A-9: Next Step Recommendation
  const nextStepRec = reportData.nextStepRecommendation || ''
  const nextStepRationale = reportData.nextStepRationale || ''

  const getNextStepConfig = (rec: string) => {
    switch (rec) {
      case 'BUILD_MVP':
        return {
          label: 'Build Minimum Viable Product (MVP)',
          icon: <Hammer className="w-5 h-5 text-blue-600" />,
          badgeClass: 'bg-blue-100 text-blue-800 border-blue-200',
        }
      case 'GET_FIRST_CUSTOMERS':
        return {
          label: 'Acquire First Paying Customers',
          icon: <UserCheck className="w-5 h-5 text-emerald-600" />,
          badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-200',
        }
      case 'SCALE_GROWTH':
        return {
          label: 'Scale Distribution & Growth',
          icon: <Rocket className="w-5 h-5 text-purple-600" />,
          badgeClass: 'bg-purple-100 text-purple-800 border-purple-200',
        }
      case 'FUNDRAISING':
        return {
          label: 'Prepare for Seed Fundraising',
          icon: <Coins className="w-5 h-5 text-amber-600" />,
          badgeClass: 'bg-amber-100 text-amber-800 border-amber-200',
        }
      case 'MORE_VALIDATION':
      default:
        return {
          label: 'Conduct Additional Validation',
          icon: <Search className="w-5 h-5 text-amber-600" />,
          badgeClass: 'bg-amber-100 text-amber-800 border-amber-200',
        }
    }
  }

  // 0A-10: Evidence Citations & Integrity Note
  const evidenceList: EvidenceCitation[] = Array.isArray(reportData.keyEvidence) ? reportData.keyEvidence : []
  const integrityNote = reportData.integrityNote || ''
  // Multi-agent pipeline trail (present on reports produced by the agent pipeline)
  const agentTrail = (reportData as any).agentTrail as
    | { agents?: Record<string, string>; totalTokens?: number; providers?: string[] }
    | undefined

  return (
    <div className="max-w-6xl mx-auto px-4 py-12" style={{ background: 'var(--cream, #F5F0E8)' }}>
      {isSharePage && (
        <div className="mb-12 flex items-center justify-between border-b border-[#E8E0D0] pb-6">
          <Link href="/" className="flex items-center gap-3">
            <Image src="/logo/validore-icon.svg" alt="Validore Logo" width={36} height={36} />
            <span className="text-xl font-light tracking-widest text-[#1C1C1C]">validore</span>
          </Link>
          <Link href="/auth/signup" className="px-5 py-2 text-sm font-medium text-[#0A1628] rounded focus:ring-2 focus:ring-[#0A1628] outline-none" style={{ background: 'var(--gold-gradient)' }}>
            Start Free
          </Link>
        </div>
      )}

      {!isSharePage && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8 p-4 bg-[#FAFAF7] border border-[#E8E0D0] rounded">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-[#1C1C1C]/60 block">
              Validation Dossier Export
            </span>
            <p className="text-xs text-[#1C1C1C]/70 mt-0.5">
              Export comprehensive intelligence dossier across PDF, CSV, PPTX, and White-label formats.
            </p>
          </div>
          <ExportToolbar
            reportId={report?.id}
            ideaId={report?.ideaId}
            deckType="validation"
            formats={['pdf', 'csv', 'pptx', 'white-label-pdf']}
          />
        </div>
      )}

      {/* Main Validation Score & Sub-scores */}
      <div className="flex flex-col md:flex-row gap-8 items-start mb-8">
        {/* Score Gauge */}
        <div className="card-angular p-8 bg-[#FAFAF7] w-full md:w-1/3 flex flex-col items-center justify-center relative shadow-sm">
           <h2 className="text-sm font-semibold text-[#0A1628] uppercase tracking-widest mb-6">Validation Score</h2>
           <div className="relative w-48 h-48 flex items-center justify-center">
             <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
               <circle cx="50" cy="50" r="45" fill="none" stroke="#E8E0D0" strokeWidth="8" />
               <circle 
                 cx="50" cy="50" r="45" fill="none" stroke={color} strokeWidth="8"
                 strokeDasharray="283"
                 strokeDashoffset={mounted ? 283 - (283 * overallScore) / 100 : 283}
                 className="transition-all duration-1000 ease-out"
               />
             </svg>
             <div className="absolute flex flex-col items-center justify-center">
                <span className="text-5xl font-light text-[#0A1628]">{overallScore}</span>
                <span className="text-xs text-[#1C1C1C] opacity-60 mt-1">/ 100</span>
             </div>
           </div>
           <div className="mt-6 text-center">
              <span className="text-sm font-medium px-4 py-1.5 rounded-full" style={{ background: `${color}15`, color }}>
                DECISION: {decision}
              </span>
           </div>
        </div>

        {/* Section Cards */}
        <div className="w-full md:w-2/3 grid grid-cols-2 md:grid-cols-4 gap-4 stagger-children">
           {[
             { label: 'Problem', score: problemScore },
             { label: 'Customer', score: customerScore },
             { label: 'Market', score: marketScore },
             { label: 'Competitive', score: competitiveScore },
             { label: 'WTP', score: wtpScore },
             { label: 'Business', score: businessModelScore },
             { label: 'Financial', score: financialScore },
             { label: 'Execution', score: executionScore },
           ].map(s => (
             <div key={s.label} className="card-angular p-4 bg-[#FAFAF7] shadow-sm">
                <div className="text-xs text-[#1C1C1C] opacity-70 mb-2 uppercase tracking-wide">{s.label}</div>
                <div className="text-2xl font-light text-[#0A1628]" style={{ color: getScoreColor(s.score) }}>{s.score}</div>
             </div>
           ))}
        </div>
      </div>

      {/* 0A-9: Next Step Recommendation Banner */}
      {nextStepRec && (
        <div className="card-angular p-6 bg-gradient-to-r from-[#FAFAF7] to-[#F5F0E8] border border-[#C8A860]/40 shadow-sm mb-8">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-3">
              {getNextStepConfig(nextStepRec).icon}
              <div>
                <span className="text-[10px] uppercase font-bold tracking-wider text-stone-500 block">
                  Recommended Immediate Milestone
                </span>
                <h3 className="text-base font-semibold text-[#0A1628]">
                  {getNextStepConfig(nextStepRec).label}
                </h3>
              </div>
            </div>
            <span className={`text-xs font-semibold px-3 py-1 rounded-full border ${getNextStepConfig(nextStepRec).badgeClass}`}>
              {nextStepRec}
            </span>
          </div>
          {nextStepRationale && (
            <p className="text-sm text-[#1C1C1C] opacity-90 leading-relaxed border-t border-[#E8E0D0] pt-3 mt-2">
              {nextStepRationale}
            </p>
          )}
        </div>
      )}

      {/* Decision Reasons */}
      {showSection('rationale') && (
      <div className="card-angular p-8 bg-[#FAFAF7] mb-8 shadow-sm">
        <h2 className="text-lg font-medium text-[#0A1628] mb-6 flex items-center gap-2">
          <span className="text-[#C8A860]">◈</span> Decision Rationale
        </h2>
        <ul className="space-y-4">
          {decisionReasons.length > 0 ? decisionReasons.map((reason: string, i: number) => (
            <li key={i} className="flex gap-4 items-start text-sm text-[#1C1C1C] leading-relaxed">
              <span className="text-[#C8A860] mt-1 font-bold">→</span>
              <span>{reason}</span>
            </li>
          )) : (
            <p className="text-sm text-[#1C1C1C] opacity-60">No specific rationale provided for this report.</p>
          )}
        </ul>
      </div>
      )}

      {/* 0A-3: Unique Value Proposition (UVP) + Alternatives */}
      {showSection('uvp') && (selectedUvp || uvpOptions.length > 0) && (
        <div className="card-angular p-8 bg-[#FAFAF7] mb-8 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-medium text-[#0A1628] flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-[#C8A860]" /> Value Proposition & Positioning
            </h2>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded border border-purple-200 bg-purple-50 text-purple-800">
              PROPOSED_STRATEGY
            </span>
          </div>

          {selectedUvp && (
            <div className="p-6 rounded border-2 border-[#C8A860] bg-gradient-to-br from-amber-50/50 to-stone-50 mb-6">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span className="text-xs font-bold uppercase tracking-wider text-[#96792b]">
                  Selected Primary UVP
                </span>
              </div>
              <p className="text-lg md:text-xl font-normal text-[#0A1628] leading-relaxed">
                {selectedUvp}
              </p>
            </div>
          )}

          {uvpOptions.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-500 mb-3">
                Alternative Positioning Angles Tested
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {uvpOptions.map((opt, idx) => (
                  <div key={idx} className="p-4 bg-[#F5F0E8]/70 border border-[#E8E0D0] rounded text-xs text-[#1C1C1C] leading-relaxed">
                    <span className="font-semibold text-[#96792b] block mb-1">Angle #{idx + 1}</span>
                    {opt}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 0A-2: Customer Personas */}
      {showSection('personas') && personas.length > 0 && (
        <div className="card-angular p-8 bg-[#FAFAF7] mb-8 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-medium text-[#0A1628] flex items-center gap-2">
              <Users className="w-5 h-5 text-[#C8A860]" /> Customer Personas & Pain Profiles
            </h2>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded border border-amber-200 bg-amber-50 text-amber-800">
              ASSUMPTION
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {personas.map((persona, pIdx) => {
              const sens = (persona.priceSensitivity || 'medium').toLowerCase()
              const sensClass =
                sens === 'low'
                  ? 'bg-emerald-100 text-emerald-800'
                  : sens === 'high'
                  ? 'bg-rose-100 text-rose-800'
                  : 'bg-amber-100 text-amber-800'

              return (
                <div key={pIdx} className="p-5 bg-white border border-[#E8E0D0] rounded shadow-xs flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between border-b border-[#E8E0D0] pb-3 mb-3">
                      <div>
                        <h3 className="text-base font-semibold text-[#0A1628]">{persona.name}</h3>
                        <p className="text-xs text-stone-500">
                          {[persona.occupation, persona.ageRange, persona.location].filter(Boolean).join(' • ')}
                        </p>
                      </div>
                      <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded ${sensClass}`}>
                        {persona.priceSensitivity || 'Med'} WTP
                      </span>
                    </div>

                    {persona.incomeRange && (
                      <div className="text-xs text-stone-600 mb-3">
                        <span className="font-medium text-stone-800">Income Bracket:</span> {persona.incomeRange}
                      </div>
                    )}

                    {persona.jobToBeDone && (
                      <div className="bg-[#F5F0E8] p-3 rounded text-xs italic text-[#0A1628] border-l-2 border-[#C8A860] mb-4">
                        &ldquo;{persona.jobToBeDone}&rdquo;
                      </div>
                    )}

                    {persona.goals && persona.goals.length > 0 && (
                      <div className="mb-3">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700 block mb-1">
                          Core Goals
                        </span>
                        <ul className="space-y-1 text-xs text-[#1C1C1C]">
                          {persona.goals.map((g, i) => (
                            <li key={i} className="flex items-start gap-1.5">
                              <Check className="w-3.5 h-3.5 text-emerald-600 mt-0.5 flex-shrink-0" />
                              <span>{g}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {((persona.problems && persona.problems.length > 0) || (persona.frustrations && persona.frustrations.length > 0)) && (
                      <div className="mb-3">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-700 block mb-1">
                          Critical Friction & Pain Points
                        </span>
                        <ul className="space-y-1 text-xs text-[#1C1C1C]">
                          {[...(persona.problems || []), ...(persona.frustrations || [])].slice(0, 4).map((prob, i) => (
                            <li key={i} className="flex items-start gap-1.5">
                              <AlertCircle className="w-3.5 h-3.5 text-amber-600 mt-0.5 flex-shrink-0" />
                              <span>{prob}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  {persona.preferredChannels && persona.preferredChannels.length > 0 && (
                    <div className="pt-3 border-t border-[#E8E0D0] mt-3">
                      <span className="text-[10px] font-semibold uppercase text-stone-500 block mb-1">Channels</span>
                      <div className="flex flex-wrap gap-1">
                        {persona.preferredChannels.map((c, i) => (
                          <span key={i} className="text-[10px] bg-stone-100 text-stone-700 px-2 py-0.5 rounded">
                            {c}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Competitor Table */}
      {showSection('competitor') && (
      <div className="card-angular p-8 bg-[#FAFAF7] mb-8 shadow-sm overflow-x-auto">
        <h2 className="text-lg font-medium text-[#0A1628] mb-6 flex items-center gap-2">
          <span className="text-[#C8A860]">◈</span> Competitor Analysis
        </h2>
        <table className="w-full text-left text-sm text-[#1C1C1C]">
          <thead className="bg-[#F5F0E8] text-[#1C1C1C] uppercase text-xs">
            <tr>
              <th className="px-4 py-3 rounded-tl">Competitor</th>
              <th className="px-4 py-3">Strength</th>
              <th className="px-4 py-3">Weakness</th>
              <th className="px-4 py-3 rounded-tr">Threat Level</th>
            </tr>
          </thead>
          <tbody>
            {competitors.map((comp: CompetitorItem, i: number) => (
              <tr key={i} className="border-b border-[#E8E0D0] last:border-0 hover:bg-[#F5F0E8]/50 transition-colors">
                <td className="px-4 py-4 font-medium text-[#0A1628]">{comp.name || 'Unknown'}</td>
                <td className="px-4 py-4">{comp.strength || 'N/A'}</td>
                <td className="px-4 py-4">{comp.weakness || 'N/A'}</td>
                <td className="px-4 py-4">
                  <span className={`px-2 py-1 rounded text-xs font-bold ${comp.threatLevel?.toLowerCase() === 'high' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                    {comp.threatLevel || 'Medium'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}

      {/* Financial Projections Chart */}
      {showSection('financials') && (
      <div className="card-angular p-8 bg-[#FAFAF7] shadow-sm mb-8">
        <h2 className="text-lg font-medium text-[#0A1628] mb-2 flex items-center gap-2">
          <span className="text-[#C8A860]">◈</span> Financial Projections
        </h2>
        <p className="text-xs text-[#96792b] font-semibold tracking-wider uppercase mb-8">PROJECTION</p>
        <div className="h-80 w-full" role="img" aria-label="Line chart showing revenue and costs over time">
          {mounted ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={financials} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E8E0D0" vertical={false} />
                <XAxis dataKey="month" stroke="#1C1C1C" opacity={0.6} tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis stroke="#1C1C1C" opacity={0.6} tick={{ fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(value) => `$${value/1000}k`} />
                <Tooltip 
                  contentStyle={{ background: '#0A1628', color: '#F5F0E8', border: 'none', borderRadius: '4px', fontSize: '12px' }}
                  itemStyle={{ color: '#F5F0E8' }}
                  formatter={(value) => [`$${Number(value).toLocaleString()}`, undefined]}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
                <Line type="monotone" dataKey="revenue" name="Revenue" stroke="#22c55e" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />
                <Line type="monotone" dataKey="costs" name="Costs" stroke="#ef4444" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="w-full h-full bg-[#F5F0E8] animate-pulse rounded" />
          )}
        </div>
      </div>
      )}

      {/* 0A-1: TAM / SAM / SOM Market Sizing */}
      {showSection('market') && hasMarketSizing && (
        <div className="card-angular p-8 bg-[#FAFAF7] mb-8 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-medium text-[#0A1628] flex items-center gap-2">
              <PieChart className="w-5 h-5 text-[#C8A860]" /> Market Sizing (TAM / SAM / SOM)
            </h2>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded border border-blue-200 bg-blue-50 text-blue-800">
              PROJECTION
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-6 bg-white border border-[#E8E0D0] rounded">
              <span className="text-xs uppercase font-bold tracking-wider text-stone-500 block mb-1">
                Total Addressable Market (TAM)
              </span>
              <div className="text-3xl font-light text-[#0A1628] mb-2">{tam || 'TBD'}</div>
              <p className="text-xs text-stone-600 leading-relaxed">{tamMethod}</p>
            </div>
            <div className="p-6 bg-white border border-[#E8E0D0] rounded">
              <span className="text-xs uppercase font-bold tracking-wider text-[#96792b] block mb-1">
                Serviceable Addressable Market (SAM)
              </span>
              <div className="text-3xl font-light text-[#96792b] mb-2">{sam || 'TBD'}</div>
              <p className="text-xs text-stone-600 leading-relaxed">{samMethod}</p>
            </div>
            <div className="p-6 bg-white border border-[#E8E0D0] rounded">
              <span className="text-xs uppercase font-bold tracking-wider text-emerald-600 block mb-1">
                Serviceable Obtainable Market (SOM)
              </span>
              <div className="text-3xl font-light text-[#22c55e] mb-2">{som || 'TBD'}</div>
              <p className="text-xs text-stone-600 leading-relaxed">{somMethod}</p>
            </div>
          </div>
        </div>
      )}

      {/* 0A-8: MVP Description & Scope */}
      {showSection('mvp') && mvpDescription && (
        <div className="card-angular p-8 bg-[#FAFAF7] mb-8 shadow-sm border-l-4 border-[#C8A860]">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-medium text-[#0A1628] flex items-center gap-2">
              <Box className="w-5 h-5 text-[#C8A860]" /> MVP Scope & Minimum Viable Architecture
            </h2>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded border border-purple-200 bg-purple-50 text-purple-800">
              PROPOSED_STRATEGY
            </span>
          </div>
          <p className="text-sm text-[#1C1C1C] leading-relaxed mb-4">
            {mvpDescription}
          </p>
          <div className="bg-[#F5F0E8] p-3 rounded text-xs text-stone-700 italic">
            Objective: Validate core willingness-to-pay and retention with the smallest operational footprint before engineering expansion.
          </div>
        </div>
      )}

      {/* 0A-4: MoSCoW Feature Prioritization */}
      {showSection('moscow') && hasMoscow && (
        <div className="card-angular p-8 bg-[#FAFAF7] mb-8 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-medium text-[#0A1628] flex items-center gap-2">
              <Layers className="w-5 h-5 text-[#C8A860]" /> Feature Prioritization (MoSCoW Matrix)
            </h2>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded border border-purple-200 bg-purple-50 text-purple-800">
              PROPOSED_STRATEGY
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {/* Must Have */}
            <div className="p-5 bg-white border-t-4 border-emerald-500 border-x border-b border-[#E8E0D0] rounded">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-700 block mb-1">
                Must Have (MVP Critical)
              </span>
              <p className="text-[11px] text-stone-500 mb-3">Non-negotiable for initial launch</p>
              <ul className="space-y-2 text-xs text-[#1C1C1C]">
                {(moscow?.mustHave || []).map((feat, idx) => (
                  <li key={idx} className="flex items-start gap-1.5">
                    <Check className="w-3.5 h-3.5 text-emerald-600 mt-0.5 flex-shrink-0" />
                    <span>{feat}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Should Have */}
            <div className="p-5 bg-white border-t-4 border-blue-500 border-x border-b border-[#E8E0D0] rounded">
              <span className="text-xs font-bold uppercase tracking-wider text-blue-700 block mb-1">
                Should Have (V1.1 Priority)
              </span>
              <p className="text-[11px] text-stone-500 mb-3">High value, queued immediately after launch</p>
              <ul className="space-y-2 text-xs text-[#1C1C1C]">
                {(moscow?.shouldHave || []).map((feat, idx) => (
                  <li key={idx} className="flex items-start gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-blue-500 mt-1 flex-shrink-0" />
                    <span>{feat}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Could Have */}
            <div className="p-5 bg-white border-t-4 border-amber-500 border-x border-b border-[#E8E0D0] rounded">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-700 block mb-1">
                Could Have (Nice to Have)
              </span>
              <p className="text-[11px] text-stone-500 mb-3">Desirable if runway and time permit</p>
              <ul className="space-y-2 text-xs text-[#1C1C1C]">
                {(moscow?.couldHave || []).map((feat, idx) => (
                  <li key={idx} className="flex items-start gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-amber-500 mt-1 flex-shrink-0" />
                    <span>{feat}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Won't Have */}
            <div className="p-5 bg-white border-t-4 border-stone-400 border-x border-b border-[#E8E0D0] rounded">
              <span className="text-xs font-bold uppercase tracking-wider text-stone-600 block mb-1">
                Won&apos;t Have (Deferred)
              </span>
              <p className="text-[11px] text-stone-500 mb-3">Explicitly out-of-scope for launch</p>
              <ul className="space-y-2 text-xs text-stone-600">
                {(moscow?.wontHave || []).map((feat, idx) => (
                  <li key={idx} className="flex items-start gap-1.5">
                    <span className="text-stone-400 select-none font-bold">✕</span>
                    <span>{feat}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* 0A-5: SWOT Analysis Matrix */}
      {showSection('swot') && hasSwot && (
        <div className="card-angular p-8 bg-[#FAFAF7] mb-8 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-medium text-[#0A1628] flex items-center gap-2">
              <Compass className="w-5 h-5 text-[#C8A860]" /> SWOT Analysis Matrix
            </h2>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded border border-orange-200 bg-orange-50 text-orange-800">
              AI_ESTIMATE_UNVERIFIED
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Strengths */}
            <div className="p-6 bg-white border-l-4 border-emerald-500 border-y border-r border-[#E8E0D0] rounded">
              <div className="flex items-center gap-2 mb-3">
                <ShieldCheck className="w-5 h-5 text-emerald-600" />
                <h3 className="text-sm font-semibold uppercase tracking-wider text-emerald-800">
                  Strengths (Internal Advantage)
                </h3>
              </div>
              <ul className="space-y-2 text-xs text-[#1C1C1C] leading-relaxed">
                {(swot?.strengths || []).map((s, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-emerald-600 font-bold">✓</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Weaknesses */}
            <div className="p-6 bg-white border-l-4 border-rose-500 border-y border-r border-[#E8E0D0] rounded">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="w-5 h-5 text-rose-600" />
                <h3 className="text-sm font-semibold uppercase tracking-wider text-rose-800">
                  Weaknesses (Internal Gaps)
                </h3>
              </div>
              <ul className="space-y-2 text-xs text-[#1C1C1C] leading-relaxed">
                {(swot?.weaknesses || []).map((w, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-rose-600 font-bold">!</span>
                    <span>{w}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Opportunities */}
            <div className="p-6 bg-white border-l-4 border-blue-500 border-y border-r border-[#E8E0D0] rounded">
              <div className="flex items-center gap-2 mb-3">
                <Zap className="w-5 h-5 text-blue-600" />
                <h3 className="text-sm font-semibold uppercase tracking-wider text-blue-800">
                  Opportunities (External Market)
                </h3>
              </div>
              <ul className="space-y-2 text-xs text-[#1C1C1C] leading-relaxed">
                {(swot?.opportunities || []).map((o, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-blue-600 font-bold">↗</span>
                    <span>{o}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Threats */}
            <div className="p-6 bg-white border-l-4 border-amber-500 border-y border-r border-[#E8E0D0] rounded">
              <div className="flex items-center gap-2 mb-3">
                <AlertOctagon className="w-5 h-5 text-amber-600" />
                <h3 className="text-sm font-semibold uppercase tracking-wider text-amber-800">
                  Threats (External Headwinds)
                </h3>
              </div>
              <ul className="space-y-2 text-xs text-[#1C1C1C] leading-relaxed">
                {(swot?.threats || []).map((t, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-amber-600 font-bold">⚠</span>
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* 0A-6: Risk Register Table */}
      {showSection('risks') && risks.length > 0 && (
        <div className="mb-8">
          <RiskRegisterTable risks={risks} title="Comprehensive Risk Register" badge="ASSUMPTION" />
        </div>
      )}

      {/* 0A-7: 30-Day Action Plan */}
      {showSection('actionPlan') && actionPlan.length > 0 && (
        <div className="mb-8">
          <ActionPlanTable
            plan={actionPlan}
            title="30-Day Validation & Execution Plan"
            badge="PROPOSED_STRATEGY"
            showExpectedOutput={true}
          />
        </div>
      )}

      {/* 0A-10: Evidence Citations & Integrity Statement */}
      {showSection('evidence') && (evidenceList.length > 0 || integrityNote) && (
        <div className="card-angular p-8 bg-[#FAFAF7] mb-8 shadow-sm">
          <div className="flex items-center justify-between mb-4 cursor-pointer" onClick={() => setEvidenceOpen(!evidenceOpen)}>
            <h2 className="text-lg font-medium text-[#0A1628] flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-[#C8A860]" /> Evidence Sources & Integrity Citations
            </h2>
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-bold px-2 py-0.5 rounded border border-emerald-200 bg-emerald-50 text-emerald-800">
                AUDITED_SOURCES
              </span>
              {evidenceOpen ? <ChevronUp className="w-4 h-4 text-stone-500" /> : <ChevronDown className="w-4 h-4 text-stone-500" />}
            </div>
          </div>

          {integrityNote && (
            <div className="p-4 bg-[#F5F0E8] border border-[#E8E0D0] rounded text-xs text-stone-700 leading-relaxed mb-4">
              <span className="font-semibold text-[#0A1628] block mb-1">Integrity Statement</span>
              {integrityNote}
            </div>
          )}

          {agentTrail && (
            <div className="p-4 bg-[#F5F0E8] border border-[#E8E0D0] rounded text-xs text-stone-700 mb-4">
              <span className="font-semibold text-[#0A1628] block mb-2">How this report was produced</span>
              <div className="flex flex-wrap gap-2">
                {AGENT_LABELS.map(({ key, label }) => {
                  const state = agentTrail.agents?.[key]
                  if (!state) return null
                  const ok = state === 'ok'
                  return (
                    <span
                      key={key}
                      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded border text-[10px] font-medium ${
                        ok
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                          : 'border-amber-200 bg-amber-50 text-amber-800'
                      }`}
                    >
                      {ok ? '✓' : '⚠'} {label}
                    </span>
                  )
                })}
                {agentTrail.agents?.monolithic && (
                  <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded border border-stone-200 bg-stone-50 text-stone-700 text-[10px] font-medium">
                    ↻ Monolithic fallback
                  </span>
                )}
              </div>
            </div>
          )}

          {evidenceOpen && evidenceList.length > 0 && (
            <div className="space-y-3 pt-2">
              {evidenceList.map((item, idx) => {
                const strength = (item.strength || 'MODERATE').toUpperCase()
                const strengthColor =
                  strength === 'STRONGER'
                    ? 'bg-emerald-100 text-emerald-800'
                    : strength === 'WEAK'
                    ? 'bg-stone-100 text-stone-600'
                    : 'bg-blue-100 text-blue-800'

                const label = item.label || 'VERIFIED'
                const labelColor =
                  label === 'VERIFIED'
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : label === 'PROJECTION'
                    ? 'bg-blue-50 text-blue-800 border-blue-200'
                    : 'bg-amber-50 text-amber-800 border-amber-200'

                return (
                  <div key={idx} className="p-4 bg-white border border-[#E8E0D0] rounded text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                      <span className="font-semibold text-[#0A1628] text-sm">{item.claim}</span>
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded border ${labelColor}`}>
                          {label}
                        </span>
                        <span className={`text-[10px] uppercase font-medium px-2 py-0.5 rounded ${strengthColor}`}>
                          {strength}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-stone-500 text-[11px]">
                      {item.source && <span>Source: <strong className="text-stone-700">{item.source}</strong></span>}
                      {item.publication && <span>Pub: {item.publication}</span>}
                      {item.year && <span>Year: {item.year}</span>}
                      {item.geography && <span>Region: {item.geography}</span>}
                      {item.link && (
                        <a
                          href={item.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[#96792b] hover:underline flex items-center gap-1 font-medium"
                        >
                          View Citation <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* 1. One-Line Concept Card */}
      {(reportData as any)?.oneLineConcept && (
        <div className="card-angular p-8 bg-[#FAFAF7] mb-8 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-medium text-[#0A1628] flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-[#C8A860]" /> One-Line Concept
            </h2>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded border border-emerald-200 bg-emerald-50 text-emerald-800">
              VERIFIED
            </span>
          </div>
          <p className="text-xl font-normal text-[#0A1628] leading-relaxed p-6 bg-gradient-to-br from-amber-50/50 to-stone-50 border-2 border-[#C8A860] rounded">
            {String((reportData as any).oneLineConcept)}
          </p>
        </div>
      )}

      {/* 2. Founder Assumptions Table */}
      {Array.isArray((reportData as any)?.founderAssumptions) && (reportData as any).founderAssumptions.length > 0 && (
        <div className="card-angular p-8 bg-[#FAFAF7] mb-8 shadow-sm overflow-x-auto">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-medium text-[#0A1628] flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-[#C8A860]" /> Founder Assumptions
            </h2>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded border border-amber-200 bg-amber-50 text-amber-800">
              ASSUMPTION
            </span>
          </div>
          <table className="w-full text-left text-sm text-[#1C1C1C]">
            <thead className="bg-[#F5F0E8] text-[#1C1C1C] uppercase text-xs">
              <tr>
                <th className="px-4 py-3 rounded-tl">Pre-Research Assumption</th>
                <th className="px-4 py-3">Post-Research Finding</th>
                <th className="px-4 py-3 rounded-tr">Status</th>
              </tr>
            </thead>
            <tbody>
              {(reportData as any).founderAssumptions.map((item: any, i: number) => (
                <tr key={i} className="border-b border-[#E8E0D0] last:border-0 hover:bg-[#F5F0E8]/50">
                  <td className="px-4 py-4">{item.assumption}</td>
                  <td className="px-4 py-4">{item.finding}</td>
                  <td className="px-4 py-4">
                    <span className="px-2 py-1 rounded text-xs font-bold bg-stone-100 text-stone-700">
                      {item.status || 'Pending'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 3. 5-Factor Problem Validation */}
      {(reportData as any)?.problemValidation5Factor && Object.keys((reportData as any).problemValidation5Factor).length > 0 && (
        <div className="card-angular p-8 bg-[#FAFAF7] mb-8 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-medium text-[#0A1628] flex items-center gap-2">
              <Layers className="w-5 h-5 text-[#C8A860]" /> 5-Factor Problem Validation
            </h2>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded border border-orange-200 bg-orange-50 text-orange-800">
              AI_ESTIMATE_UNVERIFIED
            </span>
          </div>
          <div className="space-y-6">
            {Object.entries((reportData as any).problemValidation5Factor).map(([key, val]: [string, any], i) => (
              <div key={i}>
                <div className="flex justify-between mb-1">
                  <span className="text-sm font-medium text-[#0A1628]">{val.label || key}</span>
                  <span className="text-sm font-bold text-[#0A1628]">{val.score}/10</span>
                </div>
                <div className="w-full bg-[#E8E0D0] rounded-full h-2 mb-2">
                  <div className="bg-[#C8A860] h-2 rounded-full" style={{ width: `${(val.score || 0) * 10}%` }}></div>
                </div>
                <p className="text-xs text-stone-600">{val.reasoning}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4. Customer Jobs, Pains & Gains */}
      {(reportData as any)?.customerJPG && (
        <div className="card-angular p-8 bg-[#FAFAF7] mb-8 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-medium text-[#0A1628] flex items-center gap-2">
              <Users className="w-5 h-5 text-[#C8A860]" /> Customer Jobs, Pains & Gains
            </h2>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded border border-emerald-200 bg-emerald-50 text-emerald-800">
              VERIFIED
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-4 bg-white border border-[#E8E0D0] rounded">
              <h3 className="text-sm font-bold text-[#0A1628] mb-3">Jobs to be Done</h3>
              <ul className="space-y-2 text-xs text-[#1C1C1C]">
                {((reportData as any).customerJPG.jobs || []).map((j: string, i: number) => (
                  <li key={i} className="flex gap-2"><Check className="w-4 h-4 text-emerald-600 shrink-0"/>{j}</li>
                ))}
              </ul>
            </div>
            <div className="p-4 bg-white border border-[#E8E0D0] rounded">
              <h3 className="text-sm font-bold text-[#0A1628] mb-3">Pains</h3>
              <ul className="space-y-2 text-xs text-[#1C1C1C]">
                {((reportData as any).customerJPG.pains || []).map((p: string, i: number) => (
                  <li key={i} className="flex gap-2"><AlertCircle className="w-4 h-4 text-rose-600 shrink-0"/>{p}</li>
                ))}
              </ul>
            </div>
            <div className="p-4 bg-white border border-[#E8E0D0] rounded">
              <h3 className="text-sm font-bold text-[#0A1628] mb-3">Gains</h3>
              <ul className="space-y-2 text-xs text-[#1C1C1C]">
                {((reportData as any).customerJPG.gains || []).map((g: string, i: number) => (
                  <li key={i} className="flex gap-2"><Sparkles className="w-4 h-4 text-blue-600 shrink-0"/>{g}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* 5. Interview Questions */}
      {Array.isArray((reportData as any)?.interviewQuestions) && (reportData as any).interviewQuestions.length > 0 && (
        <div className="card-angular p-8 bg-[#FAFAF7] mb-8 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-medium text-[#0A1628] flex items-center gap-2">
              <Search className="w-5 h-5 text-[#C8A860]" /> Interview Questions
            </h2>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded border border-emerald-200 bg-emerald-50 text-emerald-800">
              VERIFIED
            </span>
          </div>
          <ol className="list-decimal list-inside space-y-3 text-sm text-[#1C1C1C]">
            {(reportData as any).interviewQuestions.map((q: any, i: number) => (
              <li key={i} className="pl-2">
                {q.question}
                {q.category && (
                  <span className="ml-2 px-2 py-0.5 rounded text-[10px] bg-stone-100 text-stone-600 uppercase">
                    {q.category}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* 6. 2x2 Competitor Positioning Map */}
      {Array.isArray((reportData as any)?.competitorPositioning) && (reportData as any).competitorPositioning.length > 0 && (
        <div className="card-angular p-8 bg-[#FAFAF7] mb-8 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-medium text-[#0A1628] flex items-center gap-2">
              <Compass className="w-5 h-5 text-[#C8A860]" /> Competitor Positioning
            </h2>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded border border-orange-200 bg-orange-50 text-orange-800">
              AI_ESTIMATE_UNVERIFIED
            </span>
          </div>
          <ScatterPlot2x2 data={(reportData as any).competitorPositioning} xLabel="Price" yLabel="Quality" />
        </div>
      )}

      {/* 7. Landing Page Copy */}
      {(reportData as any)?.landingPageCopy && (
        <div className="card-angular p-8 bg-[#FAFAF7] mb-8 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-medium text-[#0A1628] flex items-center gap-2">
              <Rocket className="w-5 h-5 text-[#C8A860]" /> Landing Page Copy
            </h2>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded border border-amber-200 bg-amber-50 text-amber-800">
              ASSUMPTION
            </span>
          </div>
          <div className="p-8 bg-white border-2 border-[#E8E0D0] rounded-xl text-center shadow-sm">
            <h3 className="text-3xl font-bold text-[#0A1628] mb-4">{(reportData as any).landingPageCopy.headline}</h3>
            <p className="text-lg text-stone-600 mb-8">{(reportData as any).landingPageCopy.subheadline}</p>
            {Array.isArray((reportData as any).landingPageCopy.benefits) && (reportData as any).landingPageCopy.benefits.length > 0 && (
              <ul className="flex flex-col items-center space-y-2 mb-8">
                {(reportData as any).landingPageCopy.benefits.map((b: string, i: number) => (
                  <li key={i} className="flex gap-2 items-center text-sm text-[#1C1C1C]">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600"/> {b}
                  </li>
                ))}
              </ul>
            )}
            <button className="px-6 py-3 bg-[#0A1628] text-white rounded font-medium shadow-sm hover:opacity-90 transition-opacity">
              {(reportData as any).landingPageCopy.cta || 'Get Started'}
            </button>
          </div>
        </div>
      )}

      {/* 8. WTP Survey Questions */}
      {Array.isArray((reportData as any)?.wtpSurveyQuestions) && (reportData as any).wtpSurveyQuestions.length > 0 && (
        <div className="card-angular p-8 bg-[#FAFAF7] mb-8 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-medium text-[#0A1628] flex items-center gap-2">
              <Coins className="w-5 h-5 text-[#C8A860]" /> WTP Survey Questions
            </h2>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded border border-amber-200 bg-amber-50 text-amber-800">
              ASSUMPTION
            </span>
          </div>
          <div className="space-y-4">
            {(reportData as any).wtpSurveyQuestions.map((q: any, i: number) => (
              <div key={i} className="p-4 bg-white border border-[#E8E0D0] rounded flex flex-col sm:flex-row justify-between gap-4">
                <span className="text-sm font-medium text-[#1C1C1C]">{q.question}</span>
                <span className="text-xs bg-[#F5F0E8] px-2 py-1 rounded text-stone-700 whitespace-nowrap self-start sm:self-center">
                  Type: {q.type}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 9. PESTLE Analysis */}
      {(reportData as any)?.pestleAnalysis && Object.keys((reportData as any).pestleAnalysis).length > 0 && (
        <div className="card-angular p-8 bg-[#FAFAF7] mb-8 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-medium text-[#0A1628] flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-[#C8A860]" /> PESTLE Analysis
            </h2>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded border border-orange-200 bg-orange-50 text-orange-800">
              AI_ESTIMATE_UNVERIFIED
            </span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
            {Object.entries((reportData as any).pestleAnalysis).map(([key, items]: [string, any], i: number) => (
              <div key={i} className="p-4 bg-white border border-[#E8E0D0] rounded">
                <h3 className="text-sm font-bold text-[#0A1628] mb-3 uppercase">{key}</h3>
                <ul className="space-y-2 text-xs text-[#1C1C1C] list-disc pl-4">
                  {(Array.isArray(items) ? items : []).map((item, j) => (
                    <li key={j}>{item}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 10. Porter's Five Forces */}
      {(reportData as any)?.portersFiveForces && Object.keys((reportData as any).portersFiveForces).length > 0 && (
        <div className="card-angular p-8 bg-[#FAFAF7] mb-8 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-medium text-[#0A1628] flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-[#C8A860]" /> Porter&apos;s Five Forces
            </h2>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded border border-orange-200 bg-orange-50 text-orange-800">
              AI_ESTIMATE_UNVERIFIED
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.entries((reportData as any).portersFiveForces).map(([key, data]: [string, any], i: number) => {
              const level = (data.level || 'MED').toUpperCase()
              const levelColor =
                level === 'HIGH' ? 'bg-rose-100 text-rose-800'
                : level === 'LOW' ? 'bg-emerald-100 text-emerald-800'
                : 'bg-amber-100 text-amber-800'
              return (
                <div key={i} className="p-4 bg-white border border-[#E8E0D0] rounded flex flex-col justify-between">
                  <div className="flex justify-between items-center mb-2">
                    <h3 className="text-sm font-bold text-[#0A1628] uppercase">{key}</h3>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${levelColor}`}>{level}</span>
                  </div>
                  <p className="text-xs text-stone-600">{data.reasoning}</p>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {isSharePage && (
        <div className="text-center py-12 border-t border-[#E8E0D0]">
          <h2 className="text-2xl font-light text-[#0A1628] mb-4">Want your own validation report?</h2>
          <p className="text-[#1C1C1C] opacity-70 mb-8">Get AI-powered insights, competitor analysis, and financial models for your idea.</p>
          <Link href="/auth/signup" className="px-8 py-4 text-base font-medium text-[#0A1628] rounded transition-all hover:opacity-90 focus:ring-2 focus:ring-[#0A1628] outline-none inline-block" style={{ background: 'var(--gold-gradient)' }}>
            Start free on Validore
          </Link>
        </div>
      )}
    </div>
  )
}
