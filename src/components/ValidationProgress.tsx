'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Check, Loader2, Network } from 'lucide-react'

export function ValidationProgress({ progress, message }: { progress: number; message: string }) {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    const started = Date.now()
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000)
    return () => window.clearInterval(timer)
  }, [])
  const current = /saving your idea|starting your validation/i.test(message) ? 0 : /queued/i.test(message) ? 1 : progress >= 100 ? 3 : 2
  const labels = ['Save your brief', 'Join the research queue', 'Research and specialist review', 'Save your report']
  return <section className="brief-panel research-progress" aria-label="Validation progress">
    <div className="research-progress-icon"><Network size={28} aria-hidden="true" /></div>
    <span className="workspace-pill"><Loader2 size={12} className="animate-spin" aria-hidden="true" />{current === 1 ? 'Waiting for the research team' : 'Analysis in progress'}</span>
    <h2>Your research team is on it.</h2><p role="status" aria-live="polite">{message}</p>
    <div className="research-progress-track" role="progressbar" aria-label="Completed specialist analysis" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress > 0 ? progress : undefined} aria-valuetext={progress > 0 ? Math.round(progress) + '% of specialist sections complete' : 'Waiting for the first completed section'}><div className="progress-fill" style={{ transform: 'scaleX(' + progress / 100 + ')' }} /></div>
    <ol className="research-milestones">{labels.map((label, index) => <li key={label} className={index < current ? 'is-complete' : index === current ? 'is-current' : ''}><span className="milestone-dot" aria-hidden="true">{index < current ? <Check size={11} /> : index === current ? <Loader2 size={10} className="animate-spin" /> : index + 1}</span>{label}</li>)}</ol>
    <p className="research-progress-note"><span aria-label="Elapsed time">{Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')} elapsed.</span> {elapsed >= 120 ? 'Some sources and models are taking longer. Your analysis continues in the background.' : 'Progress updates as the research team completes sections.'}</p>
    <p className="research-progress-note">Once queued, you can leave this page. Your report will be saved to your workspace.</p>
    <Link href="/dashboard/reports" className="workspace-button-secondary">View your reports<ArrowRight size={15} aria-hidden="true" /></Link>
  </section>
}
