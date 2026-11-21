import { PDFDocument, PDFString, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { readPublicAsset } from '../public-assets'
import { CANVAS_LAYOUT, REPORT_DESIGN, reportGeometry, type DesignedReport, type LayoutBlock, type TableBlock } from './design'
import { hasDevanagari, loadPdfText } from './pdf-text'
import { scalarSectionTable } from './section-tables'

const color = (hex: string) => rgb(parseInt(hex.slice(0, 2), 16) / 255, parseInt(hex.slice(2, 4), 16) / 255, parseInt(hex.slice(4, 6), 16) / 255)
const clean = (value: string) => value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
export function wrapDocumentText(text: string, measure: (value: string) => number, width: number): string[] {
  const lines: string[] = []
  for (const paragraph of clean(text).replace(/\r/g, '').split('\n')) {
    let line = ''
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      if (measure(line ? line + ' ' + word : word) <= width) { line = line ? line + ' ' + word : word; continue }
      if (line) { lines.push(line); line = '' }
      for (const { segment: letter } of new Intl.Segmenter('hi', { granularity: 'grapheme' }).segment(word)) {
        if (line && measure(line + letter) > width) { lines.push(line); line = '' }
        line += letter
      }
    }
    lines.push(line)
  }
  return lines
}

/** Pure-JS printable output. Selectable text, but not a PDF/UA tagging claim. */
export async function renderDesignedPdf(report: DesignedReport, options: { whiteLabel?: boolean } = {}): Promise<Buffer> {
  const pdf = await PDFDocument.create()
  pdf.registerFontkit(fontkit)
  pdf.setTitle(report.title + ' — ' + report.subtitle)
  pdf.setAuthor(options.whiteLabel ? '' : 'Validore')
  pdf.setSubject(report.design.example ? 'Fictional planning example, not customer research' : 'Evidence-aware startup planning')
  pdf.setLanguage('en')
  const text = await loadPdfText(pdf, hasDevanagari(JSON.stringify(report)))
  const { regular, bold } = text
  const logo = options.whiteLabel ? null : await pdf.embedPng(await readPublicAsset('/logo/validore-report.png'))
  const g = reportGeometry(report)
  const ink = color(REPORT_DESIGN.ink), muted = color(REPORT_DESIGN.muted), rule = color(REPORT_DESIGN.rule)
  let page: PDFPage, y: number
  const wrap = (value: string, width: number, size = 11, font: PDFFont = regular) => wrapDocumentText(value, value => text.measure(value, size, font), width)
  const draw = (value: string, x: number, top: number, size = 11, font: PDFFont = regular, fill = ink) => {
    text.draw(page, clean(value), x, top - size, size, font, fill)
  }
  const linkLine = (line: string, original: string, x: number, top: number, size: number, font: PDFFont) => {
    const targets = original.match(/https?:\/\/[^\s<>"\[\]]+/g) ?? []
    for (const fragment of line.matchAll(/https?:\/\/[^\s<>"\[\]]+/g)) {
      const target = targets.find(value => value === fragment[0] || value.startsWith(fragment[0]))
      if (!target) continue
      try {
        const parsed = new URL(target)
        if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) continue
        const left = x + text.measure(line.slice(0, fragment.index), size, font)
        const width = text.measure(fragment[0], size, font)
        const annotation = pdf.context.obj({ Type: 'Annot', Subtype: 'Link',
          Rect: [left, top - size - 1, left + width, top + 2], Border: [0, 0, 0],
          A: { Type: 'Action', S: 'URI', URI: PDFString.of(target) } })
        page.node.addAnnot(pdf.context.register(annotation))
      } catch { /* Invalid URLs stay visible plain text. No link is fetched. */ }
    }
  }
  const newPage = (first = false) => {
    if (pdf.getPageCount() >= 100) throw new Error('Document exceeds the supported page limit')
    page = pdf.addPage([g.width, g.height]); y = g.height - g.top
    if (logo) page.drawImage(logo, { x: g.margin, y: g.height - 38, width: 98, height: 21 })
    draw(first ? 'RESEARCH • DECISIONS • NEXT STEPS' : report.subtitle, g.margin + (logo ? 114 : 0), g.height - 22, 8.5, regular, muted)
    if (report.design.example) { draw('FICTIONAL EXAMPLE — NOT CUSTOMER RESEARCH', g.margin, y, 9, bold); y -= 19 }
    page.drawLine({ start: { x: g.margin, y: y + 5 }, end: { x: g.width - g.margin, y: y + 5 }, thickness: 1.4, color: color(REPORT_DESIGN.gold) })
    y -= 6
  }
  const ensure = (height: number) => { if (y - height < g.bottom) newPage() }
  const paragraph = (text: string, size = 11, font = regular, fill = ink, gap = 8) => {
    const leading = size === 11 ? 15 : size * 1.35
    for (const line of wrap(text, g.contentWidth, size, font)) { ensure(leading); draw(line, g.margin, y, size, font, fill); linkLine(line, text, g.margin, y, size, font); y -= leading }
    y -= gap
  }
  const renderTable = (block: TableBlock) => {
    const count = block.headers.length
    if (!count || block.rows.some(row => row.length !== count)) throw new Error('Invalid document table')
    const weights = block.widths?.length === count ? block.widths : Array(count).fill(1)
    if (weights.some(value => !Number.isFinite(value) || value <= 0)) throw new Error('Invalid document column widths')
    const total = weights.reduce((sum, value) => sum + value, 0)
    const widths = weights.map(value => g.contentWidth * value / total)
    const pad = 7, size = 10, leading = 14
    const headerLines = block.headers.map((value, i) => wrap(value, widths[i] - pad * 2, size, bold))
    const headerHeight = Math.max(...headerLines.map(value => value.length)) * leading + pad * 2
    if (headerHeight > g.height - g.top - g.bottom - 60) throw new Error('Table header exceeds the available page height')
    const rowPart = (cells: string[][], height: number, header = false, original: string[] = []) => {
      let x = g.margin
      if (header) page.drawRectangle({ x, y: y - height, width: g.contentWidth, height, color: color(REPORT_DESIGN.cream) })
      cells.forEach((lines, i) => {
        lines.forEach((line, n) => {
          const font = header ? bold : regular
          draw(line, x + pad, y - pad - n * leading, size, font)
          linkLine(line, original[i] ?? line, x + pad, y - pad - n * leading, size, font)
        })
        x += widths[i]
      })
      page.drawLine({ start: { x: g.margin, y: y - height }, end: { x: g.width - g.margin, y: y - height }, thickness: 0.6, color: rule })
      y -= height
    }
    const preparedRows = block.rows.map(row => row.map((value, i) => wrap(value, widths[i] - pad * 2, size)))
    const tableHeight = headerHeight + preparedRows.reduce((sum, row) => sum + Math.max(...row.map(lines => lines.length)) * leading + pad * 2, 0)
    if (block.rows.length <= 4 && tableHeight <= (g.height - g.top - g.bottom) * 0.55) ensure(tableHeight + 12)
    ensure(headerHeight + 30); rowPart(headerLines, headerHeight, true)
    for (const [rowIndex, row] of block.rows.entries()) {
      const cells = preparedRows[rowIndex]
      let offset = 0
      const length = Math.max(...cells.map(lines => lines.length))
      const fullHeight = length * leading + pad * 2
      if (fullHeight <= g.height - g.top - g.bottom - headerHeight - 30 && y - fullHeight < g.bottom) { newPage(); rowPart(headerLines, headerHeight, true) }
      while (offset < length) {
        let fit = Math.floor((y - g.bottom - pad * 2) / leading)
        if (fit < 1) { newPage(); rowPart(headerLines, headerHeight, true); fit = Math.floor((y - g.bottom - pad * 2) / leading) }
        if (fit < 1) throw new Error('Table header leaves no space for content')
        const end = Math.min(length, offset + fit)
        rowPart(cells.map(lines => lines.slice(offset, end)), (end - offset) * leading + pad * 2, false, row)
        offset = end
        if (offset < length) { newPage(); paragraph('Table continued', 9, bold, muted, 4); rowPart(headerLines, headerHeight, true) }
      }
    }
    y -= 12
  }
  const renderCanvas = (block: Extract<LayoutBlock, { kind: 'canvas' }>) => {
    const scale = report.design.paper === 'a3' ? 1.35 : 1
    const heights = [125, 125, 100].map(value => value * scale)
    const height = heights.reduce((sum, value) => sum + value, 0)
    ensure(height)
    const top = y, column = g.contentWidth / 5
    const overflow: { title: string; text: string }[] = []
    for (const cell of CANVAS_LAYOUT) {
      const value = block.cells.find(value => value.key === cell.key)
      const x = g.margin + cell.column * column, width = cell.columns * column
      const cellTop = top - heights.slice(0, cell.row).reduce((sum, value) => sum + value, 0)
      const cellHeight = heights.slice(cell.row, cell.row + cell.rows).reduce((sum, value) => sum + value, 0)
      page.drawRectangle({ x, y: cellTop - cellHeight, width, height: cellHeight, borderColor: rule, borderWidth: 0.7 })
      const size = report.design.paper === 'a3' ? 11 : 9.5, leading = size * 1.35, pad = 8
      const titles = wrap(value?.title ?? cell.title, width - pad * 2, size + 0.5, bold)
      titles.forEach((line, i) => draw(line, x + pad, cellTop - pad - i * leading, size + 0.5, bold))
      const contentTop = cellTop - pad - titles.length * leading - 8
      const lines = wrap(value?.content ?? 'Not recorded', width - pad * 2, size)
      const capacity = Math.max(1, Math.floor((contentTop - (cellTop - cellHeight) - pad) / leading))
      const truncated = lines.length > capacity
      const shown = truncated ? Math.max(0, capacity - 1) : capacity
      lines.slice(0, shown).forEach((line, i) => draw(line, x + pad, contentTop - i * leading, size))
      if (truncated) {
        draw('Continued in appendix →', x + pad, contentTop - shown * leading, 8, bold, muted)
        overflow.push({ title: value?.title ?? cell.title, text: value?.content ?? '' })
      }
    }
    y -= height + 10
    if (overflow.length) { newPage(); paragraph('Canvas continuation', 15, bold); for (const entry of overflow) { paragraph(entry.title, 12, bold); paragraph(entry.text) } }
  }
  const renderBlock = (block: LayoutBlock) => {
    if (block.kind === 'table') return renderTable(block)
    if (block.kind === 'canvas') return renderCanvas(block)
    if (block.kind === 'text') return paragraph(block.text)
    if (block.kind === 'callout') {
      const lines = wrap(block.text, g.contentWidth - 20, 11, bold)
      const height = lines.length * 15 + 20
      if (height > g.height - g.top - g.bottom - 30) return paragraph(block.text, 11, bold)
      ensure(height + 8)
      page.drawRectangle({ x: g.margin, y: y - height, width: g.contentWidth, height, color: color(REPORT_DESIGN.cream) })
      page.drawRectangle({ x: g.margin, y: y - height, width: 3, height, color: color(REPORT_DESIGN.gold) })
      lines.forEach((line, i) => draw(line, g.margin + 10, y - 10 - i * 15, 11, bold))
      y -= height + 10; return
    }
    if (report.design.example) {
      paragraph(block.label, 11, bold, ink, 3)
      paragraph(block.prompt, 11, regular, ink, 8)
      return
    }
    const writingLines = Math.max(1, Math.min(12, block.lines ?? 2))
    const required = wrap(block.label, g.contentWidth, 11, bold).length * 15 + 3 +
      wrap(block.prompt, g.contentWidth, 9).length * 12.15 + 3 + writingLines * 18 + 10
    ensure(Math.min(required, g.height - g.top - g.bottom - 10))
    paragraph(block.label, 11, bold, ink, 3)
    paragraph(block.prompt, 9, regular, muted, 3)
    for (let i = 0; i < writingLines; i++) {
      if (y - 18 < g.bottom) { newPage(); paragraph(block.label + ' (continued)', 11, bold, ink, 3) }
      y -= 18
      page.drawLine({ start: { x: g.margin, y }, end: { x: g.width - g.margin, y }, thickness: 0.5, color: rule })
    }
    y -= 10
  }
  newPage(true)
  paragraph(report.title, report.design.orientation === 'landscape' ? 19 : 26, bold, ink, 4)
  paragraph(report.subtitle + ' · ' + report.date, 9, regular, muted, 12)
  if (report.partial) renderBlock({ kind: 'callout', text: 'Partial analysis — review missing evidence and incomplete specialist work before relying on this report.' })
  for (const section of report.sections) {
    if (section.breakBefore) newPage()
    if (section.title) { ensure(50); paragraph(section.title, 15, bold, ink, 8) }
    const scalarTable = section.blocks ? null : scalarSectionTable(section)
    if (section.blocks) section.blocks.forEach(renderBlock)
    else if (scalarTable) renderTable(scalarTable)
    else for (const line of section.lines) paragraph((line.kind === 'bullet' ? '• ' : '') + line.text, 11, line.kind === 'label' ? bold : regular)
  }
  const pages = pdf.getPages()
  pages.forEach((sheet, i) => {
    sheet.drawLine({ start: { x: g.margin, y: 39 }, end: { x: g.width - g.margin, y: 39 }, thickness: 0.6, color: rule })
    const footer = `${options.whiteLabel ? 'Planning report' : 'Validore'} · ${report.design.example ? 'Fictional example' : 'Assumptions require validation'} · v${report.design.version}`
    sheet.drawText(footer, { x: g.margin, y: 24, size: 8.5, font: regular, color: muted })
    const number = `${i + 1} / ${pages.length}`
    sheet.drawText(number, { x: g.width - g.margin - regular.widthOfTextAtSize(number, 8.5), y: 24, size: 8.5, font: regular, color: muted })
  })
  return Buffer.from(await pdf.save())
}
