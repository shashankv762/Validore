'use client'

import { useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { Brand } from '@/components/Brand'
import { CookieSettingsButton } from '@/components/CookieNotice'
import { useAccount } from '@/components/AccountProvider'
import { PLAN_CATALOG } from '@/lib/plans'
import { totalCredits } from '@/lib/credit-allocation'
import { Plus, Layers, BarChart3, Coins, Presentation, Settings, FileText, Menu, X, Network, ArrowUpRight, ChevronRight, BookOpen, Lock, type LucideIcon } from 'lucide-react'

type NavItem = { href: string; label: string; icon: LucideIcon }
const RESEARCH: NavItem[] = [
  { href: '/dashboard', label: 'New validation', icon: Plus },
  { href: '/dashboard/reports', label: 'Your reports', icon: FileText },
  { href: '/dashboard/agents', label: 'Research team', icon: Network },
]
const BUILD: NavItem[] = [
  { href: '/dashboard/lean-canvas', label: 'Lean Canvas', icon: Layers },
  { href: '/dashboard/pricing', label: 'Pricing simulator', icon: BarChart3 },
  { href: '/dashboard/crowdfunding', label: 'Crowdfunding', icon: Coins },
  { href: '/dashboard/pitch-deck', label: 'Pitch deck', icon: Presentation },
]
const ACCOUNT: NavItem[] = [
  { href: '/dashboard/credits', label: 'Credits', icon: Coins },
  { href: '/dashboard/usage', label: 'Usage', icon: BarChart3 },
  { href: '/dashboard/settings', label: 'Settings', icon: Settings },
]

export default function Sidebar({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const { data } = useAccount()
  const account = data?.user
  const toggle = useRef<HTMLButtonElement>(null)
  const active = (href: string) => href === '/dashboard' ? pathname === href :
    pathname === href || pathname.startsWith(href + '/') || (href.endsWith('/reports') && pathname.startsWith('/dashboard/report/'))
  const current = [...RESEARCH, ...BUILD, ...ACCOUNT].find(item => active(item.href))
  const balance = account ? totalCredits(account) : null
  const navLink = ({ href, label, icon: Icon }: NavItem) => {
    const locked = account && ((href.endsWith('/pricing') && account.tier === 'free') ||
      (href.endsWith('/crowdfunding') && account.tier !== 'max_premium' && !account.crowdfundingCredits) ||
      (href.endsWith('/pitch-deck') && account.tier !== 'max_premium' && !account.pitchDeckCredits))
    return <Link key={href} href={href} onClick={() => setOpen(false)} aria-current={active(href) ? 'page' : undefined}
      className={'workspace-nav-link' + (active(href) ? ' is-active' : '')}>
      <Icon size={18} aria-hidden="true" /><span>{label}</span>
      {locked && <Lock size={12} aria-label="Requires a plan or module credits" className="workspace-nav-lock" />}
    </Link>
  }
  return <div className="workspace-shell">
    <a href="#dashboard-content" className="skip-link">Skip to workspace</a>
    <header className="workspace-mobile-header"><Brand light compact />
      <button ref={toggle} type="button" onClick={() => setOpen(value => !value)} aria-label={open ? 'Close navigation' : 'Open navigation'}
        aria-expanded={open} aria-controls="dashboard-navigation" className="workspace-menu-button">
        {open ? <X size={22} aria-hidden="true" /> : <Menu size={22} aria-hidden="true" />}
      </button>
    </header>
    <aside id="dashboard-navigation" className={'workspace-sidebar dashboard-navigation' + (open ? ' is-open' : '')}
      onKeyDown={event => { if (event.key === 'Escape' && open) { setOpen(false); toggle.current?.focus() } }}>
      <div className="workspace-brand"><Brand light /><span>Founder workspace</span></div>
      <nav aria-label="Research" className="workspace-nav-group"><p>Workspace</p>{RESEARCH.map(navLink)}</nav>
      <nav aria-label="Planning tools" className="workspace-nav-group"><p>Build your plan</p>{BUILD.map(navLink)}</nav>
      <div className="workspace-sidebar-bottom">
        <div className="workspace-allowance">
          <div><span>{account ? PLAN_CATALOG[account.tier].name : 'Your'} plan</span><Coins size={15} aria-hidden="true" /></div>
          <p><strong>{balance === null ? '—' : balance.toLocaleString()}</strong> credits available</p>
          <Link href="/dashboard/credits" onClick={() => setOpen(false)}>Manage credits<ArrowUpRight size={14} aria-hidden="true" /></Link>
        </div>
        <nav aria-label="Account" className="workspace-nav-group workspace-account-nav">{ACCOUNT.map(navLink)}</nav>
        <div className="workspace-account"><span aria-hidden="true" className="workspace-avatar">{account?.email?.[0]?.toUpperCase() || 'V'}</span><div><span>Your workspace</span><small>{account?.email || 'Loading account…'}</small></div></div>
      </div>
    </aside>
    <main id="dashboard-content" tabIndex={-1} className="workspace-main">
      <div className="workspace-topbar">
        <div className="workspace-breadcrumb"><span>Workspace</span><ChevronRight size={13} aria-hidden="true" /><strong>{pathname.startsWith('/dashboard/report/') ? 'Validation report' : current?.label || 'Research'}</strong></div>
        <Link href="/demo" className="workspace-help"><BookOpen size={15} aria-hidden="true" /><span>Sample report</span><ArrowUpRight size={13} aria-hidden="true" /></Link>
      </div>
      <div className="workspace-content">{children}</div>
      <footer className="workspace-footer"><span>Build on evidence. Test your assumptions.</span><Link href="/legal/terms">Terms</Link><Link href="/legal/privacy">Privacy</Link><CookieSettingsButton /></footer>
    </main>
  </div>
}
