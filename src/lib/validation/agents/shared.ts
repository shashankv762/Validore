import type { SearchResult } from '@/lib/ai/search'
import type { HandoffAudit, ScoreSummary } from './handoffs'
import type { PlanningBasis } from '../schemas'
import type { UnitAssumptions } from '@/lib/financial'

// Shared helpers for the validation agents. Keep this module dependency-free
// apart from the search type so the agent layer stays easy to test.

export function today(asOfDate?: string): string {
  return asOfDate ?? new Date().toISOString().split('T')[0]
}

export type AgentOpts = {
  asOfDate?: string
  privateContext?: string
  customOpenRouterKey?: string | null
  preferredAiProvider?: string | null
  maxTokensPerCall?: number
  sources?: SearchResult[]
  researchBudgetId?: string
  reuseResearch?: boolean
  /** The product and growth specialists completed validated plans. */
  reviewCompletedPlans?: boolean
  synthesisHandoffAudit?: HandoffAudit
  scoreSummary?: ScoreSummary
  financeAssumptions?: UnitAssumptions
  planningBasis?: PlanningBasis
}

export type AgentSearchCtx = {
  results: SearchResult[]
  degraded: boolean
}
