import { describe, expect, it, vi } from 'vitest'
vi.mock('@/db',()=>({ db:{} }))
import { capturePlanningReport, isEligiblePlanningReport, planningOwnerContext, sourceReportContentHash } from '@/lib/planning/source-report'
import { planningIdeaSnapshot } from '@/lib/planning/requests'

const report = { id:'11111111-1111-4111-8111-111111111111',ideaId:'22222222-2222-4222-8222-222222222222',status:'partial',isLite:true,overallScore:43,
  createdAt:new Date('2026-11-15T00:00:00Z'),shareToken:'NEVER_COPY_SHARE_TOKEN',reportData:{
    decision:'TEST_FURTHER',decisionReasons:['Private: demand and payment remain unobserved.'],keyRisks:['A free workaround may be sufficient.'],
    actionPlan:[{ week:'1',action:'Offer a paid pilot',owner:'Founder',hypothesis:'The buyer will pay',participantUnit:'shop',denominator:'20 comparable shop offers',
      passCriterion:'At least 4 actual paid deposits; signups do not pass.',decisionOnFailure:'Revise the buyer/problem hypothesis before a broader build.',kpi:'Paid deposits / eligible offers' }],
    persona:{occupation:'Shop owner',goals:['Reduce stock reconciliation time'],problems:['Current effort is unmeasured']},
    financialReview:{status:'available',basis:'Prior AI assumptions, not observed revenue',base:{currency:'INR',contributionMargin:-25,largestCumulativeDeficit:75000},limitation:'No cash balance was supplied'},
    computedUnitEconomics:{currency:'INR',contributionMargin:-25,label:'ASSUMPTION'},
    customerSignals:{summary:'PRIVATE conflicting owner statements',opposingSignals:['The owner may prefer paper'],unresolvedQuestions:['Who pays?']},
    integrityNote:'AI interpretation is not independent verification.',landingPageCopy:{headline:'Ancillary copy should not replace the experiment criteria'},
    researchSources:[{ title:'Old pricing page',url:'https://example.com/pricing',fetchedAt:'2026-11-01T00:00:00Z',retrievalKind:'page',content:'Basic USD 25 per month.',dataBundleVersion:'synthetic-bundle-v1' },
      { title:'Metadata only',url:'https://example.org/context',fetchedAt:'2026-10-01T00:00:00Z',retrievalKind:'page' }],
  } }
describe('private selected-report planning handoffs',()=>{
  it('retains complete decision, risks, pass/fail criteria, contrary customer context and original financial units',()=>{
    const selected = capturePlanningReport(report,'2026-11-16T00:00:00Z')
    expect(selected.snapshot.status).toBe('partial')
    for (const field of ['decisionReasons','keyRisks','actionPlan','persona','financialReview','computedUnitEconomics','customerSignals']) expect(selected.snapshot.findings[field]).toEqual(report.reportData[field as keyof typeof report.reportData])
    expect(selected.snapshot.coverage.omittedFields).toContain('landingPageCopy')
    expect(selected.snapshot.coverage.notices.join(' ')).toContain('partial')
    expect(selected.snapshot.briefProvenance).toBe('unavailable_in_legacy_report')
    expect(JSON.stringify(selected.snapshot)).not.toContain(report.shareToken)
  })
  it('preserves dated saved passages but downgrades metadata, excerpts and invalid links',()=>{
    const selected = capturePlanningReport({ ...report,reportData:{...report.reportData,researchSources:[...report.reportData.researchSources,
      {title:'Excerpt',url:'https://example.net/large',fetchedAt:'2026-11-01',retrievalKind:'page',content:'x'.repeat(7000)},
      {title:'Credential URL',url:'https://owner:secret@example.com/private',fetchedAt:'2026-11-01',content:'Private'},
      {title:'Undated',url:'https://example.net/undated',content:'No retrieval date'},
      {title:'Local address',url:'http://127.0.0.1/private',fetchedAt:'2026-11-01',content:'Private'},
    ]} })
    expect(selected.sources).toHaveLength(3)
    expect(selected.sources[0]).toMatchObject({retrievalKind:'page',fetchedAt:'2026-11-01T00:00:00.000Z',content:'Basic USD 25 per month.'})
    expect(selected.sources[0].dataBundleVersion).toBe('synthetic-bundle-v1')
    expect(selected.snapshot.researchSources[0].dataBundleVersion).toBe('synthetic-bundle-v1')
    expect(selected.sources[1].retrievalKind).toBe('snippet')
    expect(selected.sources[1].content).toContain('No supporting passage')
    expect(selected.sources[2].retrievalKind).toBe('snippet')
    expect(selected.snapshot.coverage).toMatchObject({sourceCount:6,suppliedSourceCount:3,sourceExcerpts:1,metadataOnlySources:1})
  })
  it('captures the actual saved brief and hashes changed content/status/date without hashing a share token',()=>{
    const originalBrief = {name:'Original idea',coreProblem:'Original private problem',publicResearchFocus:'Approved inventory workflow alternatives',preparedAt:'2026-11-15'}
    const selected = capturePlanningReport({...report,reportData:{...report.reportData,ideaSnapshot:originalBrief}})
    expect(selected.snapshot.originalBrief).toEqual(originalBrief)
    expect(selected.snapshot.briefProvenance).toBe('captured_with_report')
    expect(sourceReportContentHash({...report,shareToken:'DIFFERENT'})).toBe(sourceReportContentHash(report))
    expect(sourceReportContentHash({...report,status:'complete'})).not.toBe(sourceReportContentHash(report))
    expect(sourceReportContentHash({...report,createdAt:new Date('2026-11-16')})).not.toBe(sourceReportContentHash(report))
    expect(sourceReportContentHash({...report,reportData:{...report.reportData,decisionReasons:['Changed decision']}})).not.toBe(sourceReportContentHash(report))
  })
  it('rejects an empty/failed report and an oversized core rather than deleting important criteria',()=>{
    expect(isEligiblePlanningReport({...report,status:'failed'})).toBe(false)
    expect(isEligiblePlanningReport({...report,reportData:{}})).toBe(false)
    expect(()=>capturePlanningReport({...report,reportData:{...report.reportData,actionPlan:[{...report.reportData.actionPlan[0],passCriterion:'x'.repeat(100000)}]}})).toThrow('budget')
  })
  it('discloses incomplete specialist coverage and missing legacy experiment criteria even on a complete status row',()=>{
    const selected = capturePlanningReport({...report,status:'complete',reportData:{...report.reportData,
      agentTrail:{agents:{market:'ok',customer:'failed',synthesis:'ok'}},actionPlan:[{week:'1',action:'Interview a shop owner',kpi:'Learning'}]}})
    expect(selected.snapshot.status).toBe('partial')
    expect(selected.snapshot.coverage.experimentCriteria).toMatchObject({planCount:1,fullySpecifiedPlans:0,gaps:[{index:0,missingFields:expect.arrayContaining(['denominator','passCriterion','decisionOnFailure'])}]})
    expect(selected.snapshot.findings.actionPlan).toEqual([{week:'1',action:'Interview a shop owner',kpi:'Learning'}])
    expect(selected.snapshot.coverage.notices.join(' ')).toContain('criteria remain unavailable')
  })
  it('uses saved decision/scores as canonical and retains conflicting payload values explicitly',()=>{
    const selected=capturePlanningReport({...report,status:'complete',decision:'TEST_FURTHER',overallScore:12,problemScore:null,
      reportData:{...report.reportData,decision:'GO',overallScore:99,problemScore:20}})
    expect(selected.snapshot.score).toBe(12)
    expect(selected.snapshot.findings).toMatchObject({decision:'TEST_FURTHER',overallScore:12,problemScore:null})
    expect(selected.snapshot.status).toBe('partial')
    expect(selected.snapshot.coverage.columnPayloadConflicts).toEqual(expect.arrayContaining([
      {field:'decision',columnValue:'TEST_FURTHER',payloadValue:'GO'},
      {field:'overallScore',columnValue:12,payloadValue:99},
      {field:'problemScore',columnValue:null,payloadValue:20},
    ]))
    expect(selected.snapshot.coverage.notices.join(' ')).toContain('Saved column values are canonical')
  })
  it('combines owner context as complete private JSON and preserves prior hypotheses as interpretations',()=>{
    const selected = capturePlanningReport(report)
    const context = JSON.parse(planningOwnerContext(JSON.stringify({answers:[{answer:'PRIVATE founder answer',evidence:'ASSUMPTION'}]}),selected))
    expect(context.founderContext.answers[0].answer).toBe('PRIVATE founder answer')
    expect(context.selectedValidation.findings.customerSignals.summary).toBe('PRIVATE conflicting owner statements')
    expect(context.instruction).toContain('not observed facts')
    expect(context.instruction).toContain('without silently replacing current inputs')
  })
  it('keeps legacy no-focus brief fingerprints compatible and binds an explicit approved topic',()=>{
    const idea = {name:'Pilot',industry:'Software',product:'Stock log',targetCustomer:'Shop owners',location:'India',businessModel:'Subscription',coreProblem:'Slow reconciliation',proposedSolution:'A narrow pilot'}
    expect(planningIdeaSnapshot({...idea,publicResearchFocus:null}).briefFingerprint).toBe(planningIdeaSnapshot(idea).briefFingerprint)
    expect(planningIdeaSnapshot({...idea,publicResearchFocus:'Approved stock reconciliation alternatives'}).briefFingerprint).not.toBe(planningIdeaSnapshot(idea).briefFingerprint)
  })
})
