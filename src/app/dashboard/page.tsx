'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { ArrowLeft, ArrowRight, Check, Loader2, Network, Search, Calculator, ShieldCheck, FileText, Clock3 } from 'lucide-react'
import { toast } from 'sonner'
import { IdeaInputSchema, type IdeaDraft } from '@/lib/idea-input'
import { CREDIT_COSTS } from '@/lib/credit-costs'
import { totalCredits } from '@/lib/credit-allocation'
import { FULL_AGENT_COUNT, LITE_AGENT_COUNT } from '@/lib/ai/roles'
import { useAccount, notifyAccountUpdated } from '@/components/AccountProvider'
import { ValidationProgress } from '@/components/ValidationProgress'

const FounderInterview = dynamic(() => import('@/components/FounderInterview').then(module => module.FounderInterview), {
  loading: () => <p role="status" className="p-6 text-sm text-[#53616A]">Loading your founder interview…</p>,
})

const FIELDS: { key: keyof IdeaDraft; label: string; hint: string; placeholder: string; multiline?: boolean; max: number }[] = [
  { key: 'name', label: 'Startup name', hint: 'A working title is enough. You can refine it later.', placeholder: 'e.g. Validore', max: 100 },
  { key: 'industry', label: 'Industry', hint: 'Which industry best describes your startup?', placeholder: 'e.g. SaaS, FinTech, E-commerce', max: 200 },
  { key: 'product', label: 'Product or service', hint: 'Describe what you are building and how someone will use it.', placeholder: 'We are building a platform that…', multiline: true, max: 4000 },
  { key: 'targetCustomer', label: 'Target customer', hint: 'Be specific about who needs this and who will pay.', placeholder: 'e.g. Sales teams at small B2B companies', max: 2000 },
  { key: 'location', label: 'Launch market', hint: 'Where will you reach your first customers?', placeholder: 'e.g. India, United States, Global', max: 200 },
  { key: 'businessModel', label: 'Business model', hint: 'Describe how your startup will earn revenue.', placeholder: 'e.g. B2B subscriptions at $99 per month', max: 2000 },
  { key: 'coreProblem', label: 'Core problem', hint: 'What is difficult, expensive or frustrating for your customer today?', placeholder: 'Our customers struggle with…', multiline: true, max: 4000 },
  { key: 'proposedSolution', label: 'Proposed solution', hint: 'How will your approach solve that problem?', placeholder: 'We will help them by…', multiline: true, max: 4000 },
]
const GROUPS: { title: string; description: string; fields: (keyof IdeaDraft)[] }[] = [
  { title: 'The basics', description: 'Start with a name, a market, and where you want to launch.', fields: ['name', 'industry', 'location'] },
  { title: 'Your customer', description: 'The best research starts with a specific person and a real problem.', fields: ['targetCustomer', 'coreProblem'] },
  { title: 'Your solution', description: 'Describe what you will build and how the business could work.', fields: ['product', 'proposedSolution', 'businessModel'] },
  { title: 'Founder clarity', description: 'Go a little deeper with questions tailored to your answers, or continue straight to your review.', fields: [] },
  { title: 'Review & start', description: 'Give the research team a clear brief. You can edit any detail below.', fields: [] },
]
const EMPTY: IdeaDraft = { name: '', industry: '', product: '', targetCustomer: '', location: '', businessModel: '', coreProblem: '', proposedSolution: '' }
const errorText = (data: { error?: unknown }, fallback: string) => typeof data.error === 'string' ? data.error : fallback
const delay = (ms: number, signal: AbortSignal) => new Promise<void>((resolve, reject) => {
  if (signal.aborted) { reject(signal.reason); return }
  const aborted = () => { clearTimeout(timer); reject(signal.reason) }
  const timer = setTimeout(() => { signal.removeEventListener('abort', aborted); resolve() }, ms)
  signal.addEventListener('abort', aborted, { once: true })
})

export default function IdeaWizard() {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [draft, setDraft] = useState<IdeaDraft>(EMPTY)
  const [website, setWebsite] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingMsg, setLoadingMsg] = useState('Saving your idea')
  const [progress, setProgress] = useState(0)
  const { data: accountData, error: accountError, refresh } = useAccount()
  const account = accountData?.user
  const [errorField, setErrorField] = useState<string>('')
  const [savedIdeaId, setSavedIdeaId] = useState<string | null>(null)
  const [savingBrief, setSavingBrief] = useState(false)
  const advancing = useRef(false)
  const [interviewBusy, setInterviewBusy] = useState(false)
  const touched = useRef(false)
  const active = useRef(false)
  const request = useRef<AbortController | null>(null)
  const saved = useRef<{ id: string; fingerprint: string } | null>(null)
  useEffect(() => () => request.current?.abort(), [])
  useEffect(() => {
    let active = true
    void refresh().then(data => {
      if (!active || !data?.user) return
      try {
        const stored = JSON.parse(sessionStorage.getItem('validore:brief:' + data.user.id) || 'null')
        if (stored?.draft && !touched.current) {
          const restored = Object.fromEntries(FIELDS.map(field => [field.key, typeof stored.draft[field.key] === 'string' ? stored.draft[field.key].slice(0, field.max) : ''])) as IdeaDraft
          setDraft(restored)
          setStep(Number.isInteger(stored.step) ? Math.max(0, Math.min(stored.ideaId ? 4 : 2, stored.step)) : 0)
          if (typeof stored.ideaId === 'string') { saved.current = { id: stored.ideaId, fingerprint: '' }; setSavedIdeaId(stored.ideaId) }
        }
      } catch { /* The form still works when browser storage is unavailable. */ }
    })
    return () => { active = false }
  }, [refresh])
  useEffect(() => {
    if (!account) return
    try { sessionStorage.setItem('validore:brief:' + account.id, JSON.stringify({ draft, step, ideaId: saved.current?.id })) } catch {}
  }, [draft, step, account])
  const group = GROUPS[step] ?? GROUPS[0]
  const fields = group.fields.map(key => FIELDS.find(field => field.key === key)!)
  const cost = account?.tier === 'free' ? CREDIT_COSTS.LITE_VALIDATION : CREDIT_COSTS.DEEP_VALIDATION
  const saveBrief = async (signal?: AbortSignal) => {
    const parsed = IdeaInputSchema.safeParse(draft)
    if (!parsed.success) throw new Error('Please complete the idea brief before continuing.')
    const fingerprint = JSON.stringify(parsed.data)
    if (!saved.current || saved.current.fingerprint !== fingerprint) {
      const res = await fetch('/api/ideas', { method: saved.current ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...parsed.data, website, ...(saved.current ? { ideaId: saved.current.id } : {}) }),
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20_000)]) : AbortSignal.timeout(20_000) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.idea?.id) throw new Error(errorText(data, 'Your idea could not be saved. Please try again.'))
      saved.current = { id: data.idea.id, fingerprint }
      setSavedIdeaId(data.idea.id)
      if (account) { try { sessionStorage.setItem('validore:brief:' + account.id, JSON.stringify({ draft, step, ideaId: data.idea.id })) } catch {} }
    }
    return saved.current.id
  }
  const next = async () => {
    if (advancing.current || savingBrief || interviewBusy) return
    for (const field of fields) {
      const result = IdeaInputSchema.shape[field.key].safeParse(draft[field.key])
      if (!result.success) { setError(result.error.issues[0].message); setErrorField(field.key); document.getElementById(field.key)?.focus(); return }
    }
    setError('')
    setErrorField('')
    if (step === 2) {
      advancing.current = true
      setSavingBrief(true)
      try { await saveBrief() }
      catch (error) { setError(error instanceof Error ? error.message : 'Your brief could not be saved.'); return }
      finally { advancing.current = false; setSavingBrief(false) }
    }
    setStep(value => Math.min(4, value + 1))
  }
  const handleSubmit = async () => {
    if (active.current) return
    const parsed = IdeaInputSchema.safeParse(draft)
    if (!parsed.success) {
      const first = parsed.error.issues[0]
      setStep(Math.max(0, GROUPS.findIndex(item => item.fields.includes(first.path[0] as keyof IdeaDraft))))
      setError(first.message)
      setErrorField(String(first.path[0]))
      return
    }
    active.current = true
    const controller = new AbortController()
    request.current = controller
    let navigating = false
    setError(''); setLoading(true); setProgress(0); setLoadingMsg('Saving your idea')
    const fetchJson = async (url: string, init?: RequestInit) => {
      const res = await fetch(url, { ...init, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]) })
      return { res, data: await res.json().catch(() => ({})) }
    }
    try {
      const ideaId = await saveBrief(controller.signal)
      setLoadingMsg('Starting your validation')
      const { res, data } = await fetchJson('/api/validate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ideaId }) })
      if (!res.ok || !data.jobId) throw new Error(errorText(data, 'Validation could not start. Your idea is saved; try again.'))
      notifyAccountUpdated()
      const pollingDeadline = AbortSignal.timeout(10 * 60 * 1000)
      let networkFailures = 0
      while (!pollingDeadline.aborted) {
        await delay(2000, controller.signal)
        let status
        try { status = await fetchJson('/api/reports/status?jobId=' + encodeURIComponent(data.jobId)) }
        catch (pollError) {
          if (controller.signal.aborted) throw pollError
          if (++networkFailures >= 5) throw new Error('We lost the connection to your analysis. Your work continues; check Your reports shortly.')
          continue
        }
        if (status.res.status === 401) throw new Error('Your session ended. Sign in again to view your report.')
        if (!status.res.ok) throw new Error(errorText(status.data, 'Progress could not be loaded. Check Your reports shortly.'))
        networkFailures = 0
        const job = status.data
        setProgress(typeof job.progress === 'number' && Number.isFinite(job.progress) ? Math.max(0, Math.min(100, job.progress)) : 0)
        setLoadingMsg(job.status === 'pending' ? 'Your analysis is queued' : job.reportId ? 'Your report is ready' : job.completedSections > 0 ? 'Analysing: ' + job.completedSections + ' of ' + job.totalSections + ' sections complete' : 'Researching your startup idea')
        if (job.reportId) {
          notifyAccountUpdated()
          navigating = true
          if (account) { try { sessionStorage.removeItem('validore:brief:' + account.id) } catch {} }
          toast.success('Your analysis is ready')
          router.push('/dashboard/report/' + job.reportId)
          return
        }
        if (job.status === 'failed') throw new Error(errorText({ error: job.errorMessage }, 'Analysis could not complete. Please try again.'))
      }
      throw new Error('Your analysis is taking longer than expected. It continues in the background; check Your reports shortly.')
    } catch (err) {
      if (!controller.signal.aborted) {
        const message = err instanceof Error ? err.message : 'The request could not complete. Please try again.'
        setError(message)
        toast.error(message)
      }
    } finally {
      notifyAccountUpdated()
      active.current = false
      if (!controller.signal.aborted && !navigating) setLoading(false)
    }
  }
  return <div className="idea-workspace">
    <div className="workspace-page-heading">
      <div><h1>What are you building?</h1><p>A little context now. A clearer view of your market, your assumptions, and your next move.</p></div>
      <Link href="/dashboard/reports" className="workspace-text-link"><FileText size={15} aria-hidden="true" />Your reports<ArrowRight size={14} aria-hidden="true" /></Link>
    </div>
    <div className="idea-workspace-grid">
      <div className="idea-brief">
        {!loading && <nav className="brief-steps" aria-label="Idea brief steps">{GROUPS.map((item, index) =>
          <button key={item.title} type="button" disabled={index > step || savingBrief || interviewBusy} aria-current={index === step ? 'step' : undefined}
            onClick={() => { setStep(index); setError(''); setErrorField('') }} className={index === step ? 'is-current' : index < step ? 'is-complete' : ''}>
            <span aria-hidden="true">{index < step ? <Check size={12} /> : index + 1}</span><span>{item.title}</span>
          </button>)}</nav>}
        {loading ? <ValidationProgress progress={progress} message={loadingMsg} /> : <form noValidate className="brief-panel" onSubmit={event => { event.preventDefault(); if (step < 4) void next(); else void handleSubmit() }}>
          <div className="brief-panel-heading"><span>Step {step + 1} of 5</span><h2>{group.title}</h2><p>{group.description}</p></div>
          {step < 3 ? <div className="brief-fields">{fields.map(field => <div className="brief-field" key={field.key}>
            <label htmlFor={field.key}>{field.label}</label>
            {field.multiline ? <textarea id={field.key} name={field.key} rows={4} maxLength={field.max} placeholder={field.placeholder} value={draft[field.key]}
              onChange={event => { touched.current = true; setDraft(value => ({ ...value, [field.key]: event.target.value })); setError(''); setErrorField('') }}
              aria-invalid={errorField === field.key} aria-describedby={field.key + '-hint' + (errorField === field.key ? ' wizard-error' : '')} /> :
              <input id={field.key} name={field.key} maxLength={field.max} placeholder={field.placeholder} value={draft[field.key]}
                onChange={event => { touched.current = true; setDraft(value => ({ ...value, [field.key]: event.target.value })); setError(''); setErrorField('') }}
                aria-invalid={errorField === field.key} aria-describedby={field.key + '-hint' + (errorField === field.key ? ' wizard-error' : '')} />}
            <div className="brief-field-help"><p id={field.key + '-hint'}>{field.hint}</p>{field.multiline && <span>{draft[field.key].length.toLocaleString()} / {field.max.toLocaleString()}</span>}</div>
          </div>)}</div> : step === 3 ? savedIdeaId && <FounderInterview key={savedIdeaId + JSON.stringify(draft)} ideaId={savedIdeaId} onBusyChange={setInterviewBusy} /> : <div>
            <dl className="brief-review">{FIELDS.map(item => <div key={item.key}>
              <div><dt>{item.label}</dt><button type="button" onClick={() => { setStep(GROUPS.findIndex(group => group.fields.includes(item.key))); setError('') }} aria-label={'Edit ' + item.label.toLowerCase()}>Edit</button></div>
              <dd>{draft[item.key]}</dd>
            </div>)}</dl>
            <div className="brief-cost"><div><strong>{account?.tier === 'free' ? 'Lite validation' : 'Full validation'}</strong><span>{account ? (account.tier === 'free' ? LITE_AGENT_COUNT : FULL_AGENT_COUNT) + ' specialists · PDF and Word included' : 'Loading plan details…'}</span></div><strong>{account ? cost + ' credits' : '?'}</strong></div>
            {account && cost > totalCredits(account) && <p className="brief-balance-warning">You have {totalCredits(account)} credits. <Link href="/dashboard/credits">View your credit options</Link> before starting.</p>}
            <p className="brief-privacy">Your idea and any saved founder answers are processed by configured AI providers to prepare the report. See our <Link href="/legal/privacy">Privacy Policy</Link>. Credits are returned if the analysis fails without a report.</p>
          </div>}
          <input name="website" aria-hidden="true" hidden tabIndex={-1} autoComplete="off" value={website} onChange={event => setWebsite(event.target.value)} />
          {error && <div id="wizard-error" role="alert" className="brief-error">{error}</div>}
          {accountError && <p className="brief-error" role="status">Your account details could not load. Refresh the page before starting an analysis; your brief stays in this tab.</p>}
          <div className="brief-actions">
            <button type="button" disabled={step === 0 || savingBrief || interviewBusy} onClick={() => { setStep(value => Math.max(0, value - 1)); setError(''); setErrorField('') }} className="workspace-button-secondary"><ArrowLeft size={15} aria-hidden="true" />Back</button>
            <button type="submit" disabled={loading || savingBrief || interviewBusy || (step === 2 && !account) || (step === 4 && (!account || cost > totalCredits(account)))} className="workspace-button-primary">
              {savingBrief ? <><Loader2 size={15} className="animate-spin" aria-hidden="true" />Saving brief…</> : step < 4 ? <>{step === 3 ? 'Continue to review' : 'Continue'}<ArrowRight size={15} aria-hidden="true" /></> : <>Start validation<ArrowRight size={15} aria-hidden="true" /></>}
            </button>
          </div>
          <p className="brief-save-note"><Clock3 size={12} aria-hidden="true" />Your draft stays in this browser tab.</p>
        </form>}
      </div>
      <aside className="wizard-guide">
        <div className="wizard-guide-symbol"><Network size={23} aria-hidden="true" /></div>
        <h2>A team for your next move.</h2>
        <p>Specialists work together to turn your brief into questions worth answering and a plan you can test.</p>
        <ol className="wizard-guide-steps">
          <li><Search size={17} aria-hidden="true" /><div><strong>Find the evidence</strong><span>Explore your market, customers, and alternatives.</span></div></li>
          <li><Calculator size={17} aria-hidden="true" /><div><strong>Check the assumptions</strong><span>Separate source-backed findings from estimates.</span></div></li>
          <li><ShieldCheck size={17} aria-hidden="true" /><div><strong>Make a practical plan</strong><span>See the risks and the next experiments to run.</span></div></li>
        </ol>
        <Link href="/dashboard/agents" className="workspace-text-link">Meet the research team<ArrowRight size={14} aria-hidden="true" /></Link>
        <div className="wizard-deliverable"><FileText size={18} aria-hidden="true" /><div><strong>Keep the whole report.</strong><span>Download a PDF or an editable Word document with your findings and sources.</span></div></div>
        <Link href="/demo" className="workspace-text-link">Take a look at a sample<ArrowRight size={14} aria-hidden="true" /></Link>
      </aside>
    </div>
  </div>
}
