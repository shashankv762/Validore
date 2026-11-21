import { act, createElement, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { parseHTML } from 'linkedom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { writeModuleDraft } from '@/lib/planning/module-draft'
import { PlanningDraftNotice, usePlanningDraft } from '@/components/planning/PlanningDraft'

let root: Root
let container: HTMLElement
const values = new Map<string, string>()
const storage = {
  getItem: vi.fn((key: string) => values.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => { values.set(key, value) }),
  removeItem: vi.fn((key: string) => { values.delete(key) }),
}

function Form({ ideaId }: { ideaId: string }) {
  const [value, setValue] = useState({ problem: '' })
  const draft = usePlanningDraft({ module: 'pricing', ownerId: 'owner', ideaId, ideas: [
    { id: 'idea', name: 'Clinic reminders' }, { id: 'other', name: 'Stock tracking' },
  ], value, onRestore: (restored, nextIdeaId) => { setValue(restored); expect(nextIdeaId).toBe(ideaId) } })
  return <div onChangeCapture={draft.markEdited}>
    <input aria-label="Problem" value={value.problem} onChange={event => setValue({ problem: event.currentTarget.value })} />
    <button type="button" onClick={() => { draft.markEdited(); setValue({ problem: 'Updated specific customer problem' }) }}>Edit problem</button>
    <PlanningDraftNotice draft={draft} />
  </div>
}

beforeEach(() => {
  const { window, document } = parseHTML('<html><body><div id="root"></div></body></html>')
  Object.defineProperty(window, 'localStorage', { configurable: true, value: storage })
  vi.stubGlobal('window', window); vi.stubGlobal('document', document); vi.stubGlobal('self', window)
  vi.stubGlobal('Event', window.Event); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  container = document.getElementById('root') as HTMLElement
  root = createRoot(container); values.clear()
  storage.getItem.mockReset().mockImplementation(key => values.get(key) ?? null)
  storage.setItem.mockReset().mockImplementation((key, value) => { values.set(key, value) })
  storage.removeItem.mockReset().mockImplementation(key => { values.delete(key) })
})

afterEach(async () => { await act(async () => root.unmount()); vi.unstubAllGlobals(); vi.restoreAllMocks() })
const settle = async () => act(async () => { await new Promise(resolve => setTimeout(resolve, 5)) })

describe('planning draft recovery', () => {
  it('restores the selected idea, saves subsequent edits, and hides drafts from other ideas', async () => {
    writeModuleDraft(storage, 'pricing', 'owner', 'idea', { problem: 'Appointment reminders are unreliable' })
    await act(async () => root.render(createElement(Form, { ideaId: 'idea' })))
    await settle()
    expect(container.textContent).toContain('Draft available for Clinic reminders')
    const restore = [...container.querySelectorAll('button')].find(button => button.textContent === 'Restore draft')
    await act(async () => restore!.dispatchEvent(new Event('click', { bubbles: true })))
    await settle()
    expect((container.querySelector('input') as HTMLInputElement).value).toBe('Appointment reminders are unreliable')
    expect(container.textContent).toContain('Draft saved in this browser')
    expect(container.textContent).not.toContain('Draft available for')
    const edit = [...container.querySelectorAll('button')].find(button => button.textContent === 'Edit problem')
    await act(async () => edit!.dispatchEvent(new Event('click', { bubbles: true })))
    await settle()
    expect([...values.values()].some(value => value.includes('Updated specific customer problem'))).toBe(true)

    await act(async () => root.render(createElement(Form, { ideaId: 'other' })))
    await settle()
    expect(container.textContent).not.toContain('Appointment reminders are unreliable')
    expect(container.textContent).not.toContain('Draft available for')
  })

  it('reports unavailable browser storage without breaking the form', async () => {
    storage.getItem.mockImplementation(() => { throw new Error('storage blocked') })
    await act(async () => root.render(createElement(Form, { ideaId: 'idea' })))
    await settle()
    expect(container.textContent).toContain('Browser storage is unavailable')
    expect(container.querySelector('input')).toBeTruthy()
  })
})
