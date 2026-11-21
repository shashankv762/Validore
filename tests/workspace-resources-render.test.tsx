import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { parseHTML } from 'linkedom'

const navigation = vi.hoisted(() => ({ replace: vi.fn() }))
vi.mock('next/navigation', () => ({ usePathname: () => '/dashboard/pricing', useRouter: () => ({ replace: navigation.replace }) }))
import { AccountProvider, notifyAccountUpdated } from '@/components/AccountProvider'
import { useWorkspaceResources, WorkspaceResourceStatus } from '@/components/WorkspaceResources'

const account = (id = 'owner-a') => ({ user: { id, tier: 'free' }, billing: {}, ai: {} })
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
let root: Root
let container: HTMLElement

function Workspace() {
  const resources = useWorkspaceResources()
  if (resources.loading || resources.error) return createElement(WorkspaceResourceStatus, resources)
  return createElement('div', null, 'Workspace ready: ' + resources.ideas.map(idea => idea.name).join(', '))
}
const settle = async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 5)) }) }
const render = async () => {
  await act(async () => { root.render(createElement(AccountProvider, null, createElement(Workspace))) })
  await settle()
}

beforeEach(() => {
  const { window, document } = parseHTML('<html><body><div id="root"></div></body></html>')
  vi.stubGlobal('window', window); vi.stubGlobal('document', document); vi.stubGlobal('self', window)
  vi.stubGlobal('HTMLElement', window.HTMLElement); vi.stubGlobal('Event', window.Event)
  vi.stubGlobal('localStorage', { setItem: vi.fn() }); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  container = document.getElementById('root') as HTMLElement
  root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('mounted workspace resource loading and recovery', () => {
  it('shows the server’s setup explanation and recovers after the database is repaired without reloading the page', async () => {
    let available = false
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url === '/api/me' ? response(account()) : available
      ? response({ ideas: [{ id: 'saved-idea', name: 'Preserved idea' }] })
      : response({ code: 'workspace_setup_required', error: 'Your workspace needs a database update. Please contact support.' }, 503)))
    await render()
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('database update')
    available = true
    await act(async () => { container.querySelector('button')!.click() })
    await settle()
    expect(container.textContent).toContain('Workspace ready: Preserved idea')
    expect(container.querySelector('[role="alert"]')).toBeNull()
  })

  it.each([{}, { ideas: null }, { ideas: {} }, { ideas: [{ id: 'bad', name: null }] }])('rejects malformed successful responses instead of crashing or treating them as an empty workspace: %j', async body => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => response(url === '/api/me' ? account() : body)))
    await render()
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Your workspace could not be loaded')
    expect(container.textContent).not.toContain('Workspace ready')
  })

  it('accepts an actually empty workspace', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => response(url === '/api/me' ? account() : { ideas: [] })))
    await render()
    expect(container.textContent).toContain('Workspace ready:')
    expect(container.querySelector('[role="alert"]')).toBeNull()
  })

  it('distinguishes a real expired session from maintenance', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url === '/api/me' ? response(account()) : response({ error: 'Unauthorized' }, 401)))
    await render()
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Your session has expired')
  })

  it('keeps the controlled maintenance message visible', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url === '/api/me' ? response(account()) : response({ code: 'maintenance_enabled', error: 'Planned maintenance. Please return shortly.' }, 503)))
    await render()
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Planned maintenance')
    expect(container.textContent).not.toContain('session has expired')
  })

  it('never exposes a previous owner’s delayed idea response after the account changes', async () => {
    let owner = 'owner-a'
    let resolveOld!: (value: Response) => void
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url === '/api/me') return response(account(owner))
      if (owner === 'owner-a') return new Promise<Response>(resolve => { resolveOld = resolve })
      return response({ ideas: [{ id: 'idea-b', name: 'Current owner idea' }] })
    }))
    await render()
    expect(container.querySelector('[role="status"]')).not.toBeNull()
    owner = 'owner-b'
    await act(async () => { notifyAccountUpdated() }); await settle()
    await act(async () => { resolveOld(response({ ideas: [{ id: 'idea-a', name: 'PRIVATE old owner idea' }] })) }); await settle()
    expect(container.textContent).toContain('Current owner idea')
    expect(container.textContent).not.toContain('PRIVATE')
  })
})
