import Link from 'next/link'
import { ArrowUpRight, Check } from 'lucide-react'
import { Brand } from '@/components/Brand'

export function AuthShell({ children, returning = false }: { children: React.ReactNode; returning?: boolean }) {
  return <div className="auth-shell"><a href="#auth-content" className="skip-link">Skip to form</a>
    <aside className="auth-story"><Brand light /><div><h2>{returning ? 'Your ideas. A little more clarity.' : "Know it's gold before you dig."}</h2><p>Give your idea the attention it deserves. A clearer view of your market, your assumptions, and your next move.</p><ul><li><Check size={17} aria-hidden="true" />Explore your market and competition</li><li><Check size={17} aria-hidden="true" />See the assumptions behind the numbers</li><li><Check size={17} aria-hidden="true" />Build a practical plan to test your idea</li></ul></div><Link href="/demo">Take a look at a sample report<ArrowUpRight size={17} aria-hidden="true" /></Link></aside>
    <main id="auth-content" tabIndex={-1} className="auth-form-side"><div className="auth-form-container"><div className="auth-mobile-brand"><Brand /></div>{children}<p className="auth-footnote">A thoughtful first step for your next big idea.</p></div></main>
  </div>
}
