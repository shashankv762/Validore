import { createHash } from 'node:crypto'
import { z } from 'zod'
import type { GenerateOptions } from '@/lib/ai/generate'
import { effectiveAiPreference,freeModelsOnly,ROLE_MODELS,workspaceModelPolicy } from '@/lib/ai/model-policy'
import { retrieveAgentReference } from './knowledge/playbooks'
import type { IdeaInput } from './schemas'
import { validationModelPolicy, VALIDATION_METHOD_VERSION } from './provenance'
const canonical=(value:unknown):unknown=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'
  ?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,canonical(item)])):value

/** The final Lite report belongs to the exact immutable generation snapshot.
 * Legacy flat lite-report entries lack that provenance and cannot be reused. */
export function liteReportStepId<T>(idea:IdeaInput,options:GenerateOptions<T>,definition:string,originalPrivateContext?:string):string{
 const input={version:1,idea,prompt:options.prompt,researchPrompt:options.researchPrompt,sources:options.sources??[],
  privateContext:options.privateContext??'',privateInputFingerprint:createHash('sha256').update(originalPrivateContext??'').digest('hex'),
  maxTokensPerCall:options.maxTokensPerCall,maxOutputTokens:options.maxOutputTokens,temperature:options.temperature,researchMode:options.researchMode,
  providerPreference:effectiveAiPreference(options.preferredAiProvider),freeOnly:freeModelsOnly(),workspaceModelPolicy:workspaceModelPolicy(),
  modelPolicy:validationModelPolicy(options.preferredAiProvider),
  customKeyFingerprint:options.customOpenRouterKey?createHash('sha256').update(options.customOpenRouterKey).digest('hex'):null,
  roleModels:process.env.AI_AGENT_SYNTHESIS_MODELS??ROLE_MODELS.synthesis,
  method:{contract:VALIDATION_METHOD_VERSION,definition,schema:z.toJSONSchema(options.schema),reference:retrieveAgentReference('synthesis',options.prompt)},
 }
 return 'lite-report-'+createHash('sha256').update(JSON.stringify(canonical(input))).digest('hex')
}
