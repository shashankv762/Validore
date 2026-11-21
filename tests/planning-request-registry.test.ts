import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import type { PGlite } from '@electric-sql/pglite'
import { NextRequest } from 'next/server'

const state = vi.hoisted(() => ({ client: null as unknown as PGlite, generate: vi.fn(), search:vi.fn(), access: vi.fn(), rate: vi.fn(), authId: 'auth-owner' }))
vi.mock('@/db', async () => {
  const { PGlite } = await import('@electric-sql/pglite'); const { drizzle } = await import('drizzle-orm/pglite'); const schema = await import('@/db/schema')
  state.client = new PGlite(); return { db: drizzle(state.client, { schema }) }
})
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: state.authId } } }) } }) }))
vi.mock('@/lib/tier-gate', () => ({ canUserAccess: state.access, canUserAccessWithCredits: async () => ({ allowed: await state.access(), reason: 'tier' }) }))
vi.mock('@/lib/rate-limit', () => ({ rateLimitCheck: state.rate, checkAndIncrementConcurrency: async () => ({ allowed: true }), decrementConcurrency: async () => {} }))
vi.mock('@/lib/ai/generate', () => ({ generateWithFallback: state.generate }))
vi.mock('@/lib/ai/search', async () => ({ ...(await vi.importActual<typeof import('@/lib/ai/search')>('@/lib/ai/search')), webSearch:state.search }))
vi.mock('@/lib/interview/context', () => ({ loadFounderContext: async () => '' }))
vi.mock('@/lib/plan-catalog', () => ({ getPlan: async () => ({ maxConcurrentRequests: 3, maxTokensPerCall: 10000 }) }))

import { db } from '@/db'
import * as schema from '@/db/schema'
import { deductCredits } from '@/lib/credits'
import { beginPlanningRequest, checkpointPlanningRequest, completePlanningRequest, failPlanningRequest, PlanningRequestError } from '@/lib/planning/requests'
import { POST as pricing } from '@/app/api/pricing/route'
import { POST as campaign } from '@/app/api/crowdfunding/route'
import { POST as pitch } from '@/app/api/pitch-deck/route'
import { POST as canvas } from '@/app/api/lean-canvas/route'
import { POST as manualCanvas } from '@/app/api/lean-canvas/manual/route'
import { GET as sourceReportOptions } from '@/app/api/planning/reports/route'
import { CREDIT_COSTS } from '@/lib/credit-costs'
import { PitchDeckAiSchema } from '@/lib/planning/pitch-schema'
import { PitchSlidesSchema, PitchStrategySchema, PitchPreparationSchema, PitchQaSchema } from '@/lib/planning/pitch-generation'
import { stagedPitchFixture } from './fixtures/pitch-deck'
import { CANVAS_KEYS } from '@/lib/planning/evidence'

const ownerId = 'aaaaaaaa-1111-4111-8111-111111111111'
const otherId = 'bbbbbbbb-2222-4222-8222-222222222222'
const ideaId = 'cccccccc-3333-4333-8333-333333333333'
const request = (module: string, payload: unknown, key?: string) => new NextRequest('http://localhost/api/' + module, { method: 'POST', headers: { origin: 'http://localhost', 'content-type': 'application/json', ...(key === undefined ? {} : { 'Idempotency-Key': key }) }, body: JSON.stringify(payload) })
const pricingInput = { ideaId, sellingPrice: 1000, expectedCustomers: 100, variableCostPerUnit: 300, fixedCostMonthly: 50000, discountPercent: 10, conversionRatePercent: 3.5, estimatedCac: 500, retentionMonths: 18 }
const campaignInput = { ideaId, fundingGoal: 50000, projectDescription: 'An actual founder description of the campaign and delivery.', category: 'Technology', country: 'India', preLaunchCommunitySize: 0, socialFollowers: 0, emailListSize: 0, campaignDurationDays: 30, rewardTiers: 3, lowestReward: 25, averageReward: 100, highestReward: 500, hasVideo: false, marketingBudget: 2000 }
const pitchInput = { ideaId, founderName: 'Founder', founderBackground: 'A genuine founder background and experience.', teamSize: 1 }
const pricingAi = { customerWtpInsights: 'No measured WTP.', customerValueAnalysis: 'Test perceived value.', competitorPrices: [], vanWestendorpInsights: { tooExpensive: 'Not measured', expensive: 'Not measured', bargain: 'Not measured', tooCheap: 'Not measured', acceptableRange: 'Not measured', label: 'ASSUMPTION' }, pricingModelRecommendation: 'Test', recommendedPriceToTest: 'INR 1000', validationStepsRequired: [], thirtyDayValidationPlan: [], riskRegister: [], customerWtpScore: 0, customerValueScore: 0, competitivePositionScore: 0, demandPotentialScore: 0, scalabilityScore: 0, pricingSimplicityScore: 0, integrityNote: 'Assumptions require testing.' }
const campaignAi = { problemProductAppealScore: 0, fundingGoalFeasibilityScore: 0, preLaunchAudienceScore: 0, campaignPageQualityScore: 0, rewardStrategyScore: 0, pricingEconomicsScore: 0, marketingReadinessScore: 0, founderCredibilityScore: 0, earlyMomentumPlanScore: 0, operationalReadinessScore: 0, recommendation: 'TEST_FURTHER', rewardTierAnalysis: [], marketingChannels: [], thirtyDayPrelaunchPlan: [], riskRegister: [], scenarios: {} }
const pitchAi = stagedPitchFixture
const canvasAi = { ...Object.fromEntries(['problem', 'customerSegments', 'uvp', 'solution', 'channels', 'revenueStreams', 'costStructure', 'keyMetrics', 'unfairAdvantage'].map(key => [key, { content: 'A founder hypothesis', confidenceScore: 0, label: 'ASSUMPTION', keyAssumptions: ['Customer demand is untested'] }])), overallConfidenceScore: 0, riskiestAssumption: 'Demand', validationExperiments: [], changeReason: 'Initial canvas', evidenceSummary: 'No customer testing yet.' }
const generation = (data: unknown) => ({ data: structuredClone(data), provider: 'synthetic-provider', tokensUsed: 100, sources: [] })
const testPlan = Array.from({ length: 4 }, (_, index) => ({ week: 'Week ' + (index + 1), activity: 'Recruit shop owners for a measured paid pilot.', owner: 'Founder', kpi: 'Count paid deposits / offers made.', expectedOutput: 'A recorded outcome and next decision.' }))
const testRisk = { risk: 'No customer has paid for the proposed workflow yet.', probability: 'high', impact: 'high', riskLevel: 'high', mitigation: 'Run a paid pilot before committing to production.' }

beforeAll(async () => {
  const { generateDrizzleJson, generateMigration } = await import('drizzle-kit/api')
  for (const statement of await generateMigration(generateDrizzleJson({}), generateDrizzleJson(schema))) await state.client.exec(statement)
  await state.client.exec('CREATE ROLE anon; CREATE ROLE authenticated;')
  const migration = await readFile(new URL('../drizzle/0009_planning_module_requests.sql', import.meta.url), 'utf8')
  await state.client.exec(migration); await state.client.exec(migration)
  const checkpoints = await readFile(new URL('../drizzle/0010_planning_stage_checkpoints.sql', import.meta.url), 'utf8')
  await state.client.exec(checkpoints); await state.client.exec(checkpoints)
}, 30000)
beforeEach(async () => {
  vi.clearAllMocks(); state.authId = 'auth-owner'; state.access.mockResolvedValue(true); state.rate.mockResolvedValue({ success: true })
  await state.client.exec('TRUNCATE users CASCADE')
  const now = new Date()
  await db.insert(schema.users).values([{ id: ownerId, supabaseId: 'auth-owner', email: 'owner@example.test', tier: 'max_premium', purchasedCredits: 5000, creditBalance: 0, rewardCredits: 0, creditCycleAllowance: 0, creditCycleStartedAt: now, creditResetAt: new Date(now.getTime() + 30 * 86400000) }, { id: otherId, supabaseId: 'auth-other', email: 'other@example.test', purchasedCredits: 5000 }])
  await db.insert(schema.ideas).values({ id: ideaId, userId: ownerId, name: 'Synthetic planning idea', industry: 'Software', product: 'Stock planning', targetCustomer: 'Shop owners', location: 'India', businessModel: 'Subscription', coreProblem: 'Slow reconciliation', proposedSolution: 'Pilot reminders' })
  state.generate.mockResolvedValue(generation(pricingAi))
  state.search.mockResolvedValue({results:[],degraded:true})
})
afterAll(async () => state.client.close())
const balance = async () => (await db.query.users.findFirst({ where: eq(schema.users.id, ownerId) }))!.purchasedCredits
const sourceMarker = 'PRIVATE prior finding: paper may be sufficient; payment is unobserved.'
async function selectedReport(options:{userId?:string;ideaId?:string;status?:string;data?:Record<string,unknown>}={}) {
  const userId=options.userId ?? ownerId, sourceIdea=options.ideaId ?? ideaId
  const [job] = await db.insert(schema.validationJobs).values({userId,ideaId:sourceIdea,status:'partial',isLite:true}).returning()
  const data = {decision:'TEST_FURTHER',decisionReasons:[sourceMarker],keyRisks:['A free workaround may be sufficient'],
    actionPlan:[{week:'1',action:'Offer a paid pilot',owner:'Founder',hypothesis:'The shop owner will pay',participantUnit:'shop',denominator:'20 comparable shop offers',
      passCriterion:'At least 4 actual paid deposits; email signups do not pass',decisionOnFailure:'Revise the buyer/problem hypothesis before further spending',kpi:'Deposits / eligible offers'}],
    customerSignals:{summary:sourceMarker,opposingSignals:['A free workaround may be sufficient'],unresolvedQuestions:['Who pays?']},
    financialReview:{status:'available',basis:'Prior AI assumptions',base:{currency:'INR',contributionMargin:-25}},
    ideaSnapshot:{name:'Original saved idea',coreProblem:'Original private reconciliation problem',preparedAt:'2026-11-15T00:00:00Z'},
    researchSources:[{title:'Saved pricing page',url:'https://example.com/pricing',fetchedAt:'2026-11-01T00:00:00Z',retrievalKind:'page',content:'Basic USD 25 per month.'}],
    integrityNote:'Prior AI interpretations and owner inputs; not independently verified demand.',...(options.data ?? {})}
  const [report] = await db.insert(schema.validationReports).values({userId,ideaId:sourceIdea,jobId:job.id,isLite:true,status:options.status ?? 'partial',overallScore:43,
    decision:'TEST_FURTHER',decisionReasons:data.decisionReasons,keyRisks:data.keyRisks,actionPlan:data.actionPlan,reportData:data}).returning()
  return report
}

describe('transactional planning request identity', () => {
  it.each([
    ['pricing',pricing,pricingInput,pricingAi],['crowdfunding',campaign,campaignInput,campaignAi],['pitch-deck',pitch,pitchInput,pitchAi],['lean-canvas',canvas,{ideaId},canvasAi],
  ] as const)('privately reuses an explicitly selected owned same-idea validation in %s and replays its immutable snapshot',async(module,handler,input,output)=>{
    const source = await selectedReport();const key=randomUUID();const body={...input,sourceReportId:source.id}
    state.generate.mockResolvedValue(generation(output))
    const response=await handler(request(module,body,key));expect(response.status).toBe(200)
    const generated=await response.json()
    const snapshot = module==='lean-canvas' ? generated.canvas.analysisData.sourceReport : module==='pitch-deck' ? generated.result.reportData.sourceReport : generated.result.sourceReport
    expect(snapshot).toMatchObject({reportId:source.id,ideaId,status:'partial',score:43,mode:'lite',briefProvenance:'captured_with_report'})
    expect(snapshot.findings.actionPlan).toEqual((source.reportData as Record<string,unknown>).actionPlan)
    expect(snapshot.findings.financialReview.base.currency).toBe('INR')
    expect(snapshot.coverage.notices.join(' ')).toContain('partial')
    for(const [options] of state.generate.mock.calls){
      expect(options).toMatchObject({researchMode:'reuse',maxResearchRounds:0,privateContextMaxChars:128000})
      expect(options.privateContext).toContain(sourceMarker)
      expect(JSON.parse(options.privateContext).selectedValidation.reportId).toBe(source.id)
    }
    expect(state.search.mock.calls.length).toBeGreaterThan(0)
    expect(JSON.stringify(state.search.mock.calls)).not.toContain(sourceMarker)
    expect(JSON.stringify(state.generate.mock.calls.map(([options])=>options.researchPrompt))).not.toContain(sourceMarker)
    const beforeReplay=await balance(),calls=state.generate.mock.calls.length
    const replay=await handler(request(module,body,key));expect(replay.status).toBe(200);expect((await replay.json()).reused).toBe(true)
    expect(await balance()).toBe(beforeReplay);expect(state.generate).toHaveBeenCalledTimes(calls)
    await db.update(schema.validationReports).set({reportData:{...(source.reportData as Record<string,unknown>),decisionReasons:['Changed private finding']}}).where(eq(schema.validationReports.id,source.id))
    const changed=await handler(request(module,body,key));expect(changed.status).toBe(200);const changedBody=await changed.json();expect(changedBody.reused).toBe(true)
    const frozen=module==='lean-canvas'?changedBody.canvas.analysisData.sourceReport:module==='pitch-deck'?changedBody.result.reportData.sourceReport:changedBody.result.sourceReport
    expect(frozen).toEqual(snapshot)
    expect(await balance()).toBe(beforeReplay);expect(state.generate).toHaveBeenCalledTimes(calls)
  })
  it.each([['pricing',pricing,pricingInput],['crowdfunding',campaign,campaignInput],['pitch-deck',pitch,pitchInput],['lean-canvas',canvas,{ideaId}]] as const)
    ('rejects an unavailable/other-owner source for %s before public research, model or debit',async(module,handler,input)=>{
      const source=await selectedReport({userId:otherId})
      const response=await handler(request(module,{...input,sourceReportId:source.id},randomUUID()))
      expect(response.status).toBe(404);expect(await balance()).toBe(5000)
      expect(state.generate).not.toHaveBeenCalled();expect(state.search).not.toHaveBeenCalled();expect(await db.select().from(schema.creditLedger)).toHaveLength(0)
    })
  it('lists only owned eligible validations for the chosen idea without returning private report text',async()=>{
    const owned=await selectedReport(),foreign=await selectedReport({userId:otherId}),failed=await selectedReport({status:'failed'})
    const response=await sourceReportOptions(new NextRequest('http://localhost/api/planning/reports?ideaId='+ideaId))
    expect(response.status).toBe(200);const body=await response.json()
    expect(body.records.map((row:Record<string,string>)=>row.id)).toEqual([owned.id])
    expect(body.records[0]).toMatchObject({status:'partial',score:43,mode:'lite'})
    expect(JSON.stringify(body)).not.toContain(sourceMarker);expect(JSON.stringify(body)).not.toContain(foreign.id);expect(JSON.stringify(body)).not.toContain(failed.id)
  })
  it('rejects a report for a different owned idea and source selection changes under the same run key',async()=>{
    const [otherIdea]=await db.insert(schema.ideas).values({userId:ownerId,name:'Other idea',industry:'Software',product:'Other product',targetCustomer:'Other customer',location:'India',businessModel:'Other model',coreProblem:'Other problem',proposedSolution:'Other solution'}).returning()
    const wrong=await selectedReport({ideaId:otherIdea.id})
    expect((await pricing(request('pricing',{...pricingInput,sourceReportId:wrong.id},randomUUID()))).status).toBe(404)
    const first=await selectedReport(),second=await selectedReport(),key=randomUUID()
    expect((await pricing(request('pricing',{...pricingInput,sourceReportId:first.id},key))).status).toBe(200)
    const calls=state.generate.mock.calls.length
    expect((await pricing(request('pricing',{...pricingInput,sourceReportId:second.id},key))).status).toBe(409)
    expect(state.generate).toHaveBeenCalledTimes(calls)
  })
  it('cancels a debit/result when the selected report is edited while the model is working',async()=>{
    const source=await selectedReport()
    state.generate.mockImplementation(async()=>{
      await db.update(schema.validationReports).set({reportData:{...(source.reportData as Record<string,unknown>),decisionReasons:['Changed during generation']}}).where(eq(schema.validationReports.id,source.id))
      return generation(pricingAi)
    })
    const response=await pricing(request('pricing',{...pricingInput,sourceReportId:source.id},randomUUID()))
    expect(response.status).toBe(409);expect((await response.json()).code).toBe('planning_inputs_changed')
    expect(await balance()).toBe(5000);expect(await db.select().from(schema.creditLedger)).toHaveLength(0);expect(await db.select().from(schema.pricingSimulations)).toHaveLength(0)
  })
  it.each([
    ['pricing',pricing,pricingInput,pricingAi,schema.pricingSimulations],
    ['crowdfunding',campaign,campaignInput,campaignAi,schema.crowdfundingAnalyses],
    ['pitch-deck',pitch,pitchInput,pitchAi,schema.pitchDecks],
    ['lean-canvas',canvas,{ideaId},canvasAi,schema.leanCanvases],
  ] as const)('fences unkeyed %s idea mutations even when the selected source is unchanged',async(module,handler,input,output,table)=>{
    const source=await selectedReport()
    state.generate.mockImplementation(async()=>{
      await db.update(schema.ideas).set({coreProblem:'Edited during generation',publicResearchFocus:'Approved revised inventory alternatives'}).where(eq(schema.ideas.id,ideaId))
      return generation(output)
    })
    const response=await handler(request(module,{...input,sourceReportId:source.id}))
    expect(response.status).toBe(409);expect((await response.json()).code).toBe('planning_inputs_changed')
    expect(await balance()).toBe(5000);expect(await db.select().from(schema.creditLedger)).toHaveLength(0);expect(await db.select().from(table)).toHaveLength(0)
  })
  it('also fences an unkeyed standalone Pricing run when its idea changes without a selected source',async()=>{
    state.generate.mockImplementation(async()=>{
      await db.update(schema.ideas).set({coreProblem:'Changed standalone idea'}).where(eq(schema.ideas.id,ideaId))
      return generation(pricingAi)
    })
    const response=await pricing(request('pricing',pricingInput))
    expect(response.status).toBe(409);expect(await balance()).toBe(5000)
    expect(await db.select().from(schema.creditLedger)).toHaveLength(0);expect(await db.select().from(schema.pricingSimulations)).toHaveLength(0)
  })
  it('replays the frozen completed artifact after its selected report is deleted without model calls or debit',async()=>{
    const source=await selectedReport({status:'complete'}),body={...pricingInput,sourceReportId:source.id},key=randomUUID()
    const first=await pricing(request('pricing',body,key));expect(first.status).toBe(200);const original=await first.json(),remaining=await balance()
    await db.delete(schema.validationReports).where(eq(schema.validationReports.id,source.id))
    state.generate.mockClear();state.search.mockClear()
    const replay=await pricing(request('pricing',body,key));expect(replay.status).toBe(200)
    const recovered=await replay.json();expect(recovered.result).toEqual(original.result);expect(recovered.reused).toBe(true);expect(recovered.creditsCharged).toBe(0)
    expect(await balance()).toBe(remaining);expect(state.generate).not.toHaveBeenCalled();expect(state.search).not.toHaveBeenCalled()
  })
  it('keeps selected-report capture identity stable across a 202 Pitch continuation',async()=>{
    const source=await selectedReport(),key=randomUUID();let clock=Date.now()
    const now=vi.spyOn(Date,'now').mockImplementation(()=>clock)
    try{
      state.generate.mockImplementation(async()=>{clock+=70000;return generation(pitchAi)})
      const body={...pitchInput,sourceReportId:source.id}
      expect((await pitch(request('pitch-deck',body,key))).status).toBe(202)
      const capturedAt=JSON.parse(state.generate.mock.calls[0][0].privateContext).selectedValidation.capturedAt
      state.generate.mockClear()
      expect((await pitch(request('pitch-deck',body,key))).status).toBe(200)
      expect(JSON.parse(state.generate.mock.calls[0][0].privateContext).selectedValidation.capturedAt).toBe(capturedAt)
      expect(state.generate.mock.calls.map(([options])=>options.schema)).toEqual([PitchPreparationSchema,PitchQaSchema])
    }finally{now.mockRestore()}
  })
  it('refuses changed source content before resuming a partial Pitch and makes no extra model call or debit',async()=>{
    const source=await selectedReport(),key=randomUUID();let clock=Date.now()
    const now=vi.spyOn(Date,'now').mockImplementation(()=>clock)
    try{
      state.generate.mockImplementation(async()=>{clock+=70000;return generation(pitchAi)})
      const body={...pitchInput,sourceReportId:source.id}
      expect((await pitch(request('pitch-deck',body,key))).status).toBe(202)
      await db.update(schema.validationReports).set({reportData:{...(source.reportData as Record<string,unknown>),decisionReasons:['Changed before continuation']}}).where(eq(schema.validationReports.id,source.id))
      const calls=state.generate.mock.calls.length,response=await pitch(request('pitch-deck',body,key))
      expect(response.status).toBe(409);expect((await response.json()).code).toBe('planning_inputs_changed')
      expect(state.generate).toHaveBeenCalledTimes(calls);expect(await balance()).toBe(5000)
      expect(await db.select().from(schema.pitchDecks)).toHaveLength(0);expect(await db.select().from(schema.creditLedger)).toHaveLength(0)
    }finally{now.mockRestore()}
  })
  it('invalidates a pending planning request when the explicit approved research topic changes',async()=>{
    const key=randomUUID(),run=await beginPlanningRequest(request('pricing',pricingInput,key),ownerId,'pricing')
    await failPlanningRequest(run.lease)
    await db.update(schema.ideas).set({publicResearchFocus:'Approved inventory reconciliation alternatives'}).where(eq(schema.ideas.id,ideaId))
    await expect(beginPlanningRequest(request('pricing',pricingInput,key),ownerId,'pricing')).rejects.toMatchObject({code:'planning_inputs_changed'})
  })
  it('records or explicitly clears a linked source on manual Canvas revisions without charges',async()=>{
    const source=await selectedReport(),blocks=Object.fromEntries(CANVAS_KEYS.map(key=>[key,'Founder '+key]))
    const first=await manualCanvas(request('lean-canvas/manual',{ideaId,sourceReportId:source.id,blocks},randomUUID()))
    expect(first.status).toBe(200);const original=(await first.json()).canvas
    expect(original.analysisData.sourceReport.reportId).toBe(source.id)
    const cleared=await manualCanvas(request('lean-canvas/manual',{ideaId,parentCanvasId:original.id,sourceReportId:null,blocks},randomUUID()))
    expect(cleared.status).toBe(200);expect((await cleared.json()).canvas.analysisData.sourceReport).toBeNull()
    expect(await balance()).toBe(5000);expect(await db.select().from(schema.creditLedger)).toHaveLength(0)
  })
  it('persists a 202 pitch checkpoint without debit, resumes only unfinished writers and clears private stage data after complete delivery', async () => {
    const key = randomUUID(); let clock = Date.now()
    const now = vi.spyOn(Date, 'now').mockImplementation(() => clock)
    try {
      state.generate.mockImplementation(async () => { clock += 70000; return generation(stagedPitchFixture) })
      const first = await pitch(request('pitch-deck', pitchInput, key))
      expect(first.status).toBe(202)
      expect(await first.json()).toMatchObject({ completedStages: ['slides','strategy'], creditsCharged: 0 })
      expect(await balance()).toBe(5000)
      expect(await db.select().from(schema.creditLedger)).toHaveLength(0)
      expect(await db.select().from(schema.pitchDecks)).toHaveLength(0)
      const staged = (await db.select().from(schema.planningModuleRequests))[0]
      expect(staged.status).toBe('failed')
      expect(staged.stageData).toMatchObject({ version: 'staged_pitch_v2', stages: { slides: { data: { slides: stagedPitchFixture.slides } } } })
      state.generate.mockClear()
      const second = await pitch(request('pitch-deck', pitchInput, key))
      expect(second.status).toBe(200)
      expect(state.generate.mock.calls.map(([call]) => call.schema)).toEqual([PitchPreparationSchema, PitchQaSchema])
      expect((await second.json()).result.investorQa).toEqual(stagedPitchFixture.investorQa)
      expect(await balance()).toBe(5000 - CREDIT_COSTS.PITCH_DECK)
      expect((await db.select().from(schema.planningModuleRequests))[0].stageData).toBeNull()
      expect(await db.select().from(schema.creditLedger)).toHaveLength(1)
    } finally { now.mockRestore() }
  })
  it('fences replaced checkpoint writers and rejects oversized private checkpoints', async () => {
    const key = randomUUID()
    const initial = await beginPlanningRequest(request('pitch-deck', pitchInput, key), ownerId, 'pitch-deck')
    await failPlanningRequest(initial.lease)
    const retry = await beginPlanningRequest(request('pitch-deck', pitchInput, key), ownerId, 'pitch-deck')
    await expect(checkpointPlanningRequest(initial.lease!, { stale: 'writer' })).rejects.toThrow('replaced')
    await checkpointPlanningRequest(retry.lease!, { current: 'writer' })
    expect((await db.select().from(schema.planningModuleRequests))[0].stageData).toEqual({ current: 'writer' })
    await expect(checkpointPlanningRequest(retry.lease!, { private: 'x'.repeat(500001) })).rejects.toMatchObject({ status: 413 })
  })
  it('saves long preparation without a debit, then finishes QA once under the same request key',async()=>{
    const key=randomUUID();let clock=Date.now();const now=vi.spyOn(Date,'now').mockImplementation(()=>clock)
    try{
      state.generate.mockImplementation(async(options)=>{clock+=options.schema===PitchPreparationSchema?190000:70000;return generation(stagedPitchFixture)})
      expect((await pitch(request('pitch-deck',pitchInput,key))).status).toBe(202)
      state.generate.mockClear()
      const prepared=await pitch(request('pitch-deck',pitchInput,key));expect(prepared.status).toBe(202)
      expect((await prepared.json()).completedStages).toEqual(['slides','strategy','preparation'])
      expect(state.generate).toHaveBeenCalledOnce();expect(state.generate.mock.calls[0][0]).toMatchObject({timeoutMs:200000,maxOutputTokens:6500})
      expect(await balance()).toBe(5000);expect(await db.select().from(schema.creditLedger)).toHaveLength(0);expect(await db.select().from(schema.pitchDecks)).toHaveLength(0)
      state.generate.mockClear()
      const completed=await pitch(request('pitch-deck',pitchInput,key));expect(completed.status).toBe(200)
      expect(state.generate).toHaveBeenCalledOnce();expect(state.generate.mock.calls[0][0].schema).toBe(PitchQaSchema)
      expect(await balance()).toBe(5000-CREDIT_COSTS.PITCH_DECK);expect(await db.select().from(schema.creditLedger)).toHaveLength(1);expect(await db.select().from(schema.pitchDecks)).toHaveLength(1)
      const replay=await pitch(request('pitch-deck',pitchInput,key));expect(replay.status).toBe(200);expect((await replay.json()).creditsCharged).toBe(0)
      expect(state.generate).toHaveBeenCalledOnce()
    }finally{now.mockRestore()}
  })
  it.each([
    ['slides', PitchSlidesSchema], ['strategy', PitchStrategySchema], ['preparation', PitchPreparationSchema], ['investor-qa', PitchQaSchema],
  ] as const)('keeps every %s stage failure uncharged and retryable, then commits the complete pitch once', async (_name, failedSchema) => {
    const key = randomUUID()
    state.generate.mockImplementation(async options => {
      if (options.schema === failedSchema) throw new Error('Synthetic staged provider failure')
      return generation(stagedPitchFixture)
    })
    expect((await pitch(request('pitch-deck', pitchInput, key))).status).toBe(503)
    expect(await balance()).toBe(5000)
    expect(await db.select().from(schema.creditLedger)).toHaveLength(0)
    expect(await db.select().from(schema.pitchDecks)).toHaveLength(0)
    expect((await db.select().from(schema.planningModuleRequests))[0].status).toBe('failed')
    state.generate.mockImplementation(async () => generation(stagedPitchFixture))
    const completed = await pitch(request('pitch-deck', pitchInput, key)); expect(completed.status).toBe(200)
    const saved = (await completed.json()).result
    expect(saved.slides).toHaveLength(12); expect(saved.investorQa).toHaveLength(20)
    expect(saved.reportData.ai.actionPlan).toEqual(stagedPitchFixture.actionPlan)
    expect(saved.reportData.generationTrace.reviewHandoff.slides).toEqual(stagedPitchFixture.slides)
    expect(saved.reportData.generationTrace.reviewHandoff.strategy.kpiTargets).toEqual(stagedPitchFixture.kpiTargets)
    expect(saved.reportData.generationTrace.reviewHandoff.founderTerms).toMatchObject(pitchInput)
    expect(await balance()).toBe(5000 - CREDIT_COSTS.PITCH_DECK)
    const calls = state.generate.mock.calls.length
    expect((await pitch(request('pitch-deck', pitchInput, key))).status).toBe(200)
    expect(state.generate).toHaveBeenCalledTimes(calls)
    expect(await db.select().from(schema.pitchDecks)).toHaveLength(1)
    expect(await db.select().from(schema.creditLedger)).toHaveLength(1)
  })
  it.each([
    ['pricing', pricing, pricingInput, { ...pricingAi, customerWtpInsights: 'A real purchase test is needed before claiming demand.', customerValueAnalysis: 'Measure the time saved by the stock workflow.', pricingModelRecommendation: 'Test a narrow recurring paid pilot.', validationStepsRequired: ['Recruit the proposed shop-owner segment.', 'Measure paid deposits against offers.'], thirtyDayValidationPlan: testPlan, riskRegister: [testRisk] }, 'thirtyDayValidationPlan'],
    ['crowdfunding', campaign, campaignInput, { ...campaignAi, recommendationReasons: ['Delivery costs and campaign visitor demand remain unverified.'], keyStrengths: [], keyWeaknesses: ['No observed demand or delivery quotes were supplied.'], thirtyDayPrelaunchPlan: testPlan, riskRegister: [testRisk], scenarios: Object.fromEntries(['conservative','base','optimistic'].map(label => [label, { fundingPercent: 0, backers: 0, amountRaised: 0, label: 'ASSUMPTION' }])), integrityNote: 'The campaign scenarios are assumptions, not measured demand.' }, 'thirtyDayPrelaunchPlan'],
    ['pitch-deck', pitch, pitchInput, { ...pitchAi, pitchScript3min: 'Explain the shop-owner hypothesis, the proposed paid pilot, the evidence still needed, and the funding decision after the test.', pitchScript60sec: 'Shop owners may need this workflow; test the need with a paid pilot before building the full product.', founderReadinessNote: 'This founder background is self-reported, not an execution guarantee.', integrityNote: 'Proposed milestones and strategies are hypotheses, not achieved traction.', portfolioSections: [{ sectionTitle: 'Customer hypothesis', content: 'Shop owners may need faster stock reconciliation.', label: 'ASSUMPTION' }], roadmap: [{ phase: 'Paid pilot', timeframe: 'Next month', milestones: [{ milestone: 'Measure paid demand', status: 'PLANNED' }] }] }, 'pitchScript3min'],
    ['lean-canvas', canvas, { ideaId }, { ...canvasAi, riskiestAssumption: 'Shop owners will pay for faster stock reconciliation.', validationExperiments: [{ assumption: 'Shop owners will pay for faster reconciliation.', experiment: 'Offer a measured paid pilot to the recruited segment.', successMetric: 'At least 3 paid deposits from 20 comparable offers.', timeframe: 'Two weeks', recruitedSegment: 'Pune independent shop owners', sampleSize: '20 offers', failureAction: 'Revise the problem hypothesis if fewer than 3 pay.' }] }, 'validationExperiments'],
  ] as const)('requires a usable core output for %s instead of accepting a blank plan or script', async (module, handler, payload, candidate, field) => {
    state.generate.mockResolvedValue(generation(candidate))
    expect((await handler(request(module, payload))).status).toBe(200)
    const outputSchema = module === 'pitch-deck' ? PitchDeckAiSchema : state.generate.mock.calls[0][0].schema
    expect(outputSchema.safeParse(candidate).success).toBe(true)
    expect(outputSchema.safeParse({ ...candidate, [field]: typeof (candidate as Record<string, unknown>)[field] === 'string' ? '' : [] }).success).toBe(false)
  })
  it('retries a manual canvas save without consuming another version or any credits', async () => {
    const key = randomUUID()
    const payload = { ideaId, blocks: Object.fromEntries(['problem', 'customerSegments', 'uvp', 'solution', 'channels', 'revenueStreams', 'costStructure', 'keyMetrics', 'unfairAdvantage'].map(field => [field, 'Founder-authored ' + field])) }
    const first = await manualCanvas(request('lean-canvas/manual', payload, key))
    expect(first.status).toBe(200)
    const saved = await first.json()
    const retry = await manualCanvas(request('lean-canvas/manual', payload, key))
    expect(retry.status).toBe(200)
    expect(await retry.json()).toMatchObject({ canvas: saved.canvas, reused: true, creditsCharged: 0 })
    expect(await db.select().from(schema.leanCanvases)).toHaveLength(1)
    expect(await db.select().from(schema.creditLedger)).toHaveLength(0)
    expect(state.generate).not.toHaveBeenCalled()
    expect((await canvas(request('lean-canvas', payload, key))).status).toBe(409)
  })
  it('handles a zero-customer forecast without a nonfinite break-even score', async () => {
    const response = await pricing(request('pricing', { ...pricingInput, expectedCustomers: 0 }, randomUUID()))
    expect(response.status).toBe(200)
    expect((await response.json()).result.computedMetrics).toMatchObject({ revenue: 0, operatingProfit: -50000 })
    expect(await db.select().from(schema.creditLedger)).toHaveLength(1)
  })
  it.each([
    ['pricing', pricing, pricingInput, pricingAi, CREDIT_COSTS.PRICING, 'simulationId'],
    ['crowdfunding', campaign, campaignInput, campaignAi, CREDIT_COSTS.CROWDFUNDING, 'analysisId'],
    ['pitch-deck', pitch, pitchInput, pitchAi, CREDIT_COSTS.PITCH_DECK, 'deckId'],
    ['lean-canvas', canvas, { ideaId, intakeAnswers: {} }, canvasAi, CREDIT_COSTS.LEAN_CANVAS, 'canvas'],
  ] as const)('replays %s without another model call or debit', async (module, handler, payload, ai, cost, resultKey) => {
    const key = randomUUID(); state.generate.mockResolvedValue(generation(ai))
    const first = await handler(request(module, payload, key)); expect(first.status).toBe(200)
    const firstData = await first.json(); expect(await balance()).toBe(5000 - cost)
    state.access.mockResolvedValue(false)
    await db.update(schema.users).set({ purchasedCredits: 0 }).where(eq(schema.users.id, ownerId))
    const calls = state.access.mock.calls.length
    const replay = await handler(request(module, payload, key)); expect(replay.status).toBe(200)
    const replayData = await replay.json()
    expect(replayData[resultKey]).toEqual(firstData[resultKey])
    expect(replayData).toMatchObject({ reused: true, creditsCharged: 0 })
    expect(state.generate).toHaveBeenCalledTimes(module === 'pitch-deck' ? 4 : 1); expect(state.access).toHaveBeenCalledTimes(calls)
    expect(await db.select().from(schema.creditLedger)).toHaveLength(1)
    expect(await db.select().from(schema.planningModuleRequests)).toHaveLength(1)
  })
  it('blocks a concurrent retry until the original request completes', async () => {
    let release!: () => void
    state.generate.mockImplementationOnce(async () => { await new Promise<void>(resolve => { release = resolve }); return generation(pricingAi) })
    const key = randomUUID(); const first = pricing(request('pricing', pricingInput, key))
    for (let count = 0; count < 100 && !release; count++) await new Promise(resolve => setTimeout(resolve, 10))
    expect(release).toBeDefined()
    const concurrent = await pricing(request('pricing', pricingInput, key)); expect(concurrent.status).toBe(409)
    expect(concurrent.headers.get('retry-after')).toBeTruthy()
    expect(state.generate).toHaveBeenCalledOnce(); expect(await db.select().from(schema.creditLedger)).toHaveLength(0)
    release(); expect((await first).status).toBe(200)
    expect((await pricing(request('pricing', pricingInput, key))).status).toBe(200)
    expect(await db.select().from(schema.creditLedger)).toHaveLength(1)
  })
  it('rejects changed payloads, module reuse and changed idea briefs', async () => {
    const key = randomUUID(); expect((await pricing(request('pricing', pricingInput, key))).status).toBe(200)
    expect((await pricing(request('pricing', { ...pricingInput, sellingPrice: 1500 }, key))).status).toBe(409)
    expect((await pitch(request('pitch-deck', pitchInput, key))).status).toBe(409)
    await db.update(schema.ideas).set({ targetCustomer: 'Different customer' }).where(eq(schema.ideas.id, ideaId))
    expect((await pricing(request('pricing', pricingInput, key))).status).toBe(409)
    expect(state.generate).toHaveBeenCalledOnce(); expect(await db.select().from(schema.creditLedger)).toHaveLength(1)
  })
  it.each([
    ['pricing', pricing, pricingInput], ['crowdfunding', campaign, campaignInput],
    ['pitch-deck', pitch, pitchInput], ['lean-canvas', canvas, { ideaId }],
  ] as const)('does not begin a new %s run for a read-only or archived idea', async (module, handler, payload) => {
    await db.update(schema.ideas).set({ isReadOnly: true }).where(eq(schema.ideas.id, ideaId))
    expect((await handler(request(module, payload, randomUUID()))).status).toBe(403)
    expect((await handler(request(module, payload))).status).toBe(403)
    await db.update(schema.ideas).set({ isReadOnly: false, isActive: false }).where(eq(schema.ideas.id, ideaId))
    expect((await handler(request(module, payload, randomUUID()))).status).toBe(404)
    expect(state.generate).not.toHaveBeenCalled()
    expect(await balance()).toBe(5000)
  })
  it('reopens a completed result after an idea becomes read-only', async () => {
    const key = randomUUID()
    expect((await pricing(request('pricing', pricingInput, key))).status).toBe(200)
    await db.update(schema.ideas).set({ isReadOnly: true }).where(eq(schema.ideas.id, ideaId))
    const replay = await pricing(request('pricing', pricingInput, key))
    expect(replay.status).toBe(200)
    expect((await replay.json()).creditsCharged).toBe(0)
    expect(state.generate).toHaveBeenCalledOnce()
  })
  it.each([true, false])('cancels a result and debit when an idea becomes read-only during a %s keyed run', async keyed => {
    state.generate.mockImplementationOnce(async () => {
      await db.update(schema.ideas).set({ isReadOnly: true }).where(eq(schema.ideas.id, ideaId))
      return generation(pricingAi)
    })
    const response = await pricing(request('pricing', pricingInput, keyed ? randomUUID() : undefined))
    expect(response.status).toBe(403)
    expect(await balance()).toBe(5000)
    expect(await db.select().from(schema.creditLedger)).toHaveLength(0)
    expect(await db.select().from(schema.pricingSimulations)).toHaveLength(0)
  })
  it('retries a failed generation under the same key, charging only the completed attempt', async () => {
    const key = randomUUID(); state.generate.mockRejectedValueOnce(new Error('Synthetic provider failure'))
    expect((await pricing(request('pricing', pricingInput, key))).status).toBe(503)
    expect(await balance()).toBe(5000)
    expect((await db.select().from(schema.planningModuleRequests))[0].status).toBe('failed')
    expect((await pricing(request('pricing', pricingInput, key))).status).toBe(200)
    expect(await balance()).toBe(5000 - CREDIT_COSTS.PRICING)
    expect(await db.select().from(schema.creditLedger)).toHaveLength(1)
  })
  it('fences an expired worker and rolls back its debit and result', async () => {
    const key = randomUUID(); const old = await beginPlanningRequest(request('pricing', pricingInput, key), ownerId, 'pricing')
    await db.update(schema.planningModuleRequests).set({ leaseExpiresAt: new Date(Date.now() - 1000) }).where(eq(schema.planningModuleRequests.id, old.lease!.id))
    const renewed = await beginPlanningRequest(request('pricing', pricingInput, key), ownerId, 'pricing')
    expect(renewed.lease!.token).not.toBe(old.lease!.token)
    await expect(db.transaction(async tx => {
      await deductCredits(ownerId, CREDIT_COSTS.PRICING, 'PRICING', ideaId, undefined, tx)
      const [saved] = await tx.insert(schema.pricingSimulations).values({ ideaId, userId: ownerId, pricingScore: 0 }).returning()
      await completePlanningRequest(tx, old.lease, saved.id)
    })).rejects.toBeInstanceOf(PlanningRequestError)
    expect(await balance()).toBe(5000)
    expect(await db.select().from(schema.pricingSimulations)).toHaveLength(0)
    expect(await db.select().from(schema.creditLedger)).toHaveLength(0)
    await failPlanningRequest(old.lease)
    expect((await db.select().from(schema.planningModuleRequests))[0].leaseToken).toBe(renewed.lease!.token)
    expect((await db.select().from(schema.planningModuleRequests))[0].status).toBe('pending')
  })
  it('never regenerates a completed key whose saved result was deleted', async () => {
    const key = randomUUID(); expect((await pricing(request('pricing', pricingInput, key))).status).toBe(200)
    await db.delete(schema.pricingSimulations)
    expect((await pricing(request('pricing', pricingInput, key))).status).toBe(410)
    expect(state.generate).toHaveBeenCalledOnce(); expect(await db.select().from(schema.creditLedger)).toHaveLength(1)
  })
  it('keeps legacy callers compatible and rejects malformed keys or foreign ideas', async () => {
    expect((await pricing(request('pricing', pricingInput))).status).toBe(200)
    expect(await db.select().from(schema.planningModuleRequests)).toHaveLength(1)
    expect((await pricing(request('pricing', pricingInput, 'not-a-uuid'))).status).toBe(400)
    state.authId = 'auth-other'
    expect((await pricing(request('pricing', pricingInput, randomUUID()))).status).toBe(404)
    expect(state.generate).toHaveBeenCalledOnce()
  })
  it('keeps the reviewed migration repeatable and denies browser database roles', async () => {
    await beginPlanningRequest(request('pricing', pricingInput, randomUUID()), ownerId, 'pricing')
    await state.client.exec('SET ROLE authenticated')
    try { await expect(state.client.query('SELECT * FROM planning_module_requests')).rejects.toThrow() } finally { await state.client.exec('RESET ROLE') }
  })
  it('rate-limits new registry writes before accepting another request key', async () => {
    state.rate.mockResolvedValueOnce({ success: false })
    expect((await pricing(request('pricing', pricingInput, randomUUID()))).status).toBe(429)
    expect(await db.select().from(schema.planningModuleRequests)).toHaveLength(0)
    expect(state.generate).not.toHaveBeenCalled()
    expect(await db.select().from(schema.creditLedger)).toHaveLength(0)
  })
})
