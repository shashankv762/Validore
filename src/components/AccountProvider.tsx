'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import type { PlanTier } from '@/lib/plans'

export type AccountUser = {
  id: string
  email: string
  tier: PlanTier
  isFoundingMember: boolean
  crowdfundingCredits: number
  pitchDeckCredits: number
  validationsThisMonth: number
  creditBalance: number
  purchasedCredits: number
  creditsUsedThisCycle: number
  creditResetAt: string | null
  currentPeriodEnd: string | null
  subscriptionStatus: string | null
  cancelAtPeriodEnd: boolean
  createdAt: string | null
  emailVerified: boolean
  preferredAiProvider: 'free_models' | 'paid_models' | 'custom_openrouter'
  hasCustomApiKey: boolean
}
export type AccountData = {
  user: AccountUser
  billing: { credits: boolean; premium: boolean; maxPremium: boolean }
  ai: { freeOnly: boolean; researchTools: boolean }
}
type AccountState = {
  data: AccountData | null
  loading: boolean
  error: string | null
  updatedAt: number | null
  refresh: () => Promise<AccountData | null>
}

const AccountContext = createContext<AccountState | null>(null)
const UPDATE_EVENT = 'validore:account-updated'
const STORAGE_EVENT = 'validore:account-refresh'

export function notifyAccountUpdated() {
  window.dispatchEvent(new Event(UPDATE_EVENT))
  try { localStorage.setItem(STORAGE_EVENT, String(Date.now())) } catch { /* Same-tab refresh still works without storage. */ }
}

export function AccountProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const [snapshot, setSnapshot] = useState<Omit<AccountState, 'refresh'>>({ data: null, loading: true, error: null, updatedAt: null })
  const pending = useRef<Promise<AccountData | null> | null>(null)
  const controller = useRef<AbortController | null>(null)
  const alive = useRef(false)
  const rerun = useRef(false)

  const refresh = useCallback((): Promise<AccountData | null> => {
    if (pending.current) return pending.current
    const abort = new AbortController()
    controller.current = abort
    const request = (async () => {
      let latest: AccountData | null = null
      do {
        rerun.current = false
        try {
          const response = await fetch('/api/me', {
            cache: 'no-store', credentials: 'same-origin',
            signal: AbortSignal.any([abort.signal, AbortSignal.timeout(15_000)]),
          })
          if (response.status === 401) {
            if (alive.current && !abort.signal.aborted) setSnapshot({ data: null, loading: false, updatedAt: null, error: 'Your session has expired. Sign in again to continue.' })
            return null
          }
          if (!response.ok) throw new Error(response.status === 401
            ? 'Your session has expired. Sign in again to continue.' : 'Your account could not be refreshed. Please try again.')
          const data = await response.json() as AccountData
          if (!data.user?.id || !data.billing || !data.ai) throw new Error('Your account could not be loaded. Please try again.')
          latest = data
          if (alive.current && !abort.signal.aborted) setSnapshot({ data, loading: false, error: null, updatedAt: Date.now() })
        } catch (error) {
          if (alive.current && !abort.signal.aborted) setSnapshot(current => ({
            ...current, loading: false, error: error instanceof Error && error.name === 'Error'
              ? error.message : 'Your account could not be refreshed. Check your connection and try again.',
          }))
        }
      } while (rerun.current && alive.current && !abort.signal.aborted)
      return latest
    })()
    pending.current = request
    void request.finally(() => { if (pending.current === request) pending.current = null })
    return request
  }, [])

  useEffect(() => {
    alive.current = true
    const invalidate = () => { rerun.current = true; void refresh() }
    const visible = () => { if (document.visibilityState === 'visible') void refresh() }
    const storage = (event: StorageEvent) => { if (event.key === STORAGE_EVENT) invalidate() }
    window.addEventListener(UPDATE_EVENT, invalidate)
    window.addEventListener('focus', visible)
    window.addEventListener('storage', storage)
    document.addEventListener('visibilitychange', visible)
    const timer = window.setInterval(visible, 60_000)
    return () => {
      alive.current = false
      controller.current?.abort()
      pending.current = null
      window.clearInterval(timer)
      window.removeEventListener(UPDATE_EVENT, invalidate)
      window.removeEventListener('focus', visible)
      window.removeEventListener('storage', storage)
      document.removeEventListener('visibilitychange', visible)
    }
  }, [refresh])

  useEffect(() => { void refresh() }, [pathname, refresh])
  const value = useMemo(() => ({ ...snapshot, refresh }), [snapshot, refresh])
  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>
}

export function useAccount() {
  const context = useContext(AccountContext)
  if (!context) throw new Error('useAccount requires AccountProvider')
  return context
}
