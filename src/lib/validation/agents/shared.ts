import type { SearchResult } from '@/lib/ai/search'

// Shared helpers for the validation agents. Keep this module dependency-free
// apart from the search type so the agent layer stays easy to test.

export function today(): string {
  return new Date().toISOString().split('T')[0]
}

export type AgentOpts = {
  customOpenRouterKey?: string | null
  preferredAiProvider?: string | null
}

export type AgentSearchCtx = {
  results: SearchResult[]
  degraded: boolean
}
