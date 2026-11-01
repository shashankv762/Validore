// Change the version whenever the terms or processing notice materially changes.
export const LEGAL = {
  operator: 'Shashank V',
  country: 'India',
  contact: 'aegixchainai@gmail.com',
  version: '2026-11-01',
  updated: '1 November 2026',
} as const

export const COOKIE_NOTICE_KEY = 'validore:essential-notice:v1'
export const COOKIE_NOTICE_DAYS = 180
export const COOKIE_NOTICE_EVENT = 'validore:cookie-settings'

export function isCurrentCookieNotice(value: unknown, now = Date.now()): boolean {
  if (!value || typeof value !== 'object') return false
  const notice = value as { version?: unknown; acknowledgedAt?: unknown }
  const date = typeof notice.acknowledgedAt === 'string' ? Date.parse(notice.acknowledgedAt) : NaN
  return notice.version === LEGAL.version && Number.isFinite(date) && date <= now && now - date < COOKIE_NOTICE_DAYS * 86_400_000
}
