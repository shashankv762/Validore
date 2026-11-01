'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { ScorecardGrid } from '@/components/ui/ScorecardGrid'
import { ExportToolbar } from '@/components/ui/ExportToolbar'
import { ScatterPlot2x2 } from '@/components/ui/ScatterPlot2x2'
import { useWorkspaceResources, WorkspaceResourceStatus } from '@/components/WorkspaceResources'
import { CREDIT_COSTS } from '@/lib/credit-costs'
import { notifyAccountUpdated } from '@/components/AccountProvider'
import { PLAN_CATALOG, formatUsd } from '@/lib/plans'
import { CREDIT_PACKAGES } from '@/lib/credit-packages'

type Slide = {
  slideNumber: number
  title: string
  content: string
  keyPoints: string[]
  speakerNotes: string
  dataLabel?: string
}

type Milestone = {
  milestone: string
  targetDate: string
  status: 'PLANNED' | 'ACHIEVED'
}

type RoadmapPhase = {
  phase: string
  timeframe: string
  milestones: Milestone[]
}

type PortfolioSection = {
  sectionTitle: string
  content: string
  label?: string
}

type PitchDeckAiData = {
  slides?: Slide[]
  pitchScript3min?: string
  pitchScript60sec?: string
  investorQa?: Array<{ question: string; answer: string; label: string }>
  roadmap?: RoadmapPhase[]
  integrityNote?: string
  problemClarityScore?: number
  solutionStrengthScore?: number
  customerEvidenceScore?: number
  marketOpportunityScore?: number
  businessModelScore?: number
  competitivePositioningScore?: number
  gtmStrategyScore?: number
  financialLogicScore?: number
  teamExecutionScore?: number
  presentationQualityScore?: number
  founderReadinessScore?: number
  founderReadinessNote?: string
  portfolioSections?: PortfolioSection[]
  entrepreneurialSkillsMatrix?: { skill: string; selfRating: number; evidence: string; gap: string }[]
  customerJourney?: { stage: string; touchpoint: string; emotion: string; opportunity: string }[]
  valuePropositionCanvas?: { customerJobs: string[]; pains: string[]; gains: string[]; products: string[]; painRelievers: string[]; gainCreators: string[] }
  moscowFeatures?: { must: string[]; should: string[]; could: string[]; wont: string[] }
  competitorMatrix?: { competitor: string; pricing: string; strengths: string[]; weaknesses: string[]; ourAdvantage: string }[]
  positioningMap?: { label: string; x: number; y: number; isUs: boolean }[]
  swot?: { strengths: string[]; weaknesses: string[]; opportunities: string[]; threats: string[] }
  pestleAnalysis?: { political: string[]; economic: string[]; social: string[]; technological: string[]; legal: string[]; environmental: string[] }
  useOfFundsBreakdown?: { category: string; amount: number; percentage: number; rationale: string }[]
  gtmStrategy?: { phase1: { name: string; channels: string[]; budget: string; timeline: string }; phase2: { name: string; channels: string[]; budget: string; timeline: string } }
  salesFunnel?: { stage: string; count: number; conversion: number; tactic: string }[]
  brandStrategy?: { positioning: string; voiceTone: string; visualIdentity: string; tagline: string }
  kpiTargets?: { metric: string; current: string; target: string; timeline: string }[]
  riskRegister?: { risk: string; severity: string; likelihood: string; mitigation: string }[]
  actionPlan?: { thirtyDay: { action: string; owner: string; deadline: string }[]; ninetyDay: { action: string; owner: string; deadline: string }[] }
  investorQA?: { question: string; answer: string; category: string }[]
  [key: string]: unknown
}

type DeckResult = {
  deckId: string
  qualityScore: number
  founderReadinessScore: number
  result: {
    slides: Slide[]
    pitchScript3min: string
    pitchScript60sec: string
    investorQa: Array<{ question: string; answer: string; label: string }>
    roadmap: RoadmapPhase[]
    integrityNote: string
    portfolioSections?: PortfolioSection[]
    reportData?: {
      inputs?: unknown
      ai?: PitchDeckAiData
      qualityScore?: number
    }
    [key: string]: unknown
  }
}

type Tab = 'slides' | 'scripts' | 'qa' | 'roadmap' | 'portfolio' | 'strategy' | 'deep_analysis' | 'operations' | 'investor_prep'

const TABS: { key: Tab; label: string }[] = [
  { key: 'slides', label: '12 Slides' },
  { key: 'scripts', label: 'Pitch Scripts' },
  { key: 'qa', label: 'Investor Q&A' },
  { key: 'roadmap', label: 'Roadmap' },
  { key: 'portfolio', label: 'Portfolio Preview' },
  { key: 'strategy', label: 'Strategy' },
  { key: 'deep_analysis', label: 'Deep Analysis' },
  { key: 'operations', label: 'Operations' },
  { key: 'investor_prep', label: 'Investor Prep' },
]

export default function PitchDeckPage() {
  const resources = useWorkspaceResources()
  const { ideas, user } = resources
  const tier = user?.tier ?? 'free'
  const hasAccess = tier === 'max_premium' || (user?.pitchDeckCredits ?? 0) > 0
  const usesPack = tier !== 'max_premium' && (user?.pitchDeckCredits ?? 0) > 0
  const balance = (user?.creditBalance ?? 0) + (user?.purchasedCredits ?? 0)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<DeckResult | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>('slides')
  const [openQa, setOpenQa] = useState<number | null>(null)

  const [form, setForm] = useState({
    ideaId: '',
    founderName: '',
    founderBackground: '',
    teamSize: 1,
    fundingAskAmount: '',
    useOfFunds: '',
    currentTraction: '',
    milestones: [] as Milestone[],
  })

  const addMilestone = () =>
    setForm(f => ({
      ...f,
      milestones: [...f.milestones, { milestone: '', targetDate: '', status: 'PLANNED' as const }],
    }))

  const updateMilestone = (i: number, field: keyof Milestone, value: string) =>
    setForm(f => ({
      ...f,
      milestones: f.milestones.map((m, idx) =>
        idx === i ? { ...m, [field]: value } : m
      ),
    }))

  const removeMilestone = (i: number) =>
    setForm(f => ({ ...f, milestones: f.milestones.filter((_, idx) => idx !== i) }))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.ideaId || !form.founderName || !form.founderBackground) {
      toast.error('Please fill in all required fields.')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/pitch-deck', {
        method: 'POST',
        signal: AbortSignal.timeout(280_000),
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (res.ok) {
        setResult(data)
        toast.success('Pitch deck generated successfully!')
      } else {
        toast.error(data.error ?? 'Deck generation failed. Please try again.')
      }
    } catch {
      toast.error('Network error. Failed to generate deck.')
    } finally {
      notifyAccountUpdated()
      setLoading(false)
    }
  }

  // ── Lock screen ──────────────────────────────────────────────────────────────
  if (resources.loading || resources.error) return <WorkspaceResourceStatus {...resources} />

  if (!hasAccess && !result) {
    return (
      <div className="max-w-2xl mx-auto mt-20">
        <div className="card-angular p-10 text-center">
          <span className="text-4xl block mb-4">🔒</span>
          <h2 className="text-xl font-light text-[#141923] mb-2">Pitch Deck Builder</h2>
          <p className="text-sm text-[#364152] opacity-60 mb-8">
            12-slide investor deck, 3-min pitch script, 20 investor Q&As, quality score /100, and PPTX export.
          </p>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="card-angular p-5">
            <p className="text-lg font-light text-[#89620B] mb-1">{formatUsd(PLAN_CATALOG.max_premium.monthlyPriceUsd)}<span className="text-sm opacity-60">/mo</span></p>
              <p className="text-sm font-medium text-[#141923] mb-3">Max Premium</p>
              <p className="text-xs text-[#364152] opacity-60 mb-4">Deck generation with plan credits, PDF, Word and PPTX downloads</p>
              <a
                href="/dashboard/settings"
                className="block text-center py-2 text-xs font-medium text-[#141923]"
                style={{ background: 'linear-gradient(135deg, #D4AF37, #E0A526, #A4730C)', borderRadius: '2px 8px 2px 8px' }}
              >
                Upgrade to Max Premium
              </a>
            </div>
            <div className="card-angular p-5">
            <p className="text-lg font-light text-[#89620B] mb-1">{formatUsd(CREDIT_PACKAGES.pitch_deck.amountUsd)}<span className="text-sm opacity-60"> one-time</span></p>
              <p className="text-sm font-medium text-[#141923] mb-3">Pitch Deck Pack</p>
              <p className="text-xs text-[#364152] opacity-60 mb-4">1 full deck generation — no subscription needed</p>
              <a
                href="/dashboard/credits"
                className="block text-center py-2 text-xs font-medium text-[#364152] border border-[#E5E7EB] hover:border-[#E0A526]"
                style={{ borderRadius: '2px 8px 2px 8px' }}
              >
              Buy Pack ({formatUsd(CREDIT_PACKAGES.pitch_deck.amountUsd)})
              </a>
            </div>
          </div>
          {tier === 'premium' && (
            <p className="text-xs text-[#364152] opacity-40">
              You&apos;re on Premium. Buy a Pitch Deck Pack above or upgrade to Max Premium.
            </p>
          )}
        </div>
      </div>
    )
  }

  // ── Input form ───────────────────────────────────────────────────────────────
  if (!result) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-light text-[#141923] mb-1">Pitch Deck Builder</h1>
          <p className="text-sm text-[#364152] opacity-60">
            AI generates a 12-slide investor deck. Milestones are clearly labeled{' '}
            <span className="font-medium">PLANNED ◻️</span> or <span className="font-medium">ACHIEVED ✅</span>.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="card-angular p-5 sm:p-8">
          <fieldset disabled={loading} className="space-y-5 min-w-0">
          {/* Idea selector */}
          <div>
<label htmlFor="pitch-deck-select-idea" className="block text-xs font-medium text-[#89620B]  mb-1">Select Idea *</label>
            <select id="pitch-deck-select-idea"
              value={form.ideaId}
              onChange={e => setForm(f => ({ ...f, ideaId: e.target.value }))}
              required
              className="w-full px-3 py-2 border border-[#E5E7EB] rounded bg-[#FFFFFF] text-sm focus:border-[#E0A526] focus:outline-none"
            >
              <option value="">— Select an idea —</option>
              {ideas.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
<label htmlFor="pitch-deck-founder-name" className="block text-xs font-medium text-[#89620B]  mb-1">Founder Name *</label>
              <input id="pitch-deck-founder-name"
                value={form.founderName}
                onChange={e => setForm(f => ({ ...f, founderName: e.target.value }))}
                required placeholder="Your full name"
                className="w-full px-3 py-2 border border-[#E5E7EB] rounded bg-[#FFFFFF] text-sm focus:border-[#E0A526] focus:outline-none"
              />
            </div>
            <div>
<label htmlFor="pitch-deck-team-size" className="block text-xs font-medium text-[#89620B]  mb-1">Team Size</label>
              <input id="pitch-deck-team-size"
                type="number" min={1} max={50} value={form.teamSize}
                onChange={e => setForm(f => ({ ...f, teamSize: Number(e.target.value) }))}
                className="w-full px-3 py-2 border border-[#E5E7EB] rounded bg-[#FFFFFF] text-sm focus:border-[#E0A526] focus:outline-none"
              />
            </div>
          </div>

          <div>
<label htmlFor="pitch-deck-founder-background" className="block text-xs font-medium text-[#89620B]  mb-1">Founder Background *</label>
            <textarea id="pitch-deck-founder-background"
              rows={2} value={form.founderBackground}
              onChange={e => setForm(f => ({ ...f, founderBackground: e.target.value }))}
              required placeholder="Previous roles, domain expertise, relevant achievements…"
              className="w-full px-3 py-2 border border-[#E5E7EB] rounded bg-[#FFFFFF] text-sm focus:border-[#E0A526] focus:outline-none resize-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
<label htmlFor="pitch-deck-funding-ask" className="block text-xs font-medium text-[#89620B]  mb-1">Funding Ask ($)</label>
              <input id="pitch-deck-funding-ask"
                value={form.fundingAskAmount} placeholder="e.g. 500000"
                onChange={e => setForm(f => ({ ...f, fundingAskAmount: e.target.value }))}
                className="w-full px-3 py-2 border border-[#E5E7EB] rounded bg-[#FFFFFF] text-sm focus:border-[#E0A526] focus:outline-none"
              />
            </div>
            <div>
<label htmlFor="pitch-deck-current-traction" className="block text-xs font-medium text-[#89620B]  mb-1">Current Traction</label>
              <input id="pitch-deck-current-traction"
                value={form.currentTraction} placeholder="e.g. 50 beta users, $2k MRR"
                onChange={e => setForm(f => ({ ...f, currentTraction: e.target.value }))}
                className="w-full px-3 py-2 border border-[#E5E7EB] rounded bg-[#FFFFFF] text-sm focus:border-[#E0A526] focus:outline-none"
              />
            </div>
          </div>

          <div>
<label htmlFor="pitch-deck-use-of-funds" className="block text-xs font-medium text-[#89620B]  mb-1">Use of Funds</label>
            <input id="pitch-deck-use-of-funds"
              value={form.useOfFunds} placeholder="e.g. 50% Engineering, 30% Growth & Sales, 20% Operations"
              onChange={e => setForm(f => ({ ...f, useOfFunds: e.target.value }))}
              className="w-full px-3 py-2 border border-[#E5E7EB] rounded bg-[#FFFFFF] text-sm focus:border-[#E0A526] focus:outline-none"
            />
          </div>

          {/* Milestones */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xs font-medium text-[#89620B]">Milestones</h2>
              <button
                type="button" onClick={addMilestone}
                className="text-xs text-[#89620B] hover:underline"
              >
                + Add milestone
              </button>
            </div>
            {form.milestones.map((m, i) => (
              <div key={i} className="grid grid-cols-1 sm:grid-cols-[1fr_150px_120px_36px] gap-2 mb-4 items-center rounded-md border border-slate-200 p-3 sm:border-0 sm:p-0">
                <input
                  aria-label={`Milestone ${i + 1} description`}
                  placeholder="Milestone description" value={m.milestone}
                  onChange={e => updateMilestone(i, 'milestone', e.target.value)}
                  className="w-full min-w-0 px-3 py-2 border border-[#E5E7EB] rounded bg-[#FFFFFF] text-sm focus:border-[#E0A526] focus:outline-none"
                />
                <input
                  type="date" aria-label={`Milestone ${i + 1} target date`} value={m.targetDate}
                  onChange={e => updateMilestone(i, 'targetDate', e.target.value)}
                  className="w-full min-w-0 px-3 py-2 border border-[#E5E7EB] rounded bg-[#FFFFFF] text-sm focus:border-[#E0A526] focus:outline-none"
                />
                <select
                  aria-label={`Milestone ${i + 1} status`}
                  value={m.status}
                  onChange={e => updateMilestone(i, 'status', e.target.value)}
                  className="px-2 py-1.5 border border-[#E5E7EB] rounded bg-[#FFFFFF] text-xs focus:border-[#E0A526] focus:outline-none"
                >
                  <option value="PLANNED">Planned</option>
                  <option value="ACHIEVED">Achieved</option>
                </select>
                <button
                  aria-label={`Remove milestone ${i + 1}`}
                  type="button" onClick={() => removeMilestone(i)}
                  className="text-sm text-rose-600 hover:text-rose-800 min-h-11 px-2"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          <button
            type="submit" disabled={loading || (!usesPack && balance < CREDIT_COSTS.PITCH_DECK)}
            className="w-full py-3 text-sm font-medium text-[#141923] disabled:opacity-50 cursor-pointer"
            style={{ background: 'linear-gradient(135deg, #D4AF37, #E0A526, #A4730C)', borderRadius: '2px 12px 2px 12px' }}
          >
            {loading ? 'Generating pitch deck…' : `Generate pitch deck · ${usesPack ? '1 deck pack' : CREDIT_COSTS.PITCH_DECK + ' credits'}`}
          </button>
          <p className="text-xs leading-relaxed text-slate-500">{usesPack ? 'Uses one of your purchased deck runs.' : `${balance.toLocaleString()} credits available. Charged only when the deck is saved.`} {!usesPack && balance < CREDIT_COSTS.PITCH_DECK && <a href="/dashboard/credits" className="underline underline-offset-4">View credit options</a>}</p>
          </fieldset>
        </form>
      </div>
    )
  }

  // ── Results view ─────────────────────────────────────────────────────────────
  const ai = result.result.reportData?.ai ?? (result.result as Record<string, unknown>).ai as PitchDeckAiData | undefined

  // 0D-1: 10 Category Quality Scores
  const qualityCategories = [
    { label: 'Problem Clarity', score: ai?.problemClarityScore ?? 0, maxScore: 10 },
    { label: 'Solution Strength', score: ai?.solutionStrengthScore ?? 0, maxScore: 10 },
    { label: 'Customer Evidence', score: ai?.customerEvidenceScore ?? 0, maxScore: 10 },
    { label: 'Market Opportunity', score: ai?.marketOpportunityScore ?? 0, maxScore: 10 },
    { label: 'Business Model', score: ai?.businessModelScore ?? 0, maxScore: 10 },
    { label: 'Competitive Pos.', score: ai?.competitivePositioningScore ?? 0, maxScore: 10 },
    { label: 'GTM Strategy', score: ai?.gtmStrategyScore ?? 0, maxScore: 10 },
    { label: 'Financial Logic', score: ai?.financialLogicScore ?? 0, maxScore: 10 },
    { label: 'Team Execution', score: ai?.teamExecutionScore ?? 0, maxScore: 10 },
    { label: 'Presentation Quality', score: ai?.presentationQualityScore ?? 0, maxScore: 10 },
  ]

  // 0D-3: Portfolio sections
  const portfolioSections = result.result.portfolioSections ?? ai?.portfolioSections ?? []

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header with export buttons */}
      <div className="mb-6 flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-light text-[#141923]">Investor Pitch Deck</h1>
          <p className="text-xs text-amber-600 mt-1">12-Slide Institutional Structure • 20 Investor Q&amp;As</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <ExportToolbar
            ideaId={form.ideaId}
            deckId={result.deckId}
            deckType="pitch"
            formats={['pdf', 'docx', 'pptx', 'portfolio-zip']}
            compact={true}
          />
          <button onClick={() => setResult(null)} className="text-xs text-[#89620B] hover:underline cursor-pointer">
            ← New deck
          </button>
        </div>
      </div>

      {/* Score cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="card-angular p-6 text-center">
          <div className="text-4xl font-light text-[#89620B] mb-1">{result.qualityScore}/100</div>
          <div className="text-sm text-[#141923]">Pitch Deck Quality Score</div>
          <div className="mt-2 flex justify-center">
            <div className="h-2 w-48 rounded-full bg-[#E5E7EB]">
              <div
                className="h-2 rounded-full"
                style={{ width: `${result.qualityScore}%`, background: 'linear-gradient(135deg, #D4AF37, #E0A526)' }}
              />
            </div>
          </div>
        </div>
        <div className="card-angular p-6 text-center">
          <div className="text-4xl font-light text-[#89620B] mb-1">{result.founderReadinessScore}/100</div>
          <div className="text-sm text-[#141923]">Founder Readiness Score</div>
          {/* 0D-2: Progress bar for founder readiness */}
          <div className="mt-2 flex justify-center">
            <div className="h-2 w-48 rounded-full bg-[#E5E7EB]">
              <div
                className="h-2 rounded-full"
                style={{ width: `${result.founderReadinessScore}%`, background: 'linear-gradient(135deg, #D4AF37, #E0A526)' }}
              />
            </div>
          </div>
          <div className="text-xs opacity-50 mt-2">Developmental self-assessment — not a personality diagnosis</div>
        </div>
      </div>

      {/* 0D-1: 10-Category Quality Score Breakdown */}
      <div className="card-angular p-6 bg-[#FFFFFF] mb-6">
        <ScorecardGrid
          scores={qualityCategories}
          columns={5}
          title="10-Category Pitch Quality Scorecard"
          subtitle="Evaluation across institutional investment criteria (100 Pts Total)"
          badge="PROJECTION"
        />
      </div>

      {/* 0D-2: Founder Readiness Note */}
      {ai?.founderReadinessNote && (
        <div className="card-angular p-5 mb-6 border-l-4 border-[#E0A526] bg-[#FFFFFF]">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold text-[#141923] ">
              Founder Readiness Note &amp; Qualitative Assessment
            </h3>
            <span className="text-[10px] bg-amber-100 text-amber-800 border border-amber-300 px-2 py-0.5 rounded font-medium">
              DEVELOPMENTAL SELF-ASSESSMENT
            </span>
          </div>
          <p className="text-sm text-[#364152] leading-relaxed">
            {ai.founderReadinessNote}
          </p>
          <p className="text-[11px] text-stone-500 mt-2 italic">
            Note: This evaluation measures operational preparation for institutional capital raising, not personal intelligence or intrinsic capability.
          </p>
        </div>
      )}

      {/* Integrity note */}
      <div className="card-angular p-4 border-l-4 border-[#E0A526] mb-6 bg-[#FFFFFF]">
        <p className="text-xs font-semibold text-[#89620B] mb-1">Integrity Note</p>
        <p className="text-xs text-[#364152] leading-relaxed">{result.result.integrityNote}</p>
      </div>

      {/* Tab nav */}
      <div className="flex gap-1 mb-6 border-b border-[#E5E7EB] overflow-x-auto">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-5 py-2.5 text-sm font-medium transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === tab.key
                ? 'text-[#89620B] border-b-2 border-[#E0A526] font-semibold'
                : 'text-[#364152] opacity-60 hover:opacity-100'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Slides */}
      {activeTab === 'slides' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {result.result.slides.map(slide => (
            <div key={slide.slideNumber} style={{ borderRadius: '2px 12px 2px 12px', overflow: 'hidden' }}>
              <div className="bg-[#141923] p-4">
                <div className="text-xs text-[#89620B] mb-1 font-medium">Slide {slide.slideNumber}</div>
                <div className="text-sm font-medium text-[#F7F8FA] mb-2 leading-tight">{slide.title}</div>
                <div className="text-xs text-[#F7F8FA] opacity-70 leading-relaxed line-clamp-4">
                  {slide.content}
                </div>
                {slide.dataLabel && (
                  <div className="mt-2 text-xs text-amber-400 font-medium">{slide.dataLabel}</div>
                )}
              </div>
              <div className="bg-[#FFFFFF] p-3 border border-[#E5E7EB] border-t-0">
                <p className="text-xs text-[#364152] opacity-60 font-medium mb-1">Key Points</p>
                <ul className="space-y-0.5">
                  {slide.keyPoints.slice(0, 3).map((p, i) => (
                    <li key={i} className="text-xs text-[#364152] opacity-70 flex gap-1.5">
                      <span className="text-[#89620B] flex-shrink-0">•</span>{p}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Scripts */}
      {activeTab === 'scripts' && (
        <div className="space-y-6">
          <div className="card-angular p-6 bg-[#FFFFFF]">
            <h3 className="text-sm font-semibold text-[#141923] mb-1">
              3-Minute Pitch Script{' '}
              <span className="text-xs text-amber-600 font-normal">PROPOSED_STRATEGY</span>
            </h3>
            <p className="text-xs text-[#364152] opacity-40 mb-4">Customise with your own voice before presenting.</p>
            <pre className="text-sm text-[#364152] whitespace-pre-wrap leading-relaxed font-sans">
              {result.result.pitchScript3min}
            </pre>
          </div>
          <div className="card-angular p-6 bg-[#FFFFFF]">
            <h3 className="text-sm font-semibold text-[#141923] mb-1">
              60-Second Elevator Pitch{' '}
              <span className="text-xs text-amber-600 font-normal">PROPOSED_STRATEGY</span>
            </h3>
            <pre className="text-sm text-[#364152] whitespace-pre-wrap leading-relaxed font-sans">
              {result.result.pitchScript60sec}
            </pre>
          </div>
        </div>
      )}

      {/* Investor Q&A */}
      {activeTab === 'qa' && (
        <div className="space-y-2">
          {result.result.investorQa.map((qa, i) => (
            <div key={i} className="card-angular overflow-hidden bg-[#FFFFFF]">
              <button
                className="w-full p-4 text-left flex justify-between items-start gap-4 cursor-pointer"
                onClick={() => setOpenQa(openQa === i ? null : i)}
              >
                <span className="text-sm font-medium text-[#141923]">
                  {i + 1}. {qa.question}
                </span>
                <span className="text-[#89620B] flex-shrink-0 text-xs mt-0.5">
                  {openQa === i ? '▲' : '▼'}
                </span>
              </button>
              {openQa === i && (
                <div className="px-4 pb-4 border-t border-[#E5E7EB]">
                  <p className="text-sm text-[#364152] leading-relaxed mt-3">{qa.answer}</p>
                  {qa.label && (
                    <p className="text-xs text-amber-600 mt-2">{qa.label}</p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Roadmap */}
      {activeTab === 'roadmap' && (
        <div className="space-y-4">
          {result.result.roadmap.map((phase, i) => (
            <div key={i} className="card-angular p-5 bg-[#FFFFFF]">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-2.5 h-2.5 rounded-full bg-[#E0A526] flex-shrink-0" />
                <div>
                  <div className="text-sm font-semibold text-[#141923]">{phase.phase}</div>
                  <div className="text-xs text-[#89620B]">{phase.timeframe}</div>
                </div>
              </div>
              <ul className="space-y-2 ml-5">
                {phase.milestones.map((m, j) => (
                  <li key={j} className="flex items-start gap-2 text-sm">
                    <span className="flex-shrink-0 mt-0.5">
                      {m.status === 'ACHIEVED' ? '✅' : '◻️'}
                    </span>
                    <span className={m.status === 'ACHIEVED' ? 'text-[#364152]' : 'text-[#364152] opacity-70'}>
                      {m.milestone}
                    </span>
                    <span className="ml-auto text-xs text-[#89620B] flex-shrink-0">{m.targetDate}</span>
                    <span
                      className="text-xs px-1.5 py-0.5 rounded flex-shrink-0 font-medium"
                      style={{
                        background: m.status === 'ACHIEVED' ? '#dcfce7' : '#fef3c7',
                        color: m.status === 'ACHIEVED' ? '#166534' : '#92400e',
                      }}
                    >
                      {m.status}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {/* 0D-3: In-App Portfolio Preview Tab */}
      {activeTab === 'portfolio' && (
        <div className="space-y-6">
          <div className="card-angular p-6 flex flex-wrap items-center justify-between gap-4 bg-[#E0A526]/5 border border-[#E0A526]/30">
            <div>
              <h3 className="text-sm font-semibold text-[#141923] mb-1">
                In-App Portfolio Section Preview
              </h3>
              <p className="text-xs text-[#364152] opacity-70 max-w-xl">
                Curated landing sections generated for investor due diligence and web portfolio site export.
              </p>
            </div>
            {tier === 'max_premium' && (
              <a
                href={`/api/export/portfolio?deckId=${result.deckId}`}
                className="px-4 py-2 text-xs font-medium text-[#141923] rounded flex-shrink-0 shadow-xs"
                style={{ background: 'linear-gradient(135deg, #D4AF37, #E0A526, #A4730C)' }}
              >
                ⬇ Download Portfolio ZIP
              </a>
            )}
          </div>

          {portfolioSections.length > 0 ? (
            portfolioSections.map((sec, idx) => (
              <div key={idx} className="card-angular p-6 bg-[#FFFFFF]">
                <div className="flex items-center justify-between mb-3 border-b border-[#E5E7EB] pb-2">
                  <h4 className="text-base font-semibold text-[#141923]">{sec.sectionTitle}</h4>
                  {sec.label && (
                    <span className="text-[10px] tabular-nums font-medium px-2 py-0.5 bg-amber-100 text-amber-800 rounded border border-amber-200">
                      {sec.label}
                    </span>
                  )}
                </div>
                <div className="text-sm text-[#364152] whitespace-pre-wrap leading-relaxed">
                  {sec.content}
                </div>
              </div>
            ))
          ) : (
            <div className="card-angular p-8 text-center text-xs text-stone-500 bg-[#FFFFFF]">
              No dedicated portfolio sections found in this generation. Re-run analysis with detailed background to generate web sections.
            </div>
          )}
        </div>
      )}

      {/* New Tabs Phase 4 */}
      {activeTab === 'strategy' && (
        <div className="space-y-6">
          <div className="card-angular p-6 bg-[#FFFFFF]">
            <h3 className="text-sm font-semibold mb-2">Value Proposition Canvas</h3>
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div className="border p-3"><b>Customer Jobs:</b> {ai?.valuePropositionCanvas?.customerJobs?.join(', ')}</div>
              <div className="border p-3"><b>Products:</b> {ai?.valuePropositionCanvas?.products?.join(', ')}</div>
              <div className="border p-3"><b>Pains:</b> {ai?.valuePropositionCanvas?.pains?.join(', ')}</div>
              <div className="border p-3"><b>Pain Relievers:</b> {ai?.valuePropositionCanvas?.painRelievers?.join(', ')}</div>
              <div className="border p-3"><b>Gains:</b> {ai?.valuePropositionCanvas?.gains?.join(', ')}</div>
              <div className="border p-3"><b>Gain Creators:</b> {ai?.valuePropositionCanvas?.gainCreators?.join(', ')}</div>
            </div>
          </div>
          {ai?.customerJourney && ai.customerJourney.length > 0 && (
            <div className="card-angular p-6 bg-[#FFFFFF]">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold">Customer Journey Map</h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded border border-amber-200 bg-amber-50 text-amber-800">
                  ASSUMPTION
                </span>
              </div>
              <div className="overflow-x-auto">
                <div className="flex gap-3 min-w-[800px]">
                  {ai.customerJourney.map((stage: any, i: number) => (
                    <div key={i} className="flex-1 p-3 border rounded bg-white text-center">
                      <strong className="block text-xs mb-1">{stage.stage}</strong>
                      <p className="text-xs text-stone-600">{stage.touchpoint}</p>
                      <p className="text-xs italic mt-1">{stage.emotion}</p>
                      <p className="text-xs text-blue-600 mt-1">{stage.opportunity}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
          <div className="card-angular p-6 bg-[#FFFFFF]">
            <h3 className="text-sm font-semibold mb-2">MoSCoW Features</h3>
            <div className="grid grid-cols-4 gap-4 text-xs">
              <div className="border p-3"><b>Must:</b> {ai?.moscowFeatures?.must?.join(', ')}</div>
              <div className="border p-3"><b>Should:</b> {ai?.moscowFeatures?.should?.join(', ')}</div>
              <div className="border p-3"><b>Could:</b> {ai?.moscowFeatures?.could?.join(', ')}</div>
              <div className="border p-3"><b>Wont:</b> {ai?.moscowFeatures?.wont?.join(', ')}</div>
            </div>
          </div>
          <div className="card-angular p-6 bg-[#FFFFFF]">
            <h3 className="text-sm font-semibold mb-2">SWOT Analysis</h3>
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div className="border p-3 bg-emerald-50"><b>Strengths:</b> {ai?.swot?.strengths?.join(', ')}</div>
              <div className="border p-3 bg-rose-50"><b>Weaknesses:</b> {ai?.swot?.weaknesses?.join(', ')}</div>
              <div className="border p-3 bg-blue-50"><b>Opportunities:</b> {ai?.swot?.opportunities?.join(', ')}</div>
              <div className="border p-3 bg-orange-50"><b>Threats:</b> {ai?.swot?.threats?.join(', ')}</div>
            </div>
          </div>
          <div className="card-angular p-6 bg-[#FFFFFF]">
            <h3 className="text-sm font-semibold mb-2">PESTLE Analysis</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-xs">
              <div className="border p-2"><b>Political:</b> {ai?.pestleAnalysis?.political?.join(', ')}</div>
              <div className="border p-2"><b>Economic:</b> {ai?.pestleAnalysis?.economic?.join(', ')}</div>
              <div className="border p-2"><b>Social:</b> {ai?.pestleAnalysis?.social?.join(', ')}</div>
              <div className="border p-2"><b>Technological:</b> {ai?.pestleAnalysis?.technological?.join(', ')}</div>
              <div className="border p-2"><b>Legal:</b> {ai?.pestleAnalysis?.legal?.join(', ')}</div>
              <div className="border p-2"><b>Environmental:</b> {ai?.pestleAnalysis?.environmental?.join(', ')}</div>
            </div>
          </div>
        </div>
      )}
      {activeTab === 'deep_analysis' && (
        <div className="space-y-6">
          <div className="card-angular p-6 bg-[#FFFFFF]">
            <h3 className="text-sm font-semibold mb-4">Competitor Matrix</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead><tr className="border-b"><th>Competitor</th><th>Pricing</th><th>Strengths</th><th>Weaknesses</th><th>Our Advantage</th></tr></thead>
                <tbody>
                  {ai?.competitorMatrix?.map((c, i) => (
                    <tr key={i} className="border-b">
                      <td>{c.competitor}</td><td>{c.pricing}</td><td>{c.strengths?.join(', ')}</td><td>{c.weaknesses?.join(', ')}</td><td className="text-emerald-700 font-medium">{c.ourAdvantage}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="card-angular p-6 bg-[#FFFFFF]">
            {ai?.positioningMap && (
              <ScatterPlot2x2 
                data={(ai.positioningMap || []).map(p => ({
                  name: p.label,
                  x: p.x,
                  y: p.y,
                  isHighlighted: p.isUs
                }))}
                title="Positioning Map" 
              />
            )}
          </div>
          <div className="card-angular p-6 bg-[#FFFFFF]">
            <h3 className="text-sm font-semibold mb-2">Sales Funnel</h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
              {ai?.salesFunnel?.map((f, i) => (
                <div key={i} className="border p-3">
                  <b>{f.stage}</b><br/>Count: {f.count}<br/>Conv: {f.conversion}%<br/><i>{f.tactic}</i>
                </div>
              ))}
            </div>
          </div>
          <div className="card-angular p-6 bg-[#FFFFFF]">
            <h3 className="text-sm font-semibold mb-2">GTM Strategy</h3>
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div className="border p-3"><b>Phase 1: {ai?.gtmStrategy?.phase1?.name}</b><br/>Timeline: {ai?.gtmStrategy?.phase1?.timeline}<br/>Budget: {ai?.gtmStrategy?.phase1?.budget}<br/>Channels: {ai?.gtmStrategy?.phase1?.channels?.join(', ')}</div>
              <div className="border p-3"><b>Phase 2: {ai?.gtmStrategy?.phase2?.name}</b><br/>Timeline: {ai?.gtmStrategy?.phase2?.timeline}<br/>Budget: {ai?.gtmStrategy?.phase2?.budget}<br/>Channels: {ai?.gtmStrategy?.phase2?.channels?.join(', ')}</div>
            </div>
          </div>
        </div>
      )}
      {activeTab === 'operations' && (
        <div className="space-y-6">
          <div className="card-angular p-6 bg-[#FFFFFF]">
            <h3 className="text-sm font-semibold mb-4">Use of Funds Breakdown</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead><tr className="border-b"><th>Category</th><th>Amount</th><th>Percentage</th><th>Rationale</th></tr></thead>
                <tbody>
                  {ai?.useOfFundsBreakdown?.map((u, i) => (
                    <tr key={i} className="border-b"><td>{u.category}</td><td>${u.amount?.toLocaleString()}</td><td>{u.percentage}%</td><td>{u.rationale}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="card-angular p-6 bg-[#FFFFFF]">
            <h3 className="text-sm font-semibold mb-4">KPI Targets</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead><tr className="border-b"><th>Metric</th><th>Current</th><th>Target</th><th>Timeline</th></tr></thead>
                <tbody>
                  {ai?.kpiTargets?.map((k, i) => (
                    <tr key={i} className="border-b"><td>{k.metric}</td><td>{k.current}</td><td>{k.target}</td><td>{k.timeline}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="card-angular p-6 bg-[#FFFFFF]">
            <h3 className="text-sm font-semibold mb-4">Action Plan</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div>
                <h4 className="font-bold mb-2">30-Day Plan</h4>
                <ul className="list-disc pl-4 space-y-1">
                  {ai?.actionPlan?.thirtyDay?.map((a, i) => (
                    <li key={i}>{a.action} ({a.owner}) - {a.deadline}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h4 className="font-bold mb-2">90-Day Plan</h4>
                <ul className="list-disc pl-4 space-y-1">
                  {ai?.actionPlan?.ninetyDay?.map((a, i) => (
                    <li key={i}>{a.action} ({a.owner}) - {a.deadline}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
          <div className="card-angular p-6 bg-[#FFFFFF]">
            <h3 className="text-sm font-semibold mb-2">Brand Strategy</h3>
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div className="border p-2"><b>Positioning:</b> {ai?.brandStrategy?.positioning}</div>
              <div className="border p-2"><b>Voice Tone:</b> {ai?.brandStrategy?.voiceTone}</div>
              <div className="border p-2"><b>Visual Identity:</b> {ai?.brandStrategy?.visualIdentity}</div>
              <div className="border p-2"><b>Tagline:</b> {ai?.brandStrategy?.tagline}</div>
            </div>
          </div>
        </div>
      )}
      {activeTab === 'investor_prep' && (
        <div className="space-y-6">
          <div className="card-angular p-6 bg-[#FFFFFF]">
            <h3 className="text-sm font-semibold mb-4">Risk Register</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead><tr className="border-b"><th>Risk</th><th>Severity</th><th>Likelihood</th><th>Mitigation</th></tr></thead>
                <tbody>
                  {ai?.riskRegister?.map((r, i) => (
                    <tr key={i} className="border-b"><td>{r.risk}</td><td>{r.severity}</td><td>{r.likelihood}</td><td>{r.mitigation}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="card-angular p-6 bg-[#FFFFFF]">
            <h3 className="text-sm font-semibold mb-4">Investor Q&A</h3>
            <div className="grid gap-2 text-xs">
              {ai?.investorQA?.map((q, i) => (
                <div key={i} className="border p-3">
                  <div className="font-bold text-[#141923] mb-1">Q: {q.question}</div>
                  <div className="text-stone-700">A: {q.answer}</div>
                  <div className="text-[10px] text-amber-600 mt-1 ">{q.category}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="card-angular p-6 bg-[#FFFFFF]">
            <h3 className="text-sm font-semibold mb-4">Entrepreneurial Skills Matrix</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead><tr className="border-b"><th>Skill</th><th>Self Rating</th><th>Evidence</th><th>Gap</th></tr></thead>
                <tbody>
                  {ai?.entrepreneurialSkillsMatrix?.map((s, i) => (
                    <tr key={i} className="border-b"><td>{s.skill}</td><td>{s.selfRating}/10</td><td>{s.evidence}</td><td>{s.gap}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
