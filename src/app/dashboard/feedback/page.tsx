'use client'

import { useSearchParams } from 'next/navigation'
import { useState } from 'react'
import Link from 'next/link'
import { CustomerEvidence } from '@/components/CustomerEvidence'
import { useWorkspaceResources, WorkspaceResourceStatus } from '@/components/WorkspaceResources'
import './feedback.css'

export default function CustomerEvidencePage() {
  const params = useSearchParams()
  const resources = useWorkspaceResources()
  const [selected, setSelected] = useState('')
  if (resources.loading || resources.error) return <WorkspaceResourceStatus loading={resources.loading} error={resources.error} retry={resources.retry} />
  const ideaId = resources.ideas.some(idea => idea.id === selected) ? selected : resources.ideas.some(idea => idea.id === params.get('idea')) ? params.get('idea')! : resources.ideas[0]?.id ?? ''
  return <div className="customer-evidence-page"><div className="workspace-page-heading"><div><h1>Customer evidence</h1><p>Bring customer reviews, problems and ideas into one record. Understand the patterns, keep the sources, and choose the next experiment.</p></div><Link href="/dashboard/reports" className="workspace-text-link">Your reports</Link></div>
    {!resources.ideas.length ? <div className="brief-panel p-6"><h2 className="text-lg font-medium">Start with an idea</h2><p className="mt-2 text-sm text-[#657081]">Create an idea brief to connect customer evidence with your validation and planning tools.</p><Link className="workspace-text-link mt-3" href="/dashboard">Create your first idea</Link></div> : <><div className="evidence-idea-selector"><label htmlFor="feedback-idea">Idea to research</label><select id="feedback-idea" value={ideaId} onChange={event => setSelected(event.target.value)}>{resources.ideas.map(idea => <option key={idea.id} value={idea.id}>{idea.name}</option>)}</select></div><CustomerEvidence key={ideaId + resources.user?.id} ideaId={ideaId} /></>}
  </div>
}
