import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RunValidationStep } from '@/lib/validation/steps'

const mocks = vi.hoisted(() => ({ market: vi.fn(), customer: vi.fn(), generate: vi.fn(), search: vi.fn() }))
vi.mock('@/lib/validation/agents/market', () => ({ runMarketAgent: mocks.market }))
vi.mock('@/lib/validation/agents/customer', () => ({ runCustomerAgent: mocks.customer }))
vi.mock('@/lib/ai/generate', () => ({ generateWithFallback: mocks.generate }))
vi.mock('@/lib/ai/search', async importOriginal => ({ ...await importOriginal<typeof import('@/lib/ai/search')>(), webSearch: mocks.search }))
vi.mock('@/db', () => ({ db: {} }))
import { runLiteValidation } from '@/lib/validation/engine'
import { LiteReportSchema } from '@/lib/validation/engine'
import { PIPELINE_LITE_REPLY, PIPELINE_REPLIES } from './fixtures/agent-payloads'

const idea = { name: 'Test idea', industry: 'Software', product: 'Research tools', targetCustomer: 'Founders', location: 'India', businessModel: 'Subscription', coreProblem: 'Untested startup assumptions', proposedSolution: 'Structured research and experiments' }
const source = { title: 'Evidence', url: 'https://example.org/evidence', content: 'Research findings describe practical inventory reconciliation problems for local retailers.', source: 'example.org', fetchedAt: '2026-10-31T00:00:00Z', retrievalKind: 'page' as const }
beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('MARKET_MEMORY_ENABLED', 'false')
  vi.stubEnv('AI_FREE_ONLY','true');vi.stubEnv('AI_SPECIALIST_CONCURRENCY','')
  mocks.search.mockResolvedValue({ results: [], degraded: true, evidenceStrength: 'WEAK' })
  mocks.market.mockResolvedValue({ data: { marketScore: 7 }, provider: 'test-market', tokensUsed: 100, sources: [source] })
  mocks.customer.mockResolvedValue({ data: { problemScore: 10 }, provider: 'test-customer', tokensUsed: 120, sources: [] })
  mocks.generate.mockResolvedValue({ data: { ...PIPELINE_LITE_REPLY, problemScore: 10, customerScore: 10, marketScore: 7, competitiveScore: 4, wtpScore: 8, businessModelScore: 5, financialScore: 2, executionScore: 3,
    keyEvidence: [{ claim: 'A retrieved research finding', link: source.url, source: source.source,
      evidenceExcerpt: 'practical inventory reconciliation problems for local retailers.', strength: 'MODERATE' }],
  }, provider: 'test-reviewer', tokensUsed: 180 })
})
afterEach(() => {vi.unstubAllEnvs();vi.useRealTimers()})

describe('Lite multi-agent workflow', () => {
  it('retains an explicitly unknown sensitivity from the completed customer specialist through Lite synthesis and final assembly', async () => {
    const customer = PIPELINE_REPLIES.customer as { personas: Array<Record<string, unknown>> }
    mocks.market.mockResolvedValue({ data: PIPELINE_REPLIES.market, provider: 'market', tokensUsed: 1, sources: [] })
    mocks.customer.mockResolvedValue({ data: { ...customer, personas: customer.personas.map(persona => ({ ...persona, priceSensitivity: 'unknown' })) }, provider: 'customer', tokensUsed: 1, sources: [] })
    mocks.generate.mockImplementation(async options => ({ data: options.schema.parse(PIPELINE_LITE_REPLY), provider: 'reviewer', tokensUsed: 1 }))
    const report = await runLiteValidation(idea)
    expect(report.persona.priceSensitivity).toBe('unknown')
    expect(mocks.generate.mock.calls[0][0].prompt).toContain('priceSensitivity: unknown')
    expect(LiteReportSchema.parse(report).persona.priceSensitivity).toBe('unknown')
  })
  it('generates a smaller final synthesis and attaches completed specialist fields without changing the plan ceiling', async () => {
    mocks.market.mockResolvedValue({ data: PIPELINE_REPLIES.market, provider: 'market', tokensUsed: 1, sources: [source] })
    mocks.customer.mockResolvedValue({ data: PIPELINE_REPLIES.customer, provider: 'customer', tokensUsed: 1, sources: [] })
    mocks.generate.mockImplementation(async options => ({ data: options.schema.parse(PIPELINE_LITE_REPLY), provider: 'reviewer', tokensUsed: 1 }))
    const report = await runLiteValidation(idea, { maxTokensPerCall: 4000 })
    const options = mocks.generate.mock.calls[0][0]
    for (const field of ['problemScore', 'customerScore', 'wtpScore', 'marketScore', 'persona', 'tamEstimate', 'samEstimate', 'somEstimate', 'customerSignals']) {
      expect(options.schema.shape).not.toHaveProperty(field)
    }
    expect(options.schema.shape).toHaveProperty('actionPlan')
    expect(options.maxTokensPerCall).toBe(4000)
    expect(report.persona.name).toBe('Proposed shop owner')
    expect(report.problemScore).toBe(8)
    expect(report.tamEstimate).toBe('Not established')
    expect(report.actionPlan).toHaveLength(4)
    expect(report.handoffAudit!.characters).toBeLessThanOrEqual(12000)
    expect(LiteReportSchema.safeParse(report).success).toBe(true)
  })
  it('preserves a cautious low-score judgment, useful rationale and all five valid reasons after final assembly', async () => {
    const originalPage = { ...source, retrievalKind: 'page' as const, content: 'An ordinary vendor page describing an adjacent product.' }
    mocks.market.mockResolvedValue({ data: { marketScore: 5 }, provider: 'market', tokensUsed: 1, sources: [originalPage] })
    mocks.customer.mockResolvedValue({ data: { problemScore: 4, customerScore: 7, wtpScore: 1 }, provider: 'customer', tokensUsed: 1, sources: [] })
    const reasons = ['Missing validation is not fundamental failure.', 'Customer frequency is unknown.', 'Payment remains untested.', 'Test a narrow founder workflow.', 'Other category scores are provisional.']
    const rationale = 'Offer ten eligible founders the same paid pilot; revise the offer if fewer than three make a payment.'
    mocks.generate.mockResolvedValue({ data: { ...PIPELINE_LITE_REPLY, problemScore: 4, customerScore: 7, marketScore: 5, wtpScore: 1,
      competitiveScore: 3, businessModelScore: 4, financialScore: 2, executionScore: 3,
      decision: 'TEST_FURTHER', decisionReasons: reasons, nextStepRecommendation: 'MORE_VALIDATION', nextStepRationale: rationale,
      keyEvidence: [{ claim: 'An adjacent offering exists; this does not establish buyer demand.', link: originalPage.url,
        evidenceExcerpt: 'An ordinary vendor page describing an adjacent product.', strength: 'MODERATE' }],
    }, provider: 'reviewer', tokensUsed: 1 })
    const report = await runLiteValidation(idea)
    expect(report.overallScore).toBe(29)
    expect(report.decision).toBe('TEST_FURTHER')
    expect(report.nextStepRationale).toBe(rationale)
    expect(report.decisionReasons).toEqual(reasons)
    expect(LiteReportSchema.safeParse(report).success).toBe(true)
    expect(report.scoreSummary?.knownSubtotal).toBe(17)
    expect(report.handoffAudit?.missingCriticalFields).toEqual([])
  })
  it.each([['',1],['2',2]])('bounds Lite specialist callbacks at the configured %s worker limit',async(configured,maximum)=>{
    vi.stubEnv('AI_SPECIALIST_CONCURRENCY',configured);vi.useFakeTimers();let active=0;let peak=0;const starts:string[]=[]
    const wrap=(name:string,result:unknown)=>async()=>{active++;peak=Math.max(peak,active);starts.push(name);try{await new Promise(resolve=>setTimeout(resolve,20));return result}finally{active--}}
    mocks.market.mockImplementation(wrap('market',{data:{marketScore:7},provider:'market',tokensUsed:1,sources:[]}));mocks.customer.mockImplementation(wrap('customer',{data:{problemScore:10},provider:'customer',tokensUsed:1,sources:[]}))
    const registered:string[]=[];const runStep:RunValidationStep=async(name,work)=>{registered.push(name);return work()}
    const run=runLiteValidation(idea,{runStep});await vi.runAllTimersAsync();const report=await run;expect(peak).toBe(maximum);expect(starts).toEqual(['market','customer']);expect(registered.map(name=>name.replace(/-[0-9a-f]{64}$/,''))).toEqual(['lite-run-date','lite-research-sources','lite-agent-market','lite-agent-customer','lite-report']);expect(report.agentTrail?.agents).toEqual({market:'ok',customer:'ok',synthesis:'ok'})
  })
  it('passes specialist findings and discovered evidence into the final review', async () => {
    const report = await runLiteValidation(idea, { researchBudgetId: 'shared-report-budget' })
    expect(report.agentTrail?.agents).toEqual({ market: 'ok', customer: 'ok', synthesis: 'ok' })
    expect(report.tokensUsed).toBe(400)
    expect(report.researchSources).toEqual([source])
    expect(report.keyEvidence[0].link).toBe(source.url)
    expect(mocks.market.mock.calls[0][2]).toMatchObject({ researchBudgetId: 'shared-report-budget' })
    expect(mocks.customer.mock.calls[0][1]).toMatchObject({ researchBudgetId: 'shared-report-budget' })
    expect(mocks.generate.mock.calls[0][0]).toMatchObject({ agentRole: 'synthesis', sources: [source], researchBudgetId: 'shared-report-budget' })
    expect(mocks.generate.mock.calls[0][0].prompt).toContain('STRUCTURED SPECIALIST HANDOFFS')
    expect(mocks.generate.mock.calls[0][0].prompt).toContain('"role":"customer"')
  })
  it('reuses every persisted step when the durable runner replays a job', async () => {
    const saved = new Map<string, unknown>()
    const runStep: RunValidationStep = async <T>(id: string, work: () => Promise<T>) => {
      if (!saved.has(id)) saved.set(id, JSON.parse(JSON.stringify(await work())))
      return saved.get(id) as T
    }
    await runLiteValidation(idea, { runStep, researchBudgetId: 'job-a' })
    await runLiteValidation(idea, { runStep, researchBudgetId: 'job-a' })
    expect(mocks.search).toHaveBeenCalledTimes(1)
    expect(mocks.market).toHaveBeenCalledTimes(1)
    expect(mocks.customer).toHaveBeenCalledTimes(1)
    expect(mocks.generate).toHaveBeenCalledTimes(1)
    expect(saved.size).toBe(5) // Includes the durable run date used by prompt replay.
  })
  it('does not append newer ambient market memory to cached research during replay', async () => {
    const saved = new Map<string, unknown>()
    const runStep: RunValidationStep = async <T>(id: string, work: () => Promise<T>) => {
      if (!saved.has(id)) saved.set(id, JSON.parse(JSON.stringify(await work())))
      return saved.get(id) as T
    }
    const original = await runLiteValidation(idea, { runStep })
    vi.stubEnv('MARKET_MEMORY_ENABLED', 'true')
    const replay = await runLiteValidation(idea, { runStep })
    expect(replay.researchSources).toEqual(original.researchSources)
    expect(mocks.generate).toHaveBeenCalledTimes(1)
  })
  it('records an unavailable specialist instead of presenting it as completed', async () => {
    mocks.customer.mockRejectedValue(new Error('Unavailable'))
    const report = await runLiteValidation(idea)
    expect(report.agentTrail?.agents.customer).toBe('failed')
    expect(report.agentTrail?.agents.synthesis).toBe('ok')
    expect(mocks.generate.mock.calls[0][0].prompt).toContain('"role":"customer","status":"unavailable"')
    expect(mocks.generate.mock.calls[0][0].prompt).toContain('Missing fields are unknowns, not negative evidence')
    expect(mocks.generate.mock.calls[0][0].researchMode).toBe('reuse')
  })
  it('reruns Lite synthesis when a failed specialist recovers and adds no calls on an identical replay',async()=>{
    const saved=new Map<string,unknown>();const runStep:RunValidationStep=async<T>(id:string,work:()=>Promise<T>)=>{if(!saved.has(id)||saved.get(id)===null)saved.set(id,JSON.parse(JSON.stringify(await work())));return saved.get(id) as T}
    mocks.customer.mockRejectedValueOnce(new Error('Synthetic customer failure'))
    const first=await runLiteValidation(idea,{runStep,researchBudgetId:'same-job'});expect(first.agentTrail?.agents.customer).toBe('failed');expect(mocks.generate).toHaveBeenCalledTimes(1)
    const recovered=await runLiteValidation(idea,{runStep,researchBudgetId:'same-job'});expect(recovered.agentTrail?.agents.customer).toBe('ok');expect(mocks.generate).toHaveBeenCalledTimes(2);expect(mocks.market).toHaveBeenCalledTimes(1);expect(mocks.customer).toHaveBeenCalledTimes(2)
    expect(mocks.generate.mock.calls[0][0].prompt).toContain('"role":"customer","status":"unavailable"');expect(mocks.generate.mock.calls[1][0].prompt).toContain('"role":"customer","status":"available"')
    await runLiteValidation(idea,{runStep,researchBudgetId:'same-job'});expect(mocks.generate).toHaveBeenCalledTimes(2);expect(mocks.customer).toHaveBeenCalledTimes(2);expect([...saved.keys()].filter(key=>/^lite-report-[0-9a-f]{64}$/.test(key))).toHaveLength(2)
  })
  it('ignores flat legacy report caches and binds private/source inputs to a frozen snapshot',async()=>{
    const saved=new Map<string,unknown>([['lite-report',{data:PIPELINE_LITE_REPLY,provider:'legacy-stale',tokensUsed:0}]])
    const runStep:RunValidationStep=async<T>(id:string,work:()=>Promise<T>)=>{if(!saved.has(id))saved.set(id,await work());return saved.get(id) as T}
    await runLiteValidation(idea,{runStep,privateContext:'Private founder evidence',customOpenRouterKey:'private-provider-key'})
    expect(mocks.generate).toHaveBeenCalledTimes(1);expect([...saved.keys()].some(key=>/^lite-report-[0-9a-f]{64}$/.test(key))).toBe(true);expect(JSON.stringify([...saved.keys()])).not.toContain('Private founder');expect(JSON.stringify([...saved.keys()])).not.toContain('private-provider-key')
    expect(Object.isFrozen(mocks.generate.mock.calls[0][0])).toBe(true);expect(Object.isFrozen(mocks.generate.mock.calls[0][0].sources)).toBe(true)
    await runLiteValidation(idea,{runStep,privateContext:'Updated private evidence',customOpenRouterKey:'private-provider-key'});expect(mocks.generate).toHaveBeenCalledTimes(2)
  })
  it('does not let synthesis reintroduce unsupported market sizes', async () => {
    mocks.generate.mockResolvedValue({ data: { ...PIPELINE_LITE_REPLY, problemScore: 10, customerScore: 10, marketScore: 7, competitiveScore: 4, wtpScore: 8, businessModelScore: 5, financialScore: 2, executionScore: 3,
      tamEstimate: '$999B', samEstimate: '$99B', somEstimate: '$9B', keyEvidence: [],
    }, provider: 'test-reviewer', tokensUsed: 180 })
    const report = await runLiteValidation(idea)
    expect([report.tamEstimate, report.samEstimate, report.somEstimate]).toEqual(['Not established', 'Not established', 'Not established'])
    expect(mocks.generate.mock.calls[0][0].prompt).toContain('Not established')
  })
})
