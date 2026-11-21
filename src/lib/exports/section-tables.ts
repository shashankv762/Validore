import type { DocumentSection } from './document'
import type { TableBlock } from './design'

// Turn existing authoritative scalar rows into aligned tables at render time.
// Do not duplicate the full report payload just to add a presentation layer.
const TABLE_SECTIONS = new Set([
  'Assessment', 'Your idea', 'Financial assumptions', 'Calculated unit economics',
  'Calculation assumptions', 'Financial scenarios and sensitivity',
  'Score coverage and unreviewed criteria',
])
export function scalarSectionTable(section: DocumentSection): TableBlock | null {
  if (!TABLE_SECTIONS.has(section.title) || section.lines.length < 2 || section.lines.length > 60) return null
  const rows: string[][] = []
  for (const line of section.lines) {
    const separator = line.text.indexOf(': ')
    // Only flat, clearly labeled values are safe to present as two columns.
    // A nested register or prose keeps its complete original reading order.
    if (separator < 1 || line.kind === 'bullet' || line.kind === 'field') return null
    rows.push([line.text.slice(0, separator), line.text.slice(separator + 2)])
  }
  return { kind: 'table', headers: ['Item', 'Recorded value / evidence status'], rows, widths: [0.38, 0.62] }
}
