import { describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const fixture=vi.hoisted(()=>({user:{id:'owner',tier:'max_premium',creditBalance:4500,purchasedCredits:0,rewardCredits:0}}))
// The page resource fixture and the shared selector use the same account.
// These static form checks do not mount the application account-fetch shell.
vi.mock('@/components/AccountProvider',()=>({useAccount:()=>({data:{user:fixture.user,billing:{credits:false,premium:false,maxPremium:false},ai:{freeOnly:true,researchTools:false}},loading:false,error:null,updatedAt:0,refresh:vi.fn()}),notifyAccountUpdated:vi.fn()}))
vi.mock('@/components/WorkspaceResources', () => ({
  useWorkspaceResources: () => ({ user:fixture.user, ideas: [{ id: 'idea', name: 'Validore' }], loading: false, error: null }),
  WorkspaceResourceStatus: () => null,
}))
vi.mock('@/components/SavedModuleHistory', () => ({ useSavedModuleHistory: () => ({ records: [], open: vi.fn(), refresh: vi.fn() }), SavedModuleHistory: () => null }))
import CrowdfundingPage from '@/app/dashboard/crowdfunding/page'

describe('campaign intake contract', () => {
  it('lets a founder with a short idea name supply the required campaign description', () => {
    const html = renderToStaticMarkup(createElement(CrowdfundingPage))
    expect(html).toContain('Validore')
    expect(html).toMatch(/<label[^>]*for="campaign-description"/)
    const textarea = html.match(/<textarea[^>]*id="campaign-description"[^>]*>/)?.[0]
    expect(textarea).toBeDefined()
    expect(textarea).toContain('required=""')
    expect(textarea).toContain('minLength="20"')
    expect(textarea).toContain('maxLength="8000"')
    expect(textarea).toContain('aria-describedby="campaign-description-hint"')
  })
})
