import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { parse } from 'dotenv'

// An explicit, bounded live acceptance check. No credentials or response bodies
// are logged. Use only free models approved for this application.
if (!process.argv.includes('--live')) {
  console.log('Usage: node scripts/verify-ai-providers.mjs --live [--provider=pixrouter|opencode|openrouter] [--models=model-id,...]')
  process.exit(0)
}
const local = await readFile('.env.local', 'utf8').catch(() => '')
const env = { ...parse(local), ...process.env }
const modelArg = process.argv.find(arg => arg.startsWith('--models='))?.slice(9)
const providerArg = process.argv.find(arg => arg.startsWith('--provider='))?.slice(11)
const candidates = [
  ...['thinkingmachines/inkling:free', 'qwen/qwen3.8-27b:free', 'z-ai/glm-4.5-flash:free', 'openrouter/free'].map(model => ({ provider: 'pixrouter', model, base: 'https://pixrouter.com/v1', key: env.PIXROUTER_API_KEY })),
  ...['deepseek-v4.1-flash-free', 'glm-5.3-flash-free', 'mimo-v2.6-flash-free', 'nemotron-3.5-super-vl-free', 'big-pickle'].map(model => ({ provider: 'opencode', model, base: env.OPENCODE_BASE_URL || 'https://opencode.ai/inference/openai/v1', key: env.OPENCODE_API_KEY })),
  ...['nvidia/nemotron-3.5-super-vl:free', 'nvidia/nemotron-3-ultra-550b-a55b:free', 'google/gemma-4-31b-it:free'].map(model => ({ provider: 'openrouter', model, base: 'https://openrouter.ai/api/v1', key: env.OPENROUTER_API_KEY })),
].filter(candidate => candidate.key && (!providerArg || providerArg === candidate.provider) && (!modelArg || modelArg.split(',').includes(candidate.model)))
const tool = { type: 'function', function: { name: 'calculate', description: 'Multiply two numbers using deterministic arithmetic.', parameters: { type: 'object', properties: { a: { type: 'number' }, b: { type: 'number' } }, required: ['a', 'b'], additionalProperties: false } } }
const results = []
async function verify(candidate) {
  const started = Date.now()
  const result = { provider: candidate.provider, model: candidate.model, toolCall: false, structuredOutput: false, durationMs: 0 }
  const messages = [
    { role: 'system', content: 'You are a startup analyst. Use the supplied calculator for arithmetic. Return only JSON: {"value":number,"assumption":true,"reason":string}. Never describe a forecast as actual revenue.' },
    { role: 'user', content: 'Hypothetical monthly price is 37 and projected customer count is 19. Call calculate with these inputs, then return the monthly revenue projection and a short note that these are unverified assumptions.' },
  ]
  const request = async (extra = {}) => {
    const response = await fetch(candidate.base.replace(/\/$/, '') + '/chat/completions', {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(40000),
      headers: { Authorization: 'Bearer ' + candidate.key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: candidate.model, messages, tools: [tool], tool_choice: 'auto', temperature: 0, max_tokens: 2500, ...extra }),
    })
    if (!response.ok) throw Object.assign(new Error('Provider rejected request'), { status: response.status })
    return response.json()
  }
  try {
    const first = await request()
    const message = first.choices?.[0]?.message
    const calls = message?.tool_calls || []
    if (!calls.length || calls.length > 3) throw new Error('No bounded tool call returned')
    messages.push(message)
    for (const call of calls) {
      const args = JSON.parse(call.function.arguments)
      if (call.function.name !== 'calculate' || args.a !== 37 || args.b !== 19) throw new Error('Incorrect tool call')
      messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify({ value: args.a * args.b }) })
    }
    result.toolCall = true
    const second = await request({ tool_choice: 'none' })
    const content = second.choices?.[0]?.message?.content || ''
    const clean = content.trim().replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '')
    const value = JSON.parse(clean)
    result.structuredOutput = value.value === 703 && value.assumption === true && typeof value.reason === 'string' && value.reason.length > 5
    result.tokens = (first.usage?.total_tokens || 0) + (second.usage?.total_tokens || 0)
  } catch (error) {
    result.error = error.status ? 'HTTP ' + error.status : error.name === 'TimeoutError' ? 'Timed out' : 'Tool/JSON contract failed'
  }
  result.durationMs = Date.now() - started
  results.push(result)
  console.log(JSON.stringify(result))
}
// Keep probes sequential per pair to avoid overwhelming free provider quotas.
for (let i = 0; i < candidates.length; i += 2) await Promise.all(candidates.slice(i, i + 2).map(verify))
await mkdir('reports', { recursive: true })
const suffix = ['pixrouter', 'openrouter', 'opencode'].includes(providerArg) ? '-' + providerArg : ''
await writeFile('reports/ai-provider-acceptance' + suffix + '.json', JSON.stringify({ testedAt: new Date().toISOString(), results }, null, 2))
if (!results.length || results.some(result => !result.toolCall || !result.structuredOutput)) process.exitCode = 1
