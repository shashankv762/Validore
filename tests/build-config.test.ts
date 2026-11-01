import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { validateBuildConfig } from '../scripts/ci-config.mjs'

const jwt = (role: string) => 'header.' + Buffer.from(JSON.stringify({ role })).toString('base64url') + '.fixture-signature'
const release = () => ({
  BUILD_PROFILE: 'release',
  NEXT_PUBLIC_APP_URL: 'https://validore.onrender.com',
  NEXT_PUBLIC_SUPABASE_URL: 'https://synthetic-build-project.supabase.co',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_build_fixture',
})

describe('legacy Render build configuration entry point', () => {
  it.each(['22.12.0', '24.14.1'])('accepts the supported Node %s runtime and public release configuration', version => {
    expect(() => validateBuildConfig(release(), version)).not.toThrow()
  })

  it.each(['20.19.0', '22.11.0', '23.11.0'])('rejects unsupported Node %s', version => {
    expect(() => validateBuildConfig({}, version)).toThrow('Node 22.12+')
  })

  it('supports the legacy public anon JWT and an unconfigured local check', () => {
    expect(() => validateBuildConfig({ ...release(), NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: '', NEXT_PUBLIC_SUPABASE_ANON_KEY: jwt('anon') }, '24.14.1')).not.toThrow()
    expect(() => validateBuildConfig({}, '24.14.1')).not.toThrow()
  })

  it.each(['sb_secret_build_fixture', jwt('service_role')])('rejects a private key in either public slot, even outside release mode', key => {
    expect(() => validateBuildConfig({ NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key }, '24.14.1')).toThrow('private Supabase key')
    expect(() => validateBuildConfig({ ...release(), NEXT_PUBLIC_SUPABASE_ANON_KEY: key }, '24.14.1')).toThrow('private Supabase key')
  })

  it.each(['', 'http://validore.onrender.com', 'https://localhost', 'https://user:password@validore.onrender.com'])('rejects an invalid release origin without exposing its value', value => {
    expect(() => validateBuildConfig({ ...release(), NEXT_PUBLIC_APP_URL: value }, '24.14.1')).toThrow('NEXT_PUBLIC_APP_URL')
    expect(() => validateBuildConfig({ ...release(), NEXT_PUBLIC_SUPABASE_URL: value }, '24.14.1')).toThrow('NEXT_PUBLIC_SUPABASE_URL')
  })

  it('rejects missing or malformed public keys for a release', () => {
    for (const key of ['', 'invalid-key', jwt('authenticated')]) {
      expect(() => validateBuildConfig({ ...release(), NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key }, '24.14.1')).toThrow('public Supabase anon/publishable key')
    }
  })

  it('executes the exact missing entry point successfully and propagates failure without printing keys', () => {
    const options = { encoding: 'utf8' as const, windowsHide: true, timeout: 10_000,
      env: { NODE_ENV: 'production' as const, PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, ...release() } }
    const script = resolve('scripts/ci-config.mjs')
    const valid = spawnSync(process.execPath, [script], options)
    expect(valid.status).toBe(0)
    expect(valid.stdout).toContain('Build configuration validated')
    expect(valid.stderr).toBe('')
    const privateKey = 'sb_secret_never_print_this_fixture'
    const invalid = spawnSync(process.execPath, [script], { ...options, env: { ...options.env, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: privateKey } })
    expect(invalid.status).toBe(1)
    expect(invalid.stderr).toContain('private Supabase key')
    expect(invalid.stdout + invalid.stderr).not.toContain(privateKey)
  })
})
