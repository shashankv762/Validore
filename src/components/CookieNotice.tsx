'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { COOKIE_NOTICE_DAYS, COOKIE_NOTICE_EVENT, COOKIE_NOTICE_KEY, isCurrentCookieNotice, LEGAL } from '@/lib/legal'

export function CookieSettingsButton({ className }: { className?: string }) {
  return <button type="button" className={className} onClick={() => window.dispatchEvent(new Event(COOKIE_NOTICE_EVENT))}>Cookie settings</button>
}

export function CookieNotice() {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const sync = () => {
      try { setOpen(!isCurrentCookieNotice(JSON.parse(localStorage.getItem(COOKIE_NOTICE_KEY) || 'null'))) }
      catch { setOpen(true) }
    }
    const show = () => setOpen(true)
    sync()
    window.addEventListener(COOKIE_NOTICE_EVENT, show)
    window.addEventListener('storage', sync)
    return () => { window.removeEventListener(COOKIE_NOTICE_EVENT, show); window.removeEventListener('storage', sync) }
  }, [])
  const acknowledge = () => {
    try { localStorage.setItem(COOKIE_NOTICE_KEY, JSON.stringify({ version: LEGAL.version, acknowledgedAt: new Date().toISOString() })) } catch { /* Dismiss for this page when storage is blocked. */ }
    setOpen(false)
  }
  if (!open) return null
  return <aside className="cookie-notice" aria-labelledby="cookie-notice-title">
    <div className="cookie-notice-symbol"><ShieldCheck size={21} aria-hidden="true" /></div>
    <div className="cookie-notice-copy"><h2 id="cookie-notice-title">Your storage choices.</h2>
      <p>We use storage for sign-in, security, and saving your work. Optional rewarded ads load only when you choose to watch one in Credits. This notice does not accept advertising cookies. We remember it for {COOKIE_NOTICE_DAYS} days.</p>
      <Link href="/legal/cookies">Read our cookie policy</Link>
    </div>
    <button type="button" className="button button-navy" onClick={acknowledge}>Got it</button>
  </aside>
}
