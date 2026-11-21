import { describe, expect, it, vi } from 'vitest'
import { probeConfiguredModel } from '../scripts/lib/provider-acceptance'
import type { GatewayCandidate } from '@/lib/ai/gateways'

const candidate: GatewayCandidate = { id: 'freegg', baseURL: 'https://freegg.app/v1', apiKey: 'private-test-key-7452', modelId: 'gpt-6.1-sol', protocol: 'responses', fingerprint: 'opaque-test-account' }
const valid = { data: { value: 703 as const, assumption: true as const, reason: 'The inputs are a hypothetical scenario.' }, provider: 'freegg/gpt-6.1-sol', tokensUsed: 70,
  toolCalls: [{ agent: 'finance' as const, tool: 'calculate', summary: 'multiply 37, 19', status: 'complete' as const, startedAt: '2026-11-15T00:00:00Z', durationMs: 1 }] }

describe('bounded production-generation protocol probe', () => {
  it('pins one model, passes bounded production options and restores the prior process selection', async () => {
    const env = { AI_GATEWAY_ENABLED: 'utim,freegg', AI_GATEWAY_ORDER: 'utim,freegg', FREEGG_MODELS: 'gpt-6.1-sol,another-configured-model' }
    const original = { ...env }
    const generate = vi.fn(async (options: unknown) => {
      expect(env).toEqual({ AI_GATEWAY_ENABLED: 'freegg', AI_GATEWAY_ORDER: 'freegg', FREEGG_MODELS: 'gpt-6.1-sol' })
      expect(options).toMatchObject({ agentRole: 'finance', preferredAiProvider: 'free_models', maxModelCalls: 2, maxResearchRounds: 1, maxOutputTokens: 1200, maxTokensPerCall: 1800, timeoutMs: 120000 })
      return valid
    })
    const result = await probeConfiguredModel(candidate, env, 120000, generate)
    expect(result).toMatchObject({ provider: 'freegg', model: 'gpt-6.1-sol', protocol: 'responses', passed: true, tokens: 70 })
    expect(env).toEqual(original)
    expect(JSON.stringify(result)).not.toContain(candidate.apiKey)
    expect(result).not.toHaveProperty('data')
  })
  it('rejects answer-only or wrong-calculator responses even when the JSON is valid', async () => {
    for (const toolCalls of [[], [{ ...valid.toolCalls[0], summary: 'add 1, 2' }]]) {
      const result = await probeConfiguredModel(candidate, {}, 120000, async () => ({ ...valid, toolCalls }))
      expect(result.passed).toBe(false); expect(result.structuredOutput).toBe(true); expect(result.toolCall).toBe(false)
    }
  })
  it('does not attribute another model fallback as a pass for the selected alias', async () => {
    const result = await probeConfiguredModel(candidate, {}, 120000, async () => ({ ...valid, provider: 'utim/different-model' }))
    expect(result.passed).toBe(false)
  })
  it('restores controls on failure and never emits provider output or secret-bearing errors', async () => {
    const env: Record<string, string | undefined> = {}
    const result = await probeConfiguredModel(candidate, env, 120000, async () => { throw new Error('Provider body includes private-test-key-7452') })
    expect(result.passed).toBe(false); expect(result.tokens).toBeNull(); expect(env).toEqual({})
    expect(JSON.stringify(result)).not.toContain('private-test-key-7452')
  })
  it('carries only a safe catalog availability classification beside a successful protocol probe', async () => {
    const env: Record<string, string | undefined> = {}
    const result = await probeConfiguredModel(candidate, env, 120000, async () => valid)
    expect(result.passed).toBe(true)
    expect(result).not.toHaveProperty('catalogCheck')
    expect(JSON.stringify(result)).not.toContain(candidate.apiKey)
  })
})
