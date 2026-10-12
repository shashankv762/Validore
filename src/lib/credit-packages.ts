export const CREDIT_PACKAGES = {
  crowdfunding: {
    name: 'Crowdfunding Analysis Pack',
    description: '1 Comprehensive Campaign Feasibility Analysis & Synthetic Benchmark Credit',
    amountUsd: 49,
    amountInr: 3999,
    credits: { crowdfunding: 1, pitchDeck: 0 },
  },
  pitch_deck: {
    name: 'Pitch Deck Generator Pack',
    description: '1 Institutional 12-Slide Investor Pitch Deck Credit with PPTX Export',
    amountUsd: 49,
    amountInr: 3999,
    credits: { crowdfunding: 0, pitchDeck: 1 },
  },
  bundle: {
    name: 'Founder Bundle',
    description: '1 Crowdfunding Credit + 1 Pitch Deck Credit (Best Value Kit)',
    amountUsd: 79,
    amountInr: 5999,
    credits: { crowdfunding: 1, pitchDeck: 1 },
  },
  credit_topup: {
    name: 'Credit Top-Up Pack',
    description: '2,000 Universal AI Credits (Never Expire)',
    amountUsd: 49,
    amountInr: 3999,
    credits: { crowdfunding: 0, pitchDeck: 0, universalCredits: 2000 },
  },
} as const

export type CreditPackageType = keyof typeof CREDIT_PACKAGES

