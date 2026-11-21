import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MockLanguageModelV4 } from 'ai/test'
import type { LanguageModelV4GenerateResult } from '@ai-sdk/provider'
import type { RunValidationStep } from '@/lib/validation/steps'
import { FullReportSchema } from '@/lib/validation/schemas'
import { PIPELINE_IDEA, PIPELINE_REPLIES, PIPELINE_LITE_REPLY, PRIVATE_ANSWER, PRIVATE_DERIVED } from './fixtures/agent-payloads'
import seedData from '@/data/market/seed-sources.json'

const mocks = vi.hoisted(() => ({ create: vi.fn(), candidates: vi.fn(), read: vi.fn(), failed: vi.fn() }))
// Only external boundaries are replaced. Coordinator, agents, generateText,
// SDK tool execution, caches, data recall and schema validation are real.
vi.mock('@ai-sdk/openai', () => ({ createOpenAI: (...args: unknown[]) => mocks.create(...args) }))
vi.mock('@/lib/ai/gateways', async original => ({ ...await original<typeof import('@/lib/ai/gateways')>(),
  gatewayRouter: { candidates: mocks.candidates, canTry: () => true, failed: mocks.failed },
}))
vi.mock('@/lib/ai/public-web', async original => ({ ...await original<typeof import('@/lib/ai/public-web')>(), readPublicWeb: mocks.read }))
vi.mock('@/db', () => ({ db: {} }))

const models = new Map<string, MockLanguageModelV4>()
const sharedQuery = 'independent shop inventory research benchmark'
const privateContext = JSON.stringify({ answers: [{ answer: PRIVATE_ANSWER, evidence: 'assumption' }] })
// Refreshing the real local snapshot must not turn an integration fixture's
// frozen clock into a time before that snapshot was retrieved.
const populationSeed = seedData.find(source => source.country === 'IN' && source.indicator === 'SP.POP.TOTL')!
const snapshotTime = Math.max(Date.parse('2026-11-15T00:00:00Z'), ...seedData.map(source => Date.parse(source.fetchedAt))) + 1000
let lite = false
let malformedRole = ''
const reply = (content: LanguageModelV4GenerateResult['content'], tools = false): LanguageModelV4GenerateResult => ({
  content, finishReason: { unified: tools ? 'tool-calls' : 'stop', raw: tools ? 'tool_calls' : 'stop' }, warnings: [],
  usage: { inputTokens: { total: 80, noCache: 80, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 20, text: 20, reasoning: 0 } },
})
const durable = () => {
  const saved = new Map<string, unknown>()
  const runStep: RunValidationStep = async <T>(id: string, work: () => Promise<T>) => {
    if (!saved.has(id)) saved.set(id, JSON.parse(JSON.stringify(await work())))
    return saved.get(id) as T
  }
  return { saved, runStep }
}
const requests = () => [...models.values()].flatMap(model => model.doGenerateCalls)

beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks(); models.clear(); lite = false; malformedRole = ''
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(snapshotTime))
  for (const name of ['DATABASE_URL', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'TAVILY_API_KEY', 'SERPER_API_KEY', 'SERPAPI_API_KEY', 'SEARXNG_BASE_URL']) vi.stubEnv(name, '')
  vi.stubEnv('AI_FREE_ONLY', 'true'); vi.stubEnv('MARKET_MEMORY_ENABLED', 'true'); vi.stubEnv('RESEARCH_STORE_ENABLED', 'true')
  vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('External network traffic is forbidden in this synthetic check') }))
  mocks.read.mockImplementation(async (url: string) => {
    if (!url.startsWith('https://html.duckduckgo.com/')) throw new Error('Unexpected external read')
    return { url, text: '<html><body>' + [1, 2].map(index => '<div class="result"><a class="result__a" href="https://example.org/research-' + index + '">Synthetic public reference</a><div class="result__snippet">Unverified reference supplied by the test boundary.</div></div>').join('') + '</body></html>' }
  })
  mocks.candidates.mockImplementation(async ({ role }: { role: string }) => [1, 2].map(attempt => ({ id: 'synthetic', modelId: role + ':' + attempt, baseURL: 'https://provider.example/v1', apiKey: 'synthetic-key', fingerprint: 'synthetic-key-hash' })))
  mocks.create.mockReturnValue({ chat: (id: string) => {
    if (!models.has(id)) {
      const role = id.split(':')[0]
      models.set(id, new MockLanguageModelV4({ provider: 'synthetic', modelId: id, doGenerate: async options => {
        if (options.tools?.length) {
          if (options.prompt.some(message => message.role === 'tool')) return reply([{ type: 'text', text: 'READY' }])
          const calls: LanguageModelV4GenerateResult['content'] = [{ type: 'tool-call', toolCallId: role + '-search', toolName: 'search_web', input: JSON.stringify({ query: sharedQuery }) }]
          if (role === 'market') calls.push({ type: 'tool-call', toolCallId: role + '-indicator', toolName: 'read_market_indicator', input: JSON.stringify({ country: 'IN', indicator: 'population' }) })
          return reply(calls, true)
        }
        if (role === malformedRole && id.endsWith(':1')) return reply([{ type: 'text', text: '{invalid' }])
        return reply([{ type: 'text', text: JSON.stringify(lite && role === 'synthesis' ? PIPELINE_LITE_REPLY : PIPELINE_REPLIES[role]) }])
      } }))
    }
    return models.get(id)!
  } })
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.useRealTimers() })

function checkPrivacyBoundary() {
  for (const request of requests()) {
    const text = JSON.stringify(request.prompt)
    if (request.tools?.length) {
      for (const privateValue of [PRIVATE_ANSWER, PRIVATE_DERIVED, PIPELINE_IDEA.name, PIPELINE_IDEA.product]) expect(text).not.toContain(privateValue)
    } else expect(text).toContain(PRIVATE_ANSWER)
  }
  for (const [url] of mocks.read.mock.calls) {
    expect(url).not.toContain(encodeURIComponent(PRIVATE_ANSWER))
    expect(url).not.toContain(encodeURIComponent(PIPELINE_IDEA.name))
  }
  expect(fetch).not.toHaveBeenCalled()
}

describe('real SDK and research pipeline with synthetic external services', () => {
  it.each([
    ['legacy', undefined, [6500, 6500, 5000]],
    ['owner-managed', 0, [3000, 3000, 3000]],
  ] as const)('preserves Lite model budgets for a %s Free plan', async (_name, monthlyPriceCents, budgets) => {
    lite = true
    const { runLiteValidation } = await import('@/lib/validation/engine')
    const { resolvePlan } = await import('@/lib/plan-catalog')
    const plan = resolvePlan('free', { monthlyPriceCents, maxTokensPerCall: monthlyPriceCents === 0 ? 3000 : 4000 })
    const result = await runLiteValidation(PIPELINE_IDEA, { privateContext, researchBudgetId: 'synthetic-lite-budget', maxTokensPerCall: plan.maxTokensPerCall })
    expect(Object.values(result.agentTrail!.agents)).toEqual(['ok', 'ok', 'ok'])
    for (const [index, role] of ['market', 'customer', 'synthesis'].entries()) {
      const reportCalls = models.get(role + ':1')!.doGenerateCalls.filter(call => !call.tools?.length)
      expect(reportCalls).toHaveLength(1)
      expect(reportCalls[0].maxOutputTokens).toBe(budgets[index])
    }
    for (const request of requests().filter(call => call.tools?.length)) expect(request.maxOutputTokens).toBe(1800)
    checkPrivacyBoundary()
  }, 15_000)
  // Includes a cold module graph and the full nine-agent SDK pipeline. Under
  // parallel browser/PDF tests the five-second default can expire during import,
  // leaving unfinished work to contaminate the following test's shared fixtures.
  it('completes all nine agents, recalls stored observations, merges searches and replays without another model request', async () => {
    const { runMultiAgentValidation } = await import('@/lib/validation/agents/orchestrator')
    const steps = durable()
    const first = await runMultiAgentValidation(PIPELINE_IDEA, { privateContext, researchBudgetId: 'synthetic-full', runStep: steps.runStep })
    expect(Object.values(first!.agentTrail.agents)).toEqual(Array(9).fill('ok'))
    expect(FullReportSchema.safeParse(first!.report).success).toBe(true)
    expect(first!.report.computedUnitEconomics.contributionMargin).toBe(40)
    expect(first!.report.financialProjection).toHaveLength(12)
    expect(first!.report.tamSamSom.tam.value).toBe('Not established')
    expect(first!.report.researchSources).toContainEqual(expect.objectContaining({ country: 'IN', indicator: 'SP.POP.TOTL', observationYear: populationSeed.observationYear, value: populationSeed.value }))
    expect(first!.agentTrail.tools).toContainEqual(expect.objectContaining({ tool: 'read_market_indicator', status: 'complete' }))
    expect(requests()).toHaveLength(19)
    expect(first!.report.tokensUsed).toBe(1900)
    expect(mocks.read).toHaveBeenCalledTimes(4) // Three initial queries; five agents share one new query.
    for (const role of ['finance', 'product', 'growth', 'synthesis']) expect(models.get(role + ':1')!.doGenerateCalls).toHaveLength(1)
    const repeated = await runMultiAgentValidation(PIPELINE_IDEA, { privateContext, researchBudgetId: 'synthetic-full', runStep: steps.runStep })
    // Parallel completion order can differ on replay; report content and the
    // recorded work must agree without requiring a particular arrival order.
    expect({ ...repeated!.report, agentTrail: undefined }).toEqual({ ...first!.report, agentTrail: undefined })
    expect(repeated!.agentTrail.agents).toEqual(first!.agentTrail.agents)
    expect(repeated!.agentTrail.providers.toSorted()).toEqual(first!.agentTrail.providers.toSorted())
    const events = (trail: typeof first) => trail!.agentTrail.tools!.map(event => JSON.stringify(event)).toSorted()
    expect(events(repeated)).toEqual(events(first))
    expect(requests()).toHaveLength(19)
    expect(mocks.read).toHaveBeenCalledTimes(4)
    expect(JSON.stringify([...steps.saved.values()])).not.toContain('synthetic-key')
    checkPrivacyBoundary()
  }, 15_000)

  it('reuses cached public research on another report while recording only that report’s model usage', async () => {
    lite = true
    const { runLiteValidation } = await import('@/lib/validation/engine')
    const first = await runLiteValidation(PIPELINE_IDEA, { privateContext, researchBudgetId: 'synthetic-lite-1' })
    const reads = mocks.read.mock.calls.length
    const second = await runLiteValidation(PIPELINE_IDEA, { privateContext, researchBudgetId: 'synthetic-lite-2' })
    expect(Object.values(first.agentTrail!.agents)).toEqual(Array(3).fill('ok'))
    expect(first.tokensUsed).toBe(700)
    expect(second.tokensUsed).toBe(700)
    expect(requests()).toHaveLength(14)
    expect(reads).toBe(2)
    expect(mocks.read).toHaveBeenCalledTimes(reads)
    expect(first.tamEstimate).toBe('Not established')
    checkPrivacyBoundary()
  })

  it('counts both SDK-rejected outputs, repairs once, and falls back without repeating research', async () => {
    malformedRole = 'finance'
    const { runMultiAgentValidation } = await import('@/lib/validation/agents/orchestrator')
    const result = await runMultiAgentValidation(PIPELINE_IDEA, { privateContext, researchBudgetId: 'synthetic-fallback' })
    expect(result!.agentTrail.agents.finance).toBe('ok')
    // Eighteen other calls, two rejected finance outputs, and one valid fallback.
    // The real SDK throws on both malformed replies; each still contributes 100 tokens.
    expect(requests()).toHaveLength(21)
    expect(result!.report.tokensUsed).toBe(2100)
    expect(result!.agentTrail.totalTokens).toBe(2100)
    expect(mocks.failed).toHaveBeenCalledOnce()
    expect(mocks.failed).toHaveBeenCalledWith(expect.objectContaining({ modelId: 'finance:1' }), expect.any(SyntaxError))
    expect(mocks.read).toHaveBeenCalledTimes(4)
    expect(result!.agentTrail.tools!.filter(event => event.tool === 'read_market_indicator')).toEqual([
      expect.objectContaining({ agent: 'market', status: 'complete' }),
    ])
    const primary = models.get('finance:1')!.doGenerateCalls
    const fallback = models.get('finance:2')!.doGenerateCalls
    expect(primary).toHaveLength(2)
    expect(fallback).toHaveLength(1)
    expect(JSON.stringify(primary[0].prompt)).not.toContain('OUTPUT CORRECTION')
    expect(JSON.stringify(primary[1].prompt)).toContain('OUTPUT CORRECTION')
    expect(JSON.stringify(fallback[0].prompt)).not.toContain('OUTPUT CORRECTION')
    const reportInput = primary[0].prompt.filter(message => message.role === 'user')
    expect(JSON.stringify(reportInput)).toContain('SP.POP.TOTL')
    expect(JSON.stringify(reportInput)).toContain(PRIVATE_ANSWER)
    for (const request of [...primary, ...fallback]) {
      expect(request.tools ?? []).toHaveLength(0)
      expect(request.prompt.some(message => message.role === 'tool')).toBe(false)
      expect(request.prompt.filter(message => message.role === 'user')).toEqual(reportInput)
      expect(JSON.stringify(request.prompt)).not.toContain('{invalid')
    }
    checkPrivacyBoundary()
  })
})
