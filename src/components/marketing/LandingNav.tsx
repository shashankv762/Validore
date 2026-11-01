'use client'
import { useRef, useState } from 'react'
import Link from 'next/link'
import { Menu, X } from 'lucide-react'
import { Brand } from '@/components/Brand'

const links = [{ href: '#workflow', text: 'How it works' }, { href: '#inside', text: 'The workspace' }, { href: '#pricing', text: 'Pricing' }]

export function LandingNav() {
  const [open, setOpen] = useState(false)
  const toggle = useRef<HTMLButtonElement>(null)
  return <header className="landing-header" onKeyDown={event => { if (event.key === 'Escape' && open) { setOpen(false); toggle.current?.focus() } }}>
    <div className="landing-container header-inner"><Brand light /><nav aria-label="Main navigation" className="desktop-links">{links.map(link => <a href={link.href} key={link.href}>{link.text}</a>)}</nav><div className="header-actions"><Link href="/auth/signin" className="header-signin">Sign in</Link><Link href="/auth/signup" className="button button-gold button-small">Start for free</Link><button ref={toggle} type="button" className="mobile-menu-toggle" aria-expanded={open} aria-controls="mobile-navigation" aria-label={open ? 'Close navigation' : 'Open navigation'} onClick={() => setOpen(value => !value)}>{open ? <X size={22} /> : <Menu size={22} />}</button></div></div>
    <nav id="mobile-navigation" aria-label="Mobile navigation" className="mobile-links" hidden={!open}>{links.map(link => <a href={link.href} key={link.href} onClick={() => setOpen(false)}>{link.text}</a>)}<Link href="/auth/signin" onClick={() => setOpen(false)}>Sign in</Link><Link href="/auth/signup" onClick={() => setOpen(false)}>Start for free</Link></nav>
  </header>
}
