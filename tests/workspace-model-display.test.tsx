import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const state = vi.hoisted(() => ({ policy: 'free_only' as 'free_only' | 'operator_funded' }))
const profile = { id: '11111111-1111-4111-8111-111111111111', supabaseId: 'synthetic-auth', email: 'synthetic@example.test', tier: 'free',
  accountStatus: 'active', isAdmin: false, isFoundingMember: false, crowdfundingCredits: 0, pitchDeckCredits: 0,
  validationsThisMonth: 0, creditBalance: 100, creditCycleAllowance: 100, purchasedCredits: 200, rewardCredits: 0,
  creditsUsedThisCycle: 0, creditCycleStartedAt: new Date('2026-11-15'), creditResetAt: new Date('2099-01-01'),
  preferredAiProvider: 'free_models', encryptedOpenrouterKey: 'private-fixture-value', hasCustomApiKey: false,
  emailVerified: true, subscriptionStatus: null, currentPeriodEnd: null, cancelAtPeriodEnd: false, createdAt: new Date('2026-11-15') }
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }), useSearchParams: () => new URLSearchParams(), redirect: vi.fn() }))
vi.mock('next/link', () => ({ default: ({ children, ...props }: { children: ReactNode; href: string }) => createElement('a', props, children) }))
vi.mock('@/components/AccountProvider', () => ({ useAccount: () => ({ data: { user: profile, billing: { credits: false, premium: false, maxPremium: false }, ai: { freeOnly: state.policy === 'free_only', researchTools: true, workspaceModelPolicy: state.policy } }, loading: false, error: null, refresh: vi.fn() }), notifyAccountUpdated: vi.fn() }))
vi.mock('@/components/PrivacyControls', () => ({ PrivacyControls: () => null }))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ auth: {} }) }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'synthetic-auth', email: profile.email, email_confirmed_at: '2026-11-15' } } }) } }) }))
vi.mock('@/db', () => ({ db: { query: { users: { findFirst: async () => profile }, validationReports: { findFirst: async () => null }, ideas: { findFirst: async () => null } } } }))
vi.mock('@/lib/auth-sync', () => ({ syncUserToDatabase: vi.fn() }))
vi.mock('@/lib/credits', () => ({ topUpMonthlyCredits: vi.fn() }))
vi.mock('@/lib/plan-catalog', async () => {
  const { PLAN_CATALOG } = await import('@/lib/plans')
  return { getPlanCatalog: async () => PLAN_CATALOG, getPublicPlanCatalog: (value: unknown) => value,
    getPlanBillingAvailability: async () => ({ credits: false, premium: false, maxPremium: false }), creditCycleAllowance: () => 100 }
})
vi.mock('@/lib/platform-settings', () => ({ getPlatformSettings: async () => ({}), toAdminSettings: (value: unknown) => value }))
import { GET } from '@/app/api/me/route'
import SettingsPage from '@/app/dashboard/settings/page'
import AgentsPage from '@/app/dashboard/agents/page'

beforeEach(() => { state.policy = 'free_only'; vi.stubEnv('AI_FREE_ONLY', 'true'); vi.stubEnv('AI_WORKSPACE_MODEL_POLICY', 'operator_funded') })
afterEach(() => vi.unstubAllEnvs())

describe('public workspace model funding policy', () => {
  it.each([
    ['true', 'operator_funded', 'free_only'], ['false', 'operator_funded', 'operator_funded'], ['false', 'free_only', 'free_only'],
  ])('exposes server policy with free switch %s and configuration %s', async (freeOnly, policy, expected) => {
    vi.stubEnv('AI_FREE_ONLY', freeOnly); vi.stubEnv('AI_WORKSPACE_MODEL_POLICY', policy)
    const response = await GET(); expect(response.status).toBe(200)
    const account = await response.json()
    expect(account.ai.workspaceModelPolicy).toBe(expected)
    expect(account.user.preferredAiProvider).toBe('free_models')
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(JSON.stringify(account)).not.toContain('private-fixture-value')
    expect(JSON.stringify(account)).not.toContain('AI_WORKSPACE_MODEL_POLICY')
  })
  it.each(['free_only', 'operator_funded'] as const)('labels the default setting honestly for %s and preserves personal quota selection', policy => {
    state.policy = policy
    const html = renderToStaticMarkup(createElement(SettingsPage))
    expect(html).toContain('value="free_models"')
    expect(html).toContain('Your OpenRouter account')
    if (policy === 'operator_funded') {
      expect(html).toContain('Workspace models'); expect(html).toContain('Provider model usage is funded by the workspace operator.')
      expect(html).not.toContain('Automatic free models'); expect(html).not.toContain('Free-model availability and quotas vary.')
    } else {
      expect(html).toContain('Automatic free models'); expect(html).not.toContain('Provider model usage is funded by the workspace operator.')
    }
  })
  it.each(['free_only', 'operator_funded'] as const)('explains research funding only for %s', async policy => {
    vi.stubEnv('AI_FREE_ONLY', policy === 'operator_funded' ? 'false' : 'true')
    const html = renderToStaticMarkup(await AgentsPage())
    if (policy === 'operator_funded') {
      expect(html).toContain('Configured provider models are selected for each research task.')
      expect(html).toContain('Provider model usage is funded by the workspace operator.')
    } else expect(html).not.toContain('Provider model usage is funded by the workspace operator.')
  })
})
