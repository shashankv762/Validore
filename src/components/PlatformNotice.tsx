import { connection } from 'next/server'
import { getPlatformSettings } from '@/lib/platform-settings'

/** Render plain text; owner announcements never become executable HTML. */
export async function PlatformNotice() {
  await connection()
  const settings = await getPlatformSettings()
  const messages = [
    ...(settings.announcementEnabled && settings.announcement ? [settings.announcement] : []),
    ...(settings.maintenanceEnabled ? [settings.maintenanceMessage || 'Validore is undergoing maintenance. Please try again shortly.'] : []),
  ]
  if (!messages.length) return null
  return <aside aria-label="Platform updates" role="status" className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-center text-sm text-slate-900">
    {messages.map((message, index) => <p key={index} className="mx-auto max-w-5xl whitespace-pre-wrap break-words">{message}</p>)}
  </aside>
}
