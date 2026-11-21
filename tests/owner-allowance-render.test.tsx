import { describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { parseHTML } from 'linkedom'

const fixture=vi.hoisted(()=>({user:{id:'owner',tier:'free',isAdmin:true,unlimited:true,creditBalance:0,purchasedCredits:0,rewardCredits:0,crowdfundingCredits:0,pitchDeckCredits:0}}))
vi.mock('@/components/AccountProvider',()=>({useAccount:()=>({data:{user:fixture.user,billing:{credits:false,premium:false,maxPremium:false},ai:{freeOnly:true,researchTools:false}},loading:false,error:null,updatedAt:0,refresh:vi.fn()}),notifyAccountUpdated:vi.fn()}))
vi.mock('@/components/WorkspaceResources', () => ({
  useWorkspaceResources: () => ({ user:fixture.user, ideas: [{ id: 'idea', name: 'Owner idea' }], loading: false, error: null }),
  WorkspaceResourceStatus: () => null,
}))
vi.mock('@/components/SavedModuleHistory', () => ({ useSavedModuleHistory: () => ({ records: [], open: vi.fn(), refresh: vi.fn() }), SavedModuleHistory: () => null }))
import CrowdfundingPage from '@/app/dashboard/crowdfunding/page'
import PitchDeckPage from '@/app/dashboard/pitch-deck/page'
import PricingPage from '@/app/dashboard/pricing/page'

describe('owner allowance on module screens', () => {
  it('opens crowdfunding and pitch deck intake at zero stored balance without offering a top-up', () => {
    for (const Page of [CrowdfundingPage, PitchDeckPage]) {
      const html = renderToStaticMarkup(createElement(Page))
      expect(html).toContain('owner allowance')
      expect(html).not.toContain('View credit options')
      expect(parseHTML(html).document.querySelector('button[type="submit"]')?.hasAttribute('disabled')).toBe(false)
    }
  })
  it('opens the pricing simulator independently of the stored free tier and balance', () => {
    const html = renderToStaticMarkup(createElement(PricingPage))
    expect(html).toContain('owner allowance')
    expect(html).not.toContain('Your balance is 0 credits')
    expect(html).not.toContain('View available plans')
  })
})
