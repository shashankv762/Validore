import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Compatibility entry point for existing Render build commands. Keep this file
// even when new deployments use the shorter build:deploy command in render.yaml.
// Inspect injected configuration only: no files, network calls or secret output.
function jwtRole(key) {
  try { return JSON.parse(Buffer.from(key.split('.')[1] || '', 'base64url').toString()).role }
  catch { return undefined }
}

function requireHttpsOrigin(name, value) {
  let url
  try { url = new URL(value || '') }
  catch { throw new Error(`${name} must be a configured HTTPS origin for a release build`) }
  if (url.protocol !== 'https:' || url.username || url.password ||
    ['localhost', '127.0.0.1', '[::1]', 'example.supabase.co'].includes(url.hostname)) {
    throw new Error(`${name} must be a real HTTPS origin without embedded credentials`)
  }
}

/** @param {Record<string, string | undefined>} env @param {string} nodeVersion */
export function validateBuildConfig(env = process.env, nodeVersion = process.versions.node) {
  const [major, minor] = nodeVersion.split('.').map(Number)
  if (!((major === 22 && minor >= 12) || major >= 24)) {
    throw new Error('Use Node 22.12+ or Node 24+ for this toolchain')
  }

  const publicKeys = [env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, env.NEXT_PUBLIC_SUPABASE_ANON_KEY]
  for (const candidate of publicKeys) {
    const key = candidate || ''
    if (key.startsWith('sb_secret_') || jwtRole(key) === 'service_role') {
      throw new Error('A private Supabase key cannot be included in NEXT_PUBLIC_* build configuration')
    }
  }

  if (env.BUILD_PROFILE === 'release') {
    requireHttpsOrigin('NEXT_PUBLIC_APP_URL', env.NEXT_PUBLIC_APP_URL)
    requireHttpsOrigin('NEXT_PUBLIC_SUPABASE_URL', env.NEXT_PUBLIC_SUPABASE_URL)
    const key = publicKeys.find(Boolean) || ''
    // Classify the public key format; this does not verify JWT signatures or
    // make an Auth request. Hosted sign-in still needs an integration check.
    if (!key.startsWith('sb_publishable_') && !(key.split('.').length === 3 && jwtRole(key) === 'anon')) {
      throw new Error('Release requires a public Supabase anon/publishable key; never a service-role key')
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    validateBuildConfig()
    console.log(`Build configuration validated for Node ${process.versions.node} (${process.env.BUILD_PROFILE === 'release' ? 'release' : 'local'} profile)`)
  } catch (error) {
    console.error('[build-config] ' + error.message)
    process.exitCode = 1
  }
}
