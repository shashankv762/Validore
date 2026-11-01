import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { workerScope } from './worker-scope'

/** Only call with application-owned public asset paths, never user input. */
export async function readPublicAsset(path: string): Promise<Buffer> {
  if (!path.startsWith('/') || path.includes('..') || path.includes('\\')) throw new Error('Invalid asset path')
  const scope = workerScope()
  if (!scope) return readFile(join(process.cwd(), 'public', path))
  const response = await scope.env.ASSETS.fetch(new Request('https://assets.invalid' + path))
  if (!response.ok) throw new Error('Required public asset is unavailable: ' + path)
  return Buffer.from(await response.arrayBuffer())
}
