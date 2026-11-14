import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { parseHTML } from 'linkedom'
import type { AdminPlan, AdminUser, AdminUserDetail } from '@/lib/admin-types'

const router = vi.hoisted(() => ({ refresh: vi.fn() }))
vi.mock('@/components/Brand', () => ({ Brand: () => createElement('span', null, 'Validore') }))
vi.mock('next/link', () => ({ default: ({ children, ...props }: { children: ReactNode; href: string }) => createElement('a', props, children) }))
vi.mock('next/navigation', () => ({ useRouter: () => router }))
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }))
import AdminConsole from '@/app/admin/AdminConsole'

const account: AdminUser = { id: '11111111-1111-4111-8111-111111111111', email: 'founder@example.test', tier: 'free', accountStatus: 'active', isAdmin: false,
  statusReason: null, statusChangedAt: null, subscriptionStatus: null, createdAt: '2026-11-01T00:00:00Z', lastActiveAt: null,
  creditBalance: 50, purchasedCredits: 10, rewardCredits: 0, crowdfundingCredits: 0, pitchDeckCredits: 0 }
const second = { ...account, id: '22222222-2222-4222-8222-222222222222', email: 'second@example.test' }
const admin = { ...account, id: '33333333-3333-4333-8333-333333333333', email: 'owner@example.test', isAdmin: true }
const metadata = { page: 1, pageSize: 25, totalPages: 1, total: 3 }
const overview = { updatedAt: '2026-11-13T00:00:00Z', users: { total: 3, active: 3, blocked: 0, deactivated: 0, newThisWeek: 1 }, activity: { ideas: 4, reports: 2, activeJobs: 1, failedJobs: 0, creditsGranted: 0 }, recentActivity: [] }
const platform = { announcement: { enabled: true, message: 'Current announcement' }, maintenance: { enabled: false, message: '' }, signupEnabled: true }
const plan: AdminPlan = { tier: 'free', name: 'Free', monthlyPriceUsd: 0, monthlyCredits: 100, validationLimit: 2, activeIdeaLimit: 1, benefits: ['100 monthly credits'], stripePriceId: null, advertised: true,
  maxConcurrentRequests: 1, maxTokensPerCall: 24000, canExportPdf: true, canExportCsv: false, canExportPptx: false, canWhitelabelPdf: false, canPortfolioExport: false, canLeanCanvas: true, canAiLeanCanvas: false, canPricingSimulator: false, canCrowdfunding: false, canPitchDeck: false }
const detail = (user: AdminUser): AdminUserDetail => ({ user, stats: { ideas: 2, reports: 1, validations: 1 }, recentCredits: [], recentActivity: [] })
let root: Root
let container: HTMLElement
let responseDetail: AdminUserDetail
let writes: { method: string; body: Record<string, unknown> }[]
let failWrite: boolean
let failAccounts: boolean

beforeEach(() => {
  router.refresh.mockClear()
  const { window, document } = parseHTML('<html><head></head><body><div id="root"></div></body></html>')
  Object.defineProperty(window.HTMLElement.prototype, 'open', { configurable: true, get() { return this.hasAttribute('open') } })
  Object.assign(window.HTMLElement.prototype, { showModal(this: HTMLDialogElement) { this.setAttribute('open', '') }, close(this: HTMLDialogElement) { this.removeAttribute('open') } })
  Object.assign(window, { requestAnimationFrame: (callback: () => void) => { callback(); return 1 } })
  vi.stubGlobal('window', window); vi.stubGlobal('document', document); vi.stubGlobal('self', window)
  vi.stubGlobal('HTMLElement', window.HTMLElement); vi.stubGlobal('HTMLInputElement', window.HTMLInputElement)
  vi.stubGlobal('Event', window.Event); vi.stubGlobal('MouseEvent', window.Event)
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  writes = []; failWrite = false; failAccounts = false; responseDetail = detail(account)
  vi.stubGlobal('fetch', vi.fn(async (url: string, options?: RequestInit) => {
    if (options?.method && options.method !== 'GET') {
      writes.push({ method: options.method, body: JSON.parse(options.body as string) })
      return new Response(JSON.stringify(failWrite ? { error: 'Temporary interruption' } : { success: true }), { status: failWrite ? 503 : 200 })
    }
    if (url === '/api/admin/overview') return new Response(JSON.stringify(overview))
    if (url.startsWith('/api/admin/users?')) return new Response(JSON.stringify(failAccounts ? { error: 'Access denied', code: 'not_found' } : { users: [account, second, admin], ...metadata }), { status: failAccounts ? 403 : 200 })
    if (url.startsWith('/api/admin/users/')) return new Response(JSON.stringify(responseDetail))
    if (url.startsWith('/api/admin/audit?')) return new Response(JSON.stringify({ entries: [], ...metadata }))
    if (url === '/api/admin/settings') return new Response(JSON.stringify({ settings: platform, updatedAt: '2026-11-13T00:00:00Z' }))
    if (url === '/api/admin/plans') return new Response(JSON.stringify({ plans: [plan] }))
    return new Response(JSON.stringify({ error: 'Unexpected request' }), { status: 500 })
  }))
  container = document.getElementById('root') as HTMLElement; root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); vi.unstubAllGlobals(); vi.restoreAllMocks() })
const settle = async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 5)) }) }
const render = async () => { await act(async () => { root.render(createElement(AdminConsole)) }); await settle() }
const button = (text: string, scope: ParentNode = container) => [...scope.querySelectorAll('button')].find(item => item.textContent?.trim() === text) as HTMLButtonElement
const click = async (element: HTMLElement) => { expect(element).toBeTruthy(); await act(async () => { element.dispatchEvent(new Event('click', { bubbles: true })) }); await settle() }
const fill = async (element: HTMLInputElement | HTMLTextAreaElement, value: string) => {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value')?.set
  await act(async () => {
    if (setter) setter.call(element, value); else element.value = value
    element.dispatchEvent(new Event('input', { bubbles: true })); element.dispatchEvent(new Event('change', { bubbles: true }))
  })
}
const submit = async (form: HTMLFormElement) => { await act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) }); await settle() }

describe('mounted owner command center', () => {
  it('offers direct sign-out through the existing native POST endpoint', async () => {
    await render()
    const signout = container.querySelector('#admin-navigation form[action="/api/auth/signout"]')!
    expect(signout.getAttribute('method')).toBe('post')
    const submitButton = button('Sign out', signout)
    expect(submitButton.getAttribute('type')).toBe('submit')
    expect(submitButton.disabled).toBe(false)
    expect(writes).toHaveLength(0)
    expect(router.refresh).not.toHaveBeenCalled()
  })

  it('loads recorded metrics, protects the owner selection and grants only after review with a stable retry reference', async () => {
    await render()
    expect(container.textContent).toContain('Registered accounts')
    expect(writes).toHaveLength(0)
    await click(button('Accounts'))
    expect((container.querySelector('[aria-label="Select owner@example.test"]') as HTMLInputElement).disabled).toBe(true)
    await click(container.querySelector('[aria-label="Select all eligible accounts on this page"]') as HTMLElement)
    expect(container.textContent).toContain('2 accounts selected')
    await click(button('Grant credits'))
    const grant = container.querySelector('dialog[aria-label="Grant credits"]')!
    await fill(grant.querySelector('input[type="number"]')!, '200')
    await fill(grant.querySelector('textarea')!, 'Customer support correction')
    await submit(grant.querySelector('form')!)
    expect(writes).toHaveLength(0)
    expect(container.querySelector('dialog[aria-label="Review credit grant"]')?.textContent).toContain('400 total credits')
    failWrite = true
    await submit(container.querySelector('dialog[aria-label="Review credit grant"] form')!)
    expect(writes).toHaveLength(1)
    expect(writes[0].body).toMatchObject({ userIds: [account.id, second.id], amount: 200, type: 'general', reason: 'Customer support correction' })
    expect(writes[0].body.requestId).toMatch(/^[a-f\d-]{36}$/)
    expect(container.textContent).toContain('Temporary interruption')
    failWrite = false
    await submit(container.querySelector('dialog[aria-label="Review credit grant"] form')!)
    expect(writes[1].body.requestId).toBe(writes[0].body.requestId)
    expect(container.querySelector('dialog[aria-label="Review credit grant"]')).toBeNull()
    expect(container.textContent).not.toContain('accounts selected')
    expect(router.refresh).not.toHaveBeenCalled()
  })

  it('requires deactivation and typed email, and resumes a previously pending deletion with its original key and reason', async () => {
    await render(); await click(button('Accounts')); await click(button(account.email))
    expect(button('Permanently delete account')).toBeUndefined()
    await click(container.querySelector('[aria-label="Close account details"]') as HTMLElement)
    responseDetail = { ...detail({ ...account, accountStatus: 'deactivated' }), recentActivity: [{ id: 'audit', action: 'user.delete', actorEmail: admin.email, targetEmail: account.email, createdAt: '2026-11-13T00:00:00Z', reason: 'Requested account closure', details: { state: 'pending', requestId: '44444444-4444-4444-8444-444444444444' } }] }
    await click(button(account.email)); await click(button('Permanently delete account'))
    const deletion = container.querySelector('dialog[aria-label="Permanently delete account"]')!
    expect(button('Permanently delete', deletion).disabled).toBe(true)
    expect(deletion.textContent).toContain('Resuming the previously recorded deletion request')
    await fill(deletion.querySelector('input')!, 'wrong@example.test')
    expect(button('Permanently delete', deletion).disabled).toBe(true)
    await fill(deletion.querySelector('input')!, account.email)
    expect(button('Permanently delete', deletion).disabled).toBe(false)
    await submit(deletion.querySelector('form')!)
    expect(writes[0]).toEqual({ method: 'DELETE', body: { email: account.email, reason: 'Requested account closure', requestId: '44444444-4444-4444-8444-444444444444' } })
  })

  it('clears private account data when a refresh denies owner access', async () => {
    await render(); await click(button('Accounts'))
    expect(container.textContent).toContain(account.email)
    failAccounts = true
    await click(button('Refresh data'))
    expect(container.textContent).toContain('Access denied')
    expect(container.textContent).not.toContain(account.email)
    expect(container.querySelector('a[href="/auth/signin?next=%2Fadmin"]')).toBeTruthy()
  })

  it('reviews the precise platform change and refreshes server notices only after a successful save', async () => {
    await render(); await click(button('Platform controls'))
    await click(button('Refresh data'))
    expect(router.refresh).not.toHaveBeenCalled()
    await fill(container.querySelector('textarea')!, 'Maintenance this weekend')
    await submit(container.querySelector('.admin-settings-form')!)
    const review = container.querySelector('dialog[aria-label="Review platform changes"]')!
    expect(review.textContent).toContain('Maintenance this weekend')
    expect(button('Save changes', review).disabled).toBe(true)
    expect(writes).toHaveLength(0)
    await fill(review.querySelector('textarea')!, 'Planned operating notice')
    failWrite = true
    await submit(review.querySelector('form')!)
    expect(review.textContent).toContain('Temporary interruption')
    expect(router.refresh).not.toHaveBeenCalled()
    failWrite = false
    await submit(review.querySelector('form')!)
    expect(writes[0]).toMatchObject({ method: 'PATCH', body: { settings: { ...platform, announcement: { enabled: true, message: 'Maintenance this weekend' } }, reason: 'Planned operating notice' } })
    expect(writes[0].body.requestId).toMatch(/^[a-f\d-]{36}$/)
    expect(writes[1].body.requestId).toBe(writes[0].body.requestId)
    expect(router.refresh).toHaveBeenCalledTimes(1)
  })

  it('normalizes listed plan benefits, shows them in review and saves the editable plan with a reason', async () => {
    await render(); await click(button('Plans & limits'))
    expect(container.textContent).toContain('Included validation runs per month')
    expect(container.textContent).toContain('Maximum output tokens per call')
    await fill(container.querySelector('.admin-plan textarea')!, '100 monthly credits\n\nA new benefit  ')
    await submit(container.querySelector('.admin-content > form')!)
    const review = container.querySelector('dialog[aria-label="Review plan changes"]')!
    expect(review.textContent).toContain('A new benefit')
    expect(review.textContent).toContain('2 included validation runs per month')
    expect(review.textContent).toContain('24,000 maximum output tokens per call')
    expect(writes).toHaveLength(0)
    await fill(review.querySelector('textarea')!, 'Clarified the entry plan')
    await submit(review.querySelector('form')!)
    expect(writes[0]).toMatchObject({ method: 'PUT', body: { plans: [{ ...plan, benefits: ['100 monthly credits', 'A new benefit'] }], reason: 'Clarified the entry plan' } })
    expect(router.refresh).not.toHaveBeenCalled()
  })
})
