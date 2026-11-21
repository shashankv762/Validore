'use client'

import Link from 'next/link'
import { ArrowUpRight, Check } from 'lucide-react'
import { CurrencyDisclosure, CurrencySelector, useCurrency } from '@/components/CurrencyProvider'
import { subscriptionAvailable, subscriptionCurrency, type MonthlyPlanPrice, type PlanTier, type SubscriptionAvailability } from '@/lib/plans'

type LandingPlan = MonthlyPlanPrice & { tier: PlanTier; name: string; benefits: string[]; description: string }

export function LandingPricing({ plans, billing, signupOpen }: { plans: LandingPlan[]; billing: SubscriptionAvailability; signupOpen: boolean }) {
  const { currency, formatPlanPrice } = useCurrency()
  const checkoutCurrency = subscriptionCurrency(currency)
  const availability = plans.map(plan => ({ ...plan, available: signupOpen && (plan.tier === 'free' || subscriptionAvailable(billing, plan.tier, checkoutCurrency)) }))
  const canBuy = availability.some(plan => plan.tier !== 'free' && plan.available)
  return <>
    <div className="section-intro"><h2 id="pricing-title">Start with curiosity.<br />Start for free.</h2><p>{canBuy ? 'Choose the depth that fits your next decision. Manage your plan from your workspace.' : 'Explore Lite validation today. Paid plans are coming soon; start with the free workspace.'}</p></div>
    <div className="mb-6"><CurrencySelector /><CurrencyDisclosure /></div>
    <div className="pricing-grid">
      {availability.map(plan => {
        const free = plan.tier === 'free'
        return <article className={free ? 'plan-card plan-free' : 'plan-card'} key={plan.tier}>
          <div className="plan-heading"><h3>{plan.name}</h3><span className="plan-status">{plan.available ? (free ? 'Start here' : 'Available') : 'Paused'}</span></div>
          <p className="plan-description">{plan.description}</p>
          <p className="plan-price">{!plan.available && !free && <span className="planned-price">Planned pricing</span>}{formatPlanPrice(plan)}<span>{free ? '' : '/ month'}</span></p>
          <ul>{plan.benefits.map((feature, index) => <li key={index}><Check size={16} aria-hidden="true" />{feature}</li>)}</ul>
          {plan.available ? <Link href={free ? '/auth/signup' : '/auth/signup?next=/dashboard/settings'} className={`button ${free ? 'button-navy' : 'button-outline'}`}>{free ? 'Start for free' : `Explore ${plan.name}`}<ArrowUpRight size={17} aria-hidden="true" /></Link> : <p className="plan-unavailable">{signupOpen ? 'New purchases are not available yet.' : 'New registrations are currently paused.'}</p>}
        </article>
      })}
    </div>
  </>
}
