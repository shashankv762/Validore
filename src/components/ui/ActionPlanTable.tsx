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
  return row.action || row.activity || 'Action not provided'
}

export function ActionPlanTable({
  plan = [],
  title = 'Action & Validation Plan',
  subtitle,
  badge = 'PROPOSED_STRATEGY',
  showExpectedOutput = false,
  className = '',
}: ActionPlanTableProps) {
  const rows = Array.isArray(plan) ? plan.filter(item => item && typeof item === 'object') : []
  if (rows.length === 0) {
    return (
      <div className={`card-angular p-6 bg-[#FFFFFF] shadow-sm ${className}`}>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-[#141923]">{title}</h3>
          {badge && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded border border-[#E0A526]/40 bg-purple-50 text-purple-800">
              {badge}
            </span>
          )}
        </div>
        <p className="text-xs text-stone-500 italic">No phased action steps currently scheduled.</p>
      </div>
    )
  }

  const hasExpectedOutput = showExpectedOutput || rows.some(p => Boolean(p.expectedOutput))

  return (
    <div className={`card-angular p-6 bg-[#FFFFFF] shadow-sm ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div>
          <h3 className="text-sm font-semibold text-[#141923]">{title}</h3>
          {subtitle && <p className="text-xs text-[#364152] opacity-60 mt-0.5">{subtitle}</p>}
        </div>
        {badge && (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded border border-purple-200 bg-purple-50 text-purple-800 ">
            {badge}
          </span>
        )}
      </div>

      <ol className="grid gap-4 md:hidden" aria-label={title}>
        {rows.map((row, index) => <li key={index} className="rounded-lg border border-slate-200 p-4">
          <p className="text-xs font-semibold text-[#89620B] mb-2">{resolveTimeline(row, index)}</p>
          <p className="text-sm leading-relaxed text-[#141923]">{resolveAction(row)}</p>
          <dl className="mt-4 space-y-3 text-xs leading-relaxed">
            <div><dt className="font-medium text-slate-500">Owner</dt><dd className="mt-1 text-slate-700">{row.owner || 'Not assigned'}</dd></div>
            <div><dt className="font-medium text-slate-500">Target</dt><dd className="mt-1 text-slate-700">{row.kpi || 'To be defined'}</dd></div>
            {hasExpectedOutput && <div><dt className="font-medium text-slate-500">Expected output</dt><dd className="mt-1 text-slate-700">{row.expectedOutput || 'To be defined'}</dd></div>}
          </dl>
        </li>)}
      </ol>
      <div className="hidden md:block overflow-x-auto" role="region" aria-label={title + ' table'} tabIndex={0}>
        <table className="w-full min-w-[640px] text-xs text-left border-collapse [overflow-wrap:normal]">
          <thead>
            <tr className="border-b border-[#E5E7EB] bg-[#F7F8FA]/70">
              <th className="py-2.5 px-3 font-semibold text-[#89620B] w-28  text-[11px]">
                Timeline
              </th>
              <th className="py-2.5 px-3 font-semibold text-[#141923]">Strategic Action / Milestone</th>
              <th className="py-2.5 px-3 font-semibold text-[#141923] w-32">Lead Owner</th>
              <th className="py-2.5 px-3 font-semibold text-[#141923] w-48">Target KPI / Deliverable</th>
              {hasExpectedOutput && (
                <th className="py-2.5 px-3 font-semibold text-[#141923]">Expected Output</th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => {
              const timeline = resolveTimeline(row, idx)
              const action = resolveAction(row)
              return (
                <tr
                  key={idx}
                  className="border-b border-[#E5E7EB] last:border-0 hover:bg-[#F7F8FA]/40 transition-colors"
                >
                  <td className="py-3 px-3 font-semibold text-[#89620B] whitespace-nowrap align-top">
                    {timeline}
                  </td>
                  <td className="py-3 px-3 font-medium text-[#141923] leading-relaxed align-top">
                    {action}
                  </td>
                  <td className="py-3 px-3 align-top whitespace-nowrap">
                    <span className="inline-block bg-[#F7F8FA] text-[#141923] text-[11px] px-2 py-0.5 rounded border border-[#E5E7EB]">
                      {row.owner || 'Not assigned'}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-[#364152] opacity-90 align-top">
                    {row.kpi ? (
                      <span className="tabular-nums text-[11px] bg-stone-100 text-stone-800 px-2 py-0.5 rounded border border-stone-200">
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
