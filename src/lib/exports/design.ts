import type { DocumentSection, ReportDocument } from './document'

export const TEMPLATE_VERSION = '2.0.0'
export const REPORT_DESIGN = {
  ink: '141923', brand: '0B0E13', muted: '657081', rule: 'E5E7EB', gold: 'E0A526', paper: 'FAFAF7', cream: 'F4EFE6',
  body: 11, leading: 15, note: 9, heading: 15, title: 26,
} as const
export type TableBlock = { kind: 'table'; headers: string[]; rows: string[][]; widths?: number[] }
export type WritingBlock = { kind: 'writing'; label: string; prompt: string; lines?: number }
export type TextBlock = { kind: 'text'; text: string } | { kind: 'callout'; text: string }
export type CanvasBlock = { kind: 'canvas'; cells: { key: string; title: string; content: string }[] }
export type LayoutBlock = TableBlock | WritingBlock | TextBlock | CanvasBlock
export type DesignedSection = DocumentSection & { blocks?: LayoutBlock[] }
export type DesignedReport = Omit<ReportDocument, 'sections'> & {
  design: { version: string; paper: 'a4' | 'a3'; orientation: 'portrait' | 'landscape'; example?: boolean; workbook?: boolean }
  sections: DesignedSection[]
}
export function isDesignedReport(report: ReportDocument): report is DesignedReport {
  const value = report as Partial<DesignedReport>
  return Boolean(value.design && value.design.version === TEMPLATE_VERSION)
}
export function blockLines(block: LayoutBlock): DocumentSection['lines'] {
  if (block.kind === 'table') return [{ kind: 'label', text: block.headers.join(' | ') }, ...block.rows.map(row => ({ kind: 'text' as const, text: row.join(' | ') }))]
  if (block.kind === 'writing') return [{ kind: 'label', text: block.label }, { kind: 'field', text: block.prompt }]
  if (block.kind === 'canvas') return block.cells.flatMap(cell => [{ kind: 'label' as const, text: cell.title }, { kind: 'text' as const, text: cell.content }])
  return [{ kind: 'text', text: block.text }]
}
export function designedSection(title: string, blocks: LayoutBlock[], breakBefore = false): DesignedSection {
  return { title, blocks, lines: blocks.flatMap(blockLines), ...(breakBefore ? { breakBefore: true } : {}) }
}
export function reportGeometry(report: DesignedReport) {
  const portrait = report.design.paper === 'a3' ? [841.89, 1190.55] : [595.28, 841.89]
  const [width, height] = report.design.orientation === 'landscape' ? [portrait[1], portrait[0]] : portrait
  const margin = report.design.orientation === 'landscape' && report.design.paper === 'a4' ? 39.69 : 51.02
  return { width, height, margin, contentWidth: width - 2 * margin, bottom: 51, top: 55 }
}
export const CANVAS_LAYOUT = [
  { key: 'problem', title: '1 Problem', column: 0, row: 0, columns: 1, rows: 2 },
  { key: 'solution', title: '4 Solution', column: 1, row: 0, columns: 1, rows: 1 },
  { key: 'uvp', title: '3 Unique value proposition', column: 2, row: 0, columns: 1, rows: 2 },
  { key: 'unfairAdvantage', title: '9 Unfair advantage', column: 3, row: 0, columns: 1, rows: 1 },
  { key: 'customerSegments', title: '2 Customer segments', column: 4, row: 0, columns: 1, rows: 2 },
  { key: 'keyMetrics', title: '8 Key metrics', column: 1, row: 1, columns: 1, rows: 1 },
  { key: 'channels', title: '5 Channels', column: 3, row: 1, columns: 1, rows: 1 },
  { key: 'costStructure', title: '7 Cost structure', column: 0, row: 2, columns: 2.5, rows: 1 },
  { key: 'revenueStreams', title: '6 Revenue streams', column: 2.5, row: 2, columns: 2.5, rows: 1 },
] as const
