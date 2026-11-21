export function ScoreCoveragePanel({ value }: { value: unknown }) {
  if (!value || typeof value !== 'object') return null
  const coverage = value as { evaluatedMaximum?: unknown; evaluatedScore?: unknown; missingCategories?: unknown; note?: unknown }
  const missing = Array.isArray(coverage.missingCategories) ? coverage.missingCategories.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : []
  if (!missing.length || typeof coverage.evaluatedMaximum !== 'number' || !Number.isFinite(coverage.evaluatedMaximum) || coverage.evaluatedMaximum < 0 || coverage.evaluatedMaximum > 100 ||
    typeof coverage.evaluatedScore !== 'number' || !Number.isFinite(coverage.evaluatedScore) || coverage.evaluatedScore < 0 || coverage.evaluatedScore > coverage.evaluatedMaximum) return null
  return <section className="mb-8 border-y border-[#E5E7EB] py-5" aria-labelledby="score-coverage-heading"><h2 id="score-coverage-heading" className="text-base font-medium text-[#141923]">This score has incomplete coverage</h2><p className="mt-2 max-w-3xl text-sm leading-7 text-[#536172]">{coverage.evaluatedScore} points came from criteria with a maximum of {coverage.evaluatedMaximum} / 100. {missing.join('; ')} still need review. Unreviewed criteria do not establish that the business failed.</p></section>
}
