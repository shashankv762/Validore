import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest'
import type { RunValidationStep } from '@/lib/validation/steps'
const mocks=vi.hoisted(()=>({generate:vi.fn(),search:vi.fn(),memory:vi.fn()}))
vi.mock('@/lib/ai/generate',()=>({generateWithFallback:mocks.generate}))
vi.mock('@/lib/ai/search',async original=>({...await original<typeof import('@/lib/ai/search')>(),webSearch:mocks.search}))
vi.mock('@/lib/ai/market-memory',()=>({retrieveMarketMemory:mocks.memory}))
import { runMultiAgentValidation } from '@/lib/validation/agents/orchestrator'
import { specialistConcurrency } from '@/lib/validation/agents/specialist-scheduler'
import { FullReportSchema } from '@/lib/validation/schemas'
const FULL_AGENT_ROLES = ['market','customer','competitor','finance','product','growth','risk','evidence','synthesis']
import { PIPELINE_IDEA,PIPELINE_REPLIES } from './fixtures/agent-payloads'
const source=(name:string)=>({url:'https://example.org/'+name,title:name,source:'example.org',content:'Synthetic observed context '+name,fetchedAt:'2026-11-14T00:00:00Z',retrievalKind:'page' as const})
let active=0,peak=0
let starts:{role:string;at:number}[]=[]
let failures=new Set<string>()
beforeEach(()=>{
 vi.clearAllMocks();vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-15T00:00:00Z'));vi.stubEnv('AI_FREE_ONLY','true');vi.stubEnv('AI_SPECIALIST_CONCURRENCY','');active=0;peak=0;starts=[];failures=new Set()
 mocks.memory.mockReturnValue([source('memory')])
 mocks.search.mockImplementation(async(query:string)=>({results:query.includes('market size')?[source('z-ranked-first'),source('a-ranked-second')]:[source(query.includes('competitors')?'competitor-search':'problem-search')],degraded:false,evidenceStrength:'MODERATE'}))
 mocks.generate.mockImplementation(async(options:{agentRole:string})=>{const role=options.agentRole;active++;peak=Math.max(peak,active);starts.push({role,at:Date.now()});try{await new Promise(resolve=>setTimeout(resolve,role==='market'?30:role==='risk'?20:2));if(failures.has(role))throw new Error('Synthetic specialist unavailable');return{data:PIPELINE_REPLIES[role],provider:'synthetic/'+role,tokensUsed:100,sources:[source(role)]}}finally{active--}})
})
afterEach(()=>{vi.useRealTimers();vi.unstubAllEnvs()})

describe('bounded specialist workers and replay source identity',()=>{
 it('hands completed finance to product and the exact product basis plus financial comparison to growth',async()=>{
  const running=runMultiAgentValidation(PIPELINE_IDEA);await vi.runAllTimersAsync();await running
  const product=mocks.generate.mock.calls.find(([options])=>options.agentRole==='product')![0]
  const growth=mocks.generate.mock.calls.find(([options])=>options.agentRole==='growth')![0]
  expect(product.prompt).toContain('"estimatedSellingPrice":50');expect(product.prompt).toContain('DETERMINISTIC FINANCIAL REVIEW')
  expect(Object.isFrozen(product.financeAssumptions)).toBe(true)
  expect(growth.prompt).toContain('EXACT SHARED PLANNING BASIS');expect(growth.prompt).toContain('five-shop-pilot');expect(growth.prompt).toContain('offerComparison')
  expect(growth.planningBasis).toEqual((PIPELINE_REPLIES.product as {planningBasis:unknown}).planningBasis)
  expect(Object.isFrozen(growth.planningBasis)).toBe(true);expect(Object.isFrozen(growth.planningBasis.offer)).toBe(true)
  expect(starts.find(item=>item.role==='product')!.at).toBeGreaterThan(starts.find(item=>item.role==='finance')!.at)
  expect(starts.find(item=>item.role==='growth')!.at).toBeGreaterThan(starts.find(item=>item.role==='product')!.at)
 })
 it('reruns product, growth and final judgment when finance recovers while preserving unrelated completed research',async()=>{
  const saved=new Map<string,unknown>()
  const runStep:RunValidationStep=async<T>(name:string,work:()=>Promise<T>)=>{if(!saved.has(name)||saved.get(name)===null)saved.set(name,JSON.parse(JSON.stringify(await work())));return saved.get(name) as T}
  failures.add('finance');const first=runMultiAgentValidation(PIPELINE_IDEA,{runStep});await vi.runAllTimersAsync();await first
  failures.clear();const second=runMultiAgentValidation(PIPELINE_IDEA,{runStep});await vi.runAllTimersAsync();await second
  expect(mocks.generate).toHaveBeenCalledTimes(15)
  for(const role of ['finance','product','growth','risk','evidence','synthesis'])expect(mocks.generate.mock.calls.filter(([options])=>options.agentRole===role)).toHaveLength(2)
  for(const role of ['market','customer','competitor'])expect(mocks.generate.mock.calls.filter(([options])=>options.agentRole===role)).toHaveLength(1)
  const replay=runMultiAgentValidation(PIPELINE_IDEA,{runStep});await vi.runAllTimersAsync();await replay;expect(mocks.generate).toHaveBeenCalledTimes(15)
 })
 it('limits durable step registration even before separate worker invocations start their callbacks',async()=>{
  const pending:{id:string;finish:()=>Promise<void>}[]=[]
  const registered:string[]=[]
  const runStep:RunValidationStep=async<T>(id:string,work:()=>Promise<T>)=>{
   if(id.startsWith('research-sources-') || id.startsWith('full-run-date-'))return work()
   registered.push(id)
   return new Promise<T>((resolve,reject)=>pending.push({id,finish:async()=>{try{resolve(await work())}catch(error){reject(error)}}}))
  }
  const running=runMultiAgentValidation(PIPELINE_IDEA,{runStep})
  await vi.advanceTimersByTimeAsync(0)
  expect(registered).toEqual([expect.stringMatching(/^agent-market-/)]);expect(starts).toEqual([])
  for(let count=0;count<9;count++){
   expect(pending).toHaveLength(1)
   const finished=pending.shift()!.finish();await vi.runAllTimersAsync();await finished;await vi.advanceTimersByTimeAsync(0)
  }
  const result=await running
  expect(registered.map(id=>id.replace(/-[0-9a-f]{64}$/,''))).toEqual(FULL_AGENT_ROLES.map(role=>'agent-'+role))
  expect(Object.values(result!.agentTrail.agents)).toEqual(Array(9).fill('ok'))
 })
 it('binds independent research to its initial sources and reviews completed plans without overwriting them',async()=>{
  const original=mocks.generate.getMockImplementation()!
  mocks.generate.mockImplementation(async(options:{agentRole:string})=>{const result=await original(options);return options.agentRole==='product'?{...result,data:{...(result.data as object),uvpOptions:['A specialist-owned offer','Second offer','Third offer'],selectedUvp:'A specialist-owned offer'}}:result})
  const running=runMultiAgentValidation(PIPELINE_IDEA);await vi.runAllTimersAsync();const result=await running
  const customer=mocks.generate.mock.calls.find(([options])=>options.agentRole==='customer')![0]
  expect(Object.isFrozen(customer.sources)).toBe(true);expect(customer.sources.some((item:{url:string})=>item.url===source('market').url)).toBe(false)
  const synthesis=mocks.generate.mock.calls.find(([options])=>options.agentRole==='synthesis')![0]
  expect(synthesis.schema.shape).not.toHaveProperty('actionPlan');expect(synthesis.schema.shape).not.toHaveProperty('landingPageCopy')
  expect(synthesis.maxOutputTokens).toBe(6000);expect(synthesis.prompt).toContain('DETERMINISTIC FINANCIAL REVIEW');expect(synthesis.prompt).toContain('"profitLoss":-13000')
  expect(synthesis.prompt).toContain('EXPLICIT SCORE SUMMARY');expect(synthesis.prompt).toContain('"knownSubtotal":33')
  expect(result?.report.handoffAudit?.missingCriticalFields).toEqual([])
  expect(result?.report.selectedUvp).toBe('A specialist-owned offer');expect(result?.report.actionPlan[0].decisionOnFailure).toContain('Revise the customer segment')
  expect(result?.report.financialReview?.status).toBe('available')
 })
 it('retains full synthesis composition when a planning specialist cannot complete',async()=>{
  failures.add('product');const running=runMultiAgentValidation(PIPELINE_IDEA);await vi.runAllTimersAsync();const result=await running
  const synthesis=mocks.generate.mock.calls.find(([options])=>options.agentRole==='synthesis')![0]
  expect(synthesis.schema.shape).toHaveProperty('actionPlan');expect(synthesis.schema.shape).toHaveProperty('landingPageCopy')
  expect(result?.agentTrail.agents.product).toBe('failed');expect(result?.report.selectedUvp).toBe('Simpler stock counts');expect(result?.report.decision).toBe('TEST_FURTHER')
 })
 it.each([['',1],['1',1],['2',2],['5',3]])('runs every role and complete report with concurrency %s capped at %i',(configured,expectedPeak)=>{
  return (async()=>{vi.stubEnv('AI_SPECIALIST_CONCURRENCY',configured);const progress:number[]=[];const running=runMultiAgentValidation(PIPELINE_IDEA,{onProgress:completed=>{progress.push(completed)}});await vi.runAllTimersAsync();const result=await running;expect(peak).toBe(expectedPeak);expect(starts.map(start=>start.role).toSorted()).toEqual([...FULL_AGENT_ROLES].toSorted());expect(FullReportSchema.safeParse(result?.report).success).toBe(true);expect(progress).toEqual([1,2,3,4,5,6,7,8,9]);expect(active).toBe(0);if(expectedPeak===1)expect(starts.map(start=>start.role)).toEqual([...FULL_AGENT_ROLES]);if(expectedPeak===2)expect(starts.find(start=>start.role==='competitor')!.at).toBeGreaterThan(starts[0].at)})()
 })
 it('keeps cached replay sources byte-for-byte stable after reversed worker completion and changed ambient memory',async()=>{
  vi.stubEnv('AI_SPECIALIST_CONCURRENCY','2')
  const saved=new Map<string,unknown>();const registered:string[]=[]
  const runStep:RunValidationStep=async<T>(name:string,work:()=>Promise<T>)=>{registered.push(name);if(!saved.has(name))saved.set(name,JSON.parse(JSON.stringify(await work())));return saved.get(name) as T}
  const firstRun=runMultiAgentValidation(PIPELINE_IDEA,{runStep});await vi.runAllTimersAsync();const first=await firstRun
  expect(mocks.generate).toHaveBeenCalledTimes(9);expect(registered.map(name=>name.replace(/-[0-9a-f]{64}$/,''))).toEqual(['full-run-date','research-sources',...FULL_AGENT_ROLES.map(role=>'agent-'+role)])
  expect(first?.report.researchSources?.slice(0,3).map(item=>item.url)).toEqual(['https://example.org/memory','https://example.org/z-ranked-first','https://example.org/a-ranked-second'])
  mocks.memory.mockReturnValue([source('new-ambient-memory')])
  const secondRun=runMultiAgentValidation(PIPELINE_IDEA,{runStep});await vi.runAllTimersAsync();const second=await secondRun
  expect(mocks.generate).toHaveBeenCalledTimes(9);expect(mocks.memory).toHaveBeenCalledTimes(1)
  expect(JSON.stringify(second?.report.researchSources)).toBe(JSON.stringify(first?.report.researchSources))
  expect(second?.report.overallScore).toBe(first?.report.overallScore)
 })
 it('retains the verified single-worker default for a free-model user when the operator permits paid models',async()=>{vi.stubEnv('AI_FREE_ONLY','false');const running=runMultiAgentValidation(PIPELINE_IDEA,{preferredAiProvider:'free_models'});await vi.runAllTimersAsync();await running;expect(peak).toBe(1)})
 it('reruns successful derived work after a failed parent recovers, then replays identical inputs without calls',async()=>{
  const cache=new Map<string,unknown>()
  const runStep:RunValidationStep=async<T>(name:string,work:()=>Promise<T>)=>{if(!cache.has(name)||cache.get(name)===null)cache.set(name,JSON.parse(JSON.stringify(await work())));return cache.get(name) as T}
  failures.add('market');const first=runMultiAgentValidation(PIPELINE_IDEA,{runStep});await vi.runAllTimersAsync();expect((await first)?.agentTrail.agents.finance).toBe('ok');expect(mocks.generate).toHaveBeenCalledTimes(9)
  failures.clear();const recovered=runMultiAgentValidation(PIPELINE_IDEA,{runStep});await vi.runAllTimersAsync();expect((await recovered)?.agentTrail.agents.market).toBe('ok');expect(mocks.generate).toHaveBeenCalledTimes(16)
  for(const role of ['finance','risk','evidence','product','growth','synthesis'])expect(mocks.generate.mock.calls.filter(([options])=>options.agentRole===role)).toHaveLength(2)
  expect(mocks.generate.mock.calls.filter(([options])=>options.agentRole==='customer')).toHaveLength(1)
  const finance=mocks.generate.mock.calls.filter(([options])=>options.agentRole==='finance').map(([options])=>options.prompt)
  expect(finance[0]).toContain('"role":"market","status":"unavailable"');expect(finance[1]).toContain('"role":"market","status":"available"')
  const same=runMultiAgentValidation(PIPELINE_IDEA,{runStep});await vi.runAllTimersAsync();await same;expect(mocks.generate).toHaveBeenCalledTimes(16)
 })
 it('ignores legacy derived caches without fingerprints and freezes every queued phase snapshot',async()=>{
  const cache=new Map<string,unknown>([['agent-finance',{data:PIPELINE_REPLIES.finance,provider:'legacy-stale',tokensUsed:1,sources:[]}]])
  const runStep:RunValidationStep=async<T>(name:string,work:()=>Promise<T>)=>{if(!cache.has(name))cache.set(name,await work());return cache.get(name) as T}
  const running=runMultiAgentValidation(PIPELINE_IDEA,{runStep});await vi.runAllTimersAsync();await running
  const finance=mocks.generate.mock.calls.filter(([options])=>options.agentRole==='finance');expect(finance).toHaveLength(1);expect([...cache.keys()].some(key=>/^agent-finance-[0-9a-f]{64}$/.test(key))).toBe(true)
  const risk=mocks.generate.mock.calls.find(([options])=>options.agentRole==='risk')![0];expect(Object.isFrozen(risk.sources)).toBe(true);expect(risk.sources.some((item:{url:string})=>item.url==='https://example.org/finance')).toBe(true)
 })
 it('does not swallow durable scheduling signals or run a blocked callback',async()=>{
  const signal=new Error('Durable step must be resumed')
  const runStep:RunValidationStep=async(name,work)=>{if(name.startsWith('agent-market-'))throw signal;return work()}
  const run=runMultiAgentValidation(PIPELINE_IDEA,{runStep});const assertion=expect(run).rejects.toBe(signal);await vi.runAllTimersAsync();await assertion;expect(starts.some(start=>start.role==='market')).toBe(false)
 })
 it('bounds environment configuration without permitting unbounded fan-out',()=>{expect(specialistConcurrency('100')).toBe(5);expect(specialistConcurrency('-1')).toBe(1);expect(specialistConcurrency('2.5')).toBe(1);expect(specialistConcurrency(undefined,false)).toBe(3)})
})
