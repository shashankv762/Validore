import Link from 'next/link'
import { PolicyPage } from '@/components/legal/PolicyPage'
import { LEGAL } from '@/lib/legal'

export const metadata = { title: 'Refund Policy', description: 'Cancellation, payment refunds, and failed-analysis credit returns.' }

export default function RefundPage() {
  return <PolicyPage eyebrow="Billing, without surprises" title="Refunds & cancellation" summary="Returning app credits after a failed analysis is different from refunding a payment. Here is how each works." sections={[
    { id: 'first', title: 'First subscription payment', content: <p>Request a refund of your first subscription payment within 30 days if you completed three or fewer validation runs, or used no more than 20% of the plan’s monthly validation allowance. Support checks purchase and usage records. Mandatory legal rights still apply when these voluntary conditions do not.</p> },
    { id: 'packs', title: 'Purchased credit packs', content: <p>Completely unused packs can be refunded within 30 days. Consumed credits are generally not refundable under this voluntary policy, subject to mandatory rights and billing errors. Credits cannot otherwise be redeemed for cash.</p> },
    { id: 'failures', title: 'Failed and partial analysis', content: <><p>If a validation fails without a saved report, reserved app credits return when the failure is recorded or recovered by maintenance. This is not a card refund. Check your ledger and contact support if the balance is missing.</p><p>A report with marked missing sections or weak evidence is a partial result and may consume credits. Contact support with its reference if a technical fault made it unusable. A cautious recommendation or lack of evidence is not itself a service failure.</p></> },
    { id: 'renewal', title: 'Renewals and cancellation', content: <p>Request a refund of an unintended renewal within 72 hours if there was no usage after renewal. Cancel in <Link href="/dashboard/settings">Settings</Link> to stop future renewals; access normally continues to period end. Cancellation does not automatically refund earlier charges. Partial-month refunds are not normally offered except where required by law.</p> },
    { id: 'request', title: 'Request a refund', content: <p>Email <a href={'mailto:' + LEGAL.contact}>{LEGAL.contact}</a> from your account address with purchase date, payment reference, and a short explanation. Do not send full card numbers, passwords, or API keys. The operator reviews requests; contacting support does not automatically approve or issue a refund.</p> },
    { id: 'timing', title: 'Timing and statutory rights', content: <><p>Approved refunds are submitted to the original payment method. Provider and bank settlement commonly takes 5–10 business days. Report duplicate or incorrect charges promptly.</p><p>Mandatory consumer rights take priority over this voluntary policy. Any required checkout disclosures or consent for immediate digital-service delivery must be provided before payment.</p></> },
  ]} />
}
