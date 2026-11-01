import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { buildReportDocument } from '@/lib/exports/document'
import { renderReportPdf } from '@/lib/exports/pdf'
import { renderReportWord } from '@/lib/exports/word'

const report = {
  id: 'private-record-id', userId: 'private-owner-id', provider: 'private-provider', overallScore: 71, problemScore: 15, customerScore: 14,
  decision: 'CONDITIONAL_GO', status: 'partial', createdAt: '2026-10-31T10:00:00Z',
  keyRisks: ['Customer budgets need direct testing.'], actionPlan: [{ week: 'Week 1', action: 'Interview ten potential customers.' }],
  reportData: { researchSources: [{ title: 'Original source', url: 'https://example.org/evidence', content: 'Source excerpt for review.' }],
    scenarios: Array.from({ length: 35 }, (_, index) => ({ scenario: 'Scenario ' + index, assumption: 'This is an unverified planning assumption. '.repeat(10) })),
    finalFinding: 'FINAL FINDING: test the customer problem before scaling.',
  },
}

describe('complete report documents', () => {
  it('includes saved evidence and final sections without technical identifiers', () => {
    const document = buildReportDocument(report, { name: 'Launch research sample' }, 'validation')
    const text = JSON.stringify(document)
    expect(document.partial).toBe(true)
    expect(text).toContain('FINAL FINDING')
    expect(text).toContain('https://example.org/evidence')
    expect(text).not.toContain('private-owner-id')
    expect(text).not.toContain('private-provider')
  })
  it('creates a real multi-page PDF with embedded font assets', async () => {
    const buffer = await renderReportPdf(buildReportDocument(report, { name: 'Launch research sample' }, 'validation'))
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-')
    expect(buffer.length).toBeGreaterThan(10000)
    expect(buffer.toString('latin1')).toMatch(/\/Subtype \/Image/)
    expect(buffer.toString('latin1').match(/\/Type \/Page\b/g)!.length).toBeGreaterThan(1)
  }, 20000)
  it('creates an editable Word package with every section and the logo', async () => {
    const buffer = await renderReportWord(buildReportDocument(report, { name: 'Launch research sample' }, 'validation'))
    const zip = await JSZip.loadAsync(buffer)
    const xml = await zip.file('word/document.xml')!.async('string')
    expect(xml).toContain('FINAL FINDING')
    expect(xml).toContain('https://example.org/evidence')
    expect(xml).toContain('Scenario 34')
    expect(Object.keys(zip.files).some(name => name.startsWith('word/media/'))).toBe(true)
  })
  it('bounds the whole document and marks truncation for oversized stored content', () => {
    const document = buildReportDocument({ reportData: Object.fromEntries(Array.from({ length: 140 }, (_, index) => ['section' + index, 'x'.repeat(16000)])) }, null, 'validation')
    expect(JSON.stringify(document).length).toBeLessThan(190000)
    expect(document.sections.some(section => section.title === 'Document size limit')).toBe(true)
  })
})
