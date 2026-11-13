import { describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('@/components/WorkspaceResources', () => ({
  useWorkspaceResources: () => ({ user: { id: 'owner', tier: 'max_premium', creditBalance: 4500, purchasedCredits: 0, rewardCredits: 0 }, ideas: [{ id: 'idea', name: 'Validore' }], loading: false, error: null }),
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
