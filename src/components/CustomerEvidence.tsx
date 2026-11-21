'use client'

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { ArrowRight, ExternalLink, Loader2, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { notifyAccountUpdated, useAccount } from './AccountProvider'
import { LEGAL } from '@/lib/legal'
import { suggestSentiment, sentimentCounts } from '@/lib/customer-feedback/analysis'
import type { FeedbackRecord, FeedbackView, SentimentLabel } from '@/lib/customer-feedback/schema'

const LABELS = { positive: 'Positive', negative: 'Negative', mixed: 'Mixed', neutral: 'Neutral', unknown: 'Unclear' }
const KINDS = { review: 'Customer review', interview: 'Interview note', support: 'Support feedback', survey: 'Survey response', problem: 'Customer problem', idea: 'Idea to test' }
const localDate = () => { const now = new Date(); return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-') }
const formFingerprint = (form: HTMLFormElement) => JSON.stringify([...new FormData(form).entries()])
const observedDate = (value: string) => new Date(value.slice(0, 10) + 'T12:00:00Z').toLocaleDateString(undefined, { timeZone: 'UTC' })
const publicLink = (value: string | null) => { try { const url = new URL(value ?? ''); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : null } catch { return null } }
type Snapshot = { ideaId: string; ownerId: string; view: FeedbackView | null; error: string; loading: boolean }

export function CustomerEvidence({ ideaId }: { ideaId: string }) {
  const account = useAccount()
  const ownerId = account.data?.user.id ?? ''
  const [snapshot, setSnapshot] = useState<Snapshot>({ ideaId: '', ownerId: '', view: null, error: '', loading: true })
  const [attempt, setAttempt] = useState(0)
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState('')
  const [importNotes, setImportNotes] = useState<string[]>([])
  const [consent, setConsent] = useState(false)
  const [kind, setKind] = useState<FeedbackRecord['kind']>('review')
  const [visibleRecords, setVisibleRecords] = useState(20)
  const operation = useRef<AbortController | null>(null)
  const latest = useRef({ ideaId, ownerId }); latest.current = { ideaId, ownerId }
  const active = snapshot.ideaId === ideaId && snapshot.ownerId === ownerId
  const view = active ? snapshot.view : null
  const loading = !active || snapshot.loading
  const error = active ? snapshot.error : ''
  const retry = useCallback(() => setAttempt(value => value + 1), [])
  useEffect(() => {
    operation.current?.abort()
    if (!ideaId || !ownerId) return
    const controller = new AbortController()
    setBusy(''); setNotice(''); setImportNotes([]); setVisibleRecords(20)
    async function load() {
      try {
        const response = await fetch('/api/ideas/' + ideaId + '/feedback', { cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]) })
        const value = await response.json()
        if (!response.ok) throw new Error(value.error || 'Customer evidence could not be loaded.')
        if (!controller.signal.aborted) setSnapshot({ ideaId, ownerId, view: value, error: '', loading: false })
      } catch (failure) {
        if (!controller.signal.aborted) setSnapshot({ ideaId, ownerId, view: null, error: failure instanceof Error ? failure.message : 'Check your connection and try again.', loading: false })
      }
    }
    void load()
    return () => { controller.abort(); operation.current?.abort() }
  }, [ideaId, ownerId, attempt])

  const mutate = async (name: string, method: string, payload: unknown): Promise<boolean> => {
    if (operation.current) return false
    const controller = new AbortController(); operation.current = controller
    const requestIdea = ideaId; const requestOwner = ownerId
    setBusy(name); setNotice(''); setImportNotes([])
    setSnapshot(current => ({ ...current, error: '' }))
    try {
      const response = await fetch('/api/ideas/' + requestIdea + '/feedback', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(name === 'analyze' ? 240_000 : 30_000)]) })
      const value = await response.json()
      if (latest.current.ideaId !== requestIdea || latest.current.ownerId !== requestOwner || controller.signal.aborted) return false
      if (!response.ok) throw new Error(value.error || 'This change could not be saved. Please try again.')
      setSnapshot({ ideaId: requestIdea, ownerId: requestOwner, view: value, error: '', loading: false })
      if (name === 'import' && Array.isArray(value.importLimitations)) setImportNotes(value.importLimitations.filter((item: unknown): item is string => typeof item === 'string'))
      setNotice(name === 'analyze' ? value.reused ? 'Your saved analysis is ready. No extra credits used.' : 'Analysis saved. ' + value.creditsCharged + ' credits used.' :
        name === 'import' ? value.added + ' review records added. ' + value.duplicates + ' duplicates skipped.' : name.startsWith('remove') ? 'Record removed. Its previous analysis was cleared.' : name.startsWith('sentiment') ? 'Sentiment updated. Analyze again to refresh the findings.' : value.duplicates ? 'This evidence is already recorded.' : 'Evidence recorded and ready for research.')
      if (value.creditsCharged) notifyAccountUpdated()
      return true
    } catch (failure) {
      if (!controller.signal.aborted && latest.current.ideaId === requestIdea && latest.current.ownerId === requestOwner) setSnapshot(current => ({ ...current,
        error: failure instanceof Error && !['AbortError', 'TimeoutError', 'TypeError'].includes(failure.name) ? failure.message : 'The request could not be confirmed. Reload before retrying; any completed save or analysis will be retained.' }))
      return false
    } finally {
      if (operation.current === controller) { operation.current = null; setBusy('') }
    }
  }
  const saveRecord = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = event.currentTarget; const fields = new FormData(form)
    const submitted = formFingerprint(form)
    const observed = String(fields.get('occurredAt') ?? '')
    const success = await mutate('record', 'POST', { action: 'record', requestId: crypto.randomUUID(), kind, content: fields.get('content'),
      sourceLabel: fields.get('sourceLabel'), sourceUrl: fields.get('sourceUrl') || null,
      occurredAt: observed || null,
      rating: fields.get('rating') ? Number(fields.get('rating')) : null, sentiment: fields.get('sentiment') || null,
      consent, noticeVersion: LEGAL.version })
    if (success) {
      if (formFingerprint(form) === submitted) { form.reset(); setKind('review') }
      else setNotice('Evidence saved. Your newer draft is still here.')
    }
  }
  const importPage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = event.currentTarget
    const submitted = formFingerprint(form)
    if (await mutate('import', 'POST', { action: 'import', requestId: crypto.randomUUID(), url: new FormData(form).get('url'), consent, noticeVersion: LEGAL.version }) && formFingerprint(form) === submitted) form.reset()
  }
  const download = () => {
    if (!view) return
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), ...view }, null, 2)], { type: 'application/json' })
    const href = URL.createObjectURL(blob); const anchor = document.createElement('a')
    anchor.href = href; anchor.download = 'validore-customer-evidence.json'; anchor.click(); setTimeout(() => URL.revokeObjectURL(href), 1000)
  }
  if (loading) return <div className="workspace-loading" role="status"><Loader2 size={18} className="animate-spin" aria-hidden="true" /> Loading customer evidence…</div>
  if (!view) return <div className="evidence-notebook-error" role="alert"><p>{error || 'Customer evidence could not be loaded.'}</p><button type="button" onClick={retry} className="evidence-button"><RefreshCw size={16} aria-hidden="true" /> Try again</button></div>
  const analysis = !view.staleAnalysis ? view.analysis?.data : null
  const editable = Boolean(account.data?.user.emailVerified && !view.readOnly)
  const selected = new Map(analysis?.observations.map(item => [item.recordId, item]) ?? [])
  const counts = sentimentCounts(view.records.filter(record => selected.has(record.id)), analysis)
  return <div className="evidence-notebook">
    <div className="evidence-notebook-toolbar"><p>{view.totalRecords} of 200 records · Recording and importing are free.</p><div><button type="button" className="evidence-button evidence-button-quiet" onClick={download} disabled={!view.records.length}>Export records</button><button type="button" className="evidence-button" onClick={retry} disabled={Boolean(busy)} aria-label="Reload customer evidence"><RefreshCw size={15} aria-hidden="true" /> Refresh</button></div></div>
    {error && <p role="alert" className="evidence-notebook-error">{error} <button type="button" className="underline underline-offset-4" onClick={retry}>Reload evidence</button></p>}
    {notice && <p role="status" className="evidence-notebook-notice">{notice}</p>}
    {importNotes.length > 0 && <details className="evidence-analysis-limits"><summary>Review import coverage</summary><ul>{importNotes.map(note => <li key={note}>{note}</li>)}</ul></details>}
    {!editable && <p className="evidence-notebook-error">{view.readOnly ? 'This idea is read-only. You can review and export its evidence; choose an editable idea to add records or analyze them.' : 'Verify your email before recording or analyzing customer evidence.'}</p>}
    <div className="evidence-notebook-inputs">
      <form onSubmit={saveRecord} className="evidence-record-form"><h2>Record what customers say</h2><p>Keep the original wording. Save problems and ideas alongside reviews and interview notes.</p>
        <label htmlFor="feedback-kind">Record type</label><select id="feedback-kind" name="kind" value={kind} onChange={event => setKind(event.target.value as FeedbackRecord['kind'])}>{Object.entries(KINDS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        <label htmlFor="feedback-content">Observation, customer problem or idea</label><textarea id="feedback-content" name="content" rows={4} required minLength={12} maxLength={3000} placeholder="What happened, what was difficult, and what did the customer do about it?" />
        <div className="evidence-form-row"><div><label htmlFor="feedback-source">Source or interview context</label><input id="feedback-source" name="sourceLabel" required minLength={2} maxLength={120} placeholder="Five shop-owner interviews, Pune" /></div><div><label htmlFor="feedback-date">Observation date, if known</label><input id="feedback-date" name="occurredAt" type="date" max={localDate()} /></div></div>
        <label htmlFor="feedback-source-url">Public source URL, if available</label><input id="feedback-source-url" name="sourceUrl" type="url" maxLength={2000} placeholder="https://…" />
        <div className="evidence-form-row"><div><label htmlFor="feedback-sentiment">Reviewed sentiment, if known</label><select id="feedback-sentiment" name="sentiment"><option value="">Analyze the wording</option>{Object.entries(LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div><div><label htmlFor="feedback-rating">Original star rating, if supplied</label><select id="feedback-rating" name="rating"><option value="">No rating supplied</option>{[1, 2, 3, 4, 5].map(rating => <option value={rating} key={rating}>{rating} / 5</option>)}</select></div></div>
        <button type="submit" className="evidence-button evidence-button-primary" disabled={!consent || !editable || Boolean(busy)}>{busy === 'record' ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />}{busy === 'record' ? 'Saving record…' : 'Save evidence'}</button>
      </form>
      <div className="evidence-import-panel"><h2>Bring in public reviews</h2><p>Import up to 20 review texts exposed on a public page. Source links, original dates and ratings stay with each record.</p><form onSubmit={importPage}><label htmlFor="feedback-import-url">Public review page URL</label><input id="feedback-import-url" name="url" type="url" required maxLength={2000} placeholder="https://…" /><button className="evidence-button" type="submit" disabled={!consent || !editable || Boolean(busy)}>{busy === 'import' && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}{busy === 'import' ? 'Reading reviews…' : 'Import public reviews'}</button></form>
        <p className="evidence-small-note">Some sites hide reviews behind login or load them after the page opens. Paste individual excerpts in the record form when import is unavailable.</p>
        <div className="evidence-processing-note"><label className="evidence-consent"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} /><span>I can use these records and have removed personal or confidential details.</span></label><p>Records stay in your workspace. Analysis sends excerpts to the configured AI provider and uses them in your reports. <Link href="/legal/privacy">How your data is used</Link></p></div>
        <Link className="workspace-text-link" href={'/dashboard/interview/' + ideaId}>Add founder interview notes <ArrowRight size={14} aria-hidden="true" /></Link>
      </div>
    </div>
    {view.records.length > 0 && <section className="evidence-analysis-section" aria-labelledby="feedback-analysis-heading"><div className="evidence-section-heading"><div><h2 id="feedback-analysis-heading">Turn evidence into experiments</h2><p>{view.analysis && !view.staleAnalysis ? 'Saved analysis of ' + view.analysis.analyzedRecords + ' / ' + view.analysis.totalRecords + ' records.' : 'Analyze up to the 40 most recent records, with exact quotes and evidence-linked opportunities.'}</p></div><button className="evidence-button evidence-button-primary" disabled={!consent || !editable || Boolean(busy)} onClick={() => void mutate('analyze', 'POST', { action: 'analyze', consent, noticeVersion: LEGAL.version })} type="button">{busy === 'analyze' && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}{busy === 'analyze' ? 'Analyzing customer evidence…' : analysis ? 'Open saved analysis · free' : 'Analyze evidence · 20 credits'}</button></div>
      {view.staleAnalysis && <p className="evidence-small-note">Your records changed after the previous analysis. Run again to include the current evidence.</p>}
      {analysis ? <div className="evidence-analysis-body"><p>{analysis.summary}</p><div className="evidence-sentiment-row" aria-label="Sentiment in the analyzed sample">{Object.entries(counts).map(([label, count]) => <span key={label}>{LABELS[label as SentimentLabel]} <strong>{count}</strong></span>)}</div>
        <div className="evidence-theme-list">{analysis.themes.map((theme, index) => <article key={theme.theme}><h3>{theme.theme}</h3><p className="evidence-small-note">{theme.recordIds.length} supporting record{theme.recordIds.length === 1 ? '' : 's'} in the analyzed sample.</p><p>{theme.customerProblem}</p><h4>Opportunity to test</h4><p>{theme.opportunityHypothesis}</p><dl><div><dt>Experiment</dt><dd>{theme.nextExperiment.method}</dd></div><div><dt>Measure</dt><dd>{theme.nextExperiment.metric}</dd></div><div><dt>Pass</dt><dd>{theme.nextExperiment.passThreshold}</dd></div><div><dt>Reconsider</dt><dd>{theme.nextExperiment.failThreshold}</dd></div></dl><details><summary>Show the supporting records</summary><ul>{theme.recordIds.map(id => { const record = view.records.find(record => record.id === id); return record ? <li key={id}><a href={'#feedback-record-' + id}>{record.content.slice(0, 180)}{record.content.length > 180 ? '…' : ''}</a></li> : null })}</ul></details><span className="sr-only">Theme {index + 1}</span></article>)}</div>
        {analysis.opposingSignals.length > 0 && <div><h3>Opposing signals</h3><ul>{analysis.opposingSignals.map(value => <li key={value}>{value}</li>)}</ul></div>}
        {analysis.unansweredQuestions.length > 0 && <div><h3>Questions to investigate</h3><ul>{analysis.unansweredQuestions.map(value => <li key={value}>{value}</li>)}</ul></div>}
        <details className="evidence-analysis-limits"><summary>Source and sample limitations</summary><ul>{analysis.limitations.map(value => <li key={value}>{value}</li>)}</ul></details>
      </div> : <p className="evidence-small-note">The analysis preserves opposing feedback and unknowns. Review sentiment and compare findings with actual customer behavior before changing your plan.</p>}
    </section>}
    <section className="evidence-records-section" aria-labelledby="feedback-records-heading"><h2 id="feedback-records-heading">Your evidence record</h2>{!view.records.length ? <p className="evidence-empty">No customer evidence recorded yet. Start with a recent conversation, review, customer problem or idea you want to test.</p> : <ul className="evidence-record-list">{view.records.slice(0, visibleRecords).map(record => {
      const analyzed = selected.get(record.id); const sentiment = record.sentiment ?? analyzed?.sentiment ?? suggestSentiment(record.content, record.rating); const url = publicLink(record.sourceUrl)
      return <li key={record.id} id={'feedback-record-' + record.id}><div className="evidence-record-header"><div><strong>{KINDS[record.kind]}</strong><span>{record.sourceLabel} · {record.occurredAt ? observedDate(record.occurredAt) : 'Observation date unknown'}</span></div><button className="evidence-remove" type="button" disabled={Boolean(busy) || !editable} onClick={() => void mutate('remove-' + record.id, 'DELETE', { id: record.id })} aria-label={'Remove ' + KINDS[record.kind].toLowerCase()}><Trash2 size={16} aria-hidden="true" /></button></div><p className="evidence-record-content">{record.content}</p><div className="evidence-record-footer"><label>Sentiment<select aria-label={'Sentiment for ' + record.sourceLabel} value={record.sentiment ?? ''} onChange={event => void mutate('sentiment-' + record.id, 'PATCH', { id: record.id, sentiment: event.target.value || null })} disabled={Boolean(busy) || !editable}><option value="">{(analyzed ? 'AI analysis: ' : 'Suggested: ') + LABELS[sentiment]}</option>{Object.entries(LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><span>{record.rating === null ? '' : record.rating + ' / 5 · '}{record.provenance === 'owner_recorded' ? 'Owner-recorded evidence' : record.provenance === 'public_review_feed' ? 'Imported public review feed' : 'Imported public review'}</span>{url && <a href={url} target="_blank" rel="noreferrer noopener">View source <ExternalLink size={13} aria-hidden="true" /></a>}</div>{analyzed && <p className="evidence-small-note">{analyzed.reason}</p>}</li>
    })}</ul>}{view.records.length > visibleRecords && <button className="evidence-button" type="button" onClick={() => setVisibleRecords(value => value + 20)}>Show 20 more records</button>}</section>
  </div>
}
