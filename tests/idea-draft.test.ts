import { describe, expect, it } from 'vitest'
import { persistBrief, restoreBrief } from '@/lib/idea-draft'
import type { IdeaDraft } from '@/lib/idea-input'

const owner = '11111111-1111-4111-8111-111111111111'
const ideaId = '22222222-2222-4222-8222-222222222222'
const draft: IdeaDraft = { name: 'Saved idea', industry: 'Software', product: 'A planning tool for small companies', targetCustomer: 'Small company founders', location: 'India', businessModel: 'Subscription', coreProblem: 'Founders struggle to make informed plans', proposedSolution: 'Guided research and experiments for founders' }
const storage = () => {
  const values = new Map<string, string>()
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) } }
}
describe('restorable founder briefs', () => {
  it('preserves a saved brief while cached account hydration is still pending', () => {
    const memory = storage()
    persistBrief(memory, owner, owner, { draft, step: 3, ideaId })
    expect(persistBrief(memory, owner, null, { draft: { ...draft, name: '' }, step: 0 })).toBe(false)
    const restored = restoreBrief(memory, owner)
    expect(restored).toEqual({ draft, step: 3, ideaId })
    expect(persistBrief(memory, owner, owner, { ...restored!, draft: { ...draft, name: 'Edited' } })).toBe(true)
    expect(restoreBrief(memory, owner)?.draft.name).toBe('Edited')
  })
  it('keeps account drafts separate and never writes a previous owner snapshot', () => {
    const memory = storage()
    persistBrief(memory, owner, owner, { draft, step: 2 })
    expect(restoreBrief(memory, ideaId)).toBeNull()
    expect(persistBrief(memory, ideaId, owner, { draft, step: 2 })).toBe(false)
  })
  it('handles corrupt storage and clamps unsafe step/document references', () => {
    const memory = storage()
    memory.setItem('validore:brief:' + owner, '{bad json')
    expect(restoreBrief(memory, owner)).toBeNull()
    memory.setItem('validore:brief:' + owner, JSON.stringify({ draft, step: 200, ideaId: 'invalid' }))
    expect(restoreBrief(memory, owner)).toMatchObject({ step: 2, ideaId: undefined })
  })
})
