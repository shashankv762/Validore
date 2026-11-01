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

function resolveRiskLevel(item: RiskItem): 'critical' | 'high' | 'medium' | 'low' | 'unassessed' {
  if (typeof item.riskLevel === 'string') {
    const lvl = item.riskLevel.toLowerCase()
    if (lvl === 'critical' || lvl === 'high' || lvl === 'medium' || lvl === 'low') {
      return lvl as 'critical' | 'high' | 'medium' | 'low'
    }
  }
  const prob = typeof item.probability === 'string' ? item.probability.toLowerCase() : ''
  const imp = typeof item.impact === 'string' ? item.impact.toLowerCase() : ''
  if (!['low', 'medium', 'high'].includes(prob) || !['low', 'medium', 'high'].includes(imp)) return 'unassessed'

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
      return 'bg-emerald-100 text-emerald-800 border-emerald-300'
    default:
      return 'bg-stone-100 text-stone-700 border-stone-300'
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
  const rows = Array.isArray(risks) ? risks.filter(item => item && typeof item === 'object') : []
  if (rows.length === 0) {
    return (
      <div className={`card-angular p-6 bg-[#FFFFFF] shadow-sm ${className}`}>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-[#141923]">{title}</h3>
          {badge && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded border border-[#E0A526]/40 bg-amber-50 text-amber-800">
              {badge}
            </span>
          )}
        </div>
        <p className="text-xs text-stone-500 italic">No specific risk factors cataloged for this validation profile.</p>
      </div>
    )
  }

  return (
    <div className={`card-angular p-6 bg-[#FFFFFF] shadow-sm ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div>
          <h3 className="text-sm font-semibold text-[#141923]">{title}</h3>
          {subtitle && <p className="text-xs text-[#364152] opacity-60 mt-0.5">{subtitle}</p>}
        </div>
        {badge && (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded border border-[#E0A526]/40 bg-amber-50 text-amber-800 ">
            {badge}
          </span>
        )}
      </div>

      <ul className="grid gap-4 md:hidden" aria-label={title}>
        {rows.map((item, index) => {
          const level = resolveRiskLevel(item)
          return <li key={index} className="rounded-lg border border-slate-200 p-4">
            <span className={`inline-block rounded border px-2 py-1 text-[11px] capitalize ${getBadgeStyle(level)}`}>{level}</span>
            <p className="text-sm font-medium leading-relaxed mt-3 text-[#141923]">{item.risk}</p>
            <p className="text-xs leading-relaxed text-slate-500 mt-2">Probability: {item.probability || 'Unassessed'} · Impact: {item.impact || 'Unassessed'}</p>
            <div className="mt-4 border-t border-slate-100 pt-3 text-xs leading-relaxed"><p className="font-medium text-slate-500 mb-1">Mitigation</p><p className="text-slate-700">{item.mitigation || 'Mitigation not provided'}</p></div>
            {showOwner && <p className="text-xs text-slate-500 mt-3">Owner: {item.owner || 'Not assigned'}</p>}
          </li>
        })}
      </ul>
      <div className="hidden md:block overflow-x-auto" role="region" aria-label={title + ' table'} tabIndex={0}>
        <table className="w-full min-w-[640px] text-xs text-left border-collapse [overflow-wrap:normal]">
          <thead>
            <tr className="border-b border-[#E5E7EB] bg-[#F7F8FA]/70">
              <th className="py-2.5 px-3 font-semibold text-[#141923]">Identified Risk</th>
              <th className="py-2.5 px-3 font-semibold text-[#141923] w-24">Probability</th>
              <th className="py-2.5 px-3 font-semibold text-[#141923] w-24">Impact</th>
              <th className="py-2.5 px-3 font-semibold text-[#141923] w-28">Severity</th>
              {showOwner && <th className="py-2.5 px-3 font-semibold text-[#141923] w-28">Owner</th>}
              <th className="py-2.5 px-3 font-semibold text-[#141923]">Mitigation Strategy</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((item, idx) => {
              const level = resolveRiskLevel(item)
              const levelBadgeClass = getBadgeStyle(level)
              return (
                <tr
                  key={idx}
                  className="border-b border-[#E5E7EB] last:border-0 hover:bg-[#F7F8FA]/40 transition-colors"
                >
                  <td className="py-3 px-3 font-medium text-[#141923] align-top">
                    {item.risk}
                    {item.category && (
                      <span className="block text-[10px] text-stone-500  mt-0.5">
                        {item.category}
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-3 align-top whitespace-nowrap">
                    {item.probability ? (
                      <span className="text-[10px] tabular-nums  px-2 py-0.5 rounded bg-stone-100 text-stone-700 border border-stone-200">
                        {item.probability}
                      </span>
                    ) : (
                      <span className="text-stone-400">—</span>
                    )}
                  </td>
                  <td className="py-3 px-3 align-top whitespace-nowrap">
                    {item.impact ? (
                      <span className="text-[10px] tabular-nums  px-2 py-0.5 rounded bg-stone-100 text-stone-700 border border-stone-200">
                        {item.impact}
                      </span>
                    ) : (
                      <span className="text-stone-400">—</span>
                    )}
                  </td>
                  <td className="py-3 px-3 align-top whitespace-nowrap">
                    <span
                      className={`text-[10px] font-bold  px-2 py-0.5 rounded border ${levelBadgeClass}`}
                    >
                      {level}
                    </span>
                  </td>
                  {showOwner && (
                    <td className="py-3 px-3 align-top whitespace-nowrap text-stone-600">
                      {item.owner || 'Not assigned'}
                    </td>
                  )}
                  <td className="py-3 px-3 text-[#364152] opacity-90 leading-relaxed align-top">
                    <div className="flex items-start gap-1.5">
                      <span className="text-[#E0A526] font-bold mt-0.5 select-none">↳</span>
                      <span>{item.mitigation || 'Mitigation not provided'}</span>
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
