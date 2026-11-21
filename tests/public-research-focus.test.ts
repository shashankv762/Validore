import { describe, expect, it } from 'vitest'
import { IdeaInputSchema, PublicResearchFocusSchema } from '@/lib/idea-input'
import { approvedPublicResearchFocus, publicResearchBrief, publicResearchQuery } from '@/lib/ai/research-brief'
import { derivedStepId, researchContextStepId } from '@/lib/validation/agents/derived-step'
import { PIPELINE_IDEA } from './fixtures/agent-payloads'

const topic = 'Inventory reconciliation for independent shops using spreadsheets'
describe('explicit public research focus', () => {
  it('uses only a separately supplied public topic while keeping the private idea fields excluded', () => {
    const idea = { ...PIPELINE_IDEA, publicResearchFocus: topic }
    for (const text of [publicResearchBrief(idea), publicResearchQuery(idea, 'competitor pricing')]) {
      expect(text).toContain(topic)
      for (const privateField of [idea.name, idea.product, idea.coreProblem, idea.proposedSolution]) expect(text).not.toContain(privateField)
    }
    expect(publicResearchBrief(PIPELINE_IDEA)).not.toContain('publicResearchFocus')
    expect(publicResearchQuery(PIPELINE_IDEA, 'competitor pricing')).not.toContain(topic)
  })
  it('preserves optional legacy input and explicit clearing without inferring a public topic from private edits', () => {
    expect(IdeaInputSchema.parse(PIPELINE_IDEA)).not.toHaveProperty('publicResearchFocus')
    expect(IdeaInputSchema.parse({ ...PIPELINE_IDEA, publicResearchFocus: null }).publicResearchFocus).toBe('')
    expect(IdeaInputSchema.parse({ ...PIPELINE_IDEA, publicResearchFocus: ' ' }).publicResearchFocus).toBe('')
    expect(IdeaInputSchema.parse({ ...PIPELINE_IDEA, coreProblem: 'A new private concern requiring research' })).not.toHaveProperty('publicResearchFocus')
  })
  it('removes contacts and recognizable credentials before persistence or public searches', () => {
    const input = topic + ' founder@example.org +91 98765 43210 sk-proj-PRIVATEKEY123456 api_key=PRIVATEKEY999 bearer PRIVATEACCESS123'
    const parsed = PublicResearchFocusSchema.parse(input)
    for (const secret of ['founder@example.org', '98765', 'PRIVATEKEY123456', 'PRIVATEKEY999', 'PRIVATEACCESS123']) {
      expect(parsed).not.toContain(secret)
      expect(publicResearchQuery({ ...PIPELINE_IDEA, publicResearchFocus: input }, 'reviews')).not.toContain(secret)
    }
    expect(parsed).toContain(topic)
  })
  it.each(['https://example.org/reviews', 'www.example.org', 'example.com reviews', 'ftp://example.net/data', 'two lines\nsecond topic', 'x'.repeat(281), '\ufb03'.repeat(100)])('rejects unsafe or unbounded topics: %s', value => {
    expect(PublicResearchFocusSchema.safeParse(value).success).toBe(false)
    expect(approvedPublicResearchFocus(value)).toBe('')
  })
  it('binds public research, specialists and derived outputs to the approved topic without exposing private text in step IDs', () => {
    const first = { ...PIPELINE_IDEA, publicResearchFocus: topic }
    const second = { ...PIPELINE_IDEA, publicResearchFocus: 'Appointment reminders for clinics using phone calls' }
    for (const base of ['research-sources', 'agent-market', 'lite-agent-customer', 'monolithic-report']) {
      expect(researchContextStepId(base, PIPELINE_IDEA)).toMatch(/-[0-9a-f]{64}$/)
      expect(researchContextStepId(base, first)).toMatch(/-[0-9a-f]{64}$/)
      expect(researchContextStepId(base, first)).not.toBe(researchContextStepId(base, second))
      expect(researchContextStepId(base, first)).not.toContain(topic)
      expect(researchContextStepId(base, first)).not.toContain(PIPELINE_IDEA.product)
    }
    expect(derivedStepId('finance', first, 'same research', {}, 'method')).not.toBe(derivedStepId('finance', second, 'same research', {}, 'method'))
  })
})
