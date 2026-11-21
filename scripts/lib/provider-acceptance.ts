import { z } from 'zod'
import type { GatewayCandidate, GatewayProtocol } from '../../src/lib/ai/gateways'
import type { GatewayDiagnostic, GatewayDiagnosticState } from '../../src/lib/ai/gateways'
import type { GenerateOptions, GenerateResult } from '../../src/lib/ai/generate'
import { ACCEPTANCE_GATEWAYS, isAcceptanceGateway, type AcceptanceEnvironment } from './acceptance-cli'

const ProbeSchema = z.object({ value: z.literal(703), assumption: z.literal(true), reason: z.string().min(6).max(2000) })
type ProbeData = z.infer<typeof ProbeSchema>
type GenerateProbe = (options: GenerateOptions<ProbeData>) => Promise<GenerateResult<ProbeData>>
export type ProviderAcceptanceResult = {
  provider: string; model: string; protocol: GatewayProtocol | null;
  toolCall: boolean; structuredOutput: boolean; passed: boolean; durationMs: number; tokens: number | null; error?: string;
  availability?: GatewayDiagnosticState | 'not_configured' | 'gateway_configuration_ineligible'
  catalogCheck?: Pick<GatewayDiagnostic, 'state'> & Partial<Pick<GatewayDiagnostic, 'httpStatus' | 'retryAt'>>
  httpStatus?: number; retryAt?: string
}

/** One explicitly configured model, one research round, at most two model
 * requests. Model output and raw errors are never returned to the artifact. */
export async function probeConfiguredModel(candidate: GatewayCandidate, env: AcceptanceEnvironment, timeoutMs: number, generate?: GenerateProbe): Promise<ProviderAcceptanceResult> {
  if (!isAcceptanceGateway(candidate.id)) throw new Error('Unregistered probe provider')
  const prefix = ACCEPTANCE_GATEWAYS[candidate.id]
  const controls = ['AI_GATEWAY_ENABLED', 'AI_GATEWAY_ORDER', prefix + '_MODELS']
  const original = Object.fromEntries(controls.map(name => [name, env[name]]))
  const started = Date.now()
  const metadata: ProviderAcceptanceResult = { provider: candidate.id, model: candidate.modelId, protocol: candidate.protocol ?? 'openai',
    toolCall: false, structuredOutput: false, passed: false, durationMs: 0, tokens: null }
  env.AI_GATEWAY_ENABLED = candidate.id
  env.AI_GATEWAY_ORDER = candidate.id
  env[prefix + '_MODELS'] = candidate.modelId
  try {
    const run = generate ?? (await import('../../src/lib/ai/generate')).generateWithFallback
    const result = await run({
      prompt: 'Protocol acceptance on a synthetic scenario. Return the result of the completed calculator observation as {"value":703,"assumption":true,"reason":"a short explanation that the inputs are hypothetical"}. No sources, customer observations or factual market claims are needed.',
      researchPrompt: 'Protocol acceptance only. Use exactly one calculate tool call with operation multiply and values [37,19]. Do not search the web, retrieve market data or use another tool. These are hypothetical monthly price and customer-count inputs, not real revenue.',
      schema: ProbeSchema, agentRole: 'finance', preferredAiProvider: 'free_models',
      maxResearchRounds: 1, maxModelCalls: 2, maxOutputTokens: 1200, maxTokensPerCall: 1800, timeoutMs,
      researchBudgetId: 'provider-probe-' + candidate.id + '-' + started,
    })
    metadata.toolCall = result.toolCalls?.length === 1 && result.toolCalls[0].tool === 'calculate' &&
      result.toolCalls[0].status === 'complete' && result.toolCalls[0].summary === 'multiply 37, 19'
    metadata.structuredOutput = ProbeSchema.safeParse(result.data).success
    metadata.tokens = result.tokensUsed
    metadata.passed = metadata.toolCall && metadata.structuredOutput && result.provider === candidate.id + '/' + candidate.modelId
    if (!metadata.passed) metadata.error = 'The selected model did not satisfy the exact calculator/JSON contract.'
  } catch {
    metadata.error = 'The selected model did not complete within the protocol probe budget. Inspect safe provider diagnostics.'
  } finally {
    metadata.durationMs = Date.now() - started
    for (const name of controls) { if (original[name] === undefined) delete env[name]; else env[name] = original[name] }
  }
  return metadata
}
