import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { parseHTML } from 'linkedom'
const navigation = vi.hoisted(() => ({ router: { replace: vi.fn() }, pathname: '/dashboard/reports' }))
vi.mock('next/navigation', () => ({ usePathname: () => navigation.pathname, useRouter: () => navigation.router }))
import { AccountProvider, useAccount } from '@/components/AccountProvider'
import { registrationRecoveryPath } from '@/lib/registration-recovery'
let root: Root
let container: HTMLElement
const RecoveryState = () => { const account = useAccount(); return createElement('p', null, account.error || (account.loading ? 'Loading' : 'Account loaded')) }
beforeEach(() => {
  vi.clearAllMocks()
  navigation.pathname = '/dashboard/reports'
  const { window, document } = parseHTML('<html><body><div id="root"></div></body></html>')
  Object.defineProperty(window, 'location', { value: new URL('https://validore.onrender.com/dashboard/reports?saved=123#details'), configurable: true })
  vi.stubGlobal('window', window); vi.stubGlobal('self', window); vi.stubGlobal('document', document)
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  container = document.getElementById('root') as HTMLElement
  root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); vi.unstubAllGlobals(); vi.restoreAllMocks() })
const render = async (status: number, body: unknown) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status })))
  await act(async () => { root.render(createElement(AccountProvider, null, createElement(RecoveryState))); await new Promise(resolve => setTimeout(resolve, 5)) })
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 5)) })
}
describe('mounted account registration recovery', () => {
  it('recovers a direct workspace visit with its query and hash on the same app origin', async () => {
    await render(403, { code: 'registration_required', next: '/auth/complete-signup' })
    expect(navigation.router.replace).toHaveBeenCalledExactlyOnceWith('/auth/complete-signup?next=%2Fdashboard%2Freports%3Fsaved%3D123%23details')
    expect(container.textContent).toContain('Complete your registration')
  })
  it.each([401, 403, 503])('does not treat an ordinary %s response as registration recovery', async status => {
    await render(status, { error: 'Unavailable' })
    expect(navigation.router.replace).not.toHaveBeenCalled()
    expect(container.textContent).not.toBe('Loading')
  })
  it('does not accept an arbitrary server redirect or an unsafe return path', () => {
    expect(registrationRecoveryPath({ code: 'registration_required', next: 'https://attacker.example' }, '/dashboard', 'https://validore.onrender.com')).toBeNull()
    expect(registrationRecoveryPath({ code: 'registration_required', next: '/auth/complete-signup' }, '//attacker.example', 'https://validore.onrender.com')).toBe('/auth/complete-signup?next=%2Fdashboard')
    expect(registrationRecoveryPath({ code: 'registration_required', next: '/auth/complete-signup' }, '/auth/complete-signup', 'https://validore.onrender.com')).toBe('/auth/complete-signup?next=%2Fdashboard')
  })
})
