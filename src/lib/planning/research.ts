import { createAgentToolkit } from '@/lib/ai/agent-tools'
import { type SearchResult } from '@/lib/ai/search'

/** Read only URLs already discovered by the public-safe research query. This
 * shares the run's HTTP allowance and leaves failed reads as explicit snippets. */
export async function readPlanningOriginals(sources: SearchResult[], budgetId: string) {
  const toolkit = createAgentToolkit('competitor', sources, budgetId)
  const candidates = sources.filter(source => !['page', 'open-data'].includes(source.retrievalKind ?? '')).slice(0, 2)
  for (const [index, source] of candidates.entries()) {
    await toolkit.tools.read_page.execute?.({ url: source.url }, { toolCallId: 'planning-original-' + index, messages: [], context: {}, abortSignal: AbortSignal.timeout(12_000) })
  }
  return { sources: toolkit.sources(), events: toolkit.events }
}
