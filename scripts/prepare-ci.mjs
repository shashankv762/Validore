import { mkdir, lstat, realpath, unlink } from 'node:fs/promises'
import { resolve, join, sep } from 'node:path'
const root = await realpath(process.cwd())
for (const file of ['.env', '.env.local', '.env.production', '.env.production.local']) {
  const exists = await lstat(join(root, file)).catch(error => { if (error.code === 'ENOENT') return null; throw error })
  if (exists) throw new Error('Private environment files must not be present in the Jenkins checkout: ' + file)
}
for (const dir of ['reports', '.tmp']) {
  await mkdir(join(root, dir), { recursive: true })
  const stat = await lstat(join(root, dir))
  const canonical = await realpath(join(root, dir))
  if (stat.isSymbolicLink() || !canonical.startsWith(root + sep)) throw new Error('Generated output directory points outside the workspace')
}
for (const file of ['junit.xml', 'trivy-report.json', 'image-digest.txt', 'render-deploy.json', 'production-smoke.json']) {
  const target = join(root, 'reports', file)
  const stat = await lstat(target).catch(error => { if (error.code === 'ENOENT') return null; throw error })
  if (stat) {
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Unexpected report path: ' + target)
    await unlink(target)
  }
}
console.log('CI output directories prepared; stale generated reports removed')
