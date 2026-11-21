import { createHash } from 'node:crypto'
import { z } from 'zod'
import { FinanceAgentSchema,RiskAgentSchema,EvidenceReviewSchema,ProductAgentSchema,GrowthAgentSchema,SynthesisAgentSchema,SynthesisReviewSchema,type IdeaInput } from '../schemas'
import { retrieveAgentReference } from '../knowledge/playbooks'
import type { AgentOpts } from './shared'
import { effectiveAiPreference,freeModelsOnly,ROLE_MODELS,workspaceModelPolicy } from '@/lib/ai/model-policy'
import { publicResearchBrief } from '@/lib/ai/research-brief'
import { validationModelPolicy, VALIDATION_METHOD_VERSION } from '../provenance'
export type DerivedRole='finance'|'risk'|'evidence'|'product'|'growth'|'synthesis'
const schemas={finance:FinanceAgentSchema,risk:RiskAgentSchema,evidence:EvidenceReviewSchema,product:ProductAgentSchema,growth:GrowthAgentSchema,synthesis:SynthesisAgentSchema}
const canonical=(value:unknown):unknown=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'
  ?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,canonical(item)])):value

/** Every stage binds its exact inputs, including legacy briefs without a public
 * topic. An old unversioned result cannot masquerade as the current contract. */
export function researchContextStepId(base: string, idea: IdeaInput, dependencies?: unknown): string {
  return base + '-' + createHash('sha256').update(JSON.stringify(canonical({ version: VALIDATION_METHOD_VERSION, idea, publicBrief: publicResearchBrief(idea), dependencies }))).digest('hex')
}

/** A durable result belongs to its actual parent/evidence/private/method inputs.
 * The step identity contains only role + hash. Legacy flat entries cannot match. */
export function derivedStepId(role:DerivedRole,idea:IdeaInput,digest:string,options:AgentOpts,definition:string):string{
 const input={version:2,role,idea,digest,sources:options.sources??[],privateContext:options.privateContext??'',asOfDate:options.asOfDate,
  researchMode:options.reuseResearch?'reuse':'auto',maxTokensPerCall:options.maxTokensPerCall,reviewCompletedPlans:options.reviewCompletedPlans??false,
  synthesisHandoffAudit:options.synthesisHandoffAudit,scoreSummary:options.scoreSummary,
  financeAssumptions:options.financeAssumptions,planningBasis:options.planningBasis,
  providerPreference:effectiveAiPreference(options.preferredAiProvider),freeOnly:freeModelsOnly(),workspaceModelPolicy:workspaceModelPolicy(),
  modelPolicy:validationModelPolicy(options.preferredAiProvider),
  customKeyFingerprint:options.customOpenRouterKey?createHash('sha256').update(options.customOpenRouterKey).digest('hex'):null,
  roleModels:process.env['AI_AGENT_'+role.toUpperCase()+'_MODELS']??ROLE_MODELS[role],
  method:{contract:VALIDATION_METHOD_VERSION,definition,schema:z.toJSONSchema(role==='synthesis'&&options.reviewCompletedPlans?SynthesisReviewSchema:schemas[role]),reference:retrieveAgentReference(role,digest)},
 }
 return 'agent-'+role+'-'+createHash('sha256').update(JSON.stringify(canonical(input))).digest('hex')
}
