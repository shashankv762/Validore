'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

type CanvasBlock = {
  content: string
  confidenceScore: number
  label: string
  keyAssumptions: string[]
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
  validationScore: number | null
  changeReason: string | null
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
    setLoading(true)
    fetch(`/api/lean-canvas?ideaId=${selectedIdeaId}`)
      .then(r => r.json())
      .then(d => {
        setCanvases(d.canvases ?? [])
        setActiveVersion(0)
      })
      .finally(() => setLoading(false))
  }, [selectedIdeaId])

  async function handleGenerate() {
    if (!selectedIdeaId) return
    setGenerating(true)
    const res = await fetch('/api/lean-canvas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ideaId: selectedIdeaId }),
    })
    const data = await res.json()
    if (res.ok) {
      const updated = await fetch(`/api/lean-canvas?ideaId=${selectedIdeaId}`)
      const d = await updated.json()
      setCanvases(d.canvases ?? [])
      setActiveVersion((d.canvases?.length ?? 1) - 1)
    } else {
      alert(data.error ?? 'Generation failed')
    }
    setGenerating(false)
  }

  const currentCanvas = canvases[activeVersion]

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-light text-[#0A1628] mb-1">Lean Canvas</h1>
        <p className="text-sm text-[#1C1C1C] opacity-60">
          {isPremium
            ? 'AI-powered 9-step Lean Canvas automation with confidence scoring.'
            : 'Manual Lean Canvas editor. Upgrade to Premium for AI automation.'}
        </p>
      </div>

      <div className="card-angular p-6 mb-6">
        <label className="block text-xs font-medium text-[#96792b] uppercase tracking-wider mb-2">Select Idea</label>
        <select
          value={selectedIdeaId}
          onChange={e => setSelectedIdeaId(e.target.value)}
          className="w-full px-4 py-2 border border-[#E8E0D0] rounded bg-[#FAFAF7] text-sm focus:outline-none focus:border-[#C8A860]"
        >
          <option value="">— Select an idea —</option>
          {ideas.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
        </select>
      </div>

      {canvases.length > 0 && (
        <div className="flex gap-2 mb-6">
          {canvases.map((c, idx) => (
            <button
              key={c.id}
              onClick={() => setActiveVersion(idx)}
              className={`px-4 py-2 text-sm font-medium transition-all ${activeVersion === idx ? 'text-[#0A1628] border-b-2 border-[#C8A860]' : 'text-[#1C1C1C] opacity-60 hover:opacity-100'}`}
            >
              V{c.version}
            </button>
          ))}
        </div>
      )}

      {selectedIdeaId && (
        <div className="flex gap-3 mb-6">
          {isPremium ? (
            <button
              onClick={handleGenerate}
              disabled={generating || canvases.length >= 4}
              className="px-6 py-2.5 text-sm font-medium text-[#0A1628] disabled:opacity-50 transition-all"
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

      {loading ? (
        <div className="card-angular p-12 text-center">
          <div className="animate-pulse text-[#96792b]">Loading canvas…</div>
        </div>
      ) : currentCanvas ? (
        <div className="grid grid-cols-3 gap-4">
          {BLOCKS.map(({ key, label }) => {
            const block = currentCanvas[key as keyof Canvas] as CanvasBlock | null
            const score = block?.confidenceScore ?? 0
            const color = confidenceColor(score)
            const badge = confidenceBadge(score)
            return (
              <div key={key} className="card-angular p-5" style={{ borderLeft: `3px solid ${color}` }}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-semibold text-[#0A1628] uppercase tracking-wider">{label}</h3>
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: color + '20', color }}>
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
      ) : selectedIdeaId ? (
        <div className="card-angular p-12 text-center">
          <p className="text-[#1C1C1C] opacity-60 text-sm mb-4">No canvas yet for this idea.</p>
          {isPremium && (
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="px-6 py-2.5 text-sm font-medium text-[#0A1628]"
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
    </div>
  )
}