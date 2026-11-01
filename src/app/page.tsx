import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowUpRight, Check, ChartNoAxesCombined, Layers, Presentation, Search, ShieldCheck, Target, Plus } from 'lucide-react'
import { Brand } from '@/components/Brand'
import { LandingNav } from '@/components/marketing/LandingNav'
import { ReportPreview } from '@/components/marketing/ReportPreview'
import { billingAvailability } from '@/lib/billing-availability'
import { PLAN_CATALOG, formatUsd } from '@/lib/plans'
import './landing.css'

export const metadata: Metadata = {
  title: { absolute: "Validore — Know it's gold before you dig." },
  description: 'Explore your startup idea with AI-assisted market research, competitor analysis, financial models, and a practical plan for what to test next.',
  alternates: { canonical: '/' },
}

const modules = [
  { icon: Search, name: 'Validation report', text: 'Understand your market, customers, competition, and risks. See the reasoning behind your score, with assumptions clearly marked.', detail: 'A decision you can work with', featured: true },
  { icon: Layers, name: 'Lean Canvas', text: 'Bring your business model onto one page. Write it yourself, or use AI to help you explore it.', detail: 'From scattered thoughts to a clear model' },
  { icon: ChartNoAxesCombined, name: 'Pricing simulator', text: 'Explore pricing and unit economics. Change the assumptions and see what your business needs to work.', detail: 'Make the numbers make sense' },
  { icon: Target, name: 'Crowdfunding analysis', text: 'Examine campaign assumptions and readiness using illustrative benchmarks. Build a plan for testing demand.', detail: 'Prepare before asking for support' },
  { icon: Presentation, name: 'Pitch deck builder', text: 'Turn your idea and analysis into a structured story, ready to refine and export for your next conversation.', detail: 'A starting point for your pitch' },
]
const questions = [
  { question: 'What do I get with the free plan?', answer: 'One active idea, two Lite validations per month, a weighted score, key risks, and proposed next steps. You can also write and save a manual Lean Canvas. No payment card is needed to create an account.' },
  { question: 'Can an AI report prove that my idea will work?', answer: 'No. Validore helps you organise research and identify assumptions. Scores and financial projections are estimates, not guarantees. Use the report to plan customer interviews and real-world experiments before you invest.' },
  { question: 'Where does the research come from?', answer: 'When live search is available, reports include retrieved sources and label their evidence. If sources are unavailable, the report marks claims as unverified estimates. Crowdfunding benchmarks are synthetic examples, not a verified history of real campaigns.' },
  { question: 'Can I return to my report later?', answer: 'Yes. Your saved reports and Lean Canvas versions stay in your workspace. You can revisit your findings, refine your assumptions, and decide what to test next.' },
]

export default function LandingPage() {
  const billing = billingAvailability()
  const plans = [
    { name: PLAN_CATALOG.free.name, price: formatUsd(PLAN_CATALOG.free.monthlyPriceUsd), period: '', description: 'Explore your first idea.', available: true, features: [`${PLAN_CATALOG.free.activeIdeaLimit} active idea`, `${PLAN_CATALOG.free.validationLimit} Lite validations per month`, 'Weighted score, risks, and next steps', 'Manual Lean Canvas', 'PDF and editable Word downloads'], href: '/auth/signup', action: 'Start for free' },
    { name: PLAN_CATALOG.premium.name, price: formatUsd(PLAN_CATALOG.premium.monthlyPriceUsd), period: '/ month', description: 'Go deeper into your business model.', available: billing.premium, features: [`${PLAN_CATALOG.premium.monthlyCredits.toLocaleString()} monthly credits`, `${PLAN_CATALOG.premium.activeIdeaLimit} active ideas · ${PLAN_CATALOG.premium.validationLimit} validation limit`, 'Full report and AI Lean Canvas', 'Pricing simulator and CSV exports', 'PDF and editable Word downloads'], href: '/auth/signup?next=/dashboard/settings', action: 'Explore Premium' },
    { name: PLAN_CATALOG.max_premium.name, price: formatUsd(PLAN_CATALOG.max_premium.monthlyPriceUsd), period: '/ month', description: 'Prepare your fundraising story.', available: billing.maxPremium, features: [`${PLAN_CATALOG.max_premium.monthlyCredits.toLocaleString()} monthly credits`, `${PLAN_CATALOG.max_premium.validationLimit} validation limit · credits apply`, 'Premium features plus campaign planning', 'Pitch decks, PPTX and white-label PDF'], href: '/auth/signup?next=/dashboard/settings', action: 'Explore Max Premium' },
  ]
  return <div className="landing">
    <a href="#landing-content" className="skip-link">Skip to content</a>
    <LandingNav />
    <main id="landing-content" tabIndex={-1}>
      <section className="landing-hero" aria-labelledby="hero-title">
        <div className="hero-contours" aria-hidden="true"><span /><span /><span /><span /></div>
        <div className="landing-container hero-layout">
          <div className="hero-copy">
            <div className="hero-intro"><span aria-hidden="true" />A clearer starting point for your startup</div>
            <h1 id="hero-title">Know it&apos;s gold<br />before you dig.</h1>
            <p className="hero-description">Big ideas deserve a closer look. Explore your market, question your assumptions, and find your next move before you go all in.</p>
            <div className="hero-actions"><Link href="/auth/signup" className="button button-gold">Validate your idea<ArrowUpRight size={18} aria-hidden="true" /></Link><Link href="/demo" className="button button-quiet">Explore a sample report</Link></div>
            <p className="hero-note"><Check size={15} aria-hidden="true" />Free to start. No card needed.</p>
          </div>
          <div className="hero-preview"><ReportPreview /></div>
        </div>
        <div className="landing-container hero-foundation"><p>Look at your idea from every angle.</p><ul aria-label="Analysis perspectives"><li>Market</li><li>Customers</li><li>Competition</li><li>Finance</li><li>Risk</li><li>Next steps</li></ul></div>
      </section>
      <section id="workflow" className="landing-container workflow-section" aria-labelledby="workflow-title">
        <div className="section-intro"><h2 id="workflow-title">Less guesswork.<br />A better next move.</h2><p>You don&apos;t need a finished business plan. Start with the idea you have, and build clarity from there.</p></div>
        <ol className="workflow-steps">
          <li><span className="step-number" aria-hidden="true">01</span><h3>Tell us what you&apos;re building</h3><p>A few guided questions about your customer, the problem, and how you plan to solve it.</p></li>
          <li><span className="step-number" aria-hidden="true">02</span><h3>See the whole picture</h3><p>Review the opportunity, the tradeoffs, and the gaps. Follow the reasoning behind each finding.</p></li>
          <li><span className="step-number" aria-hidden="true">03</span><h3>Choose what to test next</h3><p>Leave with a practical action plan. Talk to customers, test the riskiest assumptions, and refine your idea.</p></li>
        </ol>
      </section>
      <section id="inside" className="tools-section" aria-labelledby="tools-title"><div className="landing-container">
        <div className="section-intro"><h2 id="tools-title">One idea.<br />Room to explore it.</h2><p>Keep your research, business model, and launch thinking connected in one workspace.</p></div>
        <div className="tools-grid">{modules.map(({ icon: Icon, ...module }) => <article key={module.name} className={'tool-card' + (module.featured ? ' tool-featured' : '')}><Icon size={25} strokeWidth={1.5} aria-hidden="true" /><h3>{module.name}</h3><p>{module.text}</p><span className="tool-detail">{module.detail}</span>{module.featured && <Link href="/demo" className="text-link">Read the sample report<ArrowUpRight size={17} aria-hidden="true" /></Link>}</article>)}</div>
        <p className="tools-note">Modules depend on your plan. The free plan includes Lite validation and a manual Lean Canvas.</p>
      </div></section>
      <section className="landing-container evidence-section" aria-labelledby="evidence-title"><div className="evidence-symbol" aria-hidden="true"><ShieldCheck size={36} strokeWidth={1.25} /></div><div><h2 id="evidence-title">Clarity includes knowing<br />what you don&apos;t know.</h2><p>A promising score is a starting point. Validore distinguishes retrieved sources from AI estimates, flags gaps, and gives you assumptions to test with real customers.</p></div><Link href="/demo" className="text-link">See how a report reads<ArrowUpRight size={18} aria-hidden="true" /></Link></section>
      <section id="pricing" className="pricing-section" aria-labelledby="pricing-title"><div className="landing-container">
        <div className="section-intro"><h2 id="pricing-title">Start with curiosity.<br />Start for free.</h2><p>{billing.premium || billing.maxPremium ? 'Choose the depth that fits your next decision. Manage your plan from your workspace.' : 'Explore Lite validation today. Paid plans are coming soon; start with the free workspace.'}</p></div>
        <div className="pricing-grid">{plans.map((plan, index) => <article className={'plan-card' + (index === 0 ? ' plan-free' : '')} key={plan.name}><div className="plan-heading"><h3>{plan.name}</h3><span className="plan-status">{index === 0 ? 'Start here' : plan.available ? 'Available' : 'Coming soon'}</span></div><p className="plan-description">{plan.description}</p><p className="plan-price">{!plan.available && <span className="planned-price">Planned pricing</span>}{plan.price}<span>{plan.period}</span></p><ul>{plan.features.map(feature => <li key={feature}><Check size={16} aria-hidden="true" />{feature}</li>)}</ul>{plan.available ? <Link href={plan.href} className={'button ' + (index === 0 ? 'button-navy' : 'button-outline')}>{plan.action}<ArrowUpRight size={17} aria-hidden="true" /></Link> : <p className="plan-unavailable">Paid signups aren&apos;t open yet.</p>}</article>)}</div>
      </div></section>
      <section className="landing-container faq-section" aria-labelledby="faq-title"><div><h2 id="faq-title">A few things<br />you might be wondering.</h2><p>The details, before you get started.</p></div><div className="faq-list">{questions.map(item => <details className="faq-item" key={item.question}><summary>{item.question}<Plus size={19} aria-hidden="true" /></summary><p>{item.answer}</p></details>)}</div></section>
      <section className="landing-container closing-section" aria-labelledby="closing-title"><Brand light /><h2 id="closing-title">Your next big idea.<br />Your first clear step.</h2><Link href="/auth/signup" className="button button-gold">Let&apos;s explore your idea<ArrowUpRight size={18} aria-hidden="true" /></Link></section>
    </main>
    <footer className="landing-footer landing-container"><div className="footer-top"><Brand /><p>Know it&apos;s gold before you dig.</p><nav aria-label="Legal and contact"><a href="mailto:aegixchainai@gmail.com">Contact</a><Link href="/legal/privacy">Privacy</Link><Link href="/legal/terms">Terms</Link><Link href="/legal/cookies">Cookies</Link><Link href="/legal/refund">Refunds</Link></nav></div><div className="footer-bottom"><p>© {new Date().getFullYear()} Validore</p><p>Built for founders, by Shashank V, Bengaluru, Karnataka, India.</p></div></footer>
  </div>
}
