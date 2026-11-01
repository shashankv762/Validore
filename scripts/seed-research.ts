import { config } from 'dotenv'
import seeds from '../src/data/market/seed-sources.json'

config({ path: '.env.local', quiet: true })

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL for the reviewed target database before seeding research.')
  if (process.env.RESEARCH_STORE_ENABLED === 'false') throw new Error('Research storage is disabled; no records were written.')
  const { preparePublicSource, rememberPublicSources } = await import('../src/lib/ai/research-store')
  const valid = seeds.map(source => preparePublicSource(source)).filter(source => source !== null)
  if (valid.length !== seeds.length) throw new Error('The bundled data contains expired or invalid records. Run npm run data:refresh and review it before seeding.')
  let saved = 0
  for (let index = 0; index < valid.length; index += 12) saved += await rememberPublicSources(valid.slice(index, index + 12))
  console.log(JSON.stringify({ expected: valid.length, stored: saved, customerDataModified: false }))
  if (saved !== valid.length) throw new Error('Not all public sources were stored. Confirm the additive migration and server-role access, then rerun; writes are idempotent.')
}

main().then(() => process.exit(0)).catch(error => { console.error(error instanceof Error ? error.message : 'Research seed failed'); process.exit(1) })
