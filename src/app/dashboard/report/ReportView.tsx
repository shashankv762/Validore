'use client'

import React, { useSyncExternalStore, useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts'
import Link from 'next/link'
import { Brand } from '@/components/Brand'
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
import { AgentActivity } from '@/components/AgentActivity'
import { EvidenceReviewPanel } from '@/components/EvidenceReviewPanel'
import { ExportToolbar } from '@/components/ui/ExportToolbar'
import { ScatterPlot2x2 } from '@/components/ui/ScatterPlot2x2'
import { ScorecardGrid } from '@/components/ui/ScorecardGrid'
import { STARTUP_WEIGHTS } from '@/lib/scoring'

interface CompetitorItem {
  name?: string
  strength?: string
  strengths?: string[]
  weakness?: string
  weaknesses?: string[]
  threatLevel?: string
}

interface FinancialItem {
  month?: string | number
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
  financialProjection?: FinancialItem[]
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
const stringList = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
const safeCitationLink = (value?: string) => {
  try { const url = new URL(value || ''); return ['http:', 'https:'].includes(url.protocol) ? url.href : undefined } catch { return undefined }
}

export default function ReportView({ report, isSharePage = false, hideDownloads = false }: { report: ReportModel | null, isSharePage?: boolean, hideDownloads?: boolean }) {
  const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false)
  const [evidenceOpen, setEvidenceOpen] = useState(true)

  const reportData = (report?.reportData && typeof report.reportData === 'object' ? report.reportData : {}) as ReportData
  const scoreValue = (value: unknown, max: number) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max ? value : null
  const overallScore = scoreValue(report?.overallScore, 100)
  const decision = typeof report?.decision === 'string' ? report.decision : 'N/A'
  const problemScore = scoreValue(report?.problemScore, STARTUP_WEIGHTS.problemValidation)
  const customerScore = scoreValue(report?.customerScore, STARTUP_WEIGHTS.customerValidation)
  const marketScore = scoreValue(report?.marketScore, STARTUP_WEIGHTS.marketOpportunity)
  const competitiveScore = scoreValue(report?.competitiveScore, STARTUP_WEIGHTS.competitiveDifferentiation)
  const wtpScore = scoreValue(report?.wtpScore, STARTUP_WEIGHTS.willingnessToPay)
  const businessModelScore = scoreValue(report?.businessModelScore, STARTUP_WEIGHTS.businessModel)
  const financialScore = scoreValue(report?.financialScore, STARTUP_WEIGHTS.financialFeasibility)
  const executionScore = scoreValue(report?.executionScore, STARTUP_WEIGHTS.executionFeasibility)
  const decisionReasons = (Array.isArray(report?.decisionReasons) ? report.decisionReasons.filter(item => typeof item === 'string') : []) as string[]
  const competitors = Array.isArray(reportData.competitors) ? reportData.competitors.filter(item => item && typeof item === 'object').map(item => ({
    ...item, strength: item.strength || stringList(item.strengths).join(', '), weakness: item.weakness || stringList(item.weaknesses).join(', '),
  })) : []
  const rawFinancials = Array.isArray(reportData.financialProjection) ? reportData.financialProjection : reportData.financials
  const financials = Array.isArray(rawFinancials) ? rawFinancials.filter(item => item && Number.isFinite(item.revenue) && Number.isFinite(item.costs)) : []

  const getScoreColor = (score: number | null) => {
    if (score === null) return '#364152'
    if (score >= 80) return '#22c55e'
    if (score >= 50) return '#f97316'
    return '#ef4444'
  }

  const color = getScoreColor(overallScore)

  // 0A-1: TAM / SAM / SOM Normalization
  const tam = reportData.tamSamSom?.tam?.value || reportData.tamEstimate || ''
  const tamMethod = reportData.tamSamSom?.tam?.method || reportData.tamSamSom?.tam?.source || 'Method not provided'
  const sam = reportData.tamSamSom?.sam?.value || reportData.samEstimate || ''
  const samMethod = reportData.tamSamSom?.sam?.method || 'Method not provided'
  const som = reportData.tamSamSom?.som?.value || reportData.somEstimate || ''
  const somMethod = reportData.tamSamSom?.som?.method || 'Method not provided'
  const hasMarketSizing = Boolean(tam || sam || som)

  // 0A-2: Personas Normalization
  const personas: PersonaItem[] = Array.isArray(reportData.personas) && reportData.personas.length > 0
    ? reportData.personas.filter(item => item && typeof item === 'object')
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
    ? reportData.riskRegister.filter(item => item && typeof item === 'object')
    : Array.isArray(reportData.keyRisks) && reportData.keyRisks.length > 0
    ? reportData.keyRisks.filter(r => typeof r === 'string' && r.trim()).map(r => ({
        risk: typeof r === 'string' ? r : String(r),
        mitigation: 'Mitigation not provided',
      }))
    : []

  // 0A-7: Action Plan Normalization
  const rawActionPlan = reportData.actionPlan || (Array.isArray(report?.actionPlan) ? report.actionPlan : [])
  const actionPlan: ActionPlanRow[] = Array.isArray(rawActionPlan)
    ? rawActionPlan.filter(item => typeof item === 'string' || (item && typeof item === 'object')).map((item, idx) => {
        if (typeof item === 'string') {
          return { step: idx + 1, action: item }
        }
        if (typeof item === 'object' && item !== null) {
          const typed = item as Record<string, unknown>
          return {
            week: (typed.week || typed.timeframe || (typed.step ? `Step ${typed.step}` : `Phase ${idx + 1}`)) as string,
            action: (typed.action || typed.activity || 'Validation action') as string,
            owner: typed.owner as string | undefined,
            kpi: typed.kpi as string | undefined,
            expectedOutput: (typed.expectedOutput || undefined) as string | undefined,
          }
        }
        return { step: idx + 1, action: 'Action not provided' }
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
  const evidenceList: EvidenceCitation[] = Array.isArray(reportData.keyEvidence) ? reportData.keyEvidence.filter(item => item && typeof item === 'object') : []
  const integrityNote = reportData.integrityNote || ''
  // Multi-agent pipeline trail (present on reports produced by the agent pipeline)
  const agentTrail = (reportData as any).agentTrail as
    | { agents?: Record<string, string>; totalTokens?: number; providers?: string[] }
    | undefined

  return (
    <div className={isSharePage ? "report-overview max-w-6xl mx-auto px-4 py-12" : "report-overview"}>
      {isSharePage && (
        <div className="mb-12 flex items-center justify-between border-b border-[#E5E7EB] pb-6">
          <Brand compact />
          <Link href="/auth/signup" className="px-5 py-2 text-sm font-medium text-[#141923] rounded focus:ring-2 focus:ring-[#141923] outline-none" style={{ background: 'var(--gold-gradient)' }}>
            Start Free
          </Link>
        </div>
      )}

      {!isSharePage && !hideDownloads && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8 p-4 bg-[#FFFFFF] border border-[#E5E7EB] rounded">
          <div>
            <span className="text-xs font-semibold  text-[#364152]/60 block">
              Download this report
            </span>
            <p className="text-xs text-[#364152]/70 mt-0.5">
              Keep a copy of your findings, sources and next steps.
            </p>
          </div>
          <ExportToolbar
            reportId={report?.id}
            ideaId={report?.ideaId}
            deckType="validation"
            formats={['pdf', 'docx', 'csv', 'pptx', 'white-label-pdf']}
          />
        </div>
      )}

      {agentTrail && Object.values(agentTrail.agents || {}).some(status => status === 'failed') && <div role="status" className="card-angular mb-6 p-5 text-sm text-[#141923]">This analysis is partial. Some specialist sections could not complete; review the agent status and treat the overall score with caution.</div>}

      {/* Main Validation Score & Sub-scores */}
      <div className="flex flex-col md:flex-row gap-8 items-start mb-8">
        {/* Score Gauge */}
        <div className="card-angular p-8 bg-[#FFFFFF] w-full md:w-1/3 flex flex-col items-center justify-center relative shadow-sm">
           <h2 className="text-sm font-semibold text-[#141923]  mb-6">Validation Score</h2>
           <div className="relative w-48 h-48 flex items-center justify-center">
             <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
               <circle cx="50" cy="50" r="45" fill="none" stroke="#E5E7EB" strokeWidth="8" />
               <circle 
                 cx="50" cy="50" r="45" fill="none" stroke={color} strokeWidth="8"
                 strokeDasharray="283"
                 strokeDashoffset={mounted ? 283 - (283 * (overallScore ?? 0)) / 100 : 283}
                 className=""
               />
             </svg>
             <div className="absolute flex flex-col items-center justify-center">
                <span className="text-5xl font-light text-[#141923]">{overallScore ?? '—'}</span>
                <span className="text-xs text-[#364152] opacity-60 mt-1">/ 100</span>
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
             { label: 'Problem', score: problemScore, max: STARTUP_WEIGHTS.problemValidation },
             { label: 'Customer', score: customerScore, max: STARTUP_WEIGHTS.customerValidation },
             { label: 'Market', score: marketScore, max: STARTUP_WEIGHTS.marketOpportunity },
             { label: 'Competitive', score: competitiveScore, max: STARTUP_WEIGHTS.competitiveDifferentiation },
             { label: 'WTP', score: wtpScore, max: STARTUP_WEIGHTS.willingnessToPay },
             { label: 'Business', score: businessModelScore, max: STARTUP_WEIGHTS.businessModel },
             { label: 'Financial', score: financialScore, max: STARTUP_WEIGHTS.financialFeasibility },
             { label: 'Execution', score: executionScore, max: STARTUP_WEIGHTS.executionFeasibility },
           ].map(s => (
             <div key={s.label} className="card-angular p-4 bg-[#FFFFFF] shadow-sm">
                <div className="text-xs text-[#364152] opacity-70 mb-2 ">{s.label}</div>
                <div className="text-2xl font-light text-[#141923]" style={{ color: getScoreColor(s.score === null ? null : (s.score / s.max) * 100) }}>{s.score ?? '—'}<span className="ml-1 text-xs text-[#364152]/70">/ {s.max}</span></div>
             </div>
           ))}
        </div>
      </div>

      {/* 0A-9: Next Step Recommendation Banner */}
      {nextStepRec && (
        <div className="card-angular p-6 bg-gradient-to-r from-[#FFFFFF] to-[#F7F8FA] border border-[#E0A526]/40 shadow-sm mb-8">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-3">
              {getNextStepConfig(nextStepRec).icon}
              <div>
                <span className="text-[10px]  font-bold tracking-wider text-stone-500 block">
                  Recommended Immediate Milestone
                </span>
                <h3 className="text-base font-semibold text-[#141923]">
                  {getNextStepConfig(nextStepRec).label}
                </h3>
              </div>
            </div>
            <span className={`text-xs font-semibold px-3 py-1 rounded-full border ${getNextStepConfig(nextStepRec).badgeClass}`}>
              {nextStepRec}
            </span>
          </div>
          {nextStepRationale && (
            <p className="text-sm text-[#364152] opacity-90 leading-relaxed border-t border-[#E5E7EB] pt-3 mt-2">
              {nextStepRationale}
            </p>
          )}
        </div>
      )}

      {/* Decision Reasons */}
      {(
      <div className="card-angular p-8 bg-[#FFFFFF] mb-8 shadow-sm">
        <h2 className="text-lg font-medium text-[#141923] mb-6 flex items-center gap-2">
          <span className="text-[#E0A526]">◈</span> Decision Rationale
        </h2>
        <ul className="space-y-4">
          {decisionReasons.length > 0 ? decisionReasons.map((reason: string, i: number) => (
            <li key={i} className="flex gap-4 items-start text-sm text-[#364152] leading-relaxed">
              <span className="text-[#E0A526] mt-1 font-bold">→</span>
              <span>{reason}</span>
            </li>
          )) : (
            <p className="text-sm text-[#364152] opacity-60">No specific rationale provided for this report.</p>
          )}
        </ul>
      </div>
      )}

      {/* 0A-3: Unique Value Proposition (UVP) + Alternatives */}
      {(selectedUvp || uvpOptions.length > 0) && (
        <div className="card-angular p-8 bg-[#FFFFFF] mb-8 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-medium text-[#141923] flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-[#E0A526]" /> Value Proposition & Positioning
            </h2>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded border border-purple-200 bg-purple-50 text-purple-800">
              PROPOSED_STRATEGY
            </span>
          </div>

          {selectedUvp && (
            <div className="p-6 rounded border-2 border-[#E0A526] bg-gradient-to-br from-amber-50/50 to-stone-50 mb-6">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span className="text-xs font-bold  text-[#89620B]">
                  Selected Primary UVP
                </span>
              </div>
              <p className="text-lg md:text-xl font-normal text-[#141923] leading-relaxed">
                {selectedUvp}
              </p>
            </div>
          )}

          {uvpOptions.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold  text-stone-500 mb-3">
                Alternative Positioning Angles Tested
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {uvpOptions.map((opt, idx) => (
                  <div key={idx} className="p-4 bg-[#F7F8FA]/70 border border-[#E5E7EB] rounded text-xs text-[#364152] leading-relaxed">
                    <span className="font-semibold text-[#89620B] block mb-1">Angle #{idx + 1}</span>
                    {opt}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 0A-2: Customer Personas */}
      {personas.length > 0 && (
        <div className="card-angular p-8 bg-[#FFFFFF] mb-8 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-medium text-[#141923] flex items-center gap-2">
              <Users className="w-5 h-5 text-[#E0A526]" /> Customer Personas & Pain Profiles
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
                <div key={pIdx} className="p-5 bg-white border border-[#E5E7EB] rounded shadow-xs flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between border-b border-[#E5E7EB] pb-3 mb-3">
                      <div>
                        <h3 className="text-base font-semibold text-[#141923]">{persona.name}</h3>
                        <p className="text-xs text-stone-500">
                          {[persona.occupation, persona.ageRange, persona.location].filter(Boolean).join(' • ')}
                        </p>
                      </div>
                      <span className={`text-[10px]  font-bold px-2 py-0.5 rounded ${sensClass}`}>
                        {persona.priceSensitivity || 'Med'} WTP
                      </span>
                    </div>

                    {persona.incomeRange && (
                      <div className="text-xs text-stone-600 mb-3">
                        <span className="font-medium text-stone-800">Income Bracket:</span> {persona.incomeRange}
                      </div>
                    )}

                    {persona.jobToBeDone && (
                      <div className="bg-[#F7F8FA] p-3 rounded text-xs italic text-[#141923] border-l-2 border-[#E0A526] mb-4">
                        &ldquo;{persona.jobToBeDone}&rdquo;
                      </div>
                    )}

                    {persona.goals && persona.goals.length > 0 && (
                      <div className="mb-3">
                        <span className="text-[11px] font-semibold  text-emerald-700 block mb-1">
                          Core Goals
                        </span>
                        <ul className="space-y-1 text-xs text-[#364152]">
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
                        <span className="text-[11px] font-semibold  text-amber-700 block mb-1">
                          Critical Friction & Pain Points
                        </span>
                        <ul className="space-y-1 text-xs text-[#364152]">
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
                    <div className="pt-3 border-t border-[#E5E7EB] mt-3">
                      <span className="text-[10px] font-semibold  text-stone-500 block mb-1">Channels</span>
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
      {(
      <div className="card-angular p-8 bg-[#FFFFFF] mb-8 shadow-sm overflow-x-auto">
        <h2 className="text-lg font-medium text-[#141923] mb-6 flex items-center gap-2">
          <span className="text-[#E0A526]">◈</span> Competitor Analysis
        </h2>
        <table className="w-full min-w-[600px] text-left text-sm text-[#364152] [overflow-wrap:normal]">
          <thead className="bg-[#F7F8FA] text-[#364152]  text-xs">
            <tr>
              <th className="px-4 py-3 rounded-tl">Competitor</th>
              <th className="px-4 py-3">Strength</th>
              <th className="px-4 py-3">Weakness</th>
              <th className="px-4 py-3 rounded-tr">Threat Level</th>
            </tr>
          </thead>
          <tbody>
            {competitors.length === 0 && <tr><td colSpan={4} className="px-4 py-6 text-[#364152]/75">Competitor data is unavailable for this report.</td></tr>}
            {competitors.map((comp: CompetitorItem, i: number) => (
              <tr key={i} className="border-b border-[#E5E7EB] last:border-0 hover:bg-[#F7F8FA]/50 transition-colors">
                <td className="px-4 py-4 font-medium text-[#141923]">{comp.name || 'Unknown'}</td>
                <td className="px-4 py-4">{comp.strength || 'N/A'}</td>
                <td className="px-4 py-4">{comp.weakness || 'N/A'}</td>
                <td className="px-4 py-4">
                  <span className={`px-2 py-1 rounded text-xs font-bold ${comp.threatLevel?.toLowerCase() === 'high' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                    {comp.threatLevel || 'Unassessed'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}

      {/* Financial Projections Chart */}
      {(
      <div className="card-angular p-8 bg-[#FFFFFF] shadow-sm mb-8">
        <h2 className="text-lg font-medium text-[#141923] mb-2 flex items-center gap-2">
          <span className="text-[#E0A526]">◈</span> Financial Projections
        </h2>
        <p className="text-xs text-[#89620B] font-semibold tracking-wider  mb-8">PROJECTION</p>
        <div className="h-80 w-full" role="img" aria-label="Line chart showing revenue and costs over time">
          {financials.length === 0 ? <div className="flex h-full items-center justify-center rounded-lg bg-[#F7F8FA] px-6 text-center text-sm text-[#364152]/75">Financial projections are unavailable for this report.</div> : mounted ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={financials} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
                <XAxis dataKey="month" stroke="#364152" opacity={0.6} tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis stroke="#364152" opacity={0.6} tick={{ fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(value) => `$${value/1000}k`} />
                <Tooltip 
                  contentStyle={{ background: '#141923', color: '#F7F8FA', border: 'none', borderRadius: '4px', fontSize: '12px' }}
                  itemStyle={{ color: '#F7F8FA' }}
                  formatter={(value) => [`$${Number(value).toLocaleString()}`, undefined]}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
                <Line type="monotone" dataKey="revenue" name="Revenue" stroke="#22c55e" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />
                <Line type="monotone" dataKey="costs" name="Costs" stroke="#ef4444" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="w-full h-full bg-[#F7F8FA] animate-pulse rounded" />
          )}
        </div>
      </div>
      )}

      {/* 0A-1: TAM / SAM / SOM Market Sizing */}
      {hasMarketSizing && (
        <div className="card-angular p-8 bg-[#FFFFFF] mb-8 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-medium text-[#141923] flex items-center gap-2">
              <PieChart className="w-5 h-5 text-[#E0A526]" /> Market Sizing (TAM / SAM / SOM)
            </h2>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded border border-blue-200 bg-blue-50 text-blue-800">
              PROJECTION
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-6 bg-white border border-[#E5E7EB] rounded">
              <span className="text-xs  font-bold tracking-wider text-stone-500 block mb-1">
                Total Addressable Market (TAM)
              </span>
              <div className="text-3xl font-light text-[#141923] mb-2">{tam || 'TBD'}</div>
              <p className="text-xs text-stone-600 leading-relaxed">{tamMethod}</p>
            </div>
            <div className="p-6 bg-white border border-[#E5E7EB] rounded">
              <span className="text-xs  font-bold tracking-wider text-[#89620B] block mb-1">
                Serviceable Addressable Market (SAM)
              </span>
              <div className="text-3xl font-light text-[#89620B] mb-2">{sam || 'TBD'}</div>
              <p className="text-xs text-stone-600 leading-relaxed">{samMethod}</p>
            </div>
            <div className="p-6 bg-white border border-[#E5E7EB] rounded">
              <span className="text-xs  font-bold tracking-wider text-emerald-600 block mb-1">
                Serviceable Obtainable Market (SOM)
              </span>
              <div className="text-3xl font-light text-[#22c55e] mb-2">{som || 'TBD'}</div>
              <p className="text-xs text-stone-600 leading-relaxed">{somMethod}</p>
            </div>
          </div>
        </div>
      )}

      {/* 0A-8: MVP Description & Scope */}
      {mvpDescription && (
        <div className="card-angular p-8 bg-[#FFFFFF] mb-8 shadow-sm border-l-4 border-[#E0A526]">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-medium text-[#141923] flex items-center gap-2">
              <Box className="w-5 h-5 text-[#E0A526]" /> MVP Scope & Minimum Viable Architecture
            </h2>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded border border-purple-200 bg-purple-50 text-purple-800">
              PROPOSED_STRATEGY
            </span>
          </div>
          <p className="text-sm text-[#364152] leading-relaxed mb-4">
            {mvpDescription}
          </p>
          <div className="bg-[#F7F8FA] p-3 rounded text-xs text-stone-700 italic">
            Objective: Validate core willingness-to-pay and retention with the smallest operational footprint before engineering expansion.
          </div>
        </div>
      )}

      {/* 0A-4: MoSCoW Feature Prioritization */}
      {hasMoscow && (
        <div className="card-angular p-8 bg-[#FFFFFF] mb-8 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-medium text-[#141923] flex items-center gap-2">
              <Layers className="w-5 h-5 text-[#E0A526]" /> Feature Prioritization (MoSCoW Matrix)
            </h2>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded border border-purple-200 bg-purple-50 text-purple-800">
              PROPOSED_STRATEGY
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {/* Must Have */}
            <div className="p-5 bg-white border-t-4 border-emerald-500 border-x border-b border-[#E5E7EB] rounded">
              <span className="text-xs font-bold  text-emerald-700 block mb-1">
                Must Have (MVP Critical)
              </span>
              <p className="text-[11px] text-stone-500 mb-3">Non-negotiable for initial launch</p>
              <ul className="space-y-2 text-xs text-[#364152]">
                {(moscow?.mustHave || []).map((feat, idx) => (
                  <li key={idx} className="flex items-start gap-1.5">
                    <Check className="w-3.5 h-3.5 text-emerald-600 mt-0.5 flex-shrink-0" />
                    <span>{feat}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Should Have */}
            <div className="p-5 bg-white border-t-4 border-blue-500 border-x border-b border-[#E5E7EB] rounded">
              <span className="text-xs font-bold  text-blue-700 block mb-1">
                Should Have (V1.1 Priority)
              </span>
              <p className="text-[11px] text-stone-500 mb-3">High value, queued immediately after launch</p>
              <ul className="space-y-2 text-xs text-[#364152]">
                {(moscow?.shouldHave || []).map((feat, idx) => (
                  <li key={idx} className="flex items-start gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-blue-500 mt-1 flex-shrink-0" />
                    <span>{feat}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Could Have */}
            <div className="p-5 bg-white border-t-4 border-amber-500 border-x border-b border-[#E5E7EB] rounded">
              <span className="text-xs font-bold  text-amber-700 block mb-1">
                Could Have (Nice to Have)
              </span>
              <p className="text-[11px] text-stone-500 mb-3">Desirable if runway and time permit</p>
              <ul className="space-y-2 text-xs text-[#364152]">
                {(moscow?.couldHave || []).map((feat, idx) => (
                  <li key={idx} className="flex items-start gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-amber-500 mt-1 flex-shrink-0" />
                    <span>{feat}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Won't Have */}
            <div className="p-5 bg-white border-t-4 border-stone-400 border-x border-b border-[#E5E7EB] rounded">
              <span className="text-xs font-bold  text-stone-600 block mb-1">
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
      {hasSwot && (
        <div className="card-angular p-8 bg-[#FFFFFF] mb-8 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-medium text-[#141923] flex items-center gap-2">
              <Compass className="w-5 h-5 text-[#E0A526]" /> SWOT Analysis Matrix
            </h2>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded border border-orange-200 bg-orange-50 text-orange-800">
              AI_ESTIMATE_UNVERIFIED
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Strengths */}
            <div className="p-6 bg-white border-l-4 border-emerald-500 border-y border-r border-[#E5E7EB] rounded">
              <div className="flex items-center gap-2 mb-3">
                <ShieldCheck className="w-5 h-5 text-emerald-600" />
                <h3 className="text-sm font-semibold  text-emerald-800">
                  Strengths (Internal Advantage)
                </h3>
              </div>
              <ul className="space-y-2 text-xs text-[#364152] leading-relaxed">
                {(swot?.strengths || []).map((s, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-emerald-600 font-bold">✓</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Weaknesses */}
            <div className="p-6 bg-white border-l-4 border-rose-500 border-y border-r border-[#E5E7EB] rounded">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="w-5 h-5 text-rose-600" />
                <h3 className="text-sm font-semibold  text-rose-800">
                  Weaknesses (Internal Gaps)
                </h3>
              </div>
              <ul className="space-y-2 text-xs text-[#364152] leading-relaxed">
                {(swot?.weaknesses || []).map((w, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-rose-600 font-bold">!</span>
                    <span>{w}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Opportunities */}
            <div className="p-6 bg-white border-l-4 border-blue-500 border-y border-r border-[#E5E7EB] rounded">
              <div className="flex items-center gap-2 mb-3">
                <Zap className="w-5 h-5 text-blue-600" />
                <h3 className="text-sm font-semibold  text-blue-800">
                  Opportunities (External Market)
                </h3>
              </div>
              <ul className="space-y-2 text-xs text-[#364152] leading-relaxed">
                {(swot?.opportunities || []).map((o, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-blue-600 font-bold">↗</span>
                    <span>{o}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Threats */}
            <div className="p-6 bg-white border-l-4 border-amber-500 border-y border-r border-[#E5E7EB] rounded">
              <div className="flex items-center gap-2 mb-3">
                <AlertOctagon className="w-5 h-5 text-amber-600" />
                <h3 className="text-sm font-semibold  text-amber-800">
                  Threats (External Headwinds)
                </h3>
              </div>
              <ul className="space-y-2 text-xs text-[#364152] leading-relaxed">
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
      {risks.length > 0 && (
        <div className="mb-8">
          <RiskRegisterTable risks={risks} title="Comprehensive Risk Register" badge="ASSUMPTION" />
        </div>
      )}

      {/* 0A-7: 30-Day Action Plan */}
      {actionPlan.length > 0 && (
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
      {(evidenceList.length > 0 || integrityNote) && (
        <div className="card-angular p-8 bg-[#FFFFFF] mb-8 shadow-sm">
          <div className="flex items-center justify-between mb-4 cursor-pointer" onClick={() => setEvidenceOpen(!evidenceOpen)}>
            <h2 className="text-lg font-medium text-[#141923] flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-[#E0A526]" /> Evidence Sources & Integrity Citations
            </h2>
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-bold px-2 py-0.5 rounded border border-emerald-200 bg-emerald-50 text-emerald-800">
                SOURCE_PROVENANCE
              </span>
              {evidenceOpen ? <ChevronUp className="w-4 h-4 text-stone-500" /> : <ChevronDown className="w-4 h-4 text-stone-500" />}
            </div>
          </div>

          {integrityNote && (
            <div className="p-4 bg-[#F7F8FA] border border-[#E5E7EB] rounded text-xs text-stone-700 leading-relaxed mb-4">
              <span className="font-semibold text-[#141923] block mb-1">Integrity Statement</span>
              {integrityNote}
            </div>
          )}

          <AgentActivity trail={agentTrail} />

          {evidenceOpen && evidenceList.length > 0 && (
            <div className="space-y-3 pt-2">
              {evidenceList.map((item, idx) => {
                const strength = typeof item.strength === 'string' ? item.strength.toUpperCase() : 'WEAK'
                const strengthColor =
                  strength === 'STRONGER'
                    ? 'bg-emerald-100 text-emerald-800'
                    : strength === 'WEAK'
                    ? 'bg-stone-100 text-stone-600'
                    : 'bg-blue-100 text-blue-800'

                const label = item.label || 'AI_ESTIMATE_UNVERIFIED'
                const labelColor =
                  label === 'VERIFIED'
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : label === 'PROJECTION'
                    ? 'bg-blue-50 text-blue-800 border-blue-200'
                    : 'bg-amber-50 text-amber-800 border-amber-200'

                return (
                  <div key={idx} className="p-4 bg-white border border-[#E5E7EB] rounded text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                      <span className="font-semibold text-[#141923] text-sm">{item.claim}</span>
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px]  font-bold px-2 py-0.5 rounded border ${labelColor}`}>
                          {label}
                        </span>
                        <span className={`text-[10px]  font-medium px-2 py-0.5 rounded ${strengthColor}`}>
                          {strength}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-stone-500 text-[11px]">
                      {item.source && <span>Source: <strong className="text-stone-700">{item.source}</strong></span>}
                      {item.publication && <span>Pub: {item.publication}</span>}
                      {item.year && <span>Year: {item.year}</span>}
                      {item.geography && <span>Region: {item.geography}</span>}
                      {safeCitationLink(item.link) && (
                        <a
                          href={safeCitationLink(item.link)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[#89620B] hover:underline flex items-center gap-1 font-medium"
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
        <div className="card-angular p-8 bg-[#FFFFFF] mb-8 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-medium text-[#141923] flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-[#E0A526]" /> One-Line Concept
            </h2>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded border border-emerald-200 bg-emerald-50 text-emerald-800">
              PROPOSED_STRATEGY
            </span>
          </div>
          <p className="text-xl font-normal text-[#141923] leading-relaxed p-6 bg-gradient-to-br from-amber-50/50 to-stone-50 border-2 border-[#E0A526] rounded">
            {String((reportData as any).oneLineConcept)}
          </p>
        </div>
      )}

      {/* 2. Founder Assumptions Table */}
      <EvidenceReviewPanel value={reportData.evidenceReview} />
      {Array.isArray((reportData as any)?.founderAssumptions) && (reportData as any).founderAssumptions.length > 0 && (
        <div className="card-angular p-8 bg-[#FFFFFF] mb-8 shadow-sm overflow-x-auto">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-medium text-[#141923] flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-[#E0A526]" /> Founder Assumptions
            </h2>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded border border-amber-200 bg-amber-50 text-amber-800">
              ASSUMPTION
            </span>
          </div>
          <p className="mb-4 text-sm text-[#667085]">These are desk-research assessments. Test the hypotheses with customers, experiments, or measured results.</p>
          <table className="w-full min-w-[600px] text-left text-sm text-[#364152] [overflow-wrap:normal]">
            <thead className="bg-[#F7F8FA] text-[#364152]  text-xs">
              <tr>
                <th className="px-4 py-3 rounded-tl">Pre-Research Assumption</th>
                <th className="px-4 py-3">Post-Research Finding</th>
                <th className="px-4 py-3 rounded-tr">Status</th>
              </tr>
            </thead>
            <tbody>
              {(reportData as any).founderAssumptions.map((item: any, i: number) => (
                <tr key={i} className="border-b border-[#E5E7EB] last:border-0 hover:bg-[#F7F8FA]/50">
                  <td className="px-4 py-4">
                    <p className="font-medium">{item.assumption || item.preResearchBelief}</p>
                    {item.assumption && item.preResearchBelief && <p className="mt-1 text-xs text-[#667085]">{item.preResearchBelief}</p>}
                  </td>
                  <td className="px-4 py-4">{item.postResearchFinding || item.finding || 'Finding not provided'}</td>
                  <td className="px-4 py-4">
                    <span className="px-2 py-1 rounded text-xs font-bold bg-stone-100 text-stone-700">
                      {typeof item.validated === 'boolean' ? (item.validated ? 'Tentative support' : 'Needs testing') : item.status || 'Pending'}
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
        <div className="card-angular p-8 bg-[#FFFFFF] mb-8 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-medium text-[#141923] flex items-center gap-2">
              <Layers className="w-5 h-5 text-[#E0A526]" /> 5-Factor Problem Validation
            </h2>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded border border-orange-200 bg-orange-50 text-orange-800">
              AI_ESTIMATE_UNVERIFIED
            </span>
          </div>
          <div className="space-y-6">
            {Object.entries((reportData as any).problemValidation5Factor).map(([key, val]: [string, any], i) => (
              <div key={i}>
                <div className="flex justify-between mb-1">
                  <span className="text-sm font-medium text-[#141923]">{val.label || key}</span>
                  <span className="text-sm font-bold text-[#141923]">{val.score}/10</span>
                </div>
                <div className="w-full bg-[#E5E7EB] rounded-full h-2 mb-2">
                  <div className="bg-[#E0A526] h-2 rounded-full" style={{ width: `${(val.score || 0) * 10}%` }}></div>
                </div>
                <p className="text-xs text-stone-600">{val.reasoning}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4. Customer Jobs, Pains & Gains */}
      {(reportData as any)?.customerJPG && (
        <div className="card-angular p-8 bg-[#FFFFFF] mb-8 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-medium text-[#141923] flex items-center gap-2">
              <Users className="w-5 h-5 text-[#E0A526]" /> Customer Jobs, Pains & Gains
            </h2>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded border border-emerald-200 bg-emerald-50 text-emerald-800">
              PROPOSED_STRATEGY
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-4 bg-white border border-[#E5E7EB] rounded">
              <h3 className="text-sm font-bold text-[#141923] mb-3">Jobs to be Done</h3>
              <ul className="space-y-2 text-xs text-[#364152]">
                {((reportData as any).customerJPG.jobs || []).map((j: string, i: number) => (
                  <li key={i} className="flex gap-2"><Check className="w-4 h-4 text-emerald-600 shrink-0"/>{j}</li>
                ))}
              </ul>
            </div>
            <div className="p-4 bg-white border border-[#E5E7EB] rounded">
              <h3 className="text-sm font-bold text-[#141923] mb-3">Pains</h3>
              <ul className="space-y-2 text-xs text-[#364152]">
                {((reportData as any).customerJPG.pains || []).map((p: string, i: number) => (
                  <li key={i} className="flex gap-2"><AlertCircle className="w-4 h-4 text-rose-600 shrink-0"/>{p}</li>
                ))}
              </ul>
            </div>
            <div className="p-4 bg-white border border-[#E5E7EB] rounded">
              <h3 className="text-sm font-bold text-[#141923] mb-3">Gains</h3>
              <ul className="space-y-2 text-xs text-[#364152]">
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
        <div className="card-angular p-8 bg-[#FFFFFF] mb-8 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-medium text-[#141923] flex items-center gap-2">
              <Search className="w-5 h-5 text-[#E0A526]" /> Interview Questions
            </h2>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded border border-emerald-200 bg-emerald-50 text-emerald-800">
              PROPOSED_STRATEGY
            </span>
          </div>
          <ol className="list-decimal list-inside space-y-3 text-sm text-[#364152]">
            {(reportData as any).interviewQuestions.map((q: any, i: number) => (
              <li key={i} className="pl-2">
                {q.question}
                {q.category && (
                  <span className="ml-2 px-2 py-0.5 rounded text-[10px] bg-stone-100 text-stone-600 ">
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
        <div className="card-angular p-8 bg-[#FFFFFF] mb-8 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-medium text-[#141923] flex items-center gap-2">
              <Compass className="w-5 h-5 text-[#E0A526]" /> Competitor Positioning
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
        <div className="card-angular p-8 bg-[#FFFFFF] mb-8 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-medium text-[#141923] flex items-center gap-2">
              <Rocket className="w-5 h-5 text-[#E0A526]" /> Landing Page Copy
            </h2>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded border border-amber-200 bg-amber-50 text-amber-800">
              ASSUMPTION
            </span>
          </div>
          <div className="p-8 bg-white border-2 border-[#E5E7EB] rounded-xl text-center shadow-sm">
            <h3 className="text-3xl font-bold text-[#141923] mb-4">{(reportData as any).landingPageCopy.headline}</h3>
            <p className="text-lg text-stone-600 mb-8">{(reportData as any).landingPageCopy.subheadline}</p>
            {Array.isArray((reportData as any).landingPageCopy.benefits) && (reportData as any).landingPageCopy.benefits.length > 0 && (
              <ul className="flex flex-col items-center space-y-2 mb-8">
                {(reportData as any).landingPageCopy.benefits.map((b: string, i: number) => (
                  <li key={i} className="flex gap-2 items-center text-sm text-[#364152]">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600"/> {b}
                  </li>
                ))}
              </ul>
            )}
            <span className="inline-block px-6 py-3 bg-[#141923] text-white rounded font-medium">
              {(reportData as any).landingPageCopy.cta || 'Get Started'}
            </span>
          </div>
        </div>
      )}

      {/* 8. WTP Survey Questions */}
      {Array.isArray((reportData as any)?.wtpSurveyQuestions) && (reportData as any).wtpSurveyQuestions.length > 0 && (
        <div className="card-angular p-8 bg-[#FFFFFF] mb-8 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-medium text-[#141923] flex items-center gap-2">
              <Coins className="w-5 h-5 text-[#E0A526]" /> WTP Survey Questions
            </h2>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded border border-amber-200 bg-amber-50 text-amber-800">
              ASSUMPTION
            </span>
          </div>
          <div className="space-y-4">
            {(reportData as any).wtpSurveyQuestions.map((q: any, i: number) => (
              <div key={i} className="p-4 bg-white border border-[#E5E7EB] rounded flex flex-col sm:flex-row justify-between gap-4">
                <span className="text-sm font-medium text-[#364152]">{q.question}</span>
                <span className="text-xs bg-[#F7F8FA] px-2 py-1 rounded text-stone-700 whitespace-nowrap self-start sm:self-center">
                  Type: {q.type}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 9. PESTLE Analysis */}
      {(reportData as any)?.pestleAnalysis && Object.keys((reportData as any).pestleAnalysis).length > 0 && (
        <div className="card-angular p-8 bg-[#FFFFFF] mb-8 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-medium text-[#141923] flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-[#E0A526]" /> PESTLE Analysis
            </h2>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded border border-orange-200 bg-orange-50 text-orange-800">
              AI_ESTIMATE_UNVERIFIED
            </span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
            {Object.entries((reportData as any).pestleAnalysis).map(([key, items]: [string, any], i: number) => (
              <div key={i} className="p-4 bg-white border border-[#E5E7EB] rounded">
                <h3 className="text-sm font-bold text-[#141923] mb-3 ">{key}</h3>
                <ul className="space-y-2 text-xs text-[#364152] list-disc pl-4">
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
        <div className="card-angular p-8 bg-[#FFFFFF] mb-8 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-medium text-[#141923] flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-[#E0A526]" /> Porter&apos;s Five Forces
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
                <div key={i} className="p-4 bg-white border border-[#E5E7EB] rounded flex flex-col justify-between">
                  <div className="flex justify-between items-center mb-2">
                    <h3 className="text-sm font-bold text-[#141923] ">{key}</h3>
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
        <div className="text-center py-12 border-t border-[#E5E7EB]">
          <h2 className="text-2xl font-light text-[#141923] mb-4">Want your own validation report?</h2>
          <p className="text-[#364152] opacity-70 mb-8">Get AI-powered insights, competitor analysis, and financial models for your idea.</p>
          <Link href="/auth/signup" className="px-8 py-4 text-base font-medium text-[#141923] rounded transition-colors hover:opacity-90 focus:ring-2 focus:ring-[#141923] outline-none inline-block" style={{ background: 'var(--gold-gradient)' }}>
            Start free on Validore
          </Link>
        </div>
      )}
    </div>
  )
}
