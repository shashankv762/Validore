export const EXPORT_SECTIONS = ['ideas', 'interviews', 'reports', 'canvases', 'pricing', 'crowdfunding', 'pitchDecks', 'jobs', 'creditLedger', 'purchases', 'devices', 'adRewards'] as const
export type ExportSection = typeof EXPORT_SECTIONS[number]

// Explicit allowlist: authentication identifiers, encrypted API keys and billing
// credentials are not part of a portable account-profile response.
export function exportableProfile(user: { id: string; email: string; tier: string; createdAt: Date | null; creditBalance: number; purchasedCredits: number; rewardCredits?: number; preferredAiProvider: string | null }) {
  return { id: user.id, email: user.email, tier: user.tier, createdAt: user.createdAt,
    creditBalance: user.creditBalance, purchasedCredits: user.purchasedCredits, rewardCredits: user.rewardCredits ?? 0, preferredAiProvider: user.preferredAiProvider }
}
