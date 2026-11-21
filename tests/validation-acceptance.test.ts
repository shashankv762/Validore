import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { acceptanceFingerprint, evaluateValidationAcceptance, recordAcceptanceAttempt } from '../scripts/lib/validation-acceptance'
import { FullReportSchema } from '@/lib/validation/schemas'
import { computeUnitEconomics, buildFinancialProjection } from '@/lib/financial'
import { FULL_AGENT_ROLES, LITE_AGENT_ROLES } from '@/lib/ai/roles'
import { PIPELINE_REPLIES, PIPELINE_LITE_REPLY } from './fixtures/agent-payloads'
import { buildAgentHandoff, serializeHandoffs, auditHandoffCoverage, buildScoreSummary } from '@/lib/validation/agents/handoffs'
vi.mock('@/db', () => ({ db: {} }))
import { LiteReportSchema } from '@/lib/validation/engine'

const directories: string[] = []
async function temp() { const path = await mkdtemp(join(tmpdir(), 'validore-acceptance-')); directories.push(path); return path }
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))) })
const source = { title: 'Official context observation', url: 'https://example.org/context', source: 'example.org',
  content: 'Synthetic source text for provenance tests, not market evidence.', fetchedAt: '2026-11-15T00:00:00Z', retrievalKind: 'open-data' as const }
const evidence = { claim: 'The contextual observation does not establish startup demand.', link: source.url, source: source.source,
  evidenceExcerpt: source.content, label: 'AI_ESTIMATE_UNVERIFIED' as const, strength: 'MODERATE' as const }
function full() {
  const report = FullReportSchema.parse(Object.assign({}, ...Object.values(PIPELINE_REPLIES), { keyEvidence: [evidence] }))
  const handoffs = FULL_AGENT_ROLES.filter(role => role !== 'synthesis').map(role => buildAgentHandoff(role, { data: PIPELINE_REPLIES[role], provider: 'fixture', tokensUsed: 0, sources: [source] }))
  return { ...report, overallScore: 35, researchSources: [source],
    handoffAudit: auditHandoffCoverage(handoffs, serializeHandoffs(handoffs)), scoreSummary: buildScoreSummary(handoffs),
    agentTrail: { agents: Object.fromEntries(FULL_AGENT_ROLES.map(role => [role, 'ok'])) },
    computedUnitEconomics: { label: 'ASSUMPTION', ...computeUnitEconomics(report.unitEconomicsAssumptions) },
    financialProjection: buildFinancialProjection(report.unitEconomicsAssumptions),
  }
}

describe('live validation acceptance artifacts', () => {
  it('replaces a stale pass before provider work, and records total failure without raw error text', async () => {
    const path = join(await temp(), 'latest.json')
    await writeFile(path, JSON.stringify({ summary: { passed: true }, result: { stale: true } }))
    const error = new Error('Private response body secret-7542')
    await expect(recordAcceptanceAttempt({ path, metadata: { codeFingerprint: 'current-code' }, run: async () => {
      const running = JSON.parse(await readFile(path, 'utf8'))
      expect(running).toMatchObject({ summary: { status: 'running', passed: false, codeFingerprint: 'current-code' }, result: null })
      throw error
    } })).rejects.toBe(error)
    const text = await readFile(path, 'utf8')
    expect(JSON.parse(text)).toMatchObject({ summary: { status: 'failed', passed: false }, result: null })
    expect(text).not.toContain('7542')
    expect(text).not.toContain('stale')
  })

  it('keeps inspectable failed quality results and marks only evaluated success as passing', async () => {
    const path = join(await temp(), 'latest.json')
    await recordAcceptanceAttempt({ path, metadata: { resumed: false }, run: async () => ({ result: { useful: true }, summary: { passed: false, qualityIssues: ['No read evidence'] } }) })
    expect(JSON.parse(await readFile(path, 'utf8'))).toMatchObject({ summary: { passed: false, status: 'failed', qualityIssues: ['No read evidence'] }, result: { useful: true } })
    await recordAcceptanceAttempt({ path, metadata: { resumed: true }, run: async () => ({ result: { complete: true }, summary: { passed: true } }) })
    expect(JSON.parse(await readFile(path, 'utf8'))).toMatchObject({ summary: { passed: true, status: 'passed', resumed: true }, result: { complete: true } })
  })
  it('preserves provider-specific latest results and immutable run paths beside the legacy latest file', async () => {
    const root = await temp()
    const legacy = join(root, 'latest.json')
    const firstProvider = join(root, 'utim.json')
    const firstArchive = join(root, 'runs', 'utim-first.json')
    await recordAcceptanceAttempt({ path: firstProvider, mirrorPaths: [legacy, firstArchive], metadata: { providerSelection: 'utim' },
      run: async () => ({ result: { models: ['approved-utim-model'] }, summary: { passed: true } }) })
    const first = await readFile(firstProvider, 'utf8')
    await recordAcceptanceAttempt({ path: join(root, 'freegg.json'), mirrorPaths: [legacy, join(root, 'runs', 'freegg-next.json')], metadata: { providerSelection: 'freegg' },
      run: async () => ({ result: { models: ['approved-freegg-alias'] }, summary: { passed: false } }) })
    expect(await readFile(firstProvider, 'utf8')).toBe(first)
    expect(await readFile(firstArchive, 'utf8')).toBe(first)
    expect(JSON.parse(await readFile(legacy, 'utf8')).summary.providerSelection).toBe('freegg')
  })

  it('invalidates resume identity for uncommitted source and evidence changes', async () => {
    const root = await temp()
    for (const directory of ['src/lib/ai', 'src/lib/validation', 'src/lib/customer-feedback', 'src/lib/interview', 'src/lib/planning', 'src/data/market', 'scripts/lib']) await mkdir(join(root, directory), { recursive: true })
    for (const path of ['src/lib/financial.ts', 'src/lib/scoring.ts', 'package.json', 'package-lock.json', 'scripts/verify-validation.ts', 'scripts/verify-ai-providers.ts', 'scripts/verify-ai-providers.mjs', 'src/lib/ai/generate.ts', 'src/data/market/context.json']) await writeFile(join(root, path), 'initial')
    const initial = await acceptanceFingerprint(root)
    await writeFile(join(root, 'src/lib/ai/generate.ts'), 'changed generation policy')
    const codeChange = await acceptanceFingerprint(root)
    expect(codeChange).not.toBe(initial)
    await writeFile(join(root, 'src/data/market/context.json'), 'refreshed observation')
    expect(await acceptanceFingerprint(root)).not.toBe(codeChange)
    await writeFile(join(root, 'src/lib/customer-feedback/analysis.ts'), 'changed customer analysis')
    const feedbackChange = await acceptanceFingerprint(root)
    expect(feedbackChange).not.toBe(codeChange)
    await writeFile(join(root, 'src/lib/planning/context.ts'), 'changed planning context')
    expect(await acceptanceFingerprint(root)).not.toBe(feedbackChange)
    expect(await acceptanceFingerprint(root)).toBe(await acceptanceFingerprint(root))
  })
})

describe('live report acceptance checks', () => {
  it('accepts complete Full output with cited read context, unknown sizing and exact deterministic finances', () => {
    expect(evaluateValidationAcceptance(full(), 'full', FullReportSchema)).toEqual([])
  })
  it('rejects an all-ok trail with unsupported sources, empty planning or altered arithmetic', () => {
    const report = full()
    report.researchSources = []
    report.selectedUvp = 'An unsupported choice'
    report.financialProjection[0].revenue += 1
    const issues = evaluateValidationAcceptance(report, 'full', FullReportSchema)
    expect(issues).toEqual(expect.arrayContaining([
      expect.stringContaining('successfully read'), expect.stringContaining('provenance'), expect.stringContaining('selectedUvp'), expect.stringContaining('financial projection'),
    ]))
  })
  it('rejects a partial workflow even when the delivered report is structurally useful', () => {
    const report = full(); report.agentTrail.agents.evidence = 'failed'
    expect(evaluateValidationAcceptance(report, 'full', FullReportSchema)).toContain('Every required specialist must complete successfully.')
  })
  it('requires read evidence and consistent scoring for complete Lite output', () => {
    const handoffs = (['market', 'customer'] as const).map(role => buildAgentHandoff(role, { data: PIPELINE_REPLIES[role], provider: 'fixture', tokensUsed: 0, sources: [source] }))
    const report = { ...PIPELINE_LITE_REPLY, keyEvidence: [evidence], overallScore: 35, researchSources: [source],
      handoffAudit: auditHandoffCoverage(handoffs, serializeHandoffs(handoffs)), scoreSummary: buildScoreSummary(handoffs),
      agentTrail: { agents: Object.fromEntries(LITE_AGENT_ROLES.map(role => [role, 'ok'])) } }
    expect(evaluateValidationAcceptance(report, 'lite', LiteReportSchema)).toEqual([])
    expect(evaluateValidationAcceptance({ ...report, overallScore: 90 }, 'lite', LiteReportSchema)).toContain('The overall score must equal the eight category scores.')
    expect(evaluateValidationAcceptance({ ...report, researchSources: [{ ...source, retrievalKind: 'snippet' }] }, 'lite', LiteReportSchema)).toContain('At least one reported observation must cite an exact passage from a successfully read page or official dataset.')
  })
})
