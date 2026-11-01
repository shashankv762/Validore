'use client'

import Link from 'next/link'
import { useRef, useState } from 'react'
import { Download, Loader2, ShieldCheck } from 'lucide-react'
import { CookieSettingsButton } from './CookieNotice'
import { LEGAL } from '@/lib/legal'
import { EXPORT_SECTIONS } from '@/lib/privacy-export'

export function PrivacyControls() {
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const active = useRef(false)
  const download = async () => {
    if (active.current) return
    active.current = true; setBusy(true); setError(''); setStatus('Preparing your account export…')
    const get = async (path: string) => {
      const response = await fetch(path, { cache: 'no-store', signal: AbortSignal.timeout(30_000) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Your export could not be completed.')
      return data
    }
    try {
      const account = await get('/api/me/data')
      const collections: Record<string, unknown[]> = {}
      let size = 0
      for (const section of EXPORT_SECTIONS) {
        setStatus('Collecting ' + section.replace(/([A-Z])/g, ' $1').toLowerCase() + '…')
        const records: unknown[] = []
        let cursor: string | null = null
        const visited = new Set<string>()
        do {
          const page = await get('/api/me/data?section=' + section + (cursor ? '&after=' + encodeURIComponent(cursor) : ''))
          if (!Array.isArray(page.records)) throw new Error('An export page is incomplete. Please try again.')
          size += JSON.stringify(page.records).length
          if (size > 30_000_000) throw new Error('Your archive is large. Contact the privacy address for an assisted export.')
          records.push(...page.records)
          cursor = typeof page.nextCursor === 'string' ? page.nextCursor : null
          if (cursor) { if (visited.has(cursor)) throw new Error('Export pagination could not finish. Please try again.'); visited.add(cursor) }
        } while (cursor)
        collections[section] = records
      }
      const blob = new Blob([JSON.stringify({ ...account, collections }, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url; anchor.download = 'validore-account-' + new Date().toISOString().slice(0, 10) + '.json'
      document.body.appendChild(anchor); anchor.click(); anchor.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      setStatus('Your account export is ready. Keep the downloaded file private.')
    } catch (error) { setError(error instanceof Error ? error.message : 'Your export could not complete.'); setStatus('') }
    finally { active.current = false; setBusy(false) }
  }
  return <section className="card-angular p-6"><div className="flex items-center gap-2 mb-3"><ShieldCheck size={17} aria-hidden="true" /><h2 className="text-base font-medium">Your data & privacy</h2></div>
    <p className="text-sm leading-relaxed text-[#64705d]">Download your briefs, founder answers, reports, and account activity. You can clear an interview from its founder-notes page. For account closure, correction, or deletion of saved work, contact <a className="underline underline-offset-4" href={'mailto:' + LEGAL.contact + '?subject=Validore%20privacy%20request'}>{LEGAL.contact}</a> from your account address.</p>
    <div className="flex flex-wrap items-center gap-5 mt-5"><button type="button" className="workspace-button-secondary" disabled={busy} onClick={() => void download()}>{busy ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Download size={15} aria-hidden="true" />}{busy ? 'Preparing export…' : 'Download my data'}</button><CookieSettingsButton className="workspace-text-link text-xs" /><Link href="/legal/privacy" className="workspace-text-link text-xs">Privacy policy</Link></div>
    {status && <p role="status" className="text-xs mt-4 text-[#68785c]">{status}</p>}{error && <p role="alert" className="text-sm mt-4 text-red-700">{error}</p>}
  </section>
}
