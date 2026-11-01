'use client'
import { useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowUpRight, CircleCheck, FileText, Lightbulb } from 'lucide-react'

const tabs = ['Overview', 'Next steps']
const dimensions = [{ label: 'Problem', value: 13, total: 20 }, { label: 'Customer', value: 12, total: 20 }, { label: 'Market', value: 10, total: 15 }]

export function ReportPreview() {
  const [selected, setSelected] = useState(0)
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])
  return <div className="report-preview" aria-label="Interactive preview of a fictional validation report">
    <div className="preview-toolbar"><span><FileText size={14} aria-hidden="true" />Validation report</span><span className="sample-label">Sample</span></div>
    <div className="preview-body"><div className="preview-title"><div><p>Idea / CampusBorrow</p><h2>Worth exploring.<br />Start smaller.</h2></div><div className="preview-score" aria-label="Illustrative score: 62 out of 100"><svg viewBox="0 0 96 96" aria-hidden="true"><circle cx="48" cy="48" r="41" className="score-track" /><circle cx="48" cy="48" r="41" pathLength="100" strokeDasharray="62 100" className="score-value" /></svg><span>62<small>/ 100</small></span></div></div>
      <p className="preview-verdict"><span className="verdict-dot" aria-hidden="true" />Modify<small>Test demand on one campus first.</small></p>
      <div className="preview-tabs" role="tablist" aria-label="Sample report sections">{tabs.map((tab, index) => <button key={tab} ref={element => { tabRefs.current[index] = element }} id={'preview-tab-' + index} type="button" role="tab" aria-selected={selected === index} aria-controls={'preview-panel-' + index} tabIndex={selected === index ? 0 : -1} onClick={() => setSelected(index)} onKeyDown={event => {
        const target = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : null
        if (target !== null) { event.preventDefault(); setSelected(target); tabRefs.current[target]?.focus() }
      }}>{tab}</button>)}</div>
      <div id="preview-panel-0" role="tabpanel" aria-labelledby="preview-tab-0" tabIndex={0} hidden={selected !== 0} className="preview-panel"><div className="preview-dimensions">{dimensions.map(item => <div key={item.label}><div className="dimension-label"><span>{item.label}</span><span>{item.value}<small> / {item.total}</small></span></div><div className="dimension-track"><span style={{ transform: `scaleX(${item.value / item.total})` }} /></div></div>)}</div><p className="preview-insight"><Lightbulb size={16} aria-hidden="true" /><span><strong>The assumption to test</strong>Will students trust a peer with their equipment?</span></p></div>
      <div id="preview-panel-1" role="tabpanel" aria-labelledby="preview-tab-1" tabIndex={0} hidden={selected !== 1} className="preview-panel"><ol className="preview-next"><li><CircleCheck size={17} aria-hidden="true" /><span><strong>Talk to potential borrowers</strong>Find out how they solve this problem today.</span></li><li><CircleCheck size={17} aria-hidden="true" /><span><strong>Run a small lending pilot</strong>Start with one category on one campus.</span></li><li><CircleCheck size={17} aria-hidden="true" /><span><strong>Measure repeat demand</strong>Track loans, disputes, and return visits.</span></li></ol></div>
    </div><div className="preview-footer"><span>Fictional example. Real questions.</span><Link href="/demo" aria-label="Open the full sample report"><ArrowUpRight size={20} aria-hidden="true" /></Link></div>
  </div>
}
