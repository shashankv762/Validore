'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, Gift, Loader2, Play, RefreshCw, X } from 'lucide-react'
import { toast } from 'sonner'
import { notifyAccountUpdated } from './AccountProvider'
import { DialogShell } from './ui/DialogShell'
import type { RewardStatus, RewardSession } from '@/lib/ads/config'

type Phase = 'idle' | 'starting' | 'playing' | 'checking'
const BASE = '/api/credits/rewards'
class RewardRequestError extends Error {
  constructor(message: string, readonly status: number) { super(message) }
}

async function request<T>(url: string, signal: AbortSignal, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: 'no-store', credentials: 'same-origin', signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]) })
  const data = await response.json()
  if (!response.ok) throw new RewardRequestError(data.error || 'Rewards are temporarily unavailable.', response.status)
  return data as T
}

function wait(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const abort = () => { window.clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')) }
    const timer = window.setTimeout(() => { signal.removeEventListener('abort', abort); resolve() }, ms)
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) abort()
  })
}

export function RewardedCredits({ ownerId, emailVerified }: { ownerId: string; emailVerified: boolean }) {
  const [status, setStatus] = useState<RewardStatus | null>(null)
  const [session, setSession] = useState<RewardSession | null>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [consentOpen, setConsentOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const iframe = useRef<HTMLIFrameElement>(null)
  const lifetime = useRef<AbortController | null>(null)
  const operation = useRef(false)
  const storageKey = 'validore:reward-session:' + ownerId

  const check = useCallback(async (id: string | undefined, signal: AbortSignal) => {
    let data: RewardStatus
    try {
      data = await request<RewardStatus>(BASE + (id ? '?sessionId=' + encodeURIComponent(id) : ''), signal)
    } catch (error) {
      // Old tab storage can outlive server retention. Recover availability once.
      if (!id || !(error instanceof RewardRequestError) || ![400, 404].includes(error.status)) throw error
      try { sessionStorage.removeItem(storageKey) } catch { /* Recovery is optional. */ }
      data = await request<RewardStatus>(BASE, signal)
    }
    if (signal.aborted) return 'closed' as const
    setStatus(data)
    if (data.session?.status === 'rewarded') {
      setSession(null)
      try { sessionStorage.removeItem(storageKey) } catch { /* Recovery is optional. */ }
      setMessage('10 credits added to your balance.')
      notifyAccountUpdated()
      return 'rewarded' as const
    }
    if (data.enabled && data.session?.status === 'pending') {
      setSession(data.session)
      try { sessionStorage.setItem(storageKey, data.session.id) } catch { /* Recovery is optional. */ }
      return 'pending' as const
    }
    setSession(null)
    try { sessionStorage.removeItem(storageKey) } catch { /* Recovery is optional. */ }
    return 'closed' as const
  }, [storageKey])

  useEffect(() => {
    const controller = new AbortController()
    lifetime.current = controller
    let previous: string | undefined
    try { previous = sessionStorage.getItem(storageKey) || undefined } catch { /* Storage may be blocked. */ }
    void Promise.resolve().then(() => { if (!controller.signal.aborted) return check(previous, controller.signal) }).catch(error => {
      if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'Could not load rewards.')
    })
    return () => controller.abort()
  }, [check, storageKey])

  // A cooldown uses one timer rather than repeatedly polling the API.
  useEffect(() => {
    if (!status?.nextAvailableAt) return
    const timer = window.setTimeout(() => setStatus(current => current ? { ...current, nextAvailableAt: null } : current), Math.max(0, Date.parse(status.nextAvailableAt) - Date.now()))
    return () => window.clearTimeout(timer)
  }, [status?.nextAvailableAt])

  useEffect(() => {
    if (!status?.enabled) return
    const now = new Date()
    const midnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)
    const timer = window.setTimeout(() => {
      const signal = lifetime.current?.signal
      if (signal && !signal.aborted) void check(session?.id, signal).catch(() => { /* Manual retry remains available. */ })
    }, midnight - now.getTime() + 1000)
    return () => window.clearTimeout(timer)
  }, [status, session?.id, check])

  const confirmReward = useCallback(async (id: string, poll: boolean) => {
    const signal = lifetime.current?.signal
    if (!signal || signal.aborted || operation.current) return
    operation.current = true
    setPhase('checking'); setError(''); setMessage('Checking your completed ad…')
    try {
      for (let attempt = 0; attempt < (poll ? 10 : 1); attempt++) {
        if (attempt) await wait(attempt < 3 ? 2500 : 5000, signal)
        const result = await check(id, signal)
        if (result === 'rewarded') { toast.success('10 earned credits added.'); return }
        if (result === 'closed') {
          if (!signal.aborted) setMessage('This ad session has ended without a confirmed reward. You can check availability for another ad.')
          return
        }
      }
      if (!signal.aborted) setMessage('Your reward is awaiting confirmation. You can check again shortly or return to your work.')
    } catch (error) {
      if (!signal.aborted) setError(error instanceof Error ? error.message : 'Could not check your reward.')
    } finally {
      operation.current = false
      if (!signal.aborted) setPhase('idle')
    }
  }, [check])

  const closePlayer = useCallback(async () => {
    const signal = lifetime.current?.signal
    if (!session || !signal || signal.aborted || operation.current) return
    operation.current = true
    setPhase('checking'); setConsentOpen(false)
    try {
      await request(BASE, signal, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: session.id }) })
      const result = await check(session.id, signal)
      if (result !== 'rewarded' && !signal.aborted) setMessage('No completed ad was confirmed. You can try again when an ad is available.')
    } catch (error) {
      if (!signal.aborted) setError(error instanceof Error ? error.message : 'Could not close this ad session.')
    } finally {
      operation.current = false
      if (!signal.aborted) setPhase('idle')
    }
  }, [session, check])

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (phase !== 'playing' || !session || event.origin !== window.location.origin || event.source !== iframe.current?.contentWindow ||
          event.data?.type !== 'validore:rewarded-ad' || event.data.sessionId !== session.id) return
      if (event.data.event === 'complete') void confirmReward(session.id, true)
      else if (['closed', 'unavailable'].includes(event.data.event)) void closePlayer()
    }
    window.addEventListener('message', receive)
    return () => window.removeEventListener('message', receive)
  }, [phase, session, confirmReward, closePlayer])

  const start = async () => {
    const signal = lifetime.current?.signal
    if (!signal || signal.aborted || operation.current) return
    operation.current = true
    setConsentOpen(false); setPhase('starting'); setError(''); setMessage('')
    try {
      const data = await request<{ session: RewardSession }>(BASE, signal, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ consent: true }) })
      if (signal.aborted) return
      setSession(data.session)
      try { sessionStorage.setItem(storageKey, data.session.id) } catch { /* Credits still arrive without browser storage. */ }
      setPhase('playing')
    } catch (error) {
      if (!signal.aborted) { setError(error instanceof Error ? error.message : 'Your ad could not be started.'); setPhase('idle') }
    } finally { operation.current = false }
  }

  const busy = phase !== 'idle'
  const disabled = !status?.enabled || !emailVerified || status.remainingToday < 1 || Boolean(status.nextAvailableAt) || busy || Boolean(session)
  return <section aria-labelledby="rewarded-credits-title" className="card-angular overflow-hidden bg-white">
    <div className="flex flex-wrap items-center justify-between gap-5 p-6 sm:p-8">
      <div className="max-w-2xl"><span className="inline-flex items-center gap-2 text-xs font-medium text-[#89620B]"><Gift size={16} aria-hidden="true" /> A little more room to explore</span>
        <h2 id="rewarded-credits-title" className="mt-2 text-xl font-medium">Watch an ad. Earn 10 credits.</h2>
        <p className="mt-2 text-sm leading-relaxed text-[#53616A]">Choose to watch a rewarded ad and receive 10 credits after completion is confirmed. Earned credits carry forward. Five completed ads fund one extra Lite validation on the Free plan.</p>
        <p className="mt-2 text-xs text-[#53616A]">{status?.enabled ? `Up to ${status.dailyLimit} ads per day, with a one-minute break between rewards. ${status.remainingToday} remaining today. Resets at midnight UTC.` : status ? 'Rewarded ads are coming soon. Your existing plan credits are ready to use.' : 'Checking ad availability…'} Credits have no cash value and do not unlock Premium tools.</p>
        {status?.enabled && !emailVerified && <p className="mt-2 text-sm text-amber-800">Verify your email to earn ad credits.</p>}
      </div>
      <button type="button" onClick={() => setConsentOpen(true)} disabled={disabled} className="inline-flex min-h-12 items-center justify-center gap-2 rounded bg-[#141923] px-5 text-sm text-white disabled:cursor-not-allowed disabled:opacity-50">
        {busy ? <Loader2 size={17} className="animate-spin" aria-hidden="true" /> : <Play size={17} aria-hidden="true" />}
        {phase === 'starting' ? 'Preparing your ad…' : phase === 'checking' ? 'Checking reward…' : !status ? 'Checking availability…' : !status.enabled ? 'Ads coming soon' : status.nextAvailableAt ? 'Next ad available shortly' : status.remainingToday < 1 ? 'Daily allowance used' : 'Watch ad · +10 credits'}
      </button>
    </div>
    {(message || error || session) && <div className="border-t border-[#E5E7EB] bg-[#FAFBFC] px-6 py-4 sm:px-8">
      {message && <p role="status" className="flex items-start gap-2 text-sm text-[#53616A]">{message.startsWith('10 credits') && <CheckCircle2 size={17} className="shrink-0 text-emerald-700" aria-hidden="true" />}{message}</p>}
      {error && <p role="alert" className="text-sm text-amber-900">{error}</p>}
      {session && !busy && <div className="mt-2 flex flex-wrap gap-4"><button type="button" onClick={() => void confirmReward(session.id, false)} className="inline-flex min-h-11 items-center gap-2 text-sm underline underline-offset-4"><RefreshCw size={14} aria-hidden="true" />Check pending reward</button>
        <button type="button" onClick={() => void closePlayer()} className="min-h-11 text-sm text-[#53616A] underline underline-offset-4">Close unfinished ad session</button></div>}
      {error && !session && !busy && <button type="button" onClick={() => { setError(''); const signal = lifetime.current?.signal; if (signal) void check(undefined, signal).catch(() => setError('Could not load rewards. Please try again.')) }} className="mt-2 min-h-11 text-sm underline">Retry availability</button>}
    </div>}
    {consentOpen && <DialogShell title="Watch an optional rewarded ad" onClose={() => setConsentOpen(false)}><div className="rounded-lg bg-white p-6">
      <h3 className="text-lg font-medium">Earn 10 credits with an ad</h3><p className="mt-3 text-sm leading-relaxed text-[#53616A]">AppLixir and its ad partners will load a video player and may use cookies or device information. Make any additional privacy choices in the ad player. Your startup brief and founder answers are not sent to the ad provider.</p>
      <p className="mt-3 text-sm text-[#53616A]">Complete the ad to earn the reward. You can cancel or continue using your existing credits at any time. Ad availability varies.</p>
      <Link href="/legal/cookies" className="mt-3 inline-block text-sm underline">Read about advertising cookies</Link>
      <div className="mt-5 flex flex-wrap gap-3"><button type="button" onClick={() => void start()} className="min-h-11 rounded bg-[#141923] px-4 text-sm text-white">Watch ad and earn 10 credits</button><button type="button" onClick={() => setConsentOpen(false)} className="min-h-11 rounded border px-4 text-sm">Not now</button></div>
    </div></DialogShell>}
    {phase === 'playing' && session && <DialogShell title="Rewarded ad player" onClose={() => void closePlayer()}><div className="rounded-lg bg-white p-3">
      <div className="flex items-center justify-between gap-3 px-2"><p className="text-sm font-medium">Complete the ad to earn 10 credits</p><button type="button" onClick={() => void closePlayer()} aria-label="Close ad without waiting" className="grid size-11 shrink-0 place-items-center"><X size={20} /></button></div>
      <iframe ref={iframe} title="Optional rewarded video from AppLixir" src={`${BASE}/player?sessionId=${encodeURIComponent(session.id)}`} className="h-[65dvh] min-h-[320px] w-full border-0" allow="autoplay; fullscreen" sandbox="allow-scripts allow-same-origin allow-popups allow-presentation" />
    </div></DialogShell>}
  </section>
}
