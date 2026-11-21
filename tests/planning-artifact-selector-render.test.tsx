import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { parseHTML } from 'linkedom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/components/AccountProvider', () => ({ useAccount: () => ({ data: { user: { id: 'owner' } } }) }))

import { PlanningArtifactSelector } from '@/components/planning/PlanningArtifactSelector'

let root: Root
let container: HTMLElement
let requestedPages: string[]
let firstPageFails = false

beforeEach(() => {
  const { window, document } = parseHTML('<html><body><div id="root"></div></body></html>')
  vi.stubGlobal('window', window); vi.stubGlobal('document', document); vi.stubGlobal('self', window)
  vi.stubGlobal('Event', window.Event); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  container = document.getElementById('root') as HTMLElement
  root = createRoot(container)
  requestedPages = []; firstPageFails = false
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input), 'http://localhost')
    const page = url.searchParams.get('page') ?? ''
    requestedPages.push(page)
    if (firstPageFails && page === '1') return { ok: false, json: async () => ({ error: 'History is temporarily unavailable.' }) }
    const start = page === '2' ? 21 : 1
    const records = Array.from({ length: 20 }, (_, index) => ({ id: `artifact-${start + index}`, module: 'pricing', version: start + index, createdAt: '2026-11-16T12:00:00.000Z' }))
    return { ok: true, json: async () => ({ records, hasMore: page === '1' }) }
  }))
})

afterEach(async () => { await act(async () => root.unmount()); vi.unstubAllGlobals(); vi.restoreAllMocks() })

const settle = async () => act(async () => { await new Promise(resolve => setTimeout(resolve, 5)) })
const render = async () => { await act(async () => root.render(createElement(PlanningArtifactSelector, { ideaId: 'idea', module: 'pricing', value: '', onChange: vi.fn() }))); await settle() }

describe('saved planning artifact selection', () => {
  it('can page through saved artifacts older than the first 20', async () => {
    await render()
    expect(container.textContent).toContain('Pricing analysis v')
    const older = [...container.querySelectorAll('button')].find(button => button.textContent === 'Older versions')
    expect(older?.disabled).toBe(false)
    await act(async () => older!.dispatchEvent(new Event('click', { bubbles: true })))
    await settle()
    expect(requestedPages).toEqual(['1', '2'])
    expect([...container.querySelectorAll('option')].some(option => option.value === 'artifact-21')).toBe(true)
    expect([...container.querySelectorAll('button')].find(button => button.textContent === 'Newer versions')?.disabled).toBe(false)
  })

  it('exposes a retry after a history request fails', async () => {
    firstPageFails = true
    await render()
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('History is temporarily unavailable.')
    firstPageFails = false
    const retry = [...container.querySelectorAll('button')].find(button => button.textContent === 'Try again')
    await act(async () => retry!.dispatchEvent(new Event('click', { bubbles: true })))
    await settle()
    expect(container.querySelector('[role="alert"]')).toBeNull()
    expect(requestedPages).toEqual(['1', '1'])
  })
})
