import { AlignmentType, BorderStyle, Document, ExternalHyperlink, Footer, Header, HeadingLevel, HeightRule, ImageRun, LineRuleType, Packer, PageNumber, PageOrientation, Paragraph, Table, TableCell, TableLayoutType, TableRow, TextRun, VerticalAlign, WidthType } from 'docx'
import { readPublicAsset } from '../public-assets'
import { REPORT_DESIGN, reportGeometry, type DesignedReport, type LayoutBlock } from './design'
import { scalarSectionTable } from './section-tables'

export async function renderDesignedWord(report: DesignedReport): Promise<Buffer> {
  const g = reportGeometry(report)
  const logo = await readPublicAsset('/logo/validore-report.png')
  const textRuns = (text: string, options: { bold?: boolean; color?: string; size?: number } = {}): (TextRun | ExternalHyperlink)[] => {
    const runs: (TextRun | ExternalHyperlink)[] = []
    text.replace(/\r/g, '').split('\n').forEach((line, index) => {
      if (index) runs.push(new TextRun({ text: '', break: 1 }))
      let offset = 0
      for (const match of line.matchAll(/https?:\/\/[^\s<>"\[\]]+/g)) {
        if (match.index! > offset) runs.push(new TextRun({ text: line.slice(offset, match.index), ...options }))
        const url = match[0]
        let link = false
        try { const parsed = new URL(url); link = ['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password } catch { /* Keep invalid links as plain text. */ }
        runs.push(link ? new ExternalHyperlink({ link: url, children: [new TextRun({ text: url, ...options, underline: {} })] }) : new TextRun({ text: url, ...options }))
        offset = match.index! + url.length
      }
      if (offset < line.length || !line.length) runs.push(new TextRun({ text: line.slice(offset), ...options }))
    })
    return runs
  }
  const p = (text: string, bold = false, color: string = REPORT_DESIGN.ink, size = 22) => new Paragraph({
    children: textRuns(text, { bold, color, size }), spacing: { after: 90, line: 300 }, widowControl: true,
  })
  const border = { style: BorderStyle.SINGLE, size: 4, color: REPORT_DESIGN.rule }
  const cell = (text: string, options: { header?: boolean; heading?: boolean; span?: number; rowSpan?: number; width?: number } = {}) => new TableCell({
    children: text.split('\n').map((line, index) => p(line, Boolean(options.header || options.heading && index === 0), REPORT_DESIGN.ink, options.heading && index === 0 ? 22 : 20)),
    verticalAlign: VerticalAlign.TOP, margins: { top: 110, bottom: 110, left: 110, right: 110 },
    ...(options.header ? { shading: { fill: REPORT_DESIGN.cream } } : {}),
    ...(options.span ? { columnSpan: options.span } : {}), ...(options.rowSpan ? { rowSpan: options.rowSpan } : {}),
    ...(options.width ? { width: { size: options.width, type: WidthType.DXA } } : {}),
    borders: { top: border, bottom: border, left: border, right: border },
  })
  const render = (block: LayoutBlock): (Paragraph | Table)[] => {
    if (block.kind === 'text') return [p(block.text)]
    if (block.kind === 'callout') return [new Paragraph({ children: textRuns(block.text, { bold: true }),
      shading: { fill: REPORT_DESIGN.cream }, spacing: { before: 100, after: 180, line: 300 }, indent: { left: 140, right: 140 }, keepLines: true })]
    if (block.kind === 'writing') {
      const label = new Paragraph({ children: [new TextRun({ text: block.label, bold: true })], keepNext: true, spacing: { before: 100, after: 60 } })
      if (report.design.example) return [label, p(block.prompt)]
      return [label, p(block.prompt, false, REPORT_DESIGN.muted, 18),
        ...Array.from({ length: Math.max(1, Math.min(12, block.lines ?? 2)) }, () => new Paragraph({ children: [new TextRun(' ')], spacing: { before: 70, after: 70, line: 300 }, border: { bottom: border } }))]
    }
    if (block.kind === 'table') {
      if (!block.headers.length || block.rows.some(row => row.length !== block.headers.length)) throw new Error('Invalid document table')
      const weights = block.widths?.length === block.headers.length ? block.widths : block.headers.map(() => 1)
      if (weights.some(value => !Number.isFinite(value) || value <= 0)) throw new Error('Invalid document column widths')
      const sum = weights.reduce((total, value) => total + value, 0)
      const widths = weights.map(value => Math.round(g.contentWidth * 20 * value / sum))
      return [new Table({ width: { size: Math.round(g.contentWidth * 20), type: WidthType.DXA }, layout: TableLayoutType.FIXED, columnWidths: widths,
        rows: [new TableRow({ tableHeader: true, children: block.headers.map((text, i) => cell(text, { header: true, width: widths[i] })) }),
          ...block.rows.map(row => new TableRow({ cantSplit: row.every(value => value.length <= 300), children: row.map((text, i) => cell(text, { width: widths[i] })) }))],
      }), p('')]
    }
    const values = new Map(block.cells.map(value => [value.key, value]))
    const canvasCell = (key: string, rowSpan = 1, span = 2) => {
      const value = values.get(key)
      return cell((value?.title ?? key) + '\n\n' + (value?.content ?? 'Not recorded'), { heading: true, span, rowSpan })
    }
    const rowScale = report.design.paper === 'a3' ? 1.35 : 1
    return [new Table({ width: { size: Math.round(g.contentWidth * 20), type: WidthType.DXA }, layout: TableLayoutType.FIXED,
      columnWidths: Array(10).fill(Math.round(g.contentWidth * 2)),
      rows: [
        new TableRow({ height: { value: Math.round(125 * 20 * rowScale), rule: HeightRule.ATLEAST }, children: [canvasCell('problem', 2), canvasCell('solution'), canvasCell('uvp', 2), canvasCell('unfairAdvantage'), canvasCell('customerSegments', 2)] }),
        new TableRow({ height: { value: Math.round(125 * 20 * rowScale), rule: HeightRule.ATLEAST }, children: [canvasCell('keyMetrics'), canvasCell('channels')] }),
        new TableRow({ height: { value: Math.round(100 * 20 * rowScale), rule: HeightRule.ATLEAST }, children: [canvasCell('costStructure', 1, 5), canvasCell('revenueStreams', 1, 5)] }),
      ],
    }), p('')]
  }
  const body: (Paragraph | Table)[] = [
    new Paragraph({ text: report.title, heading: HeadingLevel.TITLE }),
    ...(report.design.orientation === 'landscape'
      ? [p(report.subtitle + ' · ' + report.date, false, REPORT_DESIGN.muted, 18)]
      : [p(report.subtitle, false, REPORT_DESIGN.muted), p(report.date, false, REPORT_DESIGN.muted, 18)]),
    ...(report.partial ? [p('Partial analysis — review missing evidence before acting.', true)] : []),
  ]
  for (const section of report.sections) {
    if (section.title) body.push(new Paragraph({ text: section.title, heading: HeadingLevel.HEADING_1, pageBreakBefore: section.breakBefore }))
    const scalarTable = section.blocks ? null : scalarSectionTable(section)
    if (section.blocks) body.push(...section.blocks.flatMap(render))
    else if (scalarTable) body.push(...render(scalarTable))
    else body.push(...section.lines.map(line => p((line.kind === 'bullet' ? '• ' : '') + line.text, line.kind === 'label')))
  }
  const document = new Document({ creator: 'Validore', title: report.title + ' — ' + report.subtitle,
    description: report.design.example ? 'Fictional example — not customer research' : 'Editable evidence-aware planning workbook',
    styles: { default: { document: { run: { font: 'Arial', size: 22, color: REPORT_DESIGN.ink }, paragraph: { spacing: { after: 110, line: 300 } } } }, paragraphStyles: [
      { id: 'Title', name: 'Title', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: 'Arial', size: report.design.orientation === 'landscape' ? 38 : 52, bold: true, color: REPORT_DESIGN.brand }, paragraph: { keepNext: true, spacing: { before: 80, after: 140 } } },
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: 'Arial', size: 30, bold: true, color: REPORT_DESIGN.brand }, paragraph: { keepNext: true, spacing: { before: 240, after: 130 } } },
    ] },
    // docx applies the landscape rotation itself; supply portrait base dimensions.
    sections: [{ properties: { page: { size: { width: Math.round((report.design.orientation === 'landscape' ? g.height : g.width) * 20), height: Math.round((report.design.orientation === 'landscape' ? g.width : g.height) * 20), orientation: report.design.orientation === 'landscape' ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT },
      margin: { top: 1000, bottom: 950, left: Math.round(g.margin * 20), right: Math.round(g.margin * 20), header: 300, footer: 360 } } },
      headers: { default: new Header({ children: [new Paragraph({ children: [new ImageRun({ type: 'png', data: logo, transformation: { width: 112, height: 24 }, altText: { title: 'Validore', description: 'Validore company logo', name: 'Validore' } })], spacing: { after: 100, line: 480, lineRule: LineRuleType.AT_LEAST } }),
        ...(report.design.example ? [p('FICTIONAL EXAMPLE — NOT CUSTOMER RESEARCH', true, REPORT_DESIGN.muted, 17)] : [])] }) },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [
        new TextRun({ text: `Validore · ${report.design.example ? 'Fictional example' : 'Assumptions require validation'} · v${report.design.version}  |  `, size: 17, color: REPORT_DESIGN.muted }),
        new TextRun({ children: [PageNumber.CURRENT, ' / ', PageNumber.TOTAL_PAGES], size: 17 }),
      ] })] }) }, children: body,
    }],
  })
  return Packer.toBuffer(document)
}
