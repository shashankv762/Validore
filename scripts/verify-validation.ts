import { config } from 'dotenv'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { FULL_AGENT_COUNT, LITE_AGENT_COUNT } from '../src/lib/ai/roles'
import type { RunValidationStep } from '../src/lib/validation/steps'

// Explicit live acceptance using a synthetic idea. Does not sign in, write
// reports to the database, or reserve/deduct customer workspace credits.
async function main() {
  if (!process.argv.includes('--live')) {
    console.log('Usage: npm run verify:validation -- --live --mode=lite|full [--provider=pixrouter|opencode|openrouter] [--resume]')
    return
  }
  config({ path: '.env.local', quiet: true })
  process.env.AI_FREE_ONLY = 'true'
  const mode = process.argv.find(value => value.startsWith('--mode='))?.slice(7) ?? 'lite'
  const provider = process.argv.find(value => value.startsWith('--provider='))?.slice(11)
  if (!['lite', 'full'].includes(mode) || (provider && !['pixrouter', 'opencode', 'openrouter'].includes(provider))) throw new Error('Invalid acceptance options')
  if (provider) process.env.AI_GATEWAY_ENABLED = provider
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
  const identity = JSON.stringify({ version: 1, mode, provider: provider ?? 'configured', idea })
  let checkpoint: { identity: string; researchBudgetId: string; steps: Record<string, unknown> } = {
    identity, researchBudgetId: 'acceptance-' + mode + '-' + started, steps: {},
  }
  if (process.argv.includes('--resume')) {
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
  const options = { preferredAiProvider: 'free_models', researchBudgetId: checkpoint.researchBudgetId, runStep,
    onProgress: async (completed: number, total: number) => { console.log(JSON.stringify({ completed, total, elapsedSeconds: Math.round((Date.now() - started) / 1000) })) },
  }
  const result = mode === 'lite'
    ? await (await import('../src/lib/validation/engine')).runLiteValidation(idea, options)
    : await (await import('../src/lib/validation/agents/orchestrator')).runMultiAgentValidation(idea, options)
  if (!result) throw new Error('No specialist completed the workflow')
  const trail = result.agentTrail
  const passed = Boolean(trail && Object.keys(trail.agents).length === (mode === 'lite' ? LITE_AGENT_COUNT : FULL_AGENT_COUNT) && Object.values(trail.agents).every(value => value === 'ok'))
  const summary = { checkedAt: new Date().toISOString(), mode, passed, elapsedSeconds: Math.round((Date.now() - started) / 1000),
    resumedSteps, agents: trail?.agents, providers: trail?.providers, tokens: trail?.totalTokens, tools: trail?.tools?.map(event => ({ tool: event.tool, status: event.status })),
  }
  await mkdir('reports', { recursive: true })
  await writeFile('reports/validation-acceptance-' + mode + '.json', JSON.stringify({ summary, result }, null, 2))
  console.log(JSON.stringify(summary))
  if (!passed) process.exitCode = 1
}

main().catch(error => { console.error(error instanceof Error ? error.message : 'Validation acceptance failed'); process.exitCode = 1 })
