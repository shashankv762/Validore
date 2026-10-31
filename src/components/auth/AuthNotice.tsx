export default function AuthNotice({ error, message }: { error?: string | string[]; message?: string | string[] }) {
  const problem = error === 'auth_callback_failed'
    ? 'Your sign-in link could not be verified. It may have expired or been opened in a different browser. Sign in again or request a new link.'
    : typeof error === 'string' ? error.slice(0, 300) : ''
  const info = typeof message === 'string' ? message.slice(0, 300) : ''
  if (!problem && !info) return null
  return <div className="mb-5 rounded-lg border border-[#B8963E] bg-[#F5F0E8] p-4 text-sm text-[#0A1628]" role={problem ? 'alert' : 'status'}>{problem || info}</div>
}
