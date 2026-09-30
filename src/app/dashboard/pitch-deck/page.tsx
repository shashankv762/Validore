'use client'
import { useState, useEffect } from 'react'

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
  }
}

type Tab = 'slides' | 'scripts' | 'qa' | 'roadmap'

export default function PitchDeckPage() {
  const [ideas, setIdeas] = useState<Array<{ id: string; name: string }>>([])
  const [hasAccess, setHasAccess] = useState(false)
  const [tier, setTier] = useState('free')
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

  useEffect(() => {
    fetch('/api/ideas').then(r => r.json()).then(d => setIdeas(d.ideas ?? []))
    fetch('/api/me').then(r => r.json()).then(d => {
      const t = d.user?.tier ?? 'free'
      const credits = d.user?.pitchDeckCredits ?? 0
      setTier(t)
      setHasAccess(t === 'max_premium' || credits > 0)
    })
  }, [])

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
      alert('Please fill in all required fields.')
      return
    }
    setLoading(true)
    const res = await fetch('/api/pitch-deck', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const data = await res.json()
    if (res.ok) {
      setResult(data)
    } else {
      alert(data.error ?? 'Deck generation failed. Please try again.')
    }
    setLoading(false)
  }

  // ── Lock screen ──────────────────────────────────────────────────────────────
  if (!hasAccess) {
    return (
      <div className="max-w-2xl mx-auto mt-20">
        <div className="card-angular p-10 text-center">
          <span className="text-4xl block mb-4">🔒</span>
          <h2 className="text-xl font-light text-[#0A1628] mb-2">Pitch Deck Builder</h2>
          <p className="text-sm text-[#1C1C1C] opacity-60 mb-8">
            12-slide investor deck, 3-min pitch script, 20 investor Q&As, quality score /100, and PPTX export.
          </p>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="card-angular p-5">
              <p className="text-lg font-light text-[#96792b] mb-1">$79<span className="text-sm opacity-60">/mo</span></p>
              <p className="text-sm font-medium text-[#0A1628] mb-3">Max Premium</p>
              <p className="text-xs text-[#1C1C1C] opacity-60 mb-4">Unlimited deck generations + PPTX + white-label exports</p>
              <a
                href="/auth/signup?plan=max"
                className="block text-center py-2 text-xs font-medium text-[#0A1628]"
                style={{ background: 'linear-gradient(135deg, #D4AF37, #C8A860, #B8963E)', borderRadius: '2px 8px 2px 8px' }}
              >
                Upgrade to Max Premium
              </a>
            </div>
            <div className="card-angular p-5">
              <p className="text-lg font-light text-[#96792b] mb-1">$49<span className="text-sm opacity-60"> one-time</span></p>
              <p className="text-sm font-medium text-[#0A1628] mb-3">Pitch Deck Pack</p>
              <p className="text-xs text-[#1C1C1C] opacity-60 mb-4">1 full deck generation — no subscription needed</p>
              <a
                href="/dashboard/credits"
                className="block text-center py-2 text-xs font-medium text-[#1C1C1C] border border-[#E8E0D0] hover:border-[#C8A860]"
                style={{ borderRadius: '2px 8px 2px 8px' }}
              >
                Buy Pack ($49)
              </a>
            </div>
          </div>
          {tier === 'premium' && (
            <p className="text-xs text-[#1C1C1C] opacity-40">
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
          <h1 className="text-2xl font-light text-[#0A1628] mb-1">Pitch Deck Builder</h1>
          <p className="text-sm text-[#1C1C1C] opacity-60">
            AI generates a 12-slide investor deck. Milestones are clearly labeled{' '}
            <span className="font-medium">PLANNED ◻️</span> or <span className="font-medium">ACHIEVED ✅</span>.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="card-angular p-8 space-y-5">
          {/* Idea selector */}
          <div>
            <label className="block text-xs font-medium text-[#96792b] uppercase tracking-wider mb-1">Select Idea *</label>
            <select
              value={form.ideaId}
              onChange={e => setForm(f => ({ ...f, ideaId: e.target.value }))}
              required
              className="w-full px-3 py-2 border border-[#E8E0D0] rounded bg-[#FAFAF7] text-sm focus:border-[#C8A860] focus:outline-none"
            >
              <option value="">— Select an idea —</option>
              {ideas.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#96792b] uppercase tracking-wider mb-1">Founder Name *</label>
              <input
                value={form.founderName}
                onChange={e => setForm(f => ({ ...f, founderName: e.target.value }))}
                required placeholder="Your full name"
                className="w-full px-3 py-2 border border-[#E8E0D0] rounded bg-[#FAFAF7] text-sm focus:border-[#C8A860] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#96792b] uppercase tracking-wider mb-1">Team Size</label>
              <input
                type="number" min={1} value={form.teamSize}
                onChange={e => setForm(f => ({ ...f, teamSize: Number(e.target.value) }))}
                className="w-full px-3 py-2 border border-[#E8E0D0] rounded bg-[#FAFAF7] text-sm focus:border-[#C8A860] focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#96792b] uppercase tracking-wider mb-1">Founder Background *</label>
            <textarea
              value={form.founderBackground}
              onChange={e => setForm(f => ({ ...f, founderBackground: e.target.value }))}
              required rows={3}
              placeholder="Relevant experience, skills, domain expertise, why you're the right person to build this…"
              className="w-full px-3 py-2 border border-[#E8E0D0] rounded bg-[#FAFAF7] text-sm focus:border-[#C8A860] focus:outline-none resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#96792b] uppercase tracking-wider mb-1">Funding Ask (optional)</label>
              <input
                value={form.fundingAskAmount}
                onChange={e => setForm(f => ({ ...f, fundingAskAmount: e.target.value }))}
                placeholder="e.g. $500,000 or ₹4 crore"
                className="w-full px-3 py-2 border border-[#E8E0D0] rounded bg-[#FAFAF7] text-sm focus:border-[#C8A860] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#96792b] uppercase tracking-wider mb-1">Current Traction (optional)</label>
              <input
                value={form.currentTraction}
                onChange={e => setForm(f => ({ ...f, currentTraction: e.target.value }))}
                placeholder="e.g. 50 beta signups, 3 LOIs, ₹2L pre-orders"
                className="w-full px-3 py-2 border border-[#E8E0D0] rounded bg-[#FAFAF7] text-sm focus:border-[#C8A860] focus:outline-none"
              />
            </div>
          </div>

          {/* Milestones */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-[#96792b] uppercase tracking-wider">
                Milestones (optional)
              </label>
              <button type="button" onClick={addMilestone} className="text-xs text-[#96792b] hover:underline">
                + Add milestone
              </button>
            </div>
            {form.milestones.length === 0 && (
              <p className="text-xs text-[#1C1C1C] opacity-40">
                Add milestones to include them in Slide 11. Each will be labeled PLANNED ◻️ or ACHIEVED ✅.
              </p>
            )}
            {form.milestones.map((m, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 mb-2">
                <input
                  value={m.milestone}
                  onChange={e => updateMilestone(i, 'milestone', e.target.value)}
                  placeholder="Milestone description"
                  className="col-span-5 px-3 py-2 border border-[#E8E0D0] rounded bg-[#FAFAF7] text-xs focus:border-[#C8A860] focus:outline-none"
                />
                <input
                  value={m.targetDate}
                  onChange={e => updateMilestone(i, 'targetDate', e.target.value)}
                  placeholder="Target (e.g. Q1 2026)"
                  className="col-span-3 px-3 py-2 border border-[#E8E0D0] rounded bg-[#FAFAF7] text-xs focus:border-[#C8A860] focus:outline-none"
                />
                <select
                  value={m.status}
                  onChange={e => updateMilestone(i, 'status', e.target.value)}
                  className="col-span-3 px-2 py-2 border border-[#E8E0D0] rounded bg-[#FAFAF7] text-xs focus:border-[#C8A860] focus:outline-none"
                >
                  <option value="PLANNED">◻️ PLANNED</option>
                  <option value="ACHIEVED">✅ ACHIEVED</option>
                </select>
                <button
                  type="button" onClick={() => removeMilestone(i)}
                  className="col-span-1 text-xs text-[#1C1C1C] opacity-40 hover:opacity-80"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 text-sm font-medium text-[#0A1628] disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #D4AF37, #C8A860, #B8963E)', borderRadius: '2px 12px 2px 12px' }}
          >
            {loading
              ? '⏳ Building Deck — this can take 60–120 seconds…'
              : '✦ Generate Pitch Deck with AI'}
          </button>
        </form>
      </div>
    )
  }

  // ── Results view ─────────────────────────────────────────────────────────────
  const TABS: { key: Tab; label: string }[] = [
    { key: 'slides', label: '12 Slides' },
    { key: 'scripts', label: 'Pitch Scripts' },
    { key: 'qa', label: 'Investor Q&A' },
    { key: 'roadmap', label: 'Roadmap' },
  ]

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-8 flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-light text-[#0A1628] mb-1">Your Pitch Deck</h1>
          <p className="text-xs text-amber-600">
            All financial projections = PROJECTION. Milestones show exact PLANNED/ACHIEVED status as entered.
          </p>
        </div>
        <div className="flex gap-3 flex-wrap">
          <a
            href={`/api/export/pdf?reportId=${result.deckId}`}
            className="px-4 py-2 text-xs font-medium text-[#1C1C1C] border border-[#E8E0D0] hover:border-[#C8A860] transition-colors"
            style={{ borderRadius: '2px 8px 2px 8px' }}
          >
            ⬇ Branded PDF
          </a>
          {tier === 'max_premium' && (
            <>
              <a
                href={`/api/export/pptx?deckId=${result.deckId}`}
                className="px-4 py-2 text-xs font-medium text-[#0A1628]"
                style={{ background: 'linear-gradient(135deg, #D4AF37, #C8A860, #B8963E)', borderRadius: '2px 8px 2px 8px' }}
              >
                ⬇ PPTX
              </a>
              <a
                href={`/api/export/pdf/white-label?reportId=${result.deckId}`}
                className="px-4 py-2 text-xs font-medium text-[#1C1C1C] border border-[#E8E0D0] hover:border-[#C8A860] transition-colors"
                style={{ borderRadius: '2px 8px 2px 8px' }}
              >
                ⬇ White-Label PDF
              </a>
            </>
          )}
          <button onClick={() => setResult(null)} className="text-xs text-[#96792b] hover:underline">
            ← New deck
          </button>
        </div>
      </div>

      {/* Score cards */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="card-angular p-6 text-center">
          <div className="text-4xl font-light text-[#96792b] mb-1">{result.qualityScore}/100</div>
          <div className="text-sm text-[#0A1628]">Pitch Deck Quality Score</div>
          <div className="mt-1 flex justify-center">
            <div className="h-2 w-48 rounded-full bg-[#E8E0D0]">
              <div
                className="h-2 rounded-full"
                style={{ width: `${result.qualityScore}%`, background: 'linear-gradient(135deg, #D4AF37, #C8A860)' }}
              />
            </div>
          </div>
        </div>
        <div className="card-angular p-6 text-center">
          <div className="text-4xl font-light text-[#96792b] mb-1">{result.founderReadinessScore}/100</div>
          <div className="text-sm text-[#0A1628]">Founder Readiness Score</div>
          <div className="text-xs opacity-50 mt-1">Developmental self-assessment — not a personality diagnosis</div>
        </div>
      </div>

      {/* Integrity note */}
      <div className="card-angular p-4 border-l-4 border-[#C8A860] mb-6">
        <p className="text-xs font-semibold text-[#96792b] mb-1">Integrity Note</p>
        <p className="text-xs text-[#1C1C1C] leading-relaxed">{result.result.integrityNote}</p>
      </div>

      {/* Tab nav */}
      <div className="flex gap-1 mb-6 border-b border-[#E8E0D0]">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-5 py-2.5 text-sm font-medium transition-all ${
              activeTab === tab.key
                ? 'text-[#96792b] border-b-2 border-[#C8A860]'
                : 'text-[#1C1C1C] opacity-60 hover:opacity-100'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Slides */}
      {activeTab === 'slides' && (
        <div className="grid grid-cols-3 gap-4">
          {result.result.slides.map(slide => (
            <div key={slide.slideNumber} style={{ borderRadius: '2px 12px 2px 12px', overflow: 'hidden' }}>
              <div className="bg-[#0A1628] p-4">
                <div className="text-xs text-[#96792b] mb-1 font-medium">Slide {slide.slideNumber}</div>
                <div className="text-sm font-medium text-[#F5F0E8] mb-2 leading-tight">{slide.title}</div>
                <div className="text-xs text-[#F5F0E8] opacity-70 leading-relaxed line-clamp-4">
                  {slide.content}
                </div>
                {slide.dataLabel && (
                  <div className="mt-2 text-xs text-amber-400 font-medium">{slide.dataLabel}</div>
                )}
              </div>
              <div className="bg-[#FAFAF7] p-3 border border-[#E8E0D0] border-t-0">
                <p className="text-xs text-[#1C1C1C] opacity-60 font-medium mb-1">Key Points</p>
                <ul className="space-y-0.5">
                  {slide.keyPoints.slice(0, 3).map((p, i) => (
                    <li key={i} className="text-xs text-[#1C1C1C] opacity-70 flex gap-1.5">
                      <span className="text-[#96792b] flex-shrink-0">•</span>{p}
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
          <div className="card-angular p-6">
            <h3 className="text-sm font-semibold text-[#0A1628] mb-1">
              3-Minute Pitch Script{' '}
              <span className="text-xs text-amber-600 font-normal">PROPOSED_STRATEGY</span>
            </h3>
            <p className="text-xs text-[#1C1C1C] opacity-40 mb-4">Customise with your own voice before presenting.</p>
            <pre className="text-sm text-[#1C1C1C] whitespace-pre-wrap leading-relaxed font-sans">
              {result.result.pitchScript3min}
            </pre>
          </div>
          <div className="card-angular p-6">
            <h3 className="text-sm font-semibold text-[#0A1628] mb-1">
              60-Second Elevator Pitch{' '}
              <span className="text-xs text-amber-600 font-normal">PROPOSED_STRATEGY</span>
            </h3>
            <pre className="text-sm text-[#1C1C1C] whitespace-pre-wrap leading-relaxed font-sans">
              {result.result.pitchScript60sec}
            </pre>
          </div>
        </div>
      )}

      {/* Investor Q&A */}
      {activeTab === 'qa' && (
        <div className="space-y-2">
          {result.result.investorQa.map((qa, i) => (
            <div key={i} className="card-angular overflow-hidden">
              <button
                className="w-full p-4 text-left flex justify-between items-start gap-4"
                onClick={() => setOpenQa(openQa === i ? null : i)}
              >
                <span className="text-sm font-medium text-[#0A1628]">
                  {i + 1}. {qa.question}
                </span>
                <span className="text-[#96792b] flex-shrink-0 text-xs mt-0.5">
                  {openQa === i ? '▲' : '▼'}
                </span>
              </button>
              {openQa === i && (
                <div className="px-4 pb-4 border-t border-[#E8E0D0]">
                  <p className="text-sm text-[#1C1C1C] leading-relaxed mt-3">{qa.answer}</p>
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
            <div key={i} className="card-angular p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-2.5 h-2.5 rounded-full bg-[#C8A860] flex-shrink-0" />
                <div>
                  <div className="text-sm font-semibold text-[#0A1628]">{phase.phase}</div>
                  <div className="text-xs text-[#96792b]">{phase.timeframe}</div>
                </div>
              </div>
              <ul className="space-y-2 ml-5">
                {phase.milestones.map((m, j) => (
                  <li key={j} className="flex items-start gap-2 text-sm">
                    <span className="flex-shrink-0 mt-0.5">
                      {m.status === 'ACHIEVED' ? '✅' : '◻️'}
                    </span>
                    <span className={m.status === 'ACHIEVED' ? 'text-[#1C1C1C]' : 'text-[#1C1C1C] opacity-70'}>
                      {m.milestone}
                    </span>
                    <span className="ml-auto text-xs text-[#96792b] flex-shrink-0">{m.targetDate}</span>
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
    </div>
  )
}