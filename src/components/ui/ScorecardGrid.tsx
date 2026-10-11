'use client'

import React from 'react'

export interface ScorecardItem {
  label: string
  score: number
  maxScore?: number
  rationale?: string
  status?: string
}

export interface ScorecardGridProps {
  scores: ScorecardItem[]
  columns?: 2 | 3 | 4 | 5
  title?: string
  subtitle?: string
  badge?: string
  className?: string
}

export function ScorecardGrid({
  scores = [],
  columns = 4,
  title,
  subtitle,
  badge,
  className = '',
}: ScorecardGridProps) {
  if (!scores || scores.length === 0) return null

  const gridColsClass =
    columns === 2
      ? 'grid-cols-1 sm:grid-cols-2'
      : columns === 3
      ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
      : columns === 5
      ? 'grid-cols-2 sm:grid-cols-3 md:grid-cols-5'
      : 'grid-cols-2 sm:grid-cols-2 md:grid-cols-4'

  return (
    <div className={className}>
      {(title || subtitle || badge) && (
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div>
            {title && <h3 className="text-sm font-semibold text-[#0A1628]">{title}</h3>}
            {subtitle && <p className="text-xs text-[#1C1C1C] opacity-60 mt-0.5">{subtitle}</p>}
          </div>
          {badge && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded border border-[#C8A860]/40 bg-amber-50 text-amber-800 uppercase tracking-wide">
              {badge}
            </span>
          )}
        </div>
      )}

      <div className={`grid ${gridColsClass} gap-3`}>
        {scores.map((item, idx) => {
          const max = item.maxScore || (item.score <= 15 ? 15 : item.score <= 20 ? 20 : 100)
          const pct = Math.min(100, Math.max(0, (item.score / max) * 100))
          const color =
            pct >= 75 ? '#22c55e' : pct >= 50 ? '#C8A860' : '#ef4444'

          return (
            <div
              key={idx}
              className="card-angular p-3.5 bg-[#FAFAF7] border border-[#E8E0D0] hover:border-[#C8A860] transition-colors shadow-sm"
            >
              <div
                className="text-[11px] font-medium uppercase tracking-wider text-[#1C1C1C] opacity-70 mb-1.5 truncate"
                title={item.label}
              >
                {item.label}
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-xl font-light" style={{ color }}>
                  {item.score}
                </span>
                <span className="text-[10px] text-stone-400 font-mono">/{max}</span>
              </div>
              <div className="mt-2 h-1 w-full bg-[#E8E0D0] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${pct}%`, backgroundColor: color }}
                />
              </div>
              {item.rationale && (
                <p className="text-[10px] text-stone-500 mt-2 leading-tight line-clamp-2">
                  {item.rationale}
                </p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
