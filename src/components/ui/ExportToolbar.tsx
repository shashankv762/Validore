'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { FileText, FileDown, Table, Presentation, Shield, Archive, Lock, Loader2, type LucideIcon } from 'lucide-react'
import { useOptionalAccount, type AccountData } from '@/components/AccountProvider'

export type ExportFormat = 'pdf' | 'docx' | 'csv' | 'pptx' | 'white-label-pdf' | 'portfolio-zip'
type Tier = 'free' | 'premium' | 'max_premium'
export interface ExportToolbarProps {
  tier?: Tier
  reportId?: string
  canvasId?: string
  ideaId?: string
  deckId?: string
  simulationId?: string
  analysisId?: string
  deckType?: 'validation' | 'crowdfunding' | 'pitch' | 'pricing'
  formats?: ExportFormat[]
  className?: string
  compact?: boolean
}
const FORMATS: Record<ExportFormat, { label: string; icon: LucideIcon; tier: Tier; mime: string; filename: string }> = {
  pdf: { label: 'Download PDF', icon: FileDown, tier: 'free', mime: 'application/pdf', filename: 'validore-report.pdf' },
  docx: { label: 'Download Word', icon: FileText, tier: 'free', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', filename: 'validore-report.docx' },
  csv: { label: 'CSV', icon: Table, tier: 'premium', mime: 'text/csv', filename: 'validore-data.csv' },
  pptx: { label: 'PowerPoint', icon: Presentation, tier: 'max_premium', mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', filename: 'validore-deck.pptx' },
  'white-label-pdf': { label: 'Unbranded PDF', icon: Shield, tier: 'max_premium', mime: 'application/pdf', filename: 'startup-report.pdf' },
  'portfolio-zip': { label: 'Portfolio ZIP', icon: Archive, tier: 'max_premium', mime: 'application/zip', filename: 'startup-portfolio.zip' },
}

export function ExportToolbar({ tier, reportId, canvasId, ideaId, deckId, simulationId, analysisId, deckType = 'validation',
  formats = ['pdf', 'docx', 'csv', 'pptx'], className = '', compact = false }: ExportToolbarProps) {
  const router = useRouter()
  const account = useOptionalAccount()
  const [snapshot, setSnapshot] = useState<AccountData | null>(null)
  const [accountTier, setAccountTier] = useState<Tier>('free')
  const [busy, setBusy] = useState<ExportFormat | null>(null)
  const active = useRef(false)
  useEffect(() => {
    if (account || tier) return
    const controller = new AbortController()
    fetch('/api/me', { signal: controller.signal }).then(response => response.ok ? response.json() : null)
      .then(data => { if (data?.user?.tier && !controller.signal.aborted) { setAccountTier(data.user.tier); setSnapshot(data) } }).catch(() => {})
    return () => controller.abort()
  }, [account, tier])
  const profile = account?.data ?? snapshot
  const feature = { csv: 'canExportCsv', pptx: 'canExportPptx', 'white-label-pdf': 'canWhitelabelPdf', 'portfolio-zip': 'canPortfolioExport' } as const
  const allowed = (format: ExportFormat) => {
    if (profile?.user.unlimited || (format === 'pptx' && Boolean(deckId))) return true
    if (format === 'docx') return true
    if (format === 'pdf') return profile?.plan?.canExportPdf ?? true
    if (format in feature && profile?.plan?.[feature[format as keyof typeof feature]] !== undefined) return profile.plan[feature[format as keyof typeof feature]] === true
    const actualTier = profile?.user.tier ?? tier ?? accountTier
    return actualTier === 'max_premium' || (FORMATS[format].tier === 'premium' && actualTier === 'premium')
  }

  async function download(format: ExportFormat) {
    if (active.current) return
    const config = FORMATS[format]
    if (!allowed(format)) {
      toast.info('This format is not included in your current plan.', { action: { label: 'View plans', onClick: () => router.push('/dashboard/settings') } })
      return
    }
    const params = new URLSearchParams()
    let route: string = format
    if (format === 'pdf' || format === 'docx' || format === 'csv') {
      const documentKind = canvasId ? 'canvas' : deckType
      params.set('module', documentKind)
      if (canvasId && ideaId) { params.set('canvasId', canvasId); params.set('ideaId', ideaId) }
      else if (simulationId && documentKind === 'pricing') params.set('simulationId', simulationId)
      else if (analysisId && documentKind === 'crowdfunding') params.set('analysisId', analysisId)
      else if (deckId && documentKind === 'pitch' && format !== 'csv') params.set('deckId', deckId)
      else if (reportId && documentKind === 'validation') params.set('reportId', reportId)
      else if (ideaId) params.set('ideaId', ideaId)
      else { toast.info('Select a saved report to download.'); return }
    } else if (format === 'white-label-pdf') {
      if (!reportId) { toast.info('Select a validation report first.'); return }
      route = 'pdf/white-label'; params.set('reportId', reportId)
    } else if (format === 'pptx') {
      if (simulationId && deckType === 'pricing') params.set('simulationId', simulationId)
      else if (analysisId && deckType === 'crowdfunding') params.set('analysisId', analysisId)
      else if (deckId) params.set('deckId', deckId)
      else if (ideaId) params.set('ideaId', ideaId)
      else { toast.info('Select an idea or pitch deck first.'); return }
      if (reportId) params.set('reportId', reportId)
      params.set('deckType', deckType)
    } else {
      route = 'portfolio'
      if (deckId) params.set('deckId', deckId)
      else if (ideaId) params.set('ideaId', ideaId)
      else if (reportId) params.set('reportId', reportId)
    }
    active.current = true
    setBusy(format)
    try {
      const response = await fetch('/api/export/' + route + '?' + params, { signal: AbortSignal.timeout(60000) })
      if (!response.ok) {
        const data = await response.json().catch(() => null)
        throw new Error(typeof data?.error === 'string' ? data.error : response.status === 401 ? 'Sign in again to download your report.' : 'Your document could not be prepared. Try again.')
      }
      if (!response.headers.get('content-type')?.includes(config.mime)) throw new Error('The server did not return the expected document. Please try again.')
      const blob = await response.blob()
      if (!blob.size) throw new Error('The document was empty. Please try again.')
      const filename = response.headers.get('content-disposition')?.match(/filename="?([^";]+)"?/)?.[1] || config.filename
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url; anchor.download = filename
      document.body.appendChild(anchor); anchor.click(); anchor.remove()
      // Safari needs the URL to remain alive while the download starts.
      setTimeout(() => URL.revokeObjectURL(url), 30000)
      toast.success('Your download is ready.')
    } catch (error) {
      toast.error(error instanceof Error && error.name !== 'TimeoutError' ? error.message : 'The download timed out. Please try again.')
    } finally { active.current = false; setBusy(null) }
  }

  return <div className={'report-downloads ' + (compact ? 'report-downloads-compact ' : '') + className} role="group" aria-label="Download report">
    {formats.map(format => {
      const meta = FORMATS[format]
      const Icon = meta.icon
      const eligible = allowed(format)
      return <button key={format} type="button" onClick={() => void download(format)} disabled={busy !== null}
        className={'report-download-button ' + (format === 'pdf' ? 'report-download-primary' : '')}
        title={eligible ? meta.label : 'Not included in your current plan'}
        aria-busy={busy === format}>
        {busy === format ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : eligible ? <Icon size={16} aria-hidden="true" /> : <Lock size={14} aria-hidden="true" />}
        <span>{busy === format ? 'Preparing…' : meta.label}</span>
        {!eligible && <span className="format-tier">Plan access</span>}
      </button>
    })}
    <span className="sr-only" role="status">{busy ? 'Preparing your document.' : ''}</span>
  </div>
}
