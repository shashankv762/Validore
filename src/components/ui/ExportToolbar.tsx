'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  FileText,
  Table,
  Presentation,
  Shield,
  Archive,
  Lock,
  Loader2,
  Download,
} from 'lucide-react'

export type ExportFormat = 'pdf' | 'csv' | 'pptx' | 'white-label-pdf' | 'portfolio-zip'

export interface ExportToolbarProps {
  tier?: 'free' | 'premium' | 'max_premium'
  reportId?: string
  ideaId?: string
  deckId?: string
  deckType?: 'validation' | 'crowdfunding' | 'pitch' | 'pricing'
  formats?: ExportFormat[]
  className?: string
  compact?: boolean
}

interface FormatMeta {
  label: string
  icon: React.ComponentType<{ className?: string }>
  minTier: 'premium' | 'max_premium'
  tooltip: string
  defaultFilename: string
}

const FORMAT_CONFIG: Record<ExportFormat, FormatMeta> = {
  pdf: {
    label: 'Download PDF',
    icon: FileText,
    minTier: 'premium',
    tooltip: 'Requires Pro Plan ($29/mo)',
    defaultFilename: 'validore-report.pdf',
  },
  csv: {
    label: 'Download CSV',
    icon: Table,
    minTier: 'premium',
    tooltip: 'Requires Pro Plan ($29/mo)',
    defaultFilename: 'validore-data.csv',
  },
  pptx: {
    label: 'Download PPTX',
    icon: Presentation,
    minTier: 'max_premium',
    tooltip: 'Requires Max Plan ($79/mo)',
    defaultFilename: 'validore-presentation.pptx',
  },
  'white-label-pdf': {
    label: 'White-Label PDF',
    icon: Shield,
    minTier: 'max_premium',
    tooltip: 'Requires Max Plan ($79/mo)',
    defaultFilename: 'executive-summary.pdf',
  },
  'portfolio-zip': {
    label: 'Portfolio ZIP',
    icon: Archive,
    minTier: 'max_premium',
    tooltip: 'Requires Max Plan ($79/mo)',
    defaultFilename: 'startup-portfolio.zip',
  },
}

export function ExportToolbar({
  tier: initialTier,
  reportId,
  ideaId,
  deckId,
  deckType = 'validation',
  formats = ['pdf', 'csv', 'pptx'],
  className = '',
  compact = false,
}: ExportToolbarProps) {
  const router = useRouter()
  const [fetchedTier, setFetchedTier] = useState<'free' | 'premium' | 'max_premium'>('free')
  const currentTier = initialTier || fetchedTier
  const [loadingFormat, setLoadingFormat] = useState<ExportFormat | null>(null)

  // Fetch tier if not provided
  useEffect(() => {
    if (initialTier) return
    fetch('/api/me')
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (data?.user?.tier) {
          setFetchedTier(data.user.tier)
        }
      })
      .catch(() => {})
  }, [initialTier])

  const isTierEligible = (minTier: 'premium' | 'max_premium'): boolean => {
    if (currentTier === 'max_premium') return true
    if (minTier === 'premium' && currentTier === 'premium') return true
    return false
  }

  const handleExport = async (format: ExportFormat) => {
    const config = FORMAT_CONFIG[format]
    const eligible = isTierEligible(config.minTier)

    if (!eligible) {
      toast.info(
        `Export format locked. ${config.tooltip}. Visit Settings to upgrade your plan.`,
        {
          action: {
            label: 'View Plans',
            onClick: () => {
              router.push('/dashboard/settings')
            },
          },
        }
      )
      return
    }

    // Build URL
    let url = ''
    if (format === 'pdf') {
      const id = reportId || ideaId
      if (!id) {
        toast.error('A report or idea must be selected to export PDF.')
        return
      }
      const paramKey = reportId ? 'reportId' : 'ideaId'
      url = `/api/export/pdf?${paramKey}=${encodeURIComponent(id)}`
    } else if (format === 'csv') {
      const id = reportId || ideaId
      if (!id) {
        toast.error('A report or idea must be selected to export CSV.')
        return
      }
      const paramKey = reportId ? 'reportId' : 'ideaId'
      url = `/api/export/csv?${paramKey}=${encodeURIComponent(id)}`
    } else if (format === 'white-label-pdf') {
      if (!reportId) {
        toast.error('A validation report must be generated or selected to export White-label PDF.')
        return
      }
      url = `/api/export/pdf/white-label?reportId=${encodeURIComponent(reportId)}`
    } else if (format === 'pptx') {
      const params = new URLSearchParams()
      if (deckId) params.set('deckId', deckId)
      else if (ideaId) params.set('ideaId', ideaId)
      else {
        toast.error('An idea or pitch deck selection is required to export PPTX.')
        return
      }
      if (deckType) params.set('deckType', deckType)
      if (reportId) params.set('reportId', reportId)
      url = `/api/export/pptx?${params.toString()}`
    } else if (format === 'portfolio-zip') {
      const params = new URLSearchParams()
      if (ideaId) params.set('ideaId', ideaId)
      else if (reportId) params.set('reportId', reportId)
      url = `/api/export/portfolio${params.toString() ? `?${params.toString()}` : ''}`
    }

    try {
      setLoadingFormat(format)
      const res = await fetch(url)

      if (res.status === 401) {
        toast.error('Please sign in to download exports.')
        return
      }

      if (res.status === 403) {
        toast.error('Upgrade required to download this export format.')
        return
      }

      if (!res.ok) {
        const errorJson = await res.json().catch(() => null)
        const errMsg = errorJson?.error || 'Export failed. Ensure data has been generated.'
        toast.error(errMsg)
        return
      }

      // Extract filename from Content-Disposition header if available
      let filename = config.defaultFilename
      const disposition = res.headers.get('content-disposition')
      if (disposition && disposition.includes('filename=')) {
        const match = disposition.match(/filename="?([^";]+)"?/)
        if (match && match[1]) {
          filename = match[1].trim()
        }
      }

      const blob = await res.blob()
      const downloadUrl = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = downloadUrl
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(downloadUrl)

      toast.success(`${config.label} download complete!`)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Network error'
      toast.error(`Download failed: ${msg}`)
    } finally {
      setLoadingFormat(null)
    }
  }

  return (
    <div
      className={`inline-flex flex-wrap items-center gap-2 p-1.5 bg-[#FAFAF7] border border-[#E8E0D0] rounded ${className}`}
      role="toolbar"
      aria-label="Export options"
    >
      <span className="text-[11px] font-semibold uppercase tracking-wider text-[#1C1C1C]/60 px-2 flex items-center gap-1.5">
        <Download className="w-3.5 h-3.5 text-[#C8A860]" />
        <span>Export</span>
      </span>

      {formats.map(format => {
        const config = FORMAT_CONFIG[format]
        const eligible = isTierEligible(config.minTier)
        const isLoading = loadingFormat === format
        const Icon = config.icon

        return (
          <button
            key={format}
            type="button"
            onClick={() => handleExport(format)}
            disabled={isLoading}
            title={eligible ? config.label : config.tooltip}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-all ${
              compact ? 'px-2 py-1 text-[11px]' : ''
            } ${
              eligible
                ? 'bg-white text-[#0A1628] hover:bg-[#0A1628] hover:text-[#FAFAF7] border border-[#E8E0D0] shadow-sm hover:border-[#0A1628]'
                : 'bg-[#F5F0E8]/70 text-[#1C1C1C]/50 hover:text-[#1C1C1C]/80 border border-[#E8E0D0]/80 cursor-pointer'
            } disabled:opacity-50`}
          >
            {isLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-[#C8A860]" />
            ) : eligible ? (
              <Icon className="w-3.5 h-3.5 text-[#C8A860]" />
            ) : (
              <Lock className="w-3 h-3 text-[#1C1C1C]/40" />
            )}
            <span>{config.label}</span>
            {!eligible && (
              <span className="ml-1 text-[9px] uppercase px-1 py-0.2 rounded bg-[#C8A860]/15 text-[#96792b] font-semibold">
                {config.minTier === 'max_premium' ? 'Max' : 'Pro'}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
