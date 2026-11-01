export type UsageSnapshot = {
  period: { start: string; end: string | null }
  updatedAt: string
  validations: { total: number; complete: number; partial: number; failed: number; active: number; tokens: number }
  activity: { action: string; credits: number; transactions: number }[]
  recentJobs: { id: string; ideaName: string; status: string; isLite: boolean; tokensUsed: number; createdAt: string | null }[]
}
