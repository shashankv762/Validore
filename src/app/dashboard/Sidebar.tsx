'use client'

import { useState } from 'react'
import Link from 'next/link'

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Validation', icon: '✦', tier: 'free' },
  { href: '/dashboard/lean-canvas', label: 'Lean Canvas', icon: '◈', tier: 'premium' },
  { href: '/dashboard/pricing', label: 'Pricing', icon: '◉', tier: 'premium' },
  { href: '/dashboard/crowdfunding', label: 'Crowdfunding', icon: '◆', tier: 'max' },
  { href: '/dashboard/pitch-deck', label: 'Pitch Deck', icon: '◇', tier: 'max' },
]

export default function Sidebar({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className="min-h-screen flex flex-col md:flex-row w-full" style={{ background: 'var(--cream, #F5F0E8)' }}>
      {/* Mobile Header */}
      <div className="md:hidden flex items-center justify-between p-4 bg-[#0A1628] text-[#F5F0E8]">
        <Link href="/" className="block">
          <span className="text-lg font-light tracking-widest text-[#C8A860]" style={{ letterSpacing: '0.15em' }}>
            validore
          </span>
        </Link>
        <button 
          onClick={() => setIsOpen(!isOpen)} 
          className="text-[#C8A860] focus:outline-none focus:ring-2 focus:ring-[#C8A860]"
          aria-label="Toggle Navigation"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {isOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </div>

      {/* Navy sidebar */}
      <aside
        className={`${isOpen ? 'flex' : 'hidden'} md:flex w-full md:w-56 flex-shrink-0 flex-col absolute md:static z-40`}
        style={{ background: '#0A1628', minHeight: '100vh' }}
      >
        {/* Logo */}
        <div className="hidden md:block px-6 py-6 border-b border-white/10">
          <Link href="/" className="block">
            <span
              className="text-lg font-light tracking-widest"
              style={{ color: '#C8A860', letterSpacing: '0.15em' }}
            >
              validore
            </span>
            <div className="text-xs mt-0.5" style={{ color: '#C8A860', opacity: 0.5 }}>
              Know it's gold before you dig.
            </div>
          </Link>
        </div>

        {/* Nav items */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV_ITEMS.map(item => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-3 px-3 py-2.5 rounded text-sm transition-all group hover:bg-[#C8A860]/10 hover:opacity-100"
              style={{ borderRadius: '2px 8px 2px 8px', color: '#F5F0E8', opacity: 0.7 }}
            >
              <span style={{ color: '#C8A860', fontSize: '11px' }}>{item.icon}</span>
              <span>{item.label}</span>
              {(item.tier === 'premium' || item.tier === 'max') && (
                <span
                  className="ml-auto text-xs px-1.5 py-0.5 rounded font-medium bg-[#C8A860]/15 text-[#C8A860]"
                  style={{
                    fontSize: '9px',
                    letterSpacing: '0.05em',
                  }}
                >
                  {item.tier === 'max' ? 'MAX' : 'PRO'}
                </span>
              )}
            </Link>
          ))}
        </nav>

        {/* Bottom links */}
        <div className="px-3 py-4 border-t border-white/10 space-y-1">
          <Link
            href="/dashboard/credits"
            onClick={() => setIsOpen(false)}
            className="flex items-center gap-3 px-3 py-2 rounded text-sm hover:opacity-100 hover:bg-[#C8A860]/10"
            style={{ color: '#F5F0E8', opacity: 0.5, borderRadius: '2px 8px 2px 8px' }}
          >
            <span style={{ color: '#C8A860', fontSize: '11px' }}>◎</span>
            <span>Credits</span>
          </Link>
          <Link
            href="/dashboard/settings"
            onClick={() => setIsOpen(false)}
            className="flex items-center gap-3 px-3 py-2 rounded text-sm hover:opacity-100 hover:bg-[#C8A860]/10"
            style={{ color: '#F5F0E8', opacity: 0.5, borderRadius: '2px 8px 2px 8px' }}
          >
            <span style={{ color: '#C8A860', fontSize: '11px' }}>⚙</span>
            <span>Settings</span>
          </Link>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto bg-[#F5F0E8] z-0">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-8">
          {children}
        </div>
      </main>
    </div>
  )
}
