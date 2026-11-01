'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowRight, Check, Lightbulb, Loader2, LockKeyhole, MessageSquare, RotateCcw, Trash2 } from 'lucide-react'
import { LEGAL } from '@/lib/legal'
import { DIMENSION_LABELS, INTERVIEW_NOTE, InterviewStateSchema, MAX_INTERVIEW_ANSWERS, type InterviewView } from '@/lib/interview/schema'

type Evidence = 'assumption' | 'first_hand' | 'documented' | 'unknown'
const LEVEL_LABEL = { unexplored: 'Not explored', unclear: 'Needs clarity', specific: 'Specific', testable: 'Testable' }

export function FounderInterview({ ideaId, onBusyChange }: { ideaId: string; onBusyChange?: (value: boolean) => void }) {
  const [interview, setInterview] = useState<InterviewView | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [consent, setConsent] = useState(false)
  const [answer, setAnswer] = useState('')
  const [evidence, setEvidence] = useState<Evidence>('assumption')
  const [confirmClear, setConfirmClear] = useState(false)
  const active = useRef(false)
  const mounted = useRef(true)
  const textarea = useRef<HTMLTextAreaElement>(null)
  const endpoint = '/api/ideas/' + encodeURIComponent(ideaId) + '/interview'
  const load = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch(endpoint, { cache: 'no-store', signal: signal ?? AbortSignal.timeout(15_000) })
    const body = await response.json()
    if (!response.ok) throw new Error(body.error || 'Your interview could not load.')
    if (body.interview) InterviewStateSchema.parse(body.interview.state)
    return body.interview as InterviewView | null
  }, [endpoint])
  useEffect(() => {
    mounted.current = true
    const controller = new AbortController()
    void load(AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)])).then(value => { if (mounted.current) setInterview(value) })
      .catch(error => { if (!controller.signal.aborted && mounted.current) setError(error instanceof Error ? error.message : 'Your interview could not load.') })
      .finally(() => { if (mounted.current) setLoading(false) })
    return () => { mounted.current = false; controller.abort() }
  }, [load])
  useEffect(() => { onBusyChange?.(busy); return () => onBusyChange?.(false) }, [busy, onBusyChange])

  const showLatest = (latest: InterviewView | null, preserveDraft = false) => {
    if (!preserveDraft || interview?.state.nextQuestion?.id !== latest?.state.nextQuestion?.id || interview?.state.nextQuestion?.text !== latest?.state.nextQuestion?.text) {
      setAnswer(''); setEvidence('assumption')
    }
    setInterview(latest)
  }

  const mutate = async (method: 'POST' | 'PATCH' | 'DELETE', body: object) => {
    if (active.current) return
    active.current = true; setBusy(true); setError('')
    try {
      const response = await fetch(endpoint, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(55_000) })
      const data = await response.json()
      if (!response.ok) {
        if (response.status === 409) { const latest = await load(); if (mounted.current) showLatest(latest, true) }
        throw new Error(data.error || 'Your answer could not be saved.')
      }
      if (data.interview) InterviewStateSchema.parse(data.interview.state)
      if (mounted.current) { showLatest(data.interview); setConfirmClear(false) }
    } catch (error) {
      if (mounted.current) setError(error instanceof Error && error.name !== 'TimeoutError' ? error.message : 'The connection timed out. Reload your saved answers before retrying; the last answer may already be saved.')
    } finally {
      active.current = false
      if (mounted.current) { setBusy(false); window.setTimeout(() => textarea.current?.focus(), 0) }
    }
  }
  const reload = async () => {
    if (active.current) return
    setLoading(true); setError('')
    try { const latest = await load(AbortSignal.timeout(15_000)); if (mounted.current) showLatest(latest, true) }
    catch { setError('Your saved answers could not load. Please try again.') }
    finally { setLoading(false) }
  }
  const submit = (skipped = false) => {
    if (!interview?.state.nextQuestion) return
    if (!skipped && answer.trim().length < 2) { setError('Add an answer or choose “I don’t know yet”.'); textarea.current?.focus(); return }
    void mutate('PATCH', { action: 'answer', version: interview.version, questionId: interview.state.nextQuestion.id, answer: skipped ? '' : answer.trim(), evidence: skipped ? 'unknown' : evidence, skipped })
  }
  const state = interview?.state
  const question = state?.nextQuestion
  return <section className="founder-interview" aria-label="Founder clarity interview">
    {loading ? <div className="interview-loading" role="status"><Loader2 size={18} className="animate-spin" aria-hidden="true" /><div><strong>Opening your founder notes</strong><p>Checking for saved answers…</p></div></div> : <>
      {!interview && <div className="interview-intro"><div className="interview-symbol"><MessageSquare size={24} aria-hidden="true" /></div><h3>A few better questions.</h3><p>Explore the assumptions behind your idea, one answer at a time. Follow-up questions adapt to what you share and identify what is still uncertain.</p>
        <ul><li><Check size={14} aria-hidden="true" />Up to 12 focused questions; stop whenever you like.</li><li><Check size={14} aria-hidden="true" />Answers stay with this idea and inform your reports.</li><li><Check size={14} aria-hidden="true" />“I don’t know yet” is a useful starting point.</li></ul>
        <label className="interview-consent"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} /><span>I want Validore to save my answers and send relevant context to configured AI providers to tailor questions and analysis, as described in the <Link href="/legal/privacy#ai" target="_blank" rel="noreferrer">Privacy Policy</Link>. I will avoid personal records and secrets.</span></label>
        <button type="button" className="workspace-button-primary" disabled={!consent || busy || Boolean(error)} onClick={() => void mutate('POST', { consent: true, noticeVersion: LEGAL.version })}>{busy ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <MessageSquare size={15} aria-hidden="true" />}Start founder interview</button><p className="interview-note">Optional and included in your workspace. Provider limits may switch to guided questions.</p>
      </div>}
      {interview && state && <>
        <div className="interview-meta"><span><LockKeyhole size={13} aria-hidden="true" />Private founder notes</span><span>{state.answers.length} / {MAX_INTERVIEW_ANSWERS} answers saved</span></div>
        {interview.stale || interview.noticeVersion !== LEGAL.version ? <div className="interview-warning" role="status"><strong>Your brief or processing notice has changed.</strong><p>These answers are kept for your review. Clear this interview to start with the updated brief. Answers from an earlier brief are not included in a new analysis.</p></div> : question && !state.complete ? <div className="interview-question" aria-busy={busy}>
          <p className="interview-kicker">Question {state.answers.length + 1} · {DIMENSION_LABELS[question.dimension]}</p><h3>{question.text}</h3><p className="interview-why"><Lightbulb size={15} aria-hidden="true" />{question.why}</p>
          <label htmlFor="founder-answer" className="interview-answer-label">Your answer</label><textarea ref={textarea} id="founder-answer" rows={5} maxLength={3000} value={answer} onChange={event => setAnswer(event.target.value)} disabled={busy} aria-describedby="founder-answer-hint" placeholder="Be specific about what you know, what you observed, and what is still a guess." />
          <div className="interview-answer-hint"><p id="founder-answer-hint">{question.hint}</p><span>{answer.length.toLocaleString()} / 3,000</span></div>
          <label className="interview-evidence-label" htmlFor="founder-evidence">What is this answer based on?</label><select id="founder-evidence" value={evidence} disabled={busy} onChange={event => setEvidence(event.target.value as Evidence)}><option value="assumption">A hypothesis or plan</option><option value="first_hand">My direct observation or conversations</option><option value="documented">Records, measurements, or a source I can describe</option><option value="unknown">I am uncertain</option></select>
          <div className="interview-actions"><button type="button" className="workspace-button-primary" disabled={busy} onClick={() => submit()}>{busy ? <><Loader2 size={15} className="animate-spin" aria-hidden="true" />Saving & considering your answer…</> : <>Save answer<ArrowRight size={15} aria-hidden="true" /></>}</button><button type="button" className="workspace-text-link" disabled={busy} onClick={() => submit(true)}>I don’t know yet</button></div>
        </div> : <div className="interview-complete"><Check size={22} aria-hidden="true" /><h3>Your founder notes are ready.</h3><p>Use these answers with your analysis, and return to the uncertain areas after your next customer experiment.</p></div>}
        {state.answers.length > 0 && <div className="interview-assessment"><div><h3>Where your answers stand</h3><span className="workspace-pill">{state.method === 'ai' ? 'AI-assisted review' : 'Guided review'}</span></div><p>{state.assessment.summary}</p>
          <div className="clarity-grid">{state.assessment.dimensions.map(review => <details key={review.dimension} className={'clarity-item clarity-' + review.level}><summary><span>{DIMENSION_LABELS[review.dimension]}</span><small>{LEVEL_LABEL[review.level]}</small></summary><p>{review.reason}</p></details>)}</div>
          {state.assessment.contradictions.length > 0 && <div className="interview-warning"><strong>Worth clarifying</strong><ul>{state.assessment.contradictions.map((item, index) => <li key={index}>{item.description}</li>)}</ul></div>}
          <p className="interview-experiment"><strong>A useful next test</strong>{state.assessment.nextExperiment}</p><p className="interview-note">{INTERVIEW_NOTE}</p>
          <details className="interview-history"><summary>Review {state.answers.length} saved answers</summary><ol>{state.answers.map(item => <li key={item.question.id}><strong>{item.question.text}</strong><p>{item.skipped ? 'I don’t know yet.' : item.text}</p><span>{item.evidence === 'documented' ? 'Self-reported supporting records' : item.evidence === 'first_hand' ? 'Self-reported observation' : item.evidence === 'unknown' ? 'Unknown' : 'Hypothesis or plan'}</span></li>)}</ol></details>
        </div>}
        <div className="interview-footer">{!state.complete && !interview.stale && <button type="button" className="workspace-text-link" disabled={busy} onClick={() => void mutate('PATCH', { action: 'finish', version: interview.version })}>Finish with these answers</button>}<button type="button" className="workspace-text-link" disabled={busy} onClick={() => setConfirmClear(true)}><Trash2 size={13} aria-hidden="true" />Clear interview</button></div>
        {confirmClear && <div className="interview-warning" role="group" aria-label="Confirm clearing interview"><strong>Clear these saved questions and answers?</strong><p>This removes the interview from your account. Previously generated reports and downloaded copies are not changed.</p><div className="interview-actions"><button type="button" className="workspace-button-secondary" disabled={busy} onClick={() => setConfirmClear(false)}>Keep answers</button><button type="button" className="workspace-button-primary" disabled={busy} onClick={() => void mutate('DELETE', { version: interview.version })}>Clear interview</button></div></div>}
      </>}
    </>}
    {error && <div className="brief-error" role="alert"><p>{error}</p><button type="button" className="workspace-text-link" disabled={busy || loading} onClick={() => void reload()}><RotateCcw size={14} aria-hidden="true" />Reload saved answers</button></div>}
  </section>
}
