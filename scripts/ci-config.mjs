const [major, minor] = process.versions.node.split('.').map(Number)
if (!((major === 22 && minor >= 12) || major >= 24)) throw new Error('Use Node 22.12+ or Node 24+ for this toolchain')
const configuredKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
let role
try { role = JSON.parse(Buffer.from(configuredKey.split('.')[1] || '', 'base64url').toString()).role } catch {}
if (configuredKey.startsWith('sb_secret_') || role === 'service_role') throw new Error('A private Supabase key cannot be included in public build configuration')
if (process.env.BUILD_PROFILE === 'release') {
  const app = new URL(process.env.NEXT_PUBLIC_APP_URL || '')
  const supabase = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || '')
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  if (app.protocol !== 'https:' || supabase.protocol !== 'https:' || /^(localhost|127\.0\.0\.1|example\.supabase\.co)$/.test(app.hostname) || supabase.hostname === 'example.supabase.co') {
    throw new Error('Release requires real HTTPS public origins')
  }
  let publicKey = key.startsWith('sb_publishable_')
  if (!publicKey && key.split('.').length === 3) {
    try { publicKey = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role === 'anon' } catch {}
  }
  if (!publicKey) throw new Error('Release requires a public Supabase anon/publishable key; never a service-role key')
}
console.log('Node ' + process.versions.node + '; profile ' + (process.env.BUILD_PROFILE || 'local') + '; configuration validated')
