'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ArrowRight, Check, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { IdeaInputSchema, type IdeaDraft } from '@/lib/idea-input'

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
  const active = useRef(false)
  const request = useRef<AbortController | null>(null)
  const saved = useRef<{ id: string; fingerprint: string } | null>(null)
  useEffect(() => () => request.current?.abort(), [])
  const field = FIELDS[step]
  const next = () => {
    const result = IdeaInputSchema.shape[field.key].safeParse(draft[field.key])
    if (!result.success) { setError(result.error.issues[0].message); document.getElementById(field.key)?.focus(); return }
    setError('')
    setStep(value => Math.min(FIELDS.length, value + 1))
  }
  const submit = async () => {
    if (active.current) return
    const parsed = IdeaInputSchema.safeParse(draft)
    if (!parsed.success) {
      const first = parsed.error.issues[0]
      setStep(Math.max(0, FIELDS.findIndex(item => item.key === first.path[0])))
      setError(first.message)
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
      const fingerprint = JSON.stringify(parsed.data)
      if (!saved.current || saved.current.fingerprint !== fingerprint) {
        const { res, data } = await fetchJson('/api/ideas', { method: saved.current ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...parsed.data, website, ...(saved.current ? { ideaId: saved.current.id } : {}) }) })
        if (!res.ok || !data.idea?.id) throw new Error(errorText(data, 'Your idea could not be saved. Try again.'))
        saved.current = { id: data.idea.id, fingerprint }
      }
      setLoadingMsg('Starting your validation')
      const { res, data } = await fetchJson('/api/validate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ideaId: saved.current.id }) })
      if (!res.ok || !data.jobId) throw new Error(errorText(data, 'Validation could not start. Your idea is saved; try again.'))
      const deadline = Date.now() + 10 * 60 * 1000
      let networkFailures = 0
      while (Date.now() < deadline) {
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
          navigating = true
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
      active.current = false
      if (!controller.signal.aborted && !navigating) setLoading(false)
    }
  }
  return <div className="mx-auto max-w-3xl">
    <div className="mb-8">
      <h1 className="text-3xl font-light tracking-tight text-[#0A1628] sm:text-4xl">Validate your startup idea</h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[#1C1C1C]/75">Build a clear picture of your market, customers and next steps. Start with what you know; your report will label assumptions.</p>
    </div>
    <div className="mb-6 flex items-center justify-between gap-4 text-sm">
      <span className="text-[#1C1C1C]/75">Step {step + 1} of 9</span><span className="font-medium text-[#0A1628]">{field?.label || 'Review your idea'}</span>
    </div>
    <div className="mb-8 flex gap-2" role="progressbar" aria-label="Idea details" aria-valuemin={1} aria-valuemax={9} aria-valuenow={step + 1}>
      {Array.from({ length: 9 }, (_, index) => <span key={index} className={'h-1.5 flex-1 rounded-full ' + (index < step ? 'bg-[#C8A860]' : index === step ? 'bg-[#0A1628]' : 'bg-[#E8E0D0]')} />)}
    </div>
    {loading ? <section className="card-angular px-6 py-12 sm:p-12" aria-busy="true" aria-label="Validation progress">
      <div className="flex items-center gap-3"><Loader2 className="h-6 w-6 animate-spin text-[#B8963E]" aria-hidden="true" /><h2 className="text-xl font-light text-[#0A1628]">Preparing your report</h2></div>
      <p role="status" aria-live="polite" className="mt-4 text-sm text-[#1C1C1C]/80">{loadingMsg}</p>
      <div className="mt-6 h-2 overflow-hidden rounded-full bg-[#E8E0D0]" role="progressbar" aria-label="Analysis completion" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
        <div className="h-full rounded-full bg-[#C8A860] transition-[width]" style={{ width: progress + '%' }} />
      </div>
      <p className="mt-6 text-sm leading-relaxed text-[#1C1C1C]/75">You can leave this page while the analysis runs. Your report will be saved to your workspace.</p>
      <Link href="/dashboard/reports" className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-[#0A1628] underline underline-offset-4">View your reports<ArrowRight size={16} aria-hidden="true" /></Link>
    </section> : <form noValidate className="card-angular p-6 sm:p-9" onSubmit={event => { event.preventDefault(); if (field) next(); else void submit() }}>
      {field ? <div key={field.key} className="animate-step-in">
        <label htmlFor={field.key} className="block text-xl font-medium text-[#0A1628]">{field.label}</label>
        <p id={field.key + '-hint'} className="mb-5 mt-2 text-sm text-[#1C1C1C]/75">{field.hint}</p>
        {field.multiline ? <textarea id={field.key} autoFocus maxLength={field.max} placeholder={field.placeholder} value={draft[field.key]}
          onChange={event => { setDraft(value => ({ ...value, [field.key]: event.target.value })); setError('') }}
          aria-invalid={!!error} aria-describedby={field.key + '-hint' + (error ? ' wizard-error' : '')}
          className="min-h-40 w-full resize-y rounded-lg border border-[#E8E0D0] bg-white px-4 py-3 text-[#1C1C1C]" /> :
          <input id={field.key} autoFocus maxLength={field.max} placeholder={field.placeholder} value={draft[field.key]}
            onChange={event => { setDraft(value => ({ ...value, [field.key]: event.target.value })); setError('') }}
            aria-invalid={!!error} aria-describedby={field.key + '-hint' + (error ? ' wizard-error' : '')}
            className="w-full rounded-lg border border-[#E8E0D0] bg-white px-4 py-3 text-[#1C1C1C]" />}
      </div> : <div>
        <h2 className="text-xl font-medium text-[#0A1628]">Your idea at a glance</h2>
        <p className="mt-2 text-sm text-[#1C1C1C]/75">Check your details before starting the analysis.</p>
        <dl className="mt-6 divide-y divide-[#E8E0D0]">{FIELDS.map((item, index) => <div key={item.key} className="py-4 first:pt-0">
          <div className="flex items-center justify-between gap-3"><dt className="text-sm font-medium text-[#0A1628]">{item.label}</dt>
            <button type="button" onClick={() => { setStep(index); setError('') }} className="px-2 py-1 text-xs underline underline-offset-4" aria-label={'Edit ' + item.label.toLowerCase()}>Edit</button></div>
          <dd className="mt-2 whitespace-pre-wrap break-words text-sm text-[#1C1C1C]/80">{draft[item.key]}</dd>
        </div>)}</dl>
        <p className="mt-5 text-xs leading-relaxed text-[#1C1C1C]/75">Starting an analysis uses credits from your plan. Your idea is processed by AI providers; read our <Link href="/legal/privacy" className="underline underline-offset-4">Privacy Policy</Link>.</p>
      </div>}
      <input name="website" aria-hidden="true" hidden tabIndex={-1} autoComplete="off" value={website} onChange={event => setWebsite(event.target.value)} />
      {error && <div id="wizard-error" role="alert" className="mt-5 rounded-lg border border-[#B8963E] bg-[#F5F0E8] p-4 text-sm text-[#0A1628]">{error}<Link href="/dashboard/reports" className="mt-2 block underline underline-offset-4">View your reports</Link></div>}
      <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-[#E8E0D0] pt-6">
        <button type="button" disabled={step === 0} onClick={() => { setStep(value => Math.max(0, value - 1)); setError('') }} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[#E8E0D0] px-5 py-2.5 text-sm disabled:opacity-40"><ArrowLeft size={16} aria-hidden="true" />Back</button>
        <button type="submit" disabled={loading} className="inline-flex min-h-11 items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium text-[#FAFAF7]" style={{ background: field ? 'var(--navy)' : 'var(--gold-gradient)', color: field ? 'var(--ivory)' : 'var(--navy)' }}>
          {field ? <>Continue<ArrowRight size={16} aria-hidden="true" /></> : <>Validate idea<Check size={16} aria-hidden="true" /></>}
        </button>
      </div>
    </form>}
  </div>
}
