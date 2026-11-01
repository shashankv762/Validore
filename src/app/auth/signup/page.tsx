import Link from 'next/link'
import AuthNotice from '@/components/auth/AuthNotice'
import { AuthShell } from '@/components/auth/AuthShell'
import { AuthForm } from '@/components/auth/AuthForm'
import { PasswordField } from '@/components/auth/PasswordField'
import { LEGAL } from '@/lib/legal'

export const metadata = { title: 'Create your account', description: 'Start exploring your startup idea with a free Validore account.' }

export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ error?: string; message?: string; next?: string }> }) {
  const params = await searchParams
  const next = typeof params.next === 'string' ? params.next : '/dashboard'
  return <AuthShell><h1>A good idea starts here.</h1><p className="auth-description">Create your free workspace. No card needed.</p><AuthNotice error={params.error} message={params.message} />
    <AuthForm action="/api/auth/signup" label="Create your account" pendingLabel="Creating your account…">
      <input type="hidden" name="next" value={next} />
      <input type="hidden" name="policyVersion" value={LEGAL.version} />
      <div><label htmlFor="email" className="auth-label">Email address</label><input type="email" id="email" name="email" autoComplete="email" autoCapitalize="none" maxLength={320} required className="auth-input" placeholder="you@company.com" /></div>
      <div><label htmlFor="password" className="auth-label">Password</label><PasswordField id="password" name="password" autoComplete="new-password" minLength={8} maxLength={128} required aria-describedby="password-hint" /><p id="password-hint" className="auth-help">Use a unique password. We recommend 12+ characters with mixed case, a number, and a symbol.</p></div>
      <label className="auth-consent"><input type="checkbox" name="consent" required /><span>I am 18 or over, agree to the <Link href="/legal/terms">Terms of Service</Link>, and acknowledge the <Link href="/legal/privacy">Privacy Policy</Link>.</span></label>
    </AuthForm>
    <div className="auth-divider">or</div><AuthForm action="/api/auth/google" label="Continue with Google" pendingLabel="Connecting to Google…" secondary><input type="hidden" name="next" value={next} /><input type="hidden" name="intent" value="signup" /><input type="hidden" name="policyVersion" value={LEGAL.version} /><label className="auth-consent"><input type="checkbox" name="consent" required /><span>I am 18 or over, agree to the <Link href="/legal/terms">Terms</Link>, and acknowledge the <Link href="/legal/privacy">Privacy Policy</Link>.</span></label></AuthForm>
    <p className="auth-switch">Already have an account? <Link href={'/auth/signin?next=' + encodeURIComponent(next)}>Sign in</Link></p>
  </AuthShell>
}
