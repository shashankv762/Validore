import { CheckCircle2, AlertCircle, Network, ChevronDown, Search, Calculator, BookOpen } from 'lucide-react'

const LABELS: Record<string, string> = { market: 'Market', customer: 'Customer', competitor: 'Competition', finance: 'Finance', risk: 'Risk', evidence: 'Sources', product: 'Product', growth: 'Growth', synthesis: 'Review', monolithic: 'Combined review' }
const TOOLS: Record<string, string> = { recall_market_memory: 'Market memory', read_market_indicator: 'Official market data', search_web: 'Source search', read_page: 'Page reading', list_evidence: 'Evidence review', inspect_evidence: 'Source coverage', calculate: 'Calculation', calculate_financials: 'Financial check', compare_financial_scenarios: 'Scenario comparison', calculate_runway: 'Cash runway', estimate_market: 'Market sizing', rank_priorities: 'Priority ranking', estimate_sample_size: 'Survey planning', analyze_conversion: 'Conversion analysis' }
const object = (value: unknown) => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}

export function AgentActivity({ trail, defaultOpen = false }: { trail: unknown; defaultOpen?: boolean }) {
  const data = object(trail)
  const agents = Object.entries(object(data.agents)).filter(([name, status]) => LABELS[name] && typeof status === 'string')
  const events = (Array.isArray(data.tools) ? data.tools : []).map(object).filter(item => typeof item.tool === 'string' && typeof item.summary === 'string').slice(0, 60)
  if (!agents.length) return null
  return <details className="agent-activity" open={defaultOpen}>
    <summary><Network size={18} aria-hidden="true" /><span><strong>Research activity</strong><small>{agents.length} specialists · {events.length ? events.length + ' recorded tool calls' : 'No tool calls recorded'}</small></span><ChevronDown size={16} aria-hidden="true" /></summary>
    <div className="agent-activity-body"><div className="agent-result-list">{agents.map(([name, status]) => <span key={name} className={status === 'ok' ? 'agent-result-success' : 'agent-result-incomplete'}>
      {status === 'ok' ? <CheckCircle2 size={13} aria-hidden="true" /> : <AlertCircle size={13} aria-hidden="true" />}{LABELS[name]}<span>{status === 'ok' ? 'Complete' : 'Incomplete'}</span>
    </span>)}</div>
    {events.length ? <ol className="agent-event-list">{events.map((event, index) => <li key={index}>
      <span className="agent-event-icon" aria-hidden="true">{String(event.tool).startsWith('calculate') ? <Calculator size={15} /> : event.tool === 'search_web' ? <Search size={15} /> : <BookOpen size={15} />}</span>
      <div><strong>{TOOLS[String(event.tool)] || 'Research tool'}<span>{LABELS[String(event.agent)] || 'Research'}</span></strong><p>{String(event.summary)}</p></div>
      <span className={'agent-event-status ' + (event.status === 'complete' ? '' : 'is-unavailable')}>{event.status === 'complete' ? 'Complete' : event.status === 'limited' ? 'Budget reached' : 'Unavailable'}</span>
    </li>)}</ol> : <p className="agent-activity-note">This report has no recorded tool activity. Specialist completion alone does not verify its claims.</p>}
    <p className="agent-activity-note">Tools retrieve sources and check calculations. The report still needs your judgment and customer evidence.</p></div>
  </details>
}
