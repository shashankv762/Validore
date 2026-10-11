'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { AlertTriangle, FlaskConical, History, FileText } from 'lucide-react'
import { ExportToolbar } from '@/components/ui/ExportToolbar'
import { ScatterPlot2x2 } from '@/components/ui/ScatterPlot2x2'

type CanvasBlock = {
  content: string
  confidenceScore: number
  label: string
  keyAssumptions: string[]
}

type ValidationExperiment = {
  assumption: string
  experiment: string
  successMetric: string
  timeframe: string
}

type ConfidenceScores = {
  riskiestAssumption?: string
  validationExperiments?: ValidationExperiment[]
  overallScore?: number
}

type Canvas = {
  id: string
  version: number
  problem: CanvasBlock | null
  customerSegments: CanvasBlock | null
  uvp: CanvasBlock | null
  solution: CanvasBlock | null
  channels: CanvasBlock | null
  revenueStreams: CanvasBlock | null
  costStructure: CanvasBlock | null
  keyMetrics: CanvasBlock | null
  unfairAdvantage: CanvasBlock | null
  confidenceScores?: ConfidenceScores | null
  validationScore: number | null
  changeReason: string | null
  evidenceSummary: string | null
  analysisData?: any
  assumptionRegister?: { assumption: string; riskLevel: string; testMethod: string; status: string }[]
  problemStatement?: string
  interviewQuestions?: string[]
  segmentPrioritization?: { segment: string; priority: number; rationale: string; estimatedSize: string }[]
  alternativeSolutions?: { name: string; weakness: string; ourAdvantage: string }[]
  businessModelCanvas?: { keyPartners: string[]; keyActivities: string[]; keyResources: string[]; valuePropositions: string[]; customerRelationships: string[]; channels: string[]; customerSegments: string[]; costStructure: string[]; revenueStreams: string[] }
  businessModelValidationScore?: number
  bmScoreBreakdown?: { desirability: number; feasibility: number; viability: number; adaptability: number }
  ratMatrix?: { assumption: string; experiment: string; metric: string; criteria: string; result?: string }[]
  buildMeasureLearnCycles?: { hypothesis: string; buildAction: string; measureMetric: string; learnInsight: string; pivot?: string }[]
  pivotAnalysis?: { currentModel: string; triggerConditions: string[]; pivotOptions: { type: string; description: string; likelihood: string }[]; recommendation: string }
  ifThenRules?: { ifCondition: string; thenAction: string; confidence: string; rationale: string }[]
  pricingVsVolumeMatrix?: { pricePoint: number; estimatedVolume: number; revenue: number; contributionMargin: number }[]
}

function confidenceColor(score: number): string {
  if (score <= 25) return '#ef4444'
  if (score <= 50) return '#f97316'
  if (score <= 75) return '#3b82f6'
  return '#22c55e'
}

function confidenceBadge(score: number): string {
  if (score <= 25) return 'ASSUMPTION'
  if (score <= 50) return 'SOME RESEARCH'
  if (score <= 75) return 'MODERATE EVIDENCE'
  return 'STRONGER EVIDENCE'
}

const BLOCKS: { key: string; label: string }[] = [
  { key: 'problem', label: 'Problem' },
  { key: 'customerSegments', label: 'Customer Segments' },
  { key: 'uvp', label: 'Unique Value Proposition' },
  { key: 'solution', label: 'Solution' },
  { key: 'channels', label: 'Channels' },
  { key: 'revenueStreams', label: 'Revenue Streams' },
  { key: 'costStructure', label: 'Cost Structure' },
  { key: 'keyMetrics', label: 'Key Metrics' },
  { key: 'unfairAdvantage', label: 'Unfair Advantage' },
]

export default function LeanCanvasPage() {
  const [ideas, setIdeas] = useState<Array<{ id: string; name: string }>>([])
  const [selectedIdeaId, setSelectedIdeaId] = useState('')
  const [canvases, setCanvases] = useState<Canvas[]>([])
  const [activeVersion, setActiveVersion] = useState(0)
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [isPremium, setIsPremium] = useState(false)
  const [manualBlocks, setManualBlocks] = useState<Record<string, string>>({})
  const [canvasReport, setCanvasReport] = useState<any[] | null>(null)
  const [reportLoading, setReportLoading] = useState(false)
  // FIX-13: Controlled state for the 12-question intake form
  const [intakeAnswers, setIntakeAnswers] = useState<Record<number, string>>({})
  const supabase = createClient()

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const res = await fetch('/api/ideas')
      const data = await res.json()
      setIdeas(data.ideas ?? [])
      // Check tier via API to avoid RLS issues
      const tierRes = await fetch('/api/me')
      if (tierRes.ok) {
        const { user: u } = await tierRes.json()
        setIsPremium(u?.tier === 'premium' || u?.tier === 'max_premium')
      }
    }
    load()
  }, [supabase])

  useEffect(() => {
    if (!selectedIdeaId) return
    let ignore = false
    const timer = setTimeout(() => {
      if (!ignore) setLoading(true)
    }, 0)
    fetch(`/api/lean-canvas?ideaId=${selectedIdeaId}`)
      .then(r => r.json())
      .then(d => {
        if (!ignore) {
          setCanvases(d.canvases ?? [])
          setActiveVersion(0)
        }
      })
      .finally(() => {
        if (!ignore) setLoading(false)
      })
    return () => {
      ignore = true
      clearTimeout(timer)
    }
  }, [selectedIdeaId])

  async function handleGenerate() {
    if (!selectedIdeaId) {
      toast.error('Please select an idea first')
      return
    }
    setGenerating(true)
    // FIX-13: Include captured intake answers so the API can inject them into the AI prompt
    const res = await fetch('/api/lean-canvas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ideaId: selectedIdeaId, intakeAnswers }),
    })
    const data = await res.json()
    if (res.ok) {
      const updated = await fetch(`/api/lean-canvas?ideaId=${selectedIdeaId}`)
      const d = await updated.json()
      setCanvases(d.canvases ?? [])
      setActiveVersion((d.canvases?.length ?? 1) - 1)
      toast.success('Lean Canvas generated successfully!')
    } else {
      toast.error(data.error ?? 'Generation failed')
    }
    setGenerating(false)
  }

  const currentCanvas = canvases[activeVersion]
  const overallConfidenceScore =
    currentCanvas?.validationScore ??
    currentCanvas?.confidenceScores?.overallScore ??
    0
  const gaugeColor = confidenceColor(overallConfidenceScore)
  const gaugeBadge = confidenceBadge(overallConfidenceScore)

  const riskiestAssumption = currentCanvas?.confidenceScores?.riskiestAssumption
  const validationExperiments = currentCanvas?.confidenceScores?.validationExperiments ?? []

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-light text-[#0A1628] mb-1">Lean Canvas</h1>
          <p className="text-sm text-[#1C1C1C] opacity-60">
            {isPremium
              ? 'AI-powered 9-step Lean Canvas automation with confidence scoring.'
              : 'Manual Lean Canvas editor. Upgrade to Premium for AI automation.'}
          </p>
        </div>
        <ExportToolbar
          ideaId={selectedIdeaId}
          formats={['pdf', 'csv']}
        />
      </div>

      <div className="card-angular p-6">
        <label className="block text-xs font-medium text-[#96792b] uppercase tracking-wider mb-2">Select Idea</label>
        <select
          value={selectedIdeaId}
          onChange={e => setSelectedIdeaId(e.target.value)}
          className="w-full px-4 py-2 border border-[#E8E0D0] rounded bg-[#FAFAF7] text-sm focus:outline-none focus:border-[#C8A860] mb-4"
        >
          <option value="">— Select an idea —</option>
          {ideas.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
        </select>
        
        {selectedIdeaId && isPremium && (
          <div className="border-t border-[#E8E0D0] pt-4 mt-4">
            <h3 className="text-sm font-semibold mb-1">Deep Intake Form (12 Questions)</h3>
            <p className="text-xs text-[#1C1C1C]/60 mb-3">
              Your answers supplement the idea&apos;s stored data and give the AI extra context for a more precise canvas.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              {[
                '1. What is the specific problem you are solving?',
                '2. Who are the exact early adopters you will target first?',
                '3. What is your proposed solution to this problem?',
                '4. What existing alternatives are customers using today?',
                '5. What is your single, clear Unique Value Proposition?',
                '6. What is your high-level concept (X for Y)?',
                '7. What is your unfair advantage that cannot be easily copied?',
                '8. Which channels will you use to reach customers?',
                '9. How will you make money (Revenue Streams)?',
                '10. What are your primary costs (Cost Structure)?',
                '11. What key metrics will tell you if this is working?',
                '12. What is the biggest risk to this idea right now?'
              ].map((q, i) => (
                <div key={i}>
                  <label className="block text-xs font-medium text-[#0A1628] mb-1">{q}</label>
                  {/* FIX-13: Controlled input — value bound to intakeAnswers[i], onChange updates state */}
                  <input
                    type="text"
                    className="w-full px-3 py-1.5 border border-[#E8E0D0] rounded bg-white text-sm focus:border-[#C8A860] focus:outline-none"
                    placeholder="Enter details..."
                    value={intakeAnswers[i] ?? ''}
                    onChange={e => setIntakeAnswers(prev => ({ ...prev, [i]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="px-4 py-2 bg-[#0A1628] text-white rounded text-sm disabled:opacity-50"
            >
              {generating ? 'Generating AI Canvas...' : 'Submit & Generate New Canvas'}
            </button>
          </div>
        )}

      </div>

      {canvases.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex gap-2">
            {canvases.map((c, idx) => (
              <button
                key={c.id}
                onClick={() => setActiveVersion(idx)}
                className={`px-4 py-2 text-sm font-medium transition-all cursor-pointer ${
                  activeVersion === idx
                    ? 'text-[#0A1628] border-b-2 border-[#C8A860] font-semibold'
                    : 'text-[#1C1C1C] opacity-60 hover:opacity-100'
                }`}
              >
                Version {c.version}
              </button>
            ))}
          </div>

          {/* 0C-3: Overall Canvas Confidence Score Gauge */}
          {currentCanvas && (
            <div className="card-angular px-4 py-2 bg-[#FAFAF7] border border-[#E8E0D0] flex items-center gap-3">
              <div className="relative w-12 h-12 flex items-center justify-center">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="42" fill="none" stroke="#E8E0D0" strokeWidth="10" />
                  <circle
                    cx="50" cy="50" r="42" fill="none" stroke={gaugeColor} strokeWidth="10"
                    strokeDasharray="264"
                    strokeDashoffset={264 - (264 * overallConfidenceScore) / 100}
                    className="transition-all duration-700 ease-out"
                  />
                </svg>
                <span className="absolute text-xs font-bold text-[#0A1628]">
                  {overallConfidenceScore}
                </span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold tracking-wider text-stone-500 block">
                  Canvas Confidence
                </span>
                <span
                  className="text-[10px] font-bold px-2 py-0.5 rounded-full inline-block mt-0.5"
                  style={{ background: `${gaugeColor}20`, color: gaugeColor }}
                >
                  {gaugeBadge}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {selectedIdeaId && (
        <div>
          {isPremium ? (
            <button
              onClick={handleGenerate}
              disabled={generating || canvases.length >= 4}
              className="px-6 py-2.5 text-sm font-medium text-[#0A1628] disabled:opacity-50 transition-all cursor-pointer"
              style={{ background: 'linear-gradient(135deg, #D4AF37, #C8A860, #B8963E)', borderRadius: '2px 10px 2px 10px' }}
            >
              {generating ? '⏳ Generating AI Canvas…' : canvases.length >= 4 ? '✓ Max 4 versions reached' : '✦ Generate with AI'}
            </button>
          ) : (
            <div className="card-angular px-6 py-3 flex items-center gap-3">
              <span className="text-[#96792b]">🔒</span>
              <div>
                <p className="text-sm font-medium text-[#0A1628]">AI Canvas Automation — Premium Feature</p>
                <p className="text-xs text-[#1C1C1C] opacity-60">Upgrade to Premium ($29/mo) to unlock AI-powered canvas generation</p>
              </div>
              <a
                href="/auth/signup?plan=premium"
                className="ml-auto px-4 py-2 text-xs font-medium text-[#0A1628]"
                style={{ background: 'linear-gradient(135deg, #D4AF37, #C8A860, #B8963E)', borderRadius: '2px 8px 2px 8px' }}
              >
                Upgrade
              </a>
            </div>
          )}
        </div>
      )}

      {/* 0C-1: Riskiest Assumption Highlight Alert */}
      {riskiestAssumption && (
        <div className="card-angular p-4 border-l-4 border-amber-500 bg-amber-50/80 shadow-xs flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-900">
                Riskiest Assumption Under Test
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded border border-amber-300 bg-amber-200/60 text-amber-900">
                ASSUMPTION
              </span>
            </div>
            <p className="text-sm text-[#0A1628] leading-relaxed font-medium">
              {riskiestAssumption}
            </p>
          </div>
        </div>
      )}

      {/* 0C-4: Version Change Reason & Evidence Summary */}
      {currentCanvas && (currentCanvas.changeReason || currentCanvas.evidenceSummary) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="card-angular p-5 bg-[#FAFAF7] border border-[#E8E0D0]">
            <div className="flex items-center gap-2 mb-2 text-[#96792b]">
              <History className="w-4 h-4" />
              <h3 className="text-xs font-semibold uppercase tracking-wider">
                Version Evolution Rationale (V{currentCanvas.version})
              </h3>
            </div>
            <p className="text-xs text-[#1C1C1C] leading-relaxed">
              {currentCanvas.changeReason || 'Initial baseline version generated from startup parameters.'}
            </p>
          </div>

          <div className="card-angular p-5 bg-[#FAFAF7] border border-[#E8E0D0]">
            <div className="flex items-center gap-2 mb-2 text-[#96792b]">
              <FileText className="w-4 h-4" />
              <h3 className="text-xs font-semibold uppercase tracking-wider">
                Evidence &amp; Uncertainty Summary
              </h3>
            </div>
            <p className="text-xs text-[#1C1C1C] leading-relaxed">
              {currentCanvas.evidenceSummary || 'Unverified founder assumptions. Field tests and validation sprints required.'}
            </p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="card-angular p-12 text-center">
          <div className="animate-pulse text-[#96792b]">Loading canvas…</div>
        </div>
      ) : currentCanvas ? (
        <>
          {/* 9-Block Lean Canvas Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {BLOCKS.map(({ key, label }) => {
              const block = currentCanvas[key as keyof Canvas] as CanvasBlock | null
              const score = block?.confidenceScore ?? 0
              const color = confidenceColor(score)
              const badge = confidenceBadge(score)
              return (
                <div key={key} className="card-angular p-5 bg-[#FAFAF7]" style={{ borderLeft: `3px solid ${color}` }}>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xs font-semibold text-[#0A1628] uppercase tracking-wider">{label}</h3>
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-bold" style={{ background: color + '20', color }}>
                      {badge}
                    </span>
                  </div>
                  {block ? (
                    <>
                      <p className="text-sm text-[#1C1C1C] leading-relaxed mb-3">{block.content}</p>
                      {block.keyAssumptions?.length > 0 && (
                        <div className="mt-2">
                          <p className="text-xs text-[#96792b] font-medium mb-1">Key Assumptions:</p>
                          <ul className="space-y-0.5">
                            {block.keyAssumptions.map((a, i) => (
                              <li key={i} className="text-xs text-[#1C1C1C] opacity-70 flex gap-1">
                                <span>•</span>{a}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <div className="mt-3 flex items-center gap-2">
                        <div className="flex-1 h-1 rounded bg-[#E8E0D0]">
                          <div className="h-1 rounded transition-all" style={{ width: `${score}%`, background: color }} />
                        </div>
                        <span className="text-xs font-medium" style={{ color }}>{score}/100</span>
                      </div>
                    </>
                  ) : (
                    <textarea
                      value={manualBlocks[key] ?? ''}
                      onChange={e => setManualBlocks(b => ({ ...b, [key]: e.target.value }))}
                      placeholder={`Describe your ${label.toLowerCase()}…`}
                      rows={4}
                      className="w-full text-sm text-[#1C1C1C] bg-transparent border-none focus:outline-none resize-none placeholder-[#1C1C1C]/40"
                    />
                  )}
                </div>
              )
            })}
          </div>

          {/* 0C-2: Validation Experiments Planner Table */}
          {validationExperiments.length > 0 && (
            <div className="card-angular p-6 bg-[#FAFAF7]">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-[#0A1628] flex items-center gap-2">
                  <FlaskConical className="w-4 h-4 text-[#C8A860]" /> Validation Experiments Planner
                </h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded border border-purple-200 bg-purple-50 text-purple-800">
                  PROPOSED_STRATEGY
                </span>
              </div>
              <p className="text-xs text-[#1C1C1C] opacity-60 mb-4">
                Structured experiment backlog to systematically de-risk core hypotheses.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[#E8E0D0] bg-[#F5F0E8]/70">
                      <th className="py-2.5 px-3 font-semibold text-[#0A1628]">Assumption Tested</th>
                      <th className="py-2.5 px-3 font-semibold text-[#0A1628]">Experiment Method</th>
                      <th className="py-2.5 px-3 font-semibold text-[#0A1628]">Success Metric / KPI</th>
                      <th className="py-2.5 px-3 font-semibold text-[#0A1628] w-28">Timeframe</th>
                    </tr>
                  </thead>
                  <tbody>
                    {validationExperiments.map((exp, idx) => (
                      <tr key={idx} className="border-b border-[#E8E0D0] last:border-0 hover:bg-[#F5F0E8]/40">
                        <td className="py-3 px-3 font-medium text-[#0A1628] align-top">{exp.assumption}</td>
                        <td className="py-3 px-3 text-[#1C1C1C] align-top leading-relaxed">{exp.experiment}</td>
                        <td className="py-3 px-3 font-mono font-medium text-[#96792b] align-top">{exp.successMetric}</td>
                        <td className="py-3 px-3 text-stone-600 align-top whitespace-nowrap">{exp.timeframe}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* New Sections for Phase 3 */}
          {currentCanvas?.analysisData?.assumptionRegister && (
             <div className="card-angular p-6 bg-[#FAFAF7] mt-4">
               <h3 className="text-sm font-semibold mb-4">Assumption Register</h3>
               <div className="overflow-x-auto">
                 <table className="w-full text-xs text-left">
                   <thead><tr className="border-b"><th>Assumption</th><th>Risk</th><th>Method</th><th>Status</th></tr></thead>
                   <tbody>
                     {currentCanvas.analysisData.assumptionRegister.map((a: any, i: number) => (
                       <tr key={i} className="border-b"><td>{a.assumption}</td><td>{a.riskLevel}</td><td>{a.testMethod}</td><td>{a.status}</td></tr>
                     ))}
                   </tbody>
                 </table>
               </div>
             </div>
          )}
          {currentCanvas?.analysisData?.buildMeasureLearnCycles && (
            <div className="card-angular p-6 bg-[#FAFAF7] mt-4">
               <h3 className="text-sm font-semibold mb-4">Build-Measure-Learn Cycles</h3>
               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 {currentCanvas.analysisData.buildMeasureLearnCycles.map((cycle: any, i: number) => (
                    <div key={i} className="border p-4 rounded">
                      <p><strong>Hypothesis:</strong> {cycle.hypothesis}</p>
                      <p><strong>Build:</strong> {cycle.buildAction}</p>
                      <p><strong>Measure:</strong> {cycle.measureMetric}</p>
                      <p><strong>Learn:</strong> {cycle.learnInsight}</p>
                    </div>
                 ))}
               </div>
            </div>
          )}
          {currentCanvas?.analysisData?.pivotAnalysis && (
            <div className="card-angular p-6 bg-[#FAFAF7] mt-4">
               <h3 className="text-sm font-semibold mb-4">Pivot Analysis Panel</h3>
               <p><strong>Current Model:</strong> {currentCanvas.analysisData.pivotAnalysis.currentModel}</p>
               <p><strong>Recommendation:</strong> {currentCanvas.analysisData.pivotAnalysis.recommendation}</p>
            </div>
          )}
          {currentCanvas?.analysisData?.ifThenRules && (
            <div className="card-angular p-6 bg-[#FAFAF7] mt-4">
               <h3 className="text-sm font-semibold mb-4">IF→THEN Rules</h3>
               <div className="grid grid-cols-1 gap-2">
                 {currentCanvas.analysisData.ifThenRules.map((rule: any, i: number) => (
                   <div key={i} className="p-2 border rounded text-xs">
                     IF {rule.ifCondition} THEN {rule.thenAction} ({rule.confidence})
                   </div>
                 ))}
               </div>
            </div>
          )}
          {currentCanvas?.analysisData?.pricingVsVolumeMatrix && (
            <div className="card-angular p-6 bg-[#FAFAF7] mt-4">
               <h3 className="text-sm font-semibold mb-4">Pricing vs Volume Matrix</h3>
               <table className="w-full text-xs text-left">
                 <thead><tr className="border-b"><th>Price</th><th>Volume</th><th>Revenue</th><th>Margin</th></tr></thead>
                 <tbody>
                   {currentCanvas.analysisData.pricingVsVolumeMatrix.map((r: any, i: number) => (
                     <tr key={i} className="border-b"><td>${r.pricePoint}</td><td>{r.estimatedVolume}</td><td>${r.revenue}</td><td>${r.contributionMargin}</td></tr>
                   ))}
                 </tbody>
               </table>
            </div>
          )}
          {currentCanvas?.analysisData?.businessModelCanvas && (
             <div className="card-angular p-6 bg-[#FAFAF7] mt-4">
               <h3 className="text-sm font-semibold mb-4">Business Model Canvas</h3>
               <div className="grid grid-cols-5 gap-2 text-xs border p-2">
                 <div className="col-span-1 border p-2"><b>Key Partners:</b> {currentCanvas.analysisData.businessModelCanvas.keyPartners?.join(', ')}</div>
                 <div className="col-span-1 flex flex-col gap-2">
                    <div className="border p-2"><b>Key Activities:</b> {currentCanvas.analysisData.businessModelCanvas.keyActivities?.join(', ')}</div>
                    <div className="border p-2"><b>Key Resources:</b> {currentCanvas.analysisData.businessModelCanvas.keyResources?.join(', ')}</div>
                 </div>
                 <div className="col-span-1 border p-2"><b>Value Props:</b> {currentCanvas.analysisData.businessModelCanvas.valuePropositions?.join(', ')}</div>
                 <div className="col-span-1 flex flex-col gap-2">
                    <div className="border p-2"><b>Cust. Rel.:</b> {currentCanvas.analysisData.businessModelCanvas.customerRelationships?.join(', ')}</div>
                    <div className="border p-2"><b>Channels:</b> {currentCanvas.analysisData.businessModelCanvas.channels?.join(', ')}</div>
                 </div>
                 <div className="col-span-1 border p-2"><b>Segments:</b> {currentCanvas.analysisData.businessModelCanvas.customerSegments?.join(', ')}</div>
                 <div className="col-span-2 border p-2 mt-2"><b>Cost Structure:</b> {currentCanvas.analysisData.businessModelCanvas.costStructure?.join(', ')}</div>
                 <div className="col-span-3 border p-2 mt-2"><b>Revenue Streams:</b> {currentCanvas.analysisData.businessModelCanvas.revenueStreams?.join(', ')}</div>
               </div>
             </div>
          )}

          {/* FIX-06 Sections */}
          {/* 1. Formal Problem Statement */}
          {currentCanvas?.analysisData?.problemStatement && (
            <div className="card-angular p-6 bg-[#FAFAF7] mt-4 shadow-sm border-l-4 border-amber-500">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-sm font-semibold text-[#0A1628]">Formal Problem Statement</h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded border border-amber-200 bg-amber-50 text-amber-800">ASSUMPTION</span>
              </div>
              <p className="text-lg font-medium text-[#0A1628]">{currentCanvas.analysisData.problemStatement}</p>
            </div>
          )}

          {/* 2. Customer Interview Questions */}
          {Array.isArray(currentCanvas?.analysisData?.interviewQuestions) && currentCanvas.analysisData.interviewQuestions.length > 0 && (
            <div className="card-angular p-6 bg-[#FAFAF7] mt-4 shadow-sm">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-sm font-semibold text-[#0A1628]">Customer Interview Questions</h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded border border-emerald-200 bg-emerald-50 text-emerald-800">VERIFIED</span>
              </div>
              <ol className="list-decimal list-inside space-y-2 text-sm text-[#1C1C1C]">
                {currentCanvas.analysisData.interviewQuestions.map((q: any, i: number) => (
                  <li key={i}>{q.question || q}</li>
                ))}
              </ol>
            </div>
          )}

          {/* 3. Segment Prioritization Matrix */}
          {Array.isArray(currentCanvas?.analysisData?.segmentPrioritization) && currentCanvas.analysisData.segmentPrioritization.length > 0 && (
            <div className="card-angular p-6 bg-[#FAFAF7] mt-4 shadow-sm overflow-x-auto">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-sm font-semibold text-[#0A1628]">Segment Prioritization Matrix</h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded border border-orange-200 bg-orange-50 text-orange-800">AI_ESTIMATE_UNVERIFIED</span>
              </div>
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b bg-[#F5F0E8]/70">
                    <th className="py-2 px-2">Segment</th>
                    <th className="py-2 px-2">Market Size</th>
                    <th className="py-2 px-2">Accessibility</th>
                    <th className="py-2 px-2">Urgency</th>
                    <th className="py-2 px-2">Profitability</th>
                    <th className="py-2 px-2">Competitive Intensity</th>
                    <th className="py-2 px-2">Strategic Fit</th>
                    <th className="py-2 px-2">Total Score</th>
                  </tr>
                </thead>
                <tbody>
                  {currentCanvas.analysisData.segmentPrioritization.map((seg: any, i: number) => (
                    <tr key={i} className="border-b hover:bg-[#F5F0E8]/40">
                      <td className="py-2 px-2 font-medium">{seg.segment}</td>
                      <td className="py-2 px-2">{seg.estimatedSize || seg.marketSize || '-'}</td>
                      <td className="py-2 px-2">{seg.accessibility || '-'}</td>
                      <td className="py-2 px-2">{seg.urgency || '-'}</td>
                      <td className="py-2 px-2">{seg.profitability || '-'}</td>
                      <td className="py-2 px-2">{seg.competitiveIntensity || '-'}</td>
                      <td className="py-2 px-2">{seg.strategicFit || '-'}</td>
                      <td className="py-2 px-2 font-bold">{seg.priority || seg.totalScore || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* 4. Existing Alternatives Comparison */}
          {Array.isArray(currentCanvas?.analysisData?.alternativeSolutions) && currentCanvas.analysisData.alternativeSolutions.length > 0 && (
            <div className="card-angular p-6 bg-[#FAFAF7] mt-4 shadow-sm overflow-x-auto">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-sm font-semibold text-[#0A1628]">Existing Alternatives Comparison</h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded border border-emerald-200 bg-emerald-50 text-emerald-800">VERIFIED</span>
              </div>
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b bg-[#F5F0E8]/70">
                    <th className="py-2 px-2">Name</th>
                    <th className="py-2 px-2">Weakness</th>
                    <th className="py-2 px-2">Our Advantage</th>
                  </tr>
                </thead>
                <tbody>
                  {currentCanvas.analysisData.alternativeSolutions.map((alt: any, i: number) => (
                    <tr key={i} className="border-b hover:bg-[#F5F0E8]/40">
                      <td className="py-2 px-2 font-medium">{alt.name}</td>
                      <td className="py-2 px-2">{alt.weakness}</td>
                      <td className="py-2 px-2 text-emerald-700">{alt.ourAdvantage}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* 5. RAT Matrix Dashboard */}
          {Array.isArray(currentCanvas?.analysisData?.ratMatrix) && currentCanvas.analysisData.ratMatrix.length > 0 && (
            <div className="card-angular p-6 bg-[#FAFAF7] mt-4 shadow-sm">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-sm font-semibold text-[#0A1628]">RAT Matrix Dashboard</h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded border border-amber-200 bg-amber-50 text-amber-800">ASSUMPTION</span>
              </div>
              <ScatterPlot2x2 
                data={currentCanvas.analysisData.ratMatrix.map((r: any) => ({ name: r.assumption, x: r.evidence || r.evidenceScore || 50, y: r.impact || r.impactScore || 50 }))} 
                xLabel="Evidence" 
                yLabel="Impact" 
              />
            </div>
          )}

          {/* 6. Business Model Validation Score */}
          {currentCanvas?.analysisData?.businessModelValidationScore !== undefined && currentCanvas?.analysisData?.bmScoreBreakdown && (
            <div className="card-angular p-6 bg-[#FAFAF7] mt-4 shadow-sm">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-sm font-semibold text-[#0A1628]">Business Model Validation Score</h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded border border-orange-200 bg-orange-50 text-orange-800">AI_ESTIMATE_UNVERIFIED</span>
              </div>
              <div className="flex items-center gap-8">
                <div className="text-5xl font-light text-[#0A1628]">{currentCanvas.analysisData.businessModelValidationScore}<span className="text-lg text-stone-500">/100</span></div>
                <div className="flex-1 grid grid-cols-2 gap-4">
                  {Object.entries(currentCanvas.analysisData.bmScoreBreakdown).map(([key, val]: [string, any], i) => (
                    <div key={i}>
                      <div className="flex justify-between text-xs mb-1 uppercase font-semibold">
                        <span>{key}</span>
                        <span>{val}/100</span>
                      </div>
                      <div className="w-full bg-[#E8E0D0] h-1.5 rounded-full">
                        <div className="bg-[#C8A860] h-1.5 rounded-full" style={{ width: `${val}%` }}></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      ) : selectedIdeaId ? (
        <div className="card-angular p-12 text-center">
          <p className="text-[#1C1C1C] opacity-60 text-sm mb-4">No canvas yet for this idea.</p>
          {isPremium && (
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="px-6 py-2.5 text-sm font-medium text-[#0A1628] cursor-pointer"
              style={{ background: 'linear-gradient(135deg, #D4AF37, #C8A860, #B8963E)', borderRadius: '2px 10px 2px 10px' }}
            >
              {generating ? 'Generating…' : '✦ Generate Canvas with AI'}
            </button>
          )}
        </div>
      ) : (
        <div className="card-angular p-12 text-center">
          <p className="text-[#1C1C1C] opacity-40 text-sm">Select an idea above to get started.</p>
        </div>
      )}

      {/* View Full Analysis Report */}
      {currentCanvas && (
        <div className="mt-6">
          <button
            className="w-full flex items-center justify-between p-4 bg-[#FAFAF7] border border-[#E8E0D0] rounded-lg hover:bg-[#F5F0E8] text-left"
            onClick={async () => {
              if (canvasReport) {
                setCanvasReport(null)
                return
              }
              setReportLoading(true)
              try {
                const res = await fetch(`/api/lean-canvas/report?ideaId=${currentCanvas.id || selectedIdeaId}`)
                if (res.ok) {
                  const data = await res.json()
                  setCanvasReport(data.reportSections || [])
                } else {
                  toast.error('Failed to load report')
                }
              } catch {
                toast.error('Network error loading report')
              } finally {
                setReportLoading(false)
              }
            }}
          >
            <span className="font-semibold text-[#0A1628] flex items-center gap-2">
              <FileText className="w-4 h-4 text-[#C8A860]" />
              View Full Analysis Report
            </span>
            <span className="text-xs text-[#1C1C1C]/60">
              {reportLoading ? 'Loading…' : canvasReport ? '▲ Collapse' : '▼ Expand'}
            </span>
          </button>

          {canvasReport && (
            <div className="mt-2 space-y-3">
              {canvasReport.map((section: any, idx: number) => (
                <div key={idx} className="border border-[#E8E0D0] rounded-lg overflow-hidden">
                  <div className="p-4 bg-white">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-semibold text-sm text-[#0A1628]">{section.title}</h4>
                      <span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded bg-[#C8A860]/15 text-[#96792b]">
                        AI_ESTIMATE_UNVERIFIED
                      </span>
                    </div>
                    {(() => {
                      const content = section.content || ''
                      const trimmed = content.trim()
                      if (trimmed.startsWith('[{') || trimmed.startsWith('["')) {
                        try {
                          const items = JSON.parse(trimmed)
                          if (Array.isArray(items)) {
                            return (
                              <ul className="list-disc pl-5 space-y-1 text-xs text-[#1C1C1C]/80">
                                {items.map((item: any, i: number) => (
                                  <li key={i}>{typeof item === 'object' ? JSON.stringify(item) : String(item)}</li>
                                ))}
                              </ul>
                            )
                          }
                        } catch {}
                      }
                      return (
                        <p className="text-xs text-[#1C1C1C]/80 whitespace-pre-wrap leading-relaxed">{content}</p>
                      )
                    })()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}