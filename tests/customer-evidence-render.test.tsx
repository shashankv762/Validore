import { act, createElement, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { parseHTML } from 'linkedom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FeedbackRecord, FeedbackView } from '@/lib/customer-feedback/schema'

const mocks = vi.hoisted(() => ({ notify: vi.fn() }))
vi.mock('@/components/AccountProvider', () => ({ useAccount: () => ({ data: { user: { id: 'owner', emailVerified: true } } }), notifyAccountUpdated: mocks.notify }))
vi.mock('next/link', () => ({ default: ({ children, ...props }: { children: ReactNode; href: string }) => createElement('a', props, children) }))
import { CustomerEvidence } from '@/components/CustomerEvidence'

const ideaId = '11111111-2222-4333-8444-000000000001'
const recordId = '11111111-2222-4333-8444-000000000002'
const record: FeedbackRecord = { id: recordId, kind: 'interview', content: 'Three shop owners spend hours reconciling stock each week.',
  sourceLabel: 'Founder interviews, Pune', sourceUrl: null, occurredAt: null, rating: null, sentiment: null,
  provenance: 'owner_recorded', fetchedAt: null, createdAt: '2026-11-20T00:00:00.000Z' }
const analyzed: FeedbackView = { records: [record], totalRecords: 1, readOnly: false, staleAnalysis: false, analysis: {
  id: '22222222-2222-4333-8444-000000000002', sourceDigest: 'synthetic', methodVersion: 'test', ideaFingerprint: 'test',
  analyzedRecords: 1, totalRecords: 1, createdAt: '2026-11-20T00:00:00.000Z', data: {
    summary: 'One recorded interview describes weekly reconciliation effort. This is a problem signal, not proof of demand.',
    observations: [{ recordId, sentiment: 'negative', quote: 'spend hours reconciling stock each week',
      reason: 'The owner reports repeated time spent on a past task.', aspects: ['Time'] }],
    themes: [{ theme: 'Weekly reconciliation effort', recordIds: [recordId], customerProblem: 'One owner describes recurring effort.',
      opportunityHypothesis: 'A reminder may help owners complete checks more regularly.',
      nextExperiment: { method: 'Test a two-week reminder with shop owners.', metric: 'Completed weekly checks.',
        passThreshold: 'At least four of six owners complete both checks.', failThreshold: 'Two or fewer owners complete both checks.' } }],
    opposingSignals: [], unansweredQuestions: ['Who pays for this workflow today?'],
    limitations: ['One owner-recorded interview is not a representative sample.'],
  },
} }

let root: Root
let container: HTMLElement
let view: FeedbackView
let failLoad: boolean
let writes: Array<{ action: string; body: Record<string, unknown> }>

beforeEach(() => {
  const { window, document } = parseHTML('<html><body><div id="root"></div></body></html>')
  Object.defineProperty(window.HTMLFormElement.prototype, 'reset', { configurable: true, value() {} })
  vi.stubGlobal('window', window); vi.stubGlobal('document', document); vi.stubGlobal('self', window)
  vi.stubGlobal('Event', window.Event); vi.stubGlobal('HTMLElement', window.HTMLElement); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('crypto', { randomUUID: () => '33333333-2222-4333-8444-000000000003' })
  vi.stubGlobal('FormData', class {
    private values: Array<[string, string]>
    constructor(form: HTMLFormElement) {
      this.values = [...form.querySelectorAll('input, textarea, select')].flatMap(control => {
        const field = control as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
        if (!field.name || (field instanceof window.HTMLInputElement && field.type === 'checkbox' && !field.checked)) return []
        return [[field.name, field.value] as [string, string]]
      })
    }
    entries() { return this.values[Symbol.iterator]() }
    get(name: string) { return this.values.find(([key]) => key === name)?.[1] ?? null }
  })
  mocks.notify.mockReset(); view = { records: [], totalRecords: 0, analysis: null, staleAnalysis: false, readOnly: false }; failLoad = false; writes = []
  vi.stubGlobal('fetch', vi.fn(async (_url: string, options?: RequestInit) => {
    if (options?.method && options.method !== 'GET') {
      const body = JSON.parse(options.body as string) as Record<string, unknown>
      writes.push({ action: String(body.action), body })
      if (body.action === 'record') {
        view = { ...view, records: [record], totalRecords: 1 }
        return Response.json(view)
      }
      if (body.action === 'analyze') return Response.json({ ...analyzed, creditsCharged: 20, reused: false })
      return Response.json({ error: 'Unexpected write' }, { status: 400 })
    }
    return Response.json(failLoad ? { error: 'Evidence is temporarily unavailable.' } : view, { status: failLoad ? 503 : 200 })
  }))
  container = document.getElementById('root') as HTMLElement; root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); vi.unstubAllGlobals(); vi.restoreAllMocks() })
const settle = async () => act(async () => { await new Promise(resolve => setTimeout(resolve, 8)) })
const render = async () => { await act(async () => root.render(createElement(CustomerEvidence, { ideaId }))); await settle() }
const click = async (element: HTMLElement) => { await act(async () => element.dispatchEvent(new Event('click', { bubbles: true }))); await settle() }
const fill = async (element: HTMLInputElement | HTMLTextAreaElement, value: string) => {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value')?.set
  await act(async () => { setter?.call(element, value); if (!setter) element.value = value; element.dispatchEvent(new Event('input', { bubbles: true })); element.dispatchEvent(new Event('change', { bubbles: true })) })
}
const select = async (element: HTMLSelectElement, value: string) => {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value')?.set
  await act(async () => { if (setter) setter.call(element, value); else Object.defineProperty(element, 'value', { configurable: true, value }); element.dispatchEvent(new Event('change', { bubbles: true })) })
}

describe('Mounted customer-evidence workflow', () => {
  it('renders a useful empty state and recovers from a temporary read failure', async () => {
    failLoad = true; await render()
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Evidence is temporarily unavailable.')
    failLoad = false
    const retry = [...container.querySelectorAll('button')].find(button => button.textContent?.includes('Try again'))!
    await click(retry)
    expect(container.textContent).toContain('No customer evidence recorded yet.')
  })

  it('records a customer observation, analyzes it and renders the saved grounded result', async () => {
    await render()
    const checkbox = container.querySelector('input[type="checkbox"]') as HTMLInputElement
    await act(async () => { checkbox.checked = true; checkbox.dispatchEvent(new Event('click', { bubbles: true })) })
    await select(container.querySelector('#feedback-kind') as HTMLSelectElement, 'interview')
    await fill(container.querySelector('#feedback-content')!, record.content)
    await fill(container.querySelector('#feedback-source')!, record.sourceLabel)
    const form = container.querySelector('.evidence-record-form') as HTMLFormElement
    Object.defineProperty(form, 'reset', { configurable: true, value: () => {} })
    await act(async () => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))); await settle()
    expect(writes[0]).toMatchObject({ action: 'record', body: { consent: true, kind: 'interview', content: record.content, sourceLabel: record.sourceLabel } })
    expect(container.textContent).toContain('Evidence recorded and ready for research.')
    expect(container.textContent).toContain(record.content)

    const analyze = [...container.querySelectorAll('button')].find(button => button.textContent?.includes('Analyze evidence'))!
    await click(analyze)
    expect(writes[1].action).toBe('analyze')
    expect(container.textContent).toContain('One recorded interview describes weekly reconciliation effort.')
    expect(container.textContent).toContain('Weekly reconciliation effort')
    expect(container.textContent).toContain('One owner-recorded interview is not a representative sample.')
    expect(container.textContent).toContain('Analysis saved. 20 credits used.')
    expect(mocks.notify).toHaveBeenCalledOnce()
  })
})
