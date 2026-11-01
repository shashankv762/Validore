import Link from 'next/link'
import { PolicyPage } from '@/components/legal/PolicyPage'
import { CookieSettingsButton } from '@/components/CookieNotice'

export const metadata = { title: 'Cookie Policy', description: 'Essential cookies and browser storage used by Validore. Optional tracking is off.' }

export default function CookiesPage() {
  return <PolicyPage eyebrow="Just the essentials" title="Cookies & browser storage" summary="We use storage for sign-in, security, and saving your work. Optional analytics, advertising, and session-replay trackers are not enabled." sections={[
    { id: 'approach', title: 'Our approach', content: <><p>Cookies send small values with requests. Local and session storage keep information in your browser. We use these technologies for the service functions below. Essential storage is not an optional marketing preference.</p><p>“Got it” acknowledges the notice. It does not opt you into advertising, analytics, or model training. There is no “accept all” setting because no optional trackers are configured.</p></> },
    { id: 'inventory', title: 'Storage inventory', content: <div className="policy-table-wrap"><table><thead><tr><th>Name or pattern</th><th>Purpose</th><th>Location / duration</th></tr></thead><tbody>
      <tr><td><code>sb-*-auth-token</code> and chunks</td><td>Supabase sign-in and session refresh.</td><td>Cookie; expiry and renewal follow Supabase session settings. Sign-out clears local session cookies.</td></tr>
      <tr><td><code>sb-*-auth-token-code-verifier</code></td><td>Proves an authentication or recovery flow began in this browser.</td><td>Temporary cookie managed by Supabase; removed or expired by the authentication flow.</td></tr>
      <tr><td><code>validore:essential-notice:v1</code></td><td>Remembers the notice and policy version.</td><td>Local storage; treated as expired after 180 days or a policy-version change.</td></tr>
      <tr><td><code>validore:device:v1</code></td><td>Random identifier for recent account activity and abuse controls; not an advertising ID.</td><td>Local storage; renewed after 30 days.</td></tr>
      <tr><td><code>validore_device_registered:*</code></td><td>Avoids repeatedly registering the signed-in browser.</td><td>Session storage; this tab.</td></tr>
      <tr><td><code>validore:brief:*</code></td><td>Restores the same account’s unfinished brief.</td><td>Session storage; cleared when a report is ready or the tab session ends.</td></tr>
      <tr><td><code>validore:account-refresh</code></td><td>A timestamp telling other tabs to refresh your balance. It contains no account or report data.</td><td>Local storage; replaced after the next account update or removed with site data.</td></tr>
    </tbody></table></div> },
    { id: 'external', title: 'External service cookies', content: <p>Authentication pages and Stripe checkout can set their own cookies when visited. Their notices apply there. Validore does not load advertising or payment-tracking scripts on ordinary pages. See our <Link href="/legal/privacy">Privacy Policy</Link> for provider processing.</p> },
    { id: 'controls', title: 'Your controls', content: <><p>Use <CookieSettingsButton className="policy-inline-button" /> to review the notice. Browser settings can clear or block storage, although this may prevent sign-in or draft restoration. Sign out and clear site data on shared devices.</p><p>Clearing browser storage does not delete saved reports or answers. Clear an interview in its controls or request deletion through the <Link href="/legal/privacy#choices">privacy contact</Link>.</p></> },
    { id: 'future', title: 'If optional tracking is introduced', content: <p>We will update this inventory and implement required choices before enabling non-essential tracking. Optional consent will not be bundled with account creation, essential security, or workspace access.</p> },
  ]} />
}
