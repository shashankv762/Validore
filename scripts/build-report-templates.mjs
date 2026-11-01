import { mkdir, writeFile } from 'node:fs/promises'
import { createServer } from 'vite'

// Load the same TypeScript renderers used by Next and the export tests.
const runner = await createServer({ configFile: false, server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
try {
  const { buildReportTemplate } = await runner.ssrLoadModule('/src/lib/exports/template.ts')
  const { renderReportPdf } = await runner.ssrLoadModule('/src/lib/exports/pdf.ts')
  const { renderReportWord } = await runner.ssrLoadModule('/src/lib/exports/word.ts')
  const template = buildReportTemplate()
  await mkdir('public/templates', { recursive: true })
  await writeFile('public/templates/validore-report-template.pdf', await renderReportPdf(template))
  await writeFile('public/templates/validore-report-template.docx', await renderReportWord(template))
  console.log('Created the branded PDF and editable Word report templates.')
} finally {
  await runner.close()
}
