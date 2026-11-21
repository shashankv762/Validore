import { describe, expect, it } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import JSZip from 'jszip'
import { templatePack, buildCanvasTemplate, buildDecisionBrief, buildDesignedWorkbook } from '@/lib/exports/template-pack'
import { CANVAS_LAYOUT, TEMPLATE_VERSION, isDesignedReport } from '@/lib/exports/design'
import { renderReportPdf } from '@/lib/exports/pdf'
import { renderReportWord } from '@/lib/exports/word'
import { wrapDocumentText } from '@/lib/exports/designed-pdf'
import { buildReportDocument, documentLines } from '@/lib/exports/document'

describe('Validore branded reusable template pack', () => {
  it('applies the print design to saved reports without losing statuses, unknown metrics or source links', async () => {
    const data = { computedUnitEconomics: { contributionMargin: 0, breakEvenUnits: null },
      roadmap: [{ milestone: 'Pilot launch', status: 'PLANNED' }],
      assumptionRegister: [{ assumption: 'Buyers will pay', status: 'untested' }],
      preLaunchChecklist: [{ item: 'Obtain a supplier quote', status: 'pending' }],
      researchSources: [{ title: 'Original source', url: 'https://example.org/original', content: 'A passage requiring review.' }],
    }
    const report = buildReportDocument({ status: 'internal-job-state', reportData: data }, { name: 'Saved concept' }, 'validation')
    expect(isDesignedReport(report)).toBe(true)
    const lines = JSON.stringify(documentLines(data))
    expect(lines).toContain('Status: PLANNED'); expect(lines).toContain('Status: untested'); expect(lines).toContain('Status: pending')
    expect(lines).toContain('Unavailable or not attainable'); expect(lines).toContain('Contribution Margin: 0')
    expect(JSON.stringify(report)).not.toContain('internal-job-state')
    const pdf = await PDFDocument.load(await renderReportPdf(report))
    expect(pdf.getPages().some(page => (page.node.Annots()?.size() ?? 0) > 0)).toBe(true)
    const zip = await JSZip.loadAsync(await renderReportWord(report))
    const xml = await zip.file('word/document.xml')!.async('string')
    expect(xml).toContain('Unavailable or not attainable'); expect(xml).toContain('PLANNED')
    expect(xml).toContain('<w:hyperlink')
    const relationships = await zip.file('word/_rels/document.xml.rels')!.async('string')
    expect(relationships).toContain('https://example.org/original')
  }, 30_000)
  it('provides blank, companion, large workshop and explicitly fictional examples separately', () => {
    const pack = templatePack()
    expect(pack).toHaveLength(7)
    expect(pack.reduce((sum, item) => sum + item.formats.length, 0)).toBe(13)
    expect(new Set(pack.map(item => item.name)).size).toBe(pack.length)
    for (const item of pack) {
      expect(isDesignedReport(item.document)).toBe(true)
      expect(item.document.design.version).toBe(TEMPLATE_VERSION)
      expect(item.document.subtitle).toContain('Validore')
      expect(item.document.sections.every(section => section.lines.length > 0)).toBe(true)
      expect(item.document.sections.flatMap(section => section.blocks ?? []).length).toBeGreaterThan(0)
      if (item.name.includes('example')) expect(item.document.design.example).toBe(true)
      else expect(item.document.design.example).not.toBe(true)
    }
  })
  it('uses the nine Lean Canvas blocks once and the correct nonoverlapping grid', () => {
    expect(CANVAS_LAYOUT).toHaveLength(9)
    expect(new Set(CANVAS_LAYOUT.map(cell => cell.key)).size).toBe(9)
    const positions = new Set<string>()
    for (const cell of CANVAS_LAYOUT) {
      for (let column = cell.column * 2; column < (cell.column + cell.columns) * 2; column++) {
        for (let row = cell.row; row < cell.row + cell.rows; row++) {
          const position = `${column}/${row}`
          expect(positions.has(position), position).toBe(false)
          positions.add(position)
        }
      }
    }
    expect(positions.size).toBe(30)
    const keys = buildCanvasTemplate().sections.flatMap(section => section.blocks ?? []).flatMap(block => block.kind === 'canvas' ? block.cells.map(cell => cell.key) : [])
    expect(new Set(keys)).toEqual(new Set(CANVAS_LAYOUT.map(cell => cell.key)))
    expect(keys).not.toContain('keyPartners')
  })
  it('keeps logical chapters without forced breaks and uses real score/evidence tables', () => {
    const workbook = buildDesignedWorkbook()
    expect(workbook.sections).toHaveLength(5)
    expect(workbook.sections.some(section => section.breakBefore)).toBe(false)
    const tables = workbook.sections.flatMap(section => section.blocks ?? []).filter(block => block.kind === 'table')
    expect(tables.length).toBeGreaterThan(5)
    const scorecard = tables.find(table => table.headers.includes('Score / max'))!
    expect(scorecard.rows).toHaveLength(8)
    expect(scorecard.rows.map(row => row[1]).join(' ')).toContain('/ 20')
    expect(workbook.sections.flatMap(section => section.blocks ?? []).filter(block => block.kind === 'writing').every(block => (block.lines ?? 0) >= 2)).toBe(true)
  })
  it('wraps long tokens and retains every character rather than clipping them', () => {
    const token = 'https://example.test/' + 'abc'.repeat(300)
    const lines = wrapDocumentText(token, value => value.length, 30)
    expect(lines.join('')).toBe(token)
    expect(lines.every(line => line.length <= 30)).toBe(true)
    const paragraph = wrapDocumentText('One short paragraph.\nSecond paragraph.', value => value.length, 12)
    expect(paragraph.join(' ')).toContain('Second')
  })
  it('renders an A4 landscape Canvas and a separately sized A3 workshop PDF', async () => {
    for (const paper of ['a4', 'a3'] as const) {
      const pdf = await PDFDocument.load(await renderReportPdf(buildCanvasTemplate(paper)))
      expect(pdf.getPageCount()).toBe(1)
      const { width, height } = pdf.getPage(0).getSize()
      expect(width).toBeGreaterThan(height)
      expect(width).toBeCloseTo(paper === 'a4' ? 841.89 : 1190.55, 1)
      expect(pdf.getAuthor()).toBe('Validore')
      expect(pdf.getTitle()).toContain('Lean Canvas')
    }
  }, 30_000)
  it('renders a compact decision PDF and retains explicit fictional labeling in examples', async () => {
    const pdf = await PDFDocument.load(await renderReportPdf(buildDecisionBrief()))
    expect(pdf.getPageCount()).toBe(1)
    const example = await PDFDocument.load(await renderReportPdf(buildDesignedWorkbook(true)))
    expect(example.getSubject()).toContain('Fictional')
    expect(example.getPageCount()).toBeGreaterThanOrEqual(2)
  }, 30_000)
  it('creates editable Word tables with repeated headers, landscape grid and a fiction notice', async () => {
    const document = buildCanvasTemplate('a4', true)
    const zip = await JSZip.loadAsync(await renderReportWord(document))
    const xml = await zip.file('word/document.xml')!.async('string')
    expect(xml).toContain('<w:tbl>')
    expect(xml).toContain('w:orient="landscape"')
    expect(xml).toContain('w:gridSpan w:val="2"')
    expect(xml).toContain('w:gridSpan w:val="5"')
    expect(xml).toContain('w:vMerge w:val="restart"')
    expect(xml).toContain('9 Unfair advantage')
    const headers = (await Promise.all(Object.entries(zip.files).filter(([name]) => /^word\/header\d+\.xml$/.test(name)).map(([, entry]) => entry.async('string')))).join('\n')
    expect(headers).toContain('FICTIONAL EXAMPLE')
    const reportZip = await JSZip.loadAsync(await renderReportWord(buildDesignedWorkbook()))
    const reportXml = await reportZip.file('word/document.xml')!.async('string')
    expect(reportXml).toContain('<w:tblHeader')
    expect(reportXml).toContain('Original source / dates')
    const styles = await reportZip.file('word/styles.xml')!.async('string')
    expect(styles).toContain('Arial'); expect(styles).toContain('Heading 1')
  }, 20_000)
})
