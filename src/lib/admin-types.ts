import type { PlanTier } from './plans'

export type AccountStatus = 'active' | 'blocked' | 'deactivated'
export type AdminCreditType = 'general' | 'crowdfunding' | 'pitch_deck'
export type AdminAccountAction = 'block' | 'unblock' | 'deactivate' | 'reactivate'
export type AdminUser = {
  id: string
  email: string
  tier: PlanTier
  accountStatus: AccountStatus
  isAdmin: boolean
  statusReason: string | null
  statusChangedAt: string | null
  subscriptionStatus: string | null
  createdAt: string | null
  lastActiveAt: string | null
  creditBalance: number
  purchasedCredits: number
  rewardCredits: number
  crowdfundingCredits: number
  pitchDeckCredits: number
}
export type AdminAuditEntry = {
  id: string
  action: string
  actorEmail: string | null
  targetEmail: string | null
  reason: string
  createdAt: string
  details: Record<string, unknown> | null
}
export type AdminLedgerEntry = {
  id: string
  transactionType: string
  amount: number
  description: string | null
  createdAt: string
}
export type AdminOverview = {
  updatedAt: string
  users: { total: number; active: number; blocked: number; deactivated: number; newThisWeek: number }
  activity: { ideas: number; reports: number; activeJobs: number; failedJobs: number; creditsGranted: number }
  recentActivity: AdminAuditEntry[]
}
export type AdminPage<T> = { total: number; page: number; pageSize: number; totalPages: number } & T
export type AdminUsersResponse = AdminPage<{ users: AdminUser[] }>
export type AdminAuditResponse = AdminPage<{ entries: AdminAuditEntry[] }>
export type AdminUserDetail = {
  user: AdminUser
  stats: { ideas: number; reports: number; validations: number }
  recentCredits: AdminLedgerEntry[]
  recentActivity: AdminAuditEntry[]
}
export type AdminSettings = {
  announcement: { enabled: boolean; message: string }
  maintenance: { enabled: boolean; message: string }
  signupEnabled: boolean
}
export type AdminSettingsResponse = { settings: AdminSettings; updatedAt: string | null }
export type AdminPlan = {
  tier: PlanTier
  name: string
  monthlyPriceUsd: number
  monthlyCredits: number
  validationLimit: number
  activeIdeaLimit: number
  benefits: string[]
  stripePriceId: string | null
  advertised: boolean
  maxConcurrentRequests: number
  maxTokensPerCall: number
  canExportPdf: boolean
  canExportCsv: boolean
  canExportPptx: boolean
  canWhitelabelPdf: boolean
  canPortfolioExport: boolean
  canLeanCanvas: boolean
  canAiLeanCanvas: boolean
  canPricingSimulator: boolean
  canCrowdfunding: boolean
  canPitchDeck: boolean
}
export type AdminPlansResponse = { plans: AdminPlan[] }
export type AdminCreditGrant = { userIds: string[]; type: AdminCreditType; amount: number; reason: string; requestId: string }
