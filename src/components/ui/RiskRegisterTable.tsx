'use client'

import React from 'react'

export interface RiskItem {
  risk: string
  probability?: 'low' | 'medium' | 'high' | string
  impact?: 'low' | 'medium' | 'high' | string
  riskLevel?: 'low' | 'medium' | 'high' | 'critical' | string
  mitigation: string
  owner?: string
  category?: string
}

export interface RiskRegisterTableProps {
  risks: RiskItem[]
  title?: string
  subtitle?: string
  badge?: string
  showOwner?: boolean
  className?: string
}

function resolveRiskLevel(item: RiskItem): 'critical' | 'high' | 'medium' | 'low' {
  if (item.riskLevel) {
    const lvl = item.riskLevel.toLowerCase()
    if (lvl === 'critical' || lvl === 'high' || lvl === 'medium' || lvl === 'low') {
      return lvl as 'critical' | 'high' | 'medium' | 'low'
    }
  }
  const prob = (item.probability || '').toLowerCase()
  const imp = (item.impact || '').toLowerCase()

  if (prob === 'high' && imp === 'high') return 'critical'
  if (prob === 'high' || imp === 'high') return 'high'
  if (prob === 'medium' && imp === 'medium') return 'medium'
  return 'low'
}

function getBadgeStyle(level: string) {
  switch (level.toLowerCase()) {
    case 'critical':
      return 'bg-red-100 text-red-800 border-red-300'
    case 'high':
      return 'bg-orange-100 text-orange-800 border-orange-300'
    case 'medium':
      return 'bg-amber-100 text-amber-800 border-amber-300'
    case 'low':
    default:
      return 'bg-emerald-100 text-emerald-800 border-emerald-300'
  }
}

export function RiskRegisterTable({
  risks = [],
  title = 'Comprehensive Risk Register',
  subtitle,
  badge = 'ASSUMPTION',
  showOwner = false,
  className = '',
}: RiskRegisterTableProps) {
  if (!risks || risks.length === 0) {
    return (
      <div className={`card-angular p-6 bg-[#FAFAF7] shadow-sm ${className}`}>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-[#0A1628]">{title}</h3>
          {badge && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded border border-[#C8A860]/40 bg-amber-50 text-amber-800">
              {badge}
            </span>
          )}
        </div>
        <p className="text-xs text-stone-500 italic">No specific risk factors cataloged for this validation profile.</p>
      </div>
    )
  }

  return (
    <div className={`card-angular p-6 bg-[#FAFAF7] shadow-sm ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div>
          <h3 className="text-sm font-semibold text-[#0A1628]">{title}</h3>
          {subtitle && <p className="text-xs text-[#1C1C1C] opacity-60 mt-0.5">{subtitle}</p>}
        </div>
        {badge && (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded border border-[#C8A860]/40 bg-amber-50 text-amber-800 uppercase tracking-wide">
            {badge}
          </span>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs text-left border-collapse">
          <thead>
            <tr className="border-b border-[#E8E0D0] bg-[#F5F0E8]/70">
              <th className="py-2.5 px-3 font-semibold text-[#0A1628]">Identified Risk</th>
              <th className="py-2.5 px-3 font-semibold text-[#0A1628] w-24">Probability</th>
              <th className="py-2.5 px-3 font-semibold text-[#0A1628] w-24">Impact</th>
              <th className="py-2.5 px-3 font-semibold text-[#0A1628] w-28">Severity</th>
              {showOwner && <th className="py-2.5 px-3 font-semibold text-[#0A1628] w-28">Owner</th>}
              <th className="py-2.5 px-3 font-semibold text-[#0A1628]">Mitigation Strategy</th>
            </tr>
          </thead>
          <tbody>
            {risks.map((item, idx) => {
              const level = resolveRiskLevel(item)
              const levelBadgeClass = getBadgeStyle(level)
              return (
                <tr
                  key={idx}
                  className="border-b border-[#E8E0D0] last:border-0 hover:bg-[#F5F0E8]/40 transition-colors"
                >
                  <td className="py-3 px-3 font-medium text-[#0A1628] align-top">
                    {item.risk}
                    {item.category && (
                      <span className="block text-[10px] text-stone-500 uppercase tracking-wider mt-0.5">
                        {item.category}
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-3 align-top whitespace-nowrap">
                    {item.probability ? (
                      <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-stone-100 text-stone-700 border border-stone-200">
                        {item.probability}
                      </span>
                    ) : (
                      <span className="text-stone-400">—</span>
                    )}
                  </td>
                  <td className="py-3 px-3 align-top whitespace-nowrap">
                    {item.impact ? (
                      <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-stone-100 text-stone-700 border border-stone-200">
                        {item.impact}
                      </span>
                    ) : (
                      <span className="text-stone-400">—</span>
                    )}
                  </td>
                  <td className="py-3 px-3 align-top whitespace-nowrap">
                    <span
                      className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded border ${levelBadgeClass}`}
                    >
                      {level}
                    </span>
                  </td>
                  {showOwner && (
                    <td className="py-3 px-3 align-top whitespace-nowrap text-stone-600">
                      {item.owner || 'Founder'}
                    </td>
                  )}
                  <td className="py-3 px-3 text-[#1C1C1C] opacity-90 leading-relaxed align-top">
                    <div className="flex items-start gap-1.5">
                      <span className="text-[#C8A860] font-bold mt-0.5 select-none">↳</span>
                      <span>{item.mitigation}</span>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
