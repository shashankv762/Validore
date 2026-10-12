'use client'

import { useState, useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { Sparkles, Layers, BarChart3, Coins, Presentation, Settings, FileText, Lock, Menu, X, type LucideIcon } from 'lucide-react'

type Tier = 'free' | 'premium' | 'max_premium'
type NavItem = { href: string; label: string; icon: LucideIcon }
const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Validate an idea', icon: Sparkles },
  { href: '/dashboard/reports', label: 'Your reports', icon: FileText },
  { href: '/dashboard/lean-canvas', label: 'Lean Canvas', icon: Layers },
  { href: '/dashboard/pricing', label: 'Pricing', icon: BarChart3 },
  { href: '/dashboard/crowdfunding', label: 'Crowdfunding', icon: Coins },
  { href: '/dashboard/pitch-deck', label: 'Pitch Deck', icon: Presentation },
]
const ACCOUNT_ITEMS: NavItem[] = [
  { href: '/dashboard/credits', label: 'Credits', icon: Coins },
  { href: '/dashboard/settings', label: 'Settings', icon: Settings },
]

export default function Sidebar({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [isOpen, setIsOpen] = useState(false)
  const [userTier, setUserTier] = useState<Tier>('free')
  const [balances, setBalances] = useState({ crowdfunding: 0, pitchDeck: 0 })
  const toggle = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/me', { signal: controller.signal }).then(res => res.ok ? res.json() : null).then(data => {
      if (data?.user) {
        setUserTier(data.user.tier || 'free')
        setBalances({ crowdfunding: data.user.crowdfundingCredits ?? 0, pitchDeck: data.user.pitchDeckCredits ?? 0 })
      }
    }).catch(() => {})
    return () => controller.abort()
  }, [pathname])
  const active = (href: string) => href === '/dashboard' ? pathname === href : pathname === href || pathname.startsWith(href + '/')
  const badge = (href: string) => {
    if (href === '/dashboard/pricing' && userTier === 'free') return 'Premium'
    if (userTier !== 'max_premium' && (href === '/dashboard/crowdfunding' || href === '/dashboard/pitch-deck')) {
      const credits = href === '/dashboard/crowdfunding' ? balances.crowdfunding : balances.pitchDeck
      return credits > 0 ? credits + ' credits' : 'Add credits'
    }
    return null
  }
  const navLink = (item: NavItem) => {
    const selected = active(item.href) || (item.href === '/dashboard/reports' && pathname.startsWith('/dashboard/report/'))
    const tag = badge(item.href)
    const locked = tag === 'Premium' || tag === 'Add credits'
    const Icon = item.icon
    return <Link key={item.href} href={item.href} onClick={() => setIsOpen(false)} aria-current={selected ? 'page' : undefined}
      className={'flex min-h-11 items-center gap-3 rounded-lg px-3 py-3 text-sm transition-colors ' + (selected ? 'bg-[#C8A860]/15 text-[#F5F0E8]' : 'text-[#F5F0E8]/85 hover:bg-white/5 hover:text-[#F5F0E8]')}>
      <Icon aria-hidden="true" className="h-4 w-4 shrink-0 text-[#C8A860]" />
      <span className="min-w-0 flex-1">{item.label}</span>
      {tag && <span className="inline-flex items-center gap-1 rounded bg-[#C8A860]/10 px-1.5 py-1 text-[11px] text-[#C8A860]">
        {locked && <Lock aria-hidden="true" className="h-3 w-3" />}{tag}
      </span>}
    </Link>
  }
  return <div className="min-h-dvh bg-[#F5F0E8] md:flex">
    <a href="#dashboard-content" className="skip-link">Skip to workspace</a>
    <header className="flex items-center justify-between bg-[#0A1628] px-4 py-3 md:hidden">
      <Link href="/" aria-label="Validore home" className="inline-flex items-center gap-2">
        <Image src="/logo/validore-icon.svg" alt="" width={28} height={28} />
        <span className="text-lg font-light tracking-widest text-[#C8A860]">validore</span>
      </Link>
      <button ref={toggle} type="button" onClick={() => setIsOpen(value => !value)} aria-label={isOpen ? 'Close navigation' : 'Open navigation'}
        aria-expanded={isOpen} aria-controls="dashboard-navigation" className="flex h-11 w-11 items-center justify-center rounded text-[#C8A860]">
        {isOpen ? <X aria-hidden="true" size={22} /> : <Menu aria-hidden="true" size={22} />}
      </button>
    </header>
    <aside id="dashboard-navigation" className={(isOpen ? 'flex' : 'hidden') + ' dashboard-navigation w-full shrink-0 flex-col bg-[#0A1628] md:sticky md:top-0 md:flex md:h-dvh md:w-64 md:overflow-y-auto'}
      onKeyDown={event => { if (event.key === 'Escape' && isOpen) { setIsOpen(false); toggle.current?.focus() } }}>
      <div className="hidden border-b border-white/10 px-6 py-7 md:block">
        <Link href="/" aria-label="Validore home" className="inline-flex items-center gap-3">
          <Image src="/logo/validore-icon.svg" alt="" width={32} height={32} />
          <span className="text-xl font-light tracking-widest text-[#C8A860]">validore</span>
        </Link>
        <p className="mt-3 text-xs leading-relaxed text-[#F5F0E8]/75">Know it&apos;s gold before you dig.</p>
      </div>
      <nav aria-label="Workspace" className="flex-1 space-y-1 px-3 py-5">{NAV_ITEMS.map(navLink)}</nav>
      <nav aria-label="Account" className="space-y-1 border-t border-white/10 px-3 py-4">{ACCOUNT_ITEMS.map(navLink)}</nav>
      <div className="hidden px-6 pb-5 text-xs text-[#F5F0E8]/75 md:block">
        <span className="capitalize">{userTier.replace('_', ' ')}</span> plan
      </div>
    </aside>
    <main id="dashboard-content" tabIndex={-1} className="min-w-0 flex-1">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-10 lg:py-10">{children}</div>
    </main>
  </div>
}
