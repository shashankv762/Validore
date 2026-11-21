import { config } from 'dotenv'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import type { RunValidationStep } from '../src/lib/validation/steps'
import { acceptanceFingerprint, evaluateValidationAcceptance, recordAcceptanceAttempt } from './lib/validation-acceptance'
import { FullReportSchema } from '../src/lib/validation/schemas'
import { ACCEPTANCE_GATEWAYS, AcceptanceOptionsError, acceptanceArtifacts, acceptanceRuntimeConfiguration, acceptanceRuntimeFingerprint,
  assertSafeModelConfiguration, configureAcceptanceEnvironment, parseAcceptanceOptions, validationResumeFingerprint } from './lib/acceptance-cli'

// Explicit live acceptance using a synthetic idea. Does not sign in, write
// reports to the database, or reserve/deduct customer workspace credits.
async function main() {
  const args = process.argv.slice(2)
  if (!args.includes('--live') || args.includes('--help')) {
    console.log('Usage: npm run verify:validation -- --live --mode=lite|full [--provider=ID] [--free-only] [--max-tokens-per-call=4000] [--resume]\nProviders: ' + Object.keys(ACCEPTANCE_GATEWAYS).join(', ') + '\nUses configured workspace policy; --free-only narrows it.')
    return
  }
  const cli = parseAcceptanceOptions(args, 'validation')
  config({ path: '.env.local', quiet: true })
  assertSafeModelConfiguration(process.env, cli)
  configureAcceptanceEnvironment(process.env, cli, 'validation')
  const { mode, provider } = cli
  const started = Date.now()
  const idea = {
    name: 'Validore launch acceptance sample', industry: 'Startup research software',
    product: 'A research workspace that helps early-stage founders examine startup ideas and export structured reports.',
    targetCustomer: 'First-time founders and university incubators testing software startup ideas.',
    location: 'India', businessModel: 'Free preliminary reports with paid monthly credits for deeper research and planning tools.',
    coreProblem: 'Early-stage founders struggle to separate untested assumptions from market evidence before building a product.',
    proposedSolution: 'AI research specialists use public sources and deterministic calculations to produce an evidence-aware report and a practical customer research plan.',
  }
  await mkdir('reports', { recursive: true })
  const checkpointFile = 'reports/validation-checkpoint-' + mode + '-' + (provider ?? 'configured') + '.json'
  const configuration = acceptanceRuntimeConfiguration(process.env)
  const configurationFingerprint = acceptanceRuntimeFingerprint(process.env)
  const codeFingerprint = await acceptanceFingerprint(process.cwd())
  const identity = validationResumeFingerprint(cli, idea, codeFingerprint, process.env)
  const artifacts = acceptanceArtifacts('validation', provider ?? 'configured', mode, new Date(started))
  const summary = await recordAcceptanceAttempt({ path: artifacts.path, mirrorPaths: [artifacts.legacyPath, artifacts.archivePath],
    metadata: { mode, providerSelection: provider ?? 'configured', codeFingerprint, configuration, configurationFingerprint, resumeFingerprint: identity,
      maxTokensPerCall: cli.maxTokensPerCall ?? null, startedAt: new Date(started).toISOString(),
      resumed: cli.resume, verification: 'Live provider work on a synthetic idea; no customer database, credits or saved reports are changed. Checks cover completion, source provenance and deterministic consistency, not independent claim accuracy.' },
    run: async () => {
  let checkpoint: { identity: string; researchBudgetId: string; steps: Record<string, unknown> } = {
    identity, researchBudgetId: 'acceptance-' + mode + '-' + started, steps: {},
  }
  if (cli.resume) {
    checkpoint = JSON.parse(await readFile(checkpointFile, 'utf8'))
    if (checkpoint.identity !== identity || !checkpoint.steps || typeof checkpoint.researchBudgetId !== 'string') throw new Error('Checkpoint does not match this acceptance scenario')
  }
  let writes = Promise.resolve()
  const resumedSteps: string[] = []
  const runStep: RunValidationStep = async <T>(id: string, work: () => Promise<T>) => {
    if (Object.hasOwn(checkpoint.steps, id) && checkpoint.steps[id] != null) {
      resumedSteps.push(id)
      return checkpoint.steps[id] as T
    }
    const result = await work()
    checkpoint.steps[id] = result
    // Several specialists finish in parallel. Serialize writes to keep the
    // synthetic checkpoint valid and avoid repeating completed provider work.
    writes = writes.then(() => writeFile(checkpointFile, JSON.stringify(checkpoint)))
    await writes
    return result
  }
  const options = { preferredAiProvider: 'free_models', researchBudgetId: checkpoint.researchBudgetId, runStep, maxTokensPerCall: cli.maxTokensPerCall,
    onProgress: async (completed: number, total: number) => { console.log(JSON.stringify({ completed, total, elapsedSeconds: Math.round((Date.now() - started) / 1000) })) },
  }
  const engine = mode === 'lite' ? await import('../src/lib/validation/engine') : null
  const result = engine
    ? await engine.runLiteValidation(idea, options)
    : await (await import('../src/lib/validation/agents/orchestrator')).runMultiAgentValidation(idea, options)
  if (!result) throw new Error('No specialist completed the workflow')
  const trail = result.agentTrail
  const qualityIssues = evaluateValidationAcceptance('report' in result ? result.report : result, mode, engine?.LiteReportSchema ?? FullReportSchema)
  if (await acceptanceFingerprint(process.cwd()) !== codeFingerprint) qualityIssues.push('The pipeline source or evidence bundle changed during this run; rerun acceptance on a stable revision.')
  if (acceptanceRuntimeFingerprint(process.env) !== configurationFingerprint) qualityIssues.push('The runtime model configuration changed during this run; rerun acceptance with a stable policy.')
  const passed = qualityIssues.length === 0
  const summary = { passed, qualityIssues,
    resumedSteps, agents: trail?.agents, providers: trail?.providers, tokens: trail?.totalTokens, tools: trail?.tools?.map(event => ({ tool: event.tool, status: event.status })),
  }
  return { summary, result }
  } })
  console.log(JSON.stringify(summary))
  if (!summary.passed) process.exitCode = 1
}

main().catch(error => { console.error(error instanceof AcceptanceOptionsError ? error.message : 'Validation acceptance failed. Inspect the latest provider-specific acceptance artifact and safe diagnostics in reports.'); process.exitCode = 1 })
