'use client'

import React, { useSyncExternalStore } from 'react'

const emptySubscribe = () => () => {}
import {
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Cell,
} from 'recharts'

export interface ScatterPlotPoint {
  name: string
  x: number // 0 to 100
  y: number // 0 to 100
  isHighlighted?: boolean
  category?: string
  notes?: string
}

export interface ScatterPlot2x2Props {
  data: ScatterPlotPoint[]
  title?: string
  subtitle?: string
  xLabel?: string
  yLabel?: string
  xMin?: number
  xMax?: number
  yMin?: number
  yMax?: number
  xMid?: number
  yMid?: number
  quadrantLabels?: {
    topRight?: string
    topLeft?: string
    bottomRight?: string
    bottomLeft?: string
  }
  badge?: string
  height?: number
  className?: string
}

interface CustomTooltipProps {
  active?: boolean
  payload?: Array<{
    payload: ScatterPlotPoint
  }>
  xLabel?: string
  yLabel?: string
}

const CustomTooltip: React.FC<CustomTooltipProps> = ({ active, payload, xLabel, yLabel }) => {
  if (active && payload && payload.length) {
    const pt = payload[0].payload
    return (
      <div className="bg-[#0A1628] text-[#F5F0E8] p-3 rounded shadow-xl border border-[#C8A860] text-xs max-w-xs z-50">
        <div className="font-semibold text-sm text-[#C8A860] mb-1">{pt.name}</div>
        <div className="flex justify-between gap-4 mb-0.5 opacity-90">
          <span>{xLabel || 'X'}:</span>
          <span className="font-mono">{pt.x}</span>
        </div>
        <div className="flex justify-between gap-4 mb-1 opacity-90">
          <span>{yLabel || 'Y'}:</span>
          <span className="font-mono">{pt.y}</span>
        </div>
        {pt.category && (
          <div className="text-[10px] text-stone-300 italic mb-1">{pt.category}</div>
        )}
        {pt.notes && (
          <div className="text-[11px] text-stone-200 mt-1 pt-1 border-t border-stone-700 leading-tight">
            {pt.notes}
          </div>
        )}
      </div>
    )
  }
  return null
}

export function ScatterPlot2x2({
  data,
  title,
  subtitle,
  xLabel = 'Market Breadth / Feature Depth',
  yLabel = 'Perceived Value / Price Tier',
  xMin = 0,
  xMax = 100,
  yMin = 0,
  yMax = 100,
  xMid = 50,
  yMid = 50,
  quadrantLabels = {
    topRight: 'Leaders / High Value',
    topLeft: 'Premium / Niche',
    bottomRight: 'Low Cost / Volume',
    bottomLeft: 'Commodity / Underdeveloped',
  },
  badge = 'PROJECTION',
  height = 380,
  className = '',
}: ScatterPlot2x2Props) {
  const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false)

  if (!mounted) {
    return (
      <div
        className={`card-angular p-6 bg-[#FAFAF7] shadow-sm flex items-center justify-center ${className}`}
        style={{ height }}
      >
        <div className="text-xs text-stone-400">Loading positioning chart...</div>
      </div>
    )
  }

  return (
    <div className={`card-angular p-6 bg-[#FAFAF7] shadow-sm ${className}`}>
      {(title || badge) && (
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
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

      {/* Quadrant Legend Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 my-3 text-[10px] text-stone-500 bg-[#F5F0E8] p-2 rounded border border-[#E8E0D0]">
        <div className="truncate"><span className="font-semibold text-stone-700">Top-Right:</span> {quadrantLabels.topRight}</div>
        <div className="truncate"><span className="font-semibold text-stone-700">Top-Left:</span> {quadrantLabels.topLeft}</div>
        <div className="truncate"><span className="font-semibold text-stone-700">Bottom-Right:</span> {quadrantLabels.bottomRight}</div>
        <div className="truncate"><span className="font-semibold text-stone-700">Bottom-Left:</span> {quadrantLabels.bottomLeft}</div>
      </div>

      <div style={{ width: '100%', height }}>
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 20, right: 30, bottom: 30, left: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E8E0D0" opacity={0.6} />
            <XAxis
              type="number"
              dataKey="x"
              name={xLabel}
              domain={[xMin, xMax]}
              tick={{ fontSize: 10, fill: '#64748B' }}
              label={{
                value: xLabel,
                position: 'bottom',
                offset: 15,
                fill: '#0A1628',
                fontSize: 11,
                fontWeight: 500,
              }}
            />
            <YAxis
              type="number"
              dataKey="y"
              name={yLabel}
              domain={[yMin, yMax]}
              tick={{ fontSize: 10, fill: '#64748B' }}
              label={{
                value: yLabel,
                angle: -90,
                position: 'left',
                offset: 5,
                fill: '#0A1628',
                fontSize: 11,
                fontWeight: 500,
              }}
            />
            {/* Midline Reference Lines creating 2x2 quadrants */}
            <ReferenceLine x={xMid} stroke="#C8A860" strokeDasharray="4 4" strokeWidth={1.5} />
            <ReferenceLine y={yMid} stroke="#C8A860" strokeDasharray="4 4" strokeWidth={1.5} />
            <Tooltip
              content={<CustomTooltip xLabel={xLabel} yLabel={yLabel} />}
              cursor={{ strokeDasharray: '3 3' }}
            />
            <Scatter name="Competitors" data={data}>
              {data.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={entry.isHighlighted ? '#C8A860' : '#0A1628'}
                  stroke={entry.isHighlighted ? '#0A1628' : '#64748B'}
                  strokeWidth={entry.isHighlighted ? 2 : 1}
                  r={entry.isHighlighted ? 9 : 6}
                />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      <div className="flex items-center justify-end gap-4 mt-3 text-xs text-stone-600">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-[#C8A860] border border-[#0A1628]" />
          <span className="font-medium text-[#0A1628]">Our Startup (Position Target)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#0A1628]" />
          <span>Competitors / Existing Market</span>
        </div>
      </div>
    </div>
  )
}
