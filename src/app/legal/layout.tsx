import Link from 'next/link'
import type { ReactNode } from 'react'
import { Brand } from '@/components/Brand'
import { CookieSettingsButton } from '@/components/CookieNotice'
import { LEGAL } from '@/lib/legal'
import './policies.css'

export default function LegalLayout({ children }: { children: ReactNode }) {
  return <div className="policy-shell"><a className="policy-skip" href="#main-content">Skip to policy</a>
    <nav className="policy-nav" aria-label="Main navigation"><Brand compact /><div><Link href="/">Home</Link><Link href="/auth/signin">Sign in</Link></div></nav>
    {children}
    <footer className="policy-footer"><Brand compact /><nav aria-label="Legal policies"><Link href="/legal/terms">Terms</Link><Link href="/legal/privacy">Privacy</Link><Link href="/legal/cookies">Cookies</Link><Link href="/legal/refund">Refunds</Link><Link href="/legal/acceptable-use">Acceptable use</Link><CookieSettingsButton /></nav>
      <p>© {new Date().getFullYear()} Validore · {LEGAL.operator}, {LEGAL.country} · <a href={'mailto:' + LEGAL.contact}>{LEGAL.contact}</a></p>
    </footer>
  </div>
}
