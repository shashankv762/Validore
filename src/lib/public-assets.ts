import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { workerScope } from './worker-scope'

/** Only call with application-owned public asset paths, never user input. */
export async function readPublicAsset(path: string): Promise<Buffer> {
  if (!path.startsWith('/') || path.includes('..') || path.includes('\\')) throw new Error('Invalid asset path')
  const scope = workerScope()
  if (scope) {
    const response = await scope.env.ASSETS.fetch(new Request(new URL(path, 'https://assets.invalid')))
    if (!response.ok) throw new Error('Public asset is unavailable')
    const bytes = await response.arrayBuffer()
    if (bytes.byteLength > 15_000_000) throw new Error('Public asset is too large')
    return Buffer.from(bytes)
  }
  return readFile(join(process.cwd(), 'public', path))
}
