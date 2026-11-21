'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Coins, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { notifyAccountUpdated, useAccount } from '@/components/AccountProvider'
import type { DailyCreditStatus } from '@/lib/daily-credits'

export function DailyCredits({ compact = false }: { compact?: boolean }) {
  const account = useAccount()
  const user = account.data?.user
  const ownerId = user?.id
  const unlimited = Boolean(user?.unlimited)
  const [resource, setResource] = useState<{ ownerId: string; status: DailyCreditStatus | null; error: string } | null>(null)
  const status = resource?.ownerId === ownerId ? resource?.status : null
  const error = resource?.ownerId === ownerId ? resource?.error ?? '' : ''
  const [claimOwner, setClaimOwner] = useState<string | null>(null)
  const claiming = Boolean(ownerId && claimOwner === ownerId)
  const claimController = useRef<{ ownerId: string; controller: AbortController } | null>(null)
  const statusRevision = useRef(0)
  const invalidateStatus = useCallback(() => { statusRevision.current++ }, [])
  const load = useCallback(async (signal?: AbortSignal) => {
    if (!ownerId || unlimited || claimController.current?.ownerId === ownerId) return
    const revision = ++statusRevision.current
    try {
      const response = await fetch('/api/credits/daily', { cache: 'no-store', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(10_000)]) : AbortSignal.timeout(10_000) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Daily credits could not be loaded.')
      if (!signal?.aborted && revision === statusRevision.current) setResource({ ownerId, status: data, error: '' })
    } catch (failure) {
      if (!signal?.aborted && revision === statusRevision.current) setResource(previous => ({ ownerId, status: previous?.ownerId === ownerId ? previous.status : null,
        error: failure instanceof Error ? failure.message : 'Daily credits could not be loaded.' }))
    }
  }, [ownerId, unlimited])
  useEffect(() => {
    const controller = new AbortController()
    const timer = window.setTimeout(() => void load(controller.signal), 0)
    const focus = () => void load(controller.signal)
    window.addEventListener('focus', focus)
    return () => { controller.abort(); invalidateStatus(); window.clearTimeout(timer); window.removeEventListener('focus', focus) }
  }, [load, account.updatedAt, invalidateStatus])
  useEffect(() => {
    if (!status?.nextClaimAt) return
    const controller = new AbortController()
    const timer = window.setTimeout(() => void load(controller.signal), Math.max(1000, Date.parse(status.nextClaimAt) - Date.now() + 1000))
    return () => { controller.abort(); window.clearTimeout(timer) }
  }, [status?.nextClaimAt, load])
  useEffect(() => () => {
    const pending = claimController.current
    if (pending && pending.ownerId === ownerId) pending.controller.abort()
  }, [ownerId])
  const claim = async () => {
    if (!ownerId || claiming || claimController.current?.ownerId === ownerId || !status?.available || !user?.emailVerified) return
    const controller = new AbortController()
    statusRevision.current++
    claimController.current = { ownerId, controller }
    setClaimOwner(ownerId); setResource({ ownerId, status, error: '' })
    try {
      const response = await fetch('/api/credits/daily', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]) })
      const data = await response.json()
      if (controller.signal.aborted) return
      if (!response.ok) throw new Error(data.error || 'Daily credits could not be claimed.')
      setResource({ ownerId, status: data, error: '' }); notifyAccountUpdated()
      if (data.granted) toast.success(`${data.granted} daily credits added. They carry forward.`)
      else toast.info('Your daily credits were already claimed today.')
    } catch (failure) {
      if (!controller.signal.aborted) setResource({ ownerId, status,
        error: failure instanceof Error ? failure.message : 'Daily credits could not be claimed.' })
    } finally {
      if (claimController.current?.controller === controller) {
        claimController.current = null
        setClaimOwner(previous => previous === ownerId ? null : previous)
      }
    }
  }
  if (!user || user.unlimited) return null
  return <section aria-label="Daily login credits" className={compact ? 'space-y-2' : 'flex flex-wrap items-center justify-between gap-5 border-y border-[#E5E7EB] py-5'}>
    {!compact && <div><h2 className="font-medium">Your daily 10 credits</h2><p className="mt-1 text-sm text-[#53616A]">Claim once each day you log in. Earned credits carry forward.</p></div>}
    <div className="space-y-2"><button type="button" onClick={error ? () => void load() : claim} disabled={claiming || (!error && (!status?.available || !user.emailVerified))} className={'inline-flex min-h-11 items-center justify-center gap-2 rounded px-4 text-sm disabled:cursor-not-allowed disabled:opacity-60 ' + (compact ? 'w-full bg-[#E0A526] text-[#141923]' : 'bg-[#141923] text-white')}>
      {claiming ? <Loader2 size={16} aria-hidden="true" className="animate-spin" /> : status?.claimedToday ? <Check size={16} aria-hidden="true" /> : <Coins size={16} aria-hidden="true" />}
      {claiming ? 'Claiming…' : error ? 'Refresh daily credits' : !user.emailVerified ? 'Verify email to claim' : status?.claimedToday ? 'Claimed today' : 'Claim 10 daily credits'}
    </button><p className={'max-w-sm text-xs ' + (compact ? 'text-[#CBD1D8]' : 'text-[#53616A]')}>{status?.claimedToday ? `Next claim: ${new Date(status.nextClaimAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' })}. Resets at 00:00 UTC.` : 'Daily eligibility resets at 00:00 UTC. No missed-day catch-up.'}</p>
    {error && <p role="alert" className={'max-w-sm text-xs ' + (compact ? 'text-[#F0C04E]' : 'text-[#89620B]')}>{error}</p>}</div>
  </section>
}
