import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { parseHTML } from 'linkedom'

const navigation = vi.hoisted(() => ({ saved: null as string | null, path: '/dashboard', push: vi.fn(), replace: vi.fn() }))
vi.mock('next/navigation', () => ({
  usePathname: () => navigation.path,
  useSearchParams: () => new URLSearchParams(navigation.saved ? { saved: navigation.saved } : {}),
  useRouter: () => ({ push: navigation.push, replace: navigation.replace }),
}))
import { AccountProvider, notifyAccountUpdated } from '@/components/AccountProvider'
import IdeaWizard from '@/app/dashboard/page'
import PitchDeckPage from '@/app/dashboard/pitch-deck/page'
import CrowdfundingPage from '@/app/dashboard/crowdfunding/page'

const owner = '11111111-1111-4111-8111-111111111111'
const ideaId = '22222222-2222-4222-8222-222222222222'
const recordId = '33333333-3333-4333-8333-333333333333'
const badId = '44444444-4444-4444-8444-444444444444'
const account = { user: { id: owner, email: 'owner@example.test', tier: 'free', creditBalance: 100, purchasedCredits: 0, rewardCredits: 0, pitchDeckCredits: 0, crowdfundingCredits: 0 }, billing: {}, ai: {} }
const draft = { name: 'Restored startup', industry: 'Software', location: 'India', product: 'Research for startup founders', targetCustomer: 'Startup founders', coreProblem: 'Research is hard to organise', proposedSolution: 'Guided research and experiments', businessModel: 'Monthly subscription' }
let root: Root
let container: HTMLElement

beforeEach(() => {
  const { window, document } = parseHTML('<html><head></head><body><div id="root"></div></body></html>')
  const values = new Map<string, string>()
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) }
  vi.stubGlobal('window', window); vi.stubGlobal('self', window); vi.stubGlobal('document', document)
  vi.stubGlobal('HTMLElement', window.HTMLElement); vi.stubGlobal('HTMLInputElement', window.HTMLInputElement)
  vi.stubGlobal('Event', window.Event)
  vi.stubGlobal('sessionStorage', storage); vi.stubGlobal('localStorage', storage)
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  navigation.saved = null; navigation.path = '/dashboard'
  container = document.getElementById('root') as HTMLElement
  root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); vi.unstubAllGlobals(); vi.restoreAllMocks() })
const render = async (page: typeof IdeaWizard | typeof PitchDeckPage | typeof CrowdfundingPage) => {
  await act(async () => { root.render(createElement(AccountProvider, null, createElement(page))); await new Promise(resolve => setTimeout(resolve, 5)) })
}
const settle = async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 5)) }) }

describe('dashboard recovery with real mounted React effects', () => {
  it('hydrates the saved draft after the initial account request fails and a later refresh succeeds', async () => {
    let available = false
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url === '/api/me'
      ? new Response(JSON.stringify(available ? account : { error: 'Temporarily unavailable' }), { status: available ? 200 : 503 })
      : new Response(JSON.stringify({ ideas: [{ id: ideaId, ...draft }] }))))
    sessionStorage.setItem('validore:brief:' + owner, JSON.stringify({ draft, step: 1, ideaId }))
    await render(IdeaWizard); await settle()
    expect((container.querySelector('button[type="submit"]') as HTMLButtonElement).disabled).toBe(true)
    available = true
    await act(async () => { notifyAccountUpdated(); await new Promise(resolve => setTimeout(resolve, 5)) }); await settle()
    expect(container.textContent).toContain('Your customer')
    expect((container.querySelector('#targetCustomer') as HTMLInputElement).value).toBe(draft.targetCustomer)
    expect((container.querySelector('button[type="submit"]') as HTMLButtonElement).disabled).toBe(false)
    expect(JSON.parse(sessionStorage.getItem('validore:brief:' + owner)!).draft.name).toBe(draft.name)
  })
  it.each(['pitch-deck', 'crowdfunding'] as const)('shows a recoverable error for incomplete historical %s records', async module => {
    navigation.path = '/dashboard/' + module; navigation.saved = badId
    const malformed = module === 'pitch-deck'
      ? { id: badId, ideaId, qualityScore: 50, founderReadinessScore: 50, slides: null }
      : { id: badId, ideaId, performanceScore: 50, recommendation: 'TEST_FURTHER', reportData: null }
    vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(JSON.stringify(url === '/api/me' ? account : url === '/api/ideas' ? { ideas: [{ id: ideaId, name: 'Validore' }] } : url.includes('?id=') ? { record: malformed } : { records: [], hasMore: false }))))
    await render(module === 'pitch-deck' ? PitchDeckPage : CrowdfundingPage); await settle(); await settle()
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('This saved result is incomplete')
    expect(container.textContent).toContain('Try again')
    expect(container.textContent).not.toContain('Opening your saved result')
  })
  it('preserves an already-open valid pitch deck when another historical record is malformed', async () => {
    navigation.path = '/dashboard/pitch-deck'; navigation.saved = recordId
    const valid = { id: recordId, ideaId, qualityScore: 50, founderReadinessScore: 50, slides: [{ slideNumber: 1, title: 'Saved valid deck', content: 'Selected content remains visible', keyPoints: [], speakerNotes: '' }], investorQa: [], roadmap: [], reportData: { ai: { integrityNote: 'Test assumptions with customers.' } } }
    vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(JSON.stringify(url === '/api/me' ? account : url === '/api/ideas' ? { ideas: [{ id: ideaId, name: 'Validore' }] } : url.includes('?id=') ? { record: url.endsWith(recordId) ? valid : { ...valid, id: badId, slides: null } } : { records: [], hasMore: false }))))
    await render(PitchDeckPage); await settle(); await settle()
    expect(container.textContent).toContain('Selected content remains visible')
    navigation.saved = badId
    await render(PitchDeckPage); await settle()
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('This saved result is incomplete')
    expect(container.textContent).toContain('Selected content remains visible')
    expect(container.textContent).toContain('Test assumptions with customers.')
  })
})
