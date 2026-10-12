import { cp, lstat, realpath } from 'node:fs/promises'
import { resolve, join, sep } from 'node:path'
const root = await realpath(process.cwd())
const assertDirectory = async path => {
  const stat = await lstat(path)
  const canonical = await realpath(path)
  if (!stat.isDirectory() || stat.isSymbolicLink() || !canonical.startsWith(root + sep)) throw new Error('Expected a directory inside the project: ' + path)
}
const standalone = resolve(root, '.next', 'standalone')
await assertDirectory(resolve(root, '.next'))
await assertDirectory(standalone)
await assertDirectory(join(standalone, '.next'))
for (const [source, destination] of [
  [resolve(root, 'public'), join(standalone, 'public')],
  [resolve(root, '.next', 'static'), join(standalone, '.next', 'static')],
]) {
  await assertDirectory(source)
  try { await assertDirectory(destination) } catch (error) { if (error.code !== 'ENOENT') throw error }
  await cp(source, destination, { recursive: true, force: true, dereference: false })
}
console.log('Standalone public and static assets prepared')
