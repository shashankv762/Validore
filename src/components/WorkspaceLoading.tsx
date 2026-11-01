import { Network } from 'lucide-react'

export function WorkspaceLoading({ title = 'Opening your workspace', detail = 'Getting your ideas and research ready.' }: { title?: string; detail?: string }) {
  return <section className="max-w-5xl" aria-label={title}>
    <div className="loading-workspace-header" role="status"><div className="loading-workspace-symbol"><Network size={21} aria-hidden="true" /></div><div><h2>{title}</h2><p>{detail}</p></div></div>
    <div className="loading-workspace-grid" aria-hidden="true"><div className="loading-workspace-card"><div className="workspace-skeleton h-7 w-2/3" /><div className="loading-workspace-lines"><div className="workspace-skeleton" /><div className="workspace-skeleton" /></div><div className="workspace-skeleton h-24" /><div className="loading-workspace-lines"><div className="workspace-skeleton" /><div className="workspace-skeleton" /></div><div className="workspace-skeleton h-10 w-36" /></div><div className="loading-workspace-card"><div className="workspace-skeleton h-10 w-10" /><div className="workspace-skeleton h-5 w-4/5" /><div className="loading-workspace-lines"><div className="workspace-skeleton" /><div className="workspace-skeleton" /><div className="workspace-skeleton" /></div></div></div>
  </section>
}
