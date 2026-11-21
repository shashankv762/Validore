import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

// Keep the documented node/npm command while running the production SDK path.
// Structured process arguments never interpolate keys into a shell command.
const script = fileURLToPath(new URL('./verify-ai-providers.ts', import.meta.url))
const child = spawn(process.execPath, ['--import', 'tsx', script, ...process.argv.slice(2)], {
  stdio: 'inherit', windowsHide: true,
})
child.on('error', () => { console.error('The provider acceptance runner could not start. Install the project dependencies first.'); process.exitCode = 1 })
child.on('exit', code => { process.exitCode = code ?? 1 })
