import { describe, expect, it, vi } from 'vitest'
import { ACCEPTANCE_GATEWAYS, AcceptanceOptionsError, acceptanceArtifacts, acceptanceRuntimeConfiguration, acceptanceRuntimeFingerprint,
  assertSafeModelConfiguration, configureAcceptanceEnvironment, configuredAcceptanceModels, parseAcceptanceOptions, validationResumeFingerprint } from '../scripts/lib/acceptance-cli'
import { createGatewayRouter } from '@/lib/ai/gateways'

describe('acceptance CLI selection and policy', () => {
  it('matches every production gateway without making external requests', async () => {
    const env: Record<string, string> = { OLLAMA_ENABLED: 'true' }
    for (const [provider, prefix] of Object.entries(ACCEPTANCE_GATEWAYS)) {
      env[prefix + '_API_KEY'] = 'synthetic-' + provider
      env[prefix + '_MODELS'] = 'configured-model'
    }
    for (const prefix of ['APINEX', 'ORCA', 'AGENTROUTER']) env[prefix + '_BASE_URL'] = 'https://synthetic.example/v1'
    const fetcher = vi.fn(async () => new Response('{}', { status: 404 }))
    const candidates = await createGatewayRouter({ environment: () => env, fetcher }).candidates()
    expect([...new Set(candidates.map(candidate => candidate.id))].toSorted()).toEqual(Object.keys(ACCEPTANCE_GATEWAYS).toSorted())
  })
  it('accepts new gateway selections and realistic Free/Premium token ceilings', () => {
    expect(parseAcceptanceOptions(['--live', '--provider=freegg', '--mode=lite', '--max-tokens-per-call=4000'], 'validation')).toMatchObject({ provider: 'freegg', mode: 'lite', maxTokensPerCall: 4000, freeOnly: false })
    expect(parseAcceptanceOptions(['--live', '--provider=utim', '--mode=full', '--max-tokens-per-call=8000', '--resume'], 'validation')).toMatchObject({ provider: 'utim', mode: 'full', maxTokensPerCall: 8000, resume: true })
  })
  it.each([
    ['--provider=unknown'], ['--provider=freegg', '--provider=utim'], ['--free-only=false'], ['--mode=other'],
    ['--max-tokens-per-call=255'], ['--max-tokens-per-call=128001'],
  ].map(args => ({ args })))('rejects invalid validation options without echoing raw arguments: $args', ({ args }) => {
    expect(() => parseAcceptanceOptions(['--live', ...args], 'validation')).toThrow(AcceptanceOptionsError)
  })
  it('bounds provider probes and excludes Luna even when it is explicitly requested', () => {
    expect(parseAcceptanceOptions(['--live', '--provider=qronos', '--models=configured-alias', '--max-models=1', '--timeout-ms=120000'], 'providers')).toMatchObject({ maxModels: 1, timeoutMs: 120000, models: ['configured-alias'] })
    for (const option of ['--max-models=13', '--timeout-ms=240001', '--models=gpt-6-luna']) expect(() => parseAcceptanceOptions(['--live', option], 'providers')).toThrow(AcceptanceOptionsError)
  })
  it('respects runtime funding by default and only narrows it with --free-only', () => {
    const funded = { AI_FREE_ONLY: 'false', AI_WORKSPACE_MODEL_POLICY: 'operator_funded', AI_GATEWAY_ENABLED: 'pixrouter', DATABASE_URL: 'private-db', TEST_DATABASE_URL: 'private-test-db' }
    const normal = { ...funded }
    configureAcceptanceEnvironment(normal, parseAcceptanceOptions(['--live', '--provider=freegg'], 'validation'), 'validation')
    expect(normal.AI_FREE_ONLY).toBe('false'); expect(normal.AI_WORKSPACE_MODEL_POLICY).toBe('operator_funded'); expect(normal.AI_GATEWAY_ENABLED).toBe('freegg')
    expect(normal).not.toHaveProperty('DATABASE_URL'); expect(normal).not.toHaveProperty('TEST_DATABASE_URL')
    configureAcceptanceEnvironment(normal, parseAcceptanceOptions(['--live', '--free-only'], 'validation'), 'validation')
    expect(normal.AI_FREE_ONLY).toBe('true')
  })
  it('selects configured models before catalog availability and never promotes unknown-priced aliases into the free set', () => {
    const options = parseAcceptanceOptions(['--live', '--provider=freegg'], 'providers')
    const env = { FREEGG_API_KEY: 'synthetic-key', FREEGG_MODELS: 'gpt-6.1-sol,gpt-6-luna', AI_FREE_ONLY: 'true', AI_WORKSPACE_MODEL_POLICY: 'operator_funded' }
    expect(configuredAcceptanceModels(env, options)).toEqual([])
    expect(configuredAcceptanceModels({ ...env, AI_FREE_ONLY: 'false' }, options)).toEqual([{ provider: 'freegg', model: 'gpt-6.1-sol' }])
    expect(configuredAcceptanceModels({ ...env, AI_FREE_ONLY: 'false' }, { ...options, models: ['not-configured'] })).toEqual([])
  })
  it('keeps new model/protocol/auth policy in fingerprints while excluding credentials', () => {
    const env = { AI_FREE_ONLY: 'false', AI_WORKSPACE_MODEL_POLICY: 'operator_funded', FREEGG_API_KEY: 'private-key-7349', FREEGG_MODELS: 'gpt-6.1-sol',
      FREEGG_BASE_URL: 'https://user:password@freegg.app/v1?key=private-key-7349', FREEGG_PROTOCOL: 'responses', QRONOS_ANTHROPIC_AUTH_MODE: 'api_key' }
    const snapshot = acceptanceRuntimeConfiguration(env)
    expect(snapshot).toMatchObject({ FREEGG_MODELS: 'gpt-6.1-sol', FREEGG_BASE_URL: 'https://freegg.app/v1', FREEGG_PROTOCOL: 'responses', QRONOS_ANTHROPIC_AUTH_MODE: 'api_key' })
    expect(JSON.stringify(snapshot)).not.toContain('private-key-7349'); expect(JSON.stringify(snapshot)).not.toContain('password')
    const fingerprint = acceptanceRuntimeFingerprint(env)
    expect(acceptanceRuntimeFingerprint({ ...env, FREEGG_API_KEY: 'rotated-private-key-4820' })).toBe(fingerprint)
    for (const change of [{ FREEGG_MODELS: 'another-model' }, { FREEGG_PROTOCOL: 'openai' }, { QRONOS_ANTHROPIC_AUTH_MODE: 'bearer' }, { AI_WORKSPACE_MODEL_POLICY: 'free_only' }]) expect(acceptanceRuntimeFingerprint({ ...env, ...change })).not.toBe(fingerprint)
  })
  it('binds resume identity to the actual token ceiling and never stores a raw credential', () => {
    const env = { FREEGG_API_KEY: 'private-key-8271', FREEGG_MODELS: 'gpt-6.1-sol' }
    const options = parseAcceptanceOptions(['--live', '--mode=lite', '--provider=freegg', '--max-tokens-per-call=4000'], 'validation')
    const first = validationResumeFingerprint(options, { name: 'Synthetic idea' }, 'code-fingerprint', env)
    expect(first).toMatch(/^[0-9a-f]{64}$/)
    expect(validationResumeFingerprint({ ...options, maxTokensPerCall: 8000 }, { name: 'Synthetic idea' }, 'code-fingerprint', env)).not.toBe(first)
    expect(validationResumeFingerprint(options, { name: 'Synthetic idea' }, 'code-fingerprint', { ...env, FREEGG_API_KEY: 'rotated-private-key' })).toBe(first)
  })
  it('rejects credential material placed in a model field before it can reach diagnostics', () => {
    const options = parseAcceptanceOptions(['--live'], 'providers')
    expect(() => assertSafeModelConfiguration({ FREEGG_API_KEY: 'private-key-7392', FREEGG_MODELS: 'private-key-7392' }, options)).toThrow(AcceptanceOptionsError)
  })
  it('gives each provider an independent latest artifact and each run a distinct archive', () => {
    const now = new Date('2026-11-15T11:00:00Z')
    const first = acceptanceArtifacts('validation', 'utim', 'lite', now, '00000000-0000-0000-0000-000000000001')
    const second = acceptanceArtifacts('validation', 'freegg', 'lite', now, '00000000-0000-0000-0000-000000000002')
    const repeat = acceptanceArtifacts('validation', 'utim', 'lite', now, '00000000-0000-0000-0000-000000000003')
    expect(first.path).not.toBe(second.path); expect(first.legacyPath).toBe(second.legacyPath)
    expect(first.path).toBe(repeat.path); expect(first.archivePath).not.toBe(repeat.archivePath)
    expect(first.path).toBe('reports/validation-acceptance-lite-utim.json')
  })
})
