import Link from 'next/link'
import type { ReactNode } from 'react'
import { LEGAL } from '@/lib/legal'

export type PolicySection = { id: string; title: string; content: ReactNode }

export function PolicyPage({ eyebrow, title, summary, sections }: { eyebrow: string; title: string; summary: string; sections: PolicySection[] }) {
  return <main id="main-content" className="policy-main">
    <header className="policy-heading"><p className="policy-eyebrow">{eyebrow}</p><h1>{title}</h1><p className="policy-summary">{summary}</p>
      <p className="policy-updated">Updated {LEGAL.updated} <span aria-hidden="true">·</span> Version {LEGAL.version}</p>
    </header>
    <div className="policy-grid"><aside className="policy-toc"><nav aria-label="On this page"><p>On this page</p><ol>{sections.map((section, index) => <li key={section.id}><a href={'#' + section.id}><span>{String(index + 1).padStart(2, '0')}</span>{section.title}</a></li>)}</ol></nav>
      <div className="policy-contact"><strong>Need a hand?</strong><a href={'mailto:' + LEGAL.contact}>{LEGAL.contact}</a></div>
    </aside><article className="policy-content">{sections.map((section, index) => <section id={section.id} key={section.id}><h2><span>{String(index + 1).padStart(2, '0')}</span>{section.title}</h2>{section.content}</section>)}
      <div className="policy-end"><p>Operated by {LEGAL.operator}, {LEGAL.country}.</p><Link href="/dashboard/settings">Manage your account</Link></div>
    </article></div>
  </main>
}
