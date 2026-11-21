import { describe,expect,it } from 'vitest'
import { buildAgentHandoff,serializeHandoffs,buildScoreSummary } from '@/lib/validation/agents/handoffs'
import { PIPELINE_REPLIES } from './fixtures/agent-payloads'
import { FULL_AGENT_ROLES } from '@/lib/ai/roles'
const source={url:'https://example.org/original',title:'Original source',source:'example.org',content:'Original supplied source',fetchedAt:'2026-11-14T00:00:00Z',publishedAt:'2025-06-01',dataPeriod:'2025',retrievalKind:'page' as const}
const parse=(text:string)=>JSON.parse(text.slice(text.indexOf('{')))
describe('shared structured handoff source register',()=>{
 it('shows the same rounded upstream score in the handoff and explicit summary without mutating original data',()=>{
  const data={...(PIPELINE_REPLIES.finance as object),financialScore:1.5}
  const handoff=buildAgentHandoff('finance',{data,provider:'fixture',tokensUsed:0,sources:[]})
  expect(handoff.findings.financialScore).toBe(2);expect(buildScoreSummary([handoff]).scores.financialScore.score).toBe(2);expect(data.financialScore).toBe(1.5)
 })
 it('deduplicates repeated observation metadata while retaining every role, owned field, question and contrary finding',()=>{
  const customer={...(PIPELINE_REPLIES.customer as object),customerSignals:{summary:'Mixed observations',observations:[],opposingSignals:['Usability is praised while price is criticized.'],unresolvedQuestions:['Which buyer can commit budget?']}}
  const handoffs=FULL_AGENT_ROLES.filter(role=>role!=='synthesis').map(role=>buildAgentHandoff(role,{data:role==='customer'?customer:PIPELINE_REPLIES[role],provider:'fixture',tokensUsed:1,sources:[source]}))
  const text=serializeHandoffs(handoffs);const result=parse(text)
  expect(text.length).toBeLessThanOrEqual(24000);expect(result.sourceRegister).toHaveLength(1);expect(result.sourceRegister[0]).toMatchObject({url:source.url,fetchedAt:source.fetchedAt,publishedAt:source.publishedAt,dataPeriod:'2025'})
  expect(result.handoffs).toHaveLength(8)
  for(const handoff of result.handoffs){expect(handoff.sourceRefs).toEqual(['S1']);expect(handoff.sources).toBeUndefined();for(const field of Object.keys(handoffs.find(item=>item.role===handoff.role)!.findings))expect(handoff.findings).toHaveProperty(field)}
  const customerHandoff=result.handoffs.find((handoff:{role:string})=>handoff.role==='customer');expect(customerHandoff.findings.interviewQuestions).toHaveLength(10);expect(customerHandoff.findings.wtpSurveyQuestions).toHaveLength(1);expect(JSON.stringify(customerHandoff.findings.customerSignals)).toContain('price is criticized')
 })
 it('preserves distinct source vintages as observations instead of collapsing them by URL alone',()=>{const result=parse(serializeHandoffs([buildAgentHandoff('market',{data:PIPELINE_REPLIES.market,provider:'fixture',tokensUsed:0,sources:[source]}),buildAgentHandoff('evidence',{data:PIPELINE_REPLIES.evidence,provider:'fixture',tokensUsed:0,sources:[{...source,dataPeriod:'2024',publishedAt:'2024-06-01'}]})]));expect(result.sourceRegister).toHaveLength(2);expect(result.handoffs[0].sourceRefs).not.toEqual(result.handoffs[1].sourceRefs)})
 it('supplies an entire long URL or omits it explicitly, never a shortened URL',()=>{const longUrl='https://example.org/'+('path'.repeat(10000));const text=serializeHandoffs([buildAgentHandoff('market',{data:PIPELINE_REPLIES.market,provider:'fixture',tokensUsed:0,sources:[{...source,url:longUrl}]})]);expect(text.length).toBeLessThanOrEqual(24000);const parsed=parse(text);expect(parsed.omittedSources).toBeGreaterThan(0);expect(text).not.toContain(longUrl.slice(0,2000))})
})
