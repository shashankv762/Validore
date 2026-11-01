import { deduplicateSources, type SearchResult } from './search'
import type { AgentRole } from './roles'

const ROLE_TERMS: Record<AgentRole, string> = {
  market: 'market segment demand population economy industry growth', customer: 'customer problem interview need behaviour willingness pay',
  competitor: 'competitor alternative product feature price pricing subscription', finance: 'revenue cost margin acquisition price financial',
  risk: 'risk regulation law safety constraint failure', evidence: 'source data methodology survey evidence sample',
  product: 'product feature problem solution customer alternative', growth: 'growth channel acquisition conversion experiment customer',
  synthesis: 'market customer competitor financial risk evidence',
}
const STOP = new Set('the and for that this with from have will your are not use can must into return only report data source sources'.split(' '))
const terms = (text: string) => new Set((text.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []).filter(value => !STOP.has(value)))

export function compactEvidence(sources: SearchResult[], query: string, role: AgentRole = 'synthesis', maxCharacters = 12_000): string {
  if (!Number.isFinite(maxCharacters) || maxCharacters < 2) return '[]'
  const budget = Math.min(20_000, Math.floor(maxCharacters))
  const keywords = terms(query.slice(0, 8000) + ' ' + ROLE_TERMS[role])
  const ranked = deduplicateSources(sources.slice(0, 80)).map(source => {
    const found = terms(source.title + ' ' + source.content.slice(0, 4000))
    return { source, score: [...keywords].filter(term => found.has(term)).length + (source.retrievalKind === 'page' ? 2 : 0) }
  }).sort((a, b) => b.score - a.score)
  const domains = new Map<string, number>()
  const output: SearchResult[] = []
  for (const { source } of [...ranked.filter(item => { const first = !domains.has(item.source.source); domains.set(item.source.source, 1); return first }), ...ranked]) {
    if (output.length >= 12 || output.some(item => item.url === source.url)) continue
    const sentences = source.content.match(/[^.!?\n]+[.!?\n]?/g) ?? [source.content]
    const relevant = sentences.map((text, index) => ({ text, index, score: [...terms(text)].filter(term => keywords.has(term)).length }))
      .sort((a, b) => b.score - a.score || a.index - b.index).slice(0, 4).sort((a, b) => a.index - b.index)
    const item = { ...source, content: source.retrievalKind === 'memory' ? source.content : relevant.map(part => part.text).join(' ').slice(0, 1200) }
    // Omit a memory that will not fit rather than stripping its geographic or
    // historical limitations from an otherwise precise-looking statistic.
    while (source.retrievalKind !== 'memory' && item.content.length > 80 && JSON.stringify([...output, item]).length > budget) item.content = item.content.slice(0, Math.floor(item.content.length * 0.7))
    if (JSON.stringify([...output, item]).length <= budget) output.push(item)
  }
  return JSON.stringify(output)
}
