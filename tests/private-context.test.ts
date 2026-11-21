import { describe,expect,it } from 'vitest'
import { compactPrivateContext,excerptContextText } from '@/lib/ai/private-context'

describe('private interview and feedback prompt compaction',()=>{
 it('keeps small JSON and legacy private text verbatim',()=>{for(const value of ['{"answers":[{"questionId":"q1","answer":"Private answer","evidence":"assumption"}]}','Private founder note'])expect(compactPrivateContext(value)).toBe(value)})
 it('retains all twelve answer identities, evidence labels, dates and explicit feedback selection counts in huge combined JSON',()=>{
  const evidence=['assumption','first_hand','documented','unknown']
  const fullUrl='https://reviews.example.org/record/'+('complete-path/'.repeat(80))
  const answers=Array.from({length:12},(_,index)=>({questionId:'question-'+index,dimension:'problem',question:'What happened last time? '.repeat(25),answer:('Quoted "private" answer \\ and Hindi अनुभव. '.repeat(100))+fullUrl,evidence:evidence[index%4],unknown:false,answeredAt:'2026-11-14T12:00:00.000Z'}))
  const records=Array.from({length:40},(_,index)=>({id:'record-'+index,kind:'review',content:('A long selected customer observation, not a population claim. '.repeat(60)),sourceUrl:fullUrl,occurredAt:'2026-11-01',provenance:'owner_recorded'}))
  const original=JSON.stringify({founderInterview:{answers,assessment:{contradictions:[{description:'Budget claims conflict and must be checked.',answerIds:['question-0','question-11']}]}},customerEvidence:{totalRecords:200,suppliedRecords:40,records,analysis:{opposingSignals:['Positive usability feedback coexists with price complaints.']}}})
  const compact=compactPrivateContext(original)!
  expect(compact.length).toBeLessThanOrEqual(24000)
  const parsed=JSON.parse(compact)
  expect(parsed.founderInterview.answers).toHaveLength(12)
  expect(parsed.founderInterview.answers.map((answer:{questionId:string})=>answer.questionId)).toEqual(answers.map(answer=>answer.questionId))
  expect(parsed.founderInterview.answers.map((answer:{evidence:string})=>answer.evidence)).toEqual(answers.map(answer=>answer.evidence))
  expect(parsed.founderInterview.answers.every((answer:{answeredAt:string})=>answer.answeredAt==='2026-11-14T12:00:00.000Z')).toBe(true)
  expect(parsed.founderInterview.assessment.contradictions[0].answerIds).toEqual(['question-0','question-11'])
  const selected=parsed.customerEvidence.records.length
  const counts=parsed.privateContextCompaction.recordSets[0]
  expect(counts).toMatchObject({inputRecords:40,totalRecords:200,selectedRecords:selected,omittedInputRecords:40-selected,notSuppliedRecords:160})
  expect(parsed.customerEvidence.suppliedRecords).toBe(selected)
  for(const record of parsed.customerEvidence.records){expect(record.sourceUrl===fullUrl||record.sourceUrl===null).toBe(true);expect(record.occurredAt).toBe('2026-11-01')}
 })
 it('never emits the prefix of a cut-off URL as a link',()=>{const link='https://example.org/'+('path/'.repeat(100));const original='Start '+link+' conclusion';const compact=excerptContextText(original,25);expect(compact).not.toContain('https://');expect(compact).toContain('[Excerpt')})
 it('turns oversized unstructured text into complete JSON rather than cutting serialized escapes',()=>{const output=compactPrivateContext(('Private "quoted" \\ notes '.repeat(2500)))!;expect(output.length).toBeLessThanOrEqual(24000);expect(JSON.parse(output)).toMatchObject({kind:'private_text_excerpt',excerpted:true})})
})
