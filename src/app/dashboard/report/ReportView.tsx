'use client'

import React, { useEffect, useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts'
import Link from 'next/link'
import Image from 'next/image'

export default function ReportView({ report, isSharePage = false }: { report: any, isSharePage?: boolean }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const {
    overallScore = 0,
    decision = 'N/A',
    problemScore = 0,
    customerScore = 0,
    marketScore = 0,
    competitiveScore = 0,
    wtpScore = 0,
    businessModelScore = 0,
    financialScore = 0,
    executionScore = 0,
    decisionReasons = [],
    reportData = {}
  } = report || {}

  const competitors = Array.isArray(reportData?.competitors) ? reportData.competitors : [
    { name: 'Competitor A', strength: 'High', weakness: 'Expensive', threatLevel: 'High' },
    { name: 'Competitor B', strength: 'Brand presence', weakness: 'Poor UI', threatLevel: 'Medium' }
  ]

  const financials = Array.isArray(reportData?.financials) && reportData.financials.length > 0 ? reportData.financials : [
    { month: 'Month 1', revenue: 0, costs: 5000 },
    { month: 'Month 6', revenue: 12000, costs: 8000 },
    { month: 'Month 12', revenue: 45000, costs: 22000 },
    { month: 'Month 18', revenue: 95000, costs: 35000 },
    { month: 'Month 24', revenue: 180000, costs: 60000 },
  ]

  const getScoreColor = (score: number) => {
    if (score >= 80) return '#22c55e'
    if (score >= 50) return '#f97316'
    return '#ef4444'
  }

  const color = getScoreColor(overallScore)

  return (
    <div className="max-w-6xl mx-auto px-4 py-12" style={{ background: 'var(--cream, #F5F0E8)' }}>
      {isSharePage && (
        <div className="mb-12 flex items-center justify-between border-b border-[#E8E0D0] pb-6">
          <Link href="/" className="flex items-center gap-3">
            <Image src="/logo/aurexa-icon.svg" alt="Aurexa Logo" width={36} height={36} />
            <span className="text-xl font-light tracking-widest text-[#1C1C1C]">aurexa</span>
          </Link>
          <Link href="/auth/signup" className="px-5 py-2 text-sm font-medium text-[#0A1628] rounded focus:ring-2 focus:ring-[#0A1628] outline-none" style={{ background: 'var(--gold-gradient)' }}>
            Start Free
          </Link>
        </div>
      )}

      <div className="flex flex-col md:flex-row gap-8 items-start mb-12">
        {/* Score Gauge */}
        <div className="card-angular p-8 bg-[#FAFAF7] w-full md:w-1/3 flex flex-col items-center justify-center relative shadow-sm">
           <h2 className="text-sm font-semibold text-[#0A1628] uppercase tracking-widest mb-6">Validation Score</h2>
           <div className="relative w-48 h-48 flex items-center justify-center">
             <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
               <circle cx="50" cy="50" r="45" fill="none" stroke="#E8E0D0" strokeWidth="8" />
               <circle 
                 cx="50" cy="50" r="45" fill="none" stroke={color} strokeWidth="8"
                 strokeDasharray="283"
                 strokeDashoffset={mounted ? 283 - (283 * overallScore) / 100 : 283}
                 className="transition-all duration-1000 ease-out"
               />
             </svg>
             <div className="absolute flex flex-col items-center justify-center">
                <span className="text-5xl font-light text-[#0A1628]">{overallScore}</span>
                <span className="text-xs text-[#1C1C1C] opacity-60 mt-1">/ 100</span>
             </div>
           </div>
           <div className="mt-6 text-center">
              <span className="text-sm font-medium px-4 py-1.5 rounded-full" style={{ background: `${color}15`, color }}>
                DECISION: {decision}
              </span>
           </div>
        </div>

        {/* Section Cards */}
        <div className="w-full md:w-2/3 grid grid-cols-2 md:grid-cols-4 gap-4">
           {[
             { label: 'Problem', score: problemScore },
             { label: 'Customer', score: customerScore },
             { label: 'Market', score: marketScore },
             { label: 'Competitive', score: competitiveScore },
             { label: 'WTP', score: wtpScore },
             { label: 'Business', score: businessModelScore },
             { label: 'Financial', score: financialScore },
             { label: 'Execution', score: executionScore },
           ].map(s => (
             <div key={s.label} className="card-angular p-4 bg-[#FAFAF7] shadow-sm">
                <div className="text-xs text-[#1C1C1C] opacity-70 mb-2 uppercase tracking-wide">{s.label}</div>
                <div className="text-2xl font-light text-[#0A1628]" style={{ color: getScoreColor(s.score) }}>{s.score}</div>
             </div>
           ))}
        </div>
      </div>

      {/* Decision Reasons */}
      <div className="card-angular p-8 bg-[#FAFAF7] mb-8 shadow-sm">
        <h2 className="text-lg font-medium text-[#0A1628] mb-6 flex items-center gap-2">
          <span className="text-[#C8A860]">◈</span> Decision Rationale
        </h2>
        <ul className="space-y-4">
          {decisionReasons.length > 0 ? decisionReasons.map((reason: string, i: number) => (
            <li key={i} className="flex gap-4 items-start text-sm text-[#1C1C1C] leading-relaxed">
              <span className="text-[#C8A860] mt-1 font-bold">→</span>
              <span>{reason}</span>
            </li>
          )) : (
            <p className="text-sm text-[#1C1C1C] opacity-60">No specific rationale provided for this report.</p>
          )}
        </ul>
      </div>

      {/* Competitor Table */}
      <div className="card-angular p-8 bg-[#FAFAF7] mb-8 shadow-sm overflow-x-auto">
        <h2 className="text-lg font-medium text-[#0A1628] mb-6 flex items-center gap-2">
          <span className="text-[#C8A860]">◈</span> Competitor Analysis
        </h2>
        <table className="w-full text-left text-sm text-[#1C1C1C]">
          <thead className="bg-[#F5F0E8] text-[#1C1C1C] uppercase text-xs">
            <tr>
              <th className="px-4 py-3 rounded-tl">Competitor</th>
              <th className="px-4 py-3">Strength</th>
              <th className="px-4 py-3">Weakness</th>
              <th className="px-4 py-3 rounded-tr">Threat Level</th>
            </tr>
          </thead>
          <tbody>
            {competitors.map((comp: any, i: number) => (
              <tr key={i} className="border-b border-[#E8E0D0] last:border-0 hover:bg-[#F5F0E8]/50 transition-colors">
                <td className="px-4 py-4 font-medium text-[#0A1628]">{comp.name || 'Unknown'}</td>
                <td className="px-4 py-4">{comp.strength || 'N/A'}</td>
                <td className="px-4 py-4">{comp.weakness || 'N/A'}</td>
                <td className="px-4 py-4">
                  <span className={`px-2 py-1 rounded text-xs font-bold ${comp.threatLevel?.toLowerCase() === 'high' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                    {comp.threatLevel || 'Medium'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Financial Projections Chart */}
      <div className="card-angular p-8 bg-[#FAFAF7] shadow-sm mb-12">
        <h2 className="text-lg font-medium text-[#0A1628] mb-2 flex items-center gap-2">
          <span className="text-[#C8A860]">◈</span> Financial Projections
        </h2>
        <p className="text-xs text-[#96792b] font-semibold tracking-wider uppercase mb-8">PROJECTION</p>
        <div className="h-80 w-full" role="img" aria-label="Line chart showing revenue and costs over time">
          {mounted ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={financials} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E8E0D0" vertical={false} />
                <XAxis dataKey="month" stroke="#1C1C1C" opacity={0.6} tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis stroke="#1C1C1C" opacity={0.6} tick={{ fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(value) => `$${value/1000}k`} />
                <Tooltip 
                  contentStyle={{ background: '#0A1628', color: '#F5F0E8', border: 'none', borderRadius: '4px', fontSize: '12px' }}
                  itemStyle={{ color: '#F5F0E8' }}
                  formatter={(value: any) => [`$${Number(value).toLocaleString()}`, undefined]}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
                <Line type="monotone" dataKey="revenue" name="Revenue" stroke="#22c55e" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />
                <Line type="monotone" dataKey="costs" name="Costs" stroke="#ef4444" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="w-full h-full bg-[#F5F0E8] animate-pulse rounded" />
          )}
        </div>
      </div>

      {isSharePage && (
        <div className="text-center py-12 border-t border-[#E8E0D0]">
          <h2 className="text-2xl font-light text-[#0A1628] mb-4">Want your own validation report?</h2>
          <p className="text-[#1C1C1C] opacity-70 mb-8">Get AI-powered insights, competitor analysis, and financial models for your idea.</p>
          <Link href="/auth/signup" className="px-8 py-4 text-base font-medium text-[#0A1628] rounded transition-all hover:opacity-90 focus:ring-2 focus:ring-[#0A1628] outline-none inline-block" style={{ background: 'var(--gold-gradient)' }}>
            Start free on Aurexa
          </Link>
        </div>
      )}
    </div>
  )
}
