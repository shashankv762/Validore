import { describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
const run = (env: Record<string, string>) => spawnSync(process.execPath, [resolve('scripts/ci-config.mjs')], {
  env: { ...process.env, ...env }, encoding: 'utf8', windowsHide: true,
})
const publicKey = 'sb_publishable_test-public-key'
const release = { BUILD_PROFILE: 'release', NEXT_PUBLIC_APP_URL: 'https://validore.example',
  NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co', NEXT_PUBLIC_SUPABASE_ANON_KEY: publicKey }

describe('CI release configuration', () => {
  it('permits a credential-free classroom demo', () => { expect(run({ BUILD_PROFILE: 'demo' }).status).toBe(0) })
  it('validates a configured release without printing keys', () => {
    const result = run(release)
    expect(result.status).toBe(0)
    expect(result.stdout).not.toContain(publicKey)
  })
  it('rejects placeholder origins and HTTP releases', () => {
    expect(run({ ...release, NEXT_PUBLIC_APP_URL: 'http://localhost:3000' }).status).toBe(1)
    expect(run({ ...release, NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co' }).status).toBe(1)
  })
  it('rejects service-role keys in public build configuration', () => {
    const token = 'header.' + Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url') + '.signature'
    expect(run({ ...release, NEXT_PUBLIC_SUPABASE_ANON_KEY: token }).status).toBe(1)
    expect(run({ ...release, NEXT_PUBLIC_SUPABASE_ANON_KEY: 'sb_secret_private' }).status).toBe(1)
  })
})
