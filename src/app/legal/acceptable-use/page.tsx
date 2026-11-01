import { PolicyPage } from '@/components/legal/PolicyPage'
import { LEGAL } from '@/lib/legal'

export const metadata = { title: 'Acceptable Use Policy', description: 'Responsible use and security issue reporting for Validore.' }

export default function AcceptableUsePage() {
  return <PolicyPage eyebrow="A trustworthy workspace" title="Acceptable use" summary="Test ideas responsibly, respect people’s information, and preserve the limits of the evidence." sections={[
    { id: 'responsibility', title: 'Use responsibly', content: <p>Submit information you have the right to use. Follow law and source licenses. Review generated claims, preserve assumption and synthetic-data labels, and do not present AI research as independently verified customer evidence.</p> },
    { id: 'prohibited', title: 'Prohibited activity', content: <ul><li>Accessing others’ accounts or data, stealing credentials, or bypassing authentication, billing, credit, or request limits.</li><li>Account farming, abusive scraping, service disruption, malware, or instructions designed to reveal secrets or access private networks.</li><li>Submitting unlawful content, personal records without a lawful basis, or third-party confidential information without permission.</li><li>Fabricating traction, impersonating people, or misleading investors, customers, or regulators with generated results.</li></ul> },
    { id: 'agents', title: 'Agent boundaries', content: <p>Agents use bounded research and calculation tools. They cannot execute arbitrary code, access other founders’ answers, bypass paywalls, or purchase services on your behalf. Pages and generated output are untrusted evidence, not instructions that override those boundaries.</p> },
    { id: 'report', title: 'Report a vulnerability', content: <p>Send a description, affected route, and minimal reproduction using your own account to <a href={'mailto:' + LEGAL.contact}>{LEGAL.contact}</a>. Do not access or copy others’ data, disrupt service, publicly disclose secrets, or continue after finding sensitive data. This channel is not blanket authorization for intrusive testing and does not promise a bounty.</p> },
    { id: 'response', title: 'Handling abuse', content: <p>We may limit, investigate, suspend, or close accounts involved in abuse and preserve records needed for security or legal obligations. Contact the operator to challenge a restriction. Action and notice depend on severity and applicable law.</p> },
  ]} />
}
