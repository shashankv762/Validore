import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Render workspace schema preflight', () => {
  it('refuses to build over an unavailable database without exposing its connection credentials', () => {
    const secret = 'private-preflight-test-password'
    const result = spawnSync(process.execPath, [resolve('scripts/build-deploy.mjs')], {
      encoding: 'utf8', windowsHide: true, timeout: 25_000,
      env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, NODE_ENV: 'production', RENDER: 'true',
        NEXT_TELEMETRY_DISABLED: '1', NEXT_PUBLIC_APP_URL: 'https://validore.onrender.com',
        NEXT_PUBLIC_SUPABASE_URL: 'https://synthetic-build-project.supabase.co',
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_build_fixture',
        DATABASE_URL: 'postgresql://synthetic_user:' + secret + '@127.0.0.1:1/nonexistent',
      },
    })
    expect(result.status).toBe(1)
    const output = result.stdout + result.stderr
    expect(output).toContain('[build] Render database verification failed')
    expect(output).not.toContain('Creating an optimized production build')
    expect(output).not.toContain(secret)
    expect(output).not.toContain('postgresql://')
  }, 30_000)
})
