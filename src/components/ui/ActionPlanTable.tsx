'use client'

import React from 'react'

export interface ActionPlanRow {
  week?: string
  phase?: string
  step?: number | string
  action?: string
  activity?: string
  owner?: string
  kpi?: string
  expectedOutput?: string
  timeframe?: string
}

export interface ActionPlanTableProps {
  plan: ActionPlanRow[]
  title?: string
  subtitle?: string
  badge?: string
  showExpectedOutput?: boolean
  className?: string
}

function resolveTimeline(row: ActionPlanRow, index: number): string {
  if (row.week) return row.week
  if (row.phase) return row.phase
  if (row.timeframe) return row.timeframe
  if (row.step !== undefined) return `Step ${row.step}`
  return `Phase ${index + 1}`
}

function resolveAction(row: ActionPlanRow): string {
  return row.action || row.activity || 'Validation action item'
}

export function ActionPlanTable({
  plan = [],
  title = 'Action & Validation Plan',
  subtitle,
  badge = 'PROPOSED_STRATEGY',
  showExpectedOutput = false,
  className = '',
}: ActionPlanTableProps) {
  if (!plan || plan.length === 0) {
    return (
      <div className={`card-angular p-6 bg-[#FAFAF7] shadow-sm ${className}`}>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-[#0A1628]">{title}</h3>
          {badge && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded border border-[#C8A860]/40 bg-purple-50 text-purple-800">
              {badge}
            </span>
          )}
        </div>
        <p className="text-xs text-stone-500 italic">No phased action steps currently scheduled.</p>
      </div>
    )
  }

  const hasExpectedOutput = showExpectedOutput || plan.some(p => Boolean(p.expectedOutput))

  return (
    <div className={`card-angular p-6 bg-[#FAFAF7] shadow-sm ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div>
          <h3 className="text-sm font-semibold text-[#0A1628]">{title}</h3>
          {subtitle && <p className="text-xs text-[#1C1C1C] opacity-60 mt-0.5">{subtitle}</p>}
        </div>
        {badge && (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded border border-purple-200 bg-purple-50 text-purple-800 uppercase tracking-wide">
            {badge}
          </span>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs text-left border-collapse">
          <thead>
            <tr className="border-b border-[#E8E0D0] bg-[#F5F0E8]/70">
              <th className="py-2.5 px-3 font-semibold text-[#96792b] w-28 uppercase tracking-wider text-[11px]">
                Timeline
              </th>
              <th className="py-2.5 px-3 font-semibold text-[#0A1628]">Strategic Action / Milestone</th>
              <th className="py-2.5 px-3 font-semibold text-[#0A1628] w-32">Lead Owner</th>
              <th className="py-2.5 px-3 font-semibold text-[#0A1628] w-48">Target KPI / Deliverable</th>
              {hasExpectedOutput && (
                <th className="py-2.5 px-3 font-semibold text-[#0A1628]">Expected Output</th>
              )}
            </tr>
          </thead>
          <tbody>
            {plan.map((row, idx) => {
              const timeline = resolveTimeline(row, idx)
              const action = resolveAction(row)
              return (
                <tr
                  key={idx}
                  className="border-b border-[#E8E0D0] last:border-0 hover:bg-[#F5F0E8]/40 transition-colors"
                >
                  <td className="py-3 px-3 font-semibold text-[#96792b] whitespace-nowrap align-top">
                    {timeline}
                  </td>
                  <td className="py-3 px-3 font-medium text-[#0A1628] leading-relaxed align-top">
                    {action}
                  </td>
                  <td className="py-3 px-3 align-top whitespace-nowrap">
                    <span className="inline-block bg-[#F5F0E8] text-[#0A1628] text-[11px] px-2 py-0.5 rounded border border-[#E8E0D0]">
                      {row.owner || 'Founder / Team'}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-[#1C1C1C] opacity-90 align-top">
                    {row.kpi ? (
                      <span className="font-mono text-[11px] bg-stone-100 text-stone-800 px-2 py-0.5 rounded border border-stone-200">
                        {row.kpi}
                      </span>
                    ) : (
                      <span className="text-stone-400">—</span>
                    )}
                  </td>
                  {hasExpectedOutput && (
                    <td className="py-3 px-3 text-stone-600 align-top leading-relaxed">
                      {row.expectedOutput || '—'}
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
