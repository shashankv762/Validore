import { FileText, Download } from 'lucide-react'

export function ReportTemplateDownloads() {
  return <section className="card-angular mt-8 flex flex-wrap items-center justify-between gap-5 p-5 sm:p-6" aria-label="Report template downloads">
    <div className="max-w-xl"><h2 className="flex items-center gap-2 text-lg font-medium text-[#141923]"><FileText size={19} aria-hidden="true" />Your report template</h2>
      <p className="mt-2 text-sm leading-relaxed text-[#667085]">A structured guide to your decision, market evidence, economics, experiments, and source register. Edit the Word version or use the PDF as a reference.</p></div>
    <div className="flex flex-wrap gap-3">
      <a href="/templates/validore-report-template.pdf" download className="inline-flex items-center gap-2 rounded-lg border border-[#D9DDE5] bg-white px-4 py-3 text-sm font-medium text-[#141923] hover:bg-[#F7F8FA]"><Download size={15} aria-hidden="true" />PDF template</a>
      <a href="/templates/validore-report-template.docx" download className="workspace-button-primary inline-flex items-center gap-2"><Download size={15} aria-hidden="true" />Word template</a>
    </div>
  </section>
}
