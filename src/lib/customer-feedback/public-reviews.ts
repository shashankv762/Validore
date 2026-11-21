import { parseHTML } from 'linkedom'
import { publicWebUrl, readPublicWeb } from '@/lib/ai/public-web'
import type { SearchResult } from '@/lib/ai/search'
import { cleanFeedbackText, suggestSentiment } from './analysis'
import type { SentimentLabel } from './schema'
import { discoverWordpressReviewFeed, extractWordpressReviewFeed, wordpressReviewTarget } from './wordpress-review-feed'

export type PublicReview = { content: string; rating: number | null; occurredAt: string | null; suggestedSentiment: SentimentLabel; sourceUrl?: string }
export type PublicReviewPage = { source: SearchResult; reviews: PublicReview[]; availableReviewCount: number; extractionCapped: boolean; limitations: string[];
  provenance?: 'public_review_markup' | 'public_review_feed'; countIsLowerBound?: boolean }
const reviewType = (value: unknown) => (Array.isArray(value) ? value : [value]).some(type => typeof type === 'string' && /^(?:(?:https?:\/\/)?schema\.org\/)?Review$/.test(type))
const date = (value: unknown, now: number): string | null => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value)) return null
  const calendar = value.slice(0, 10)
  const midnight = Date.parse(calendar + 'T00:00:00Z')
  if (!Number.isFinite(midnight) || new Date(midnight).toISOString().slice(0, 10) !== calendar) return null
  const parsed = Date.parse(value)
  // A publisher's date-only field has no timezone. Preserve that calendar date
  // rather than inventing midnight UTC or shifting it for the reader.
  return value.length === 10 ? calendar <= new Date(now + 14 * 3_600_000).toISOString().slice(0, 10) ? calendar : null
    : Number.isFinite(parsed) && parsed <= now ? value : null
}
function normalizedRating(value: unknown): number | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const number = (value: unknown, fallback: number) => typeof value === 'number' || typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value) ? Number(value) : fallback
  const rating = number(record.ratingValue, NaN); const best = number(record.bestRating, 5); const worst = number(record.worstRating, 1)
  if (![rating, best, worst].every(Number.isFinite) || best <= worst || rating < worst || rating > best) return null
  return Math.round((1 + 4 * (rating - worst) / (best - worst)) * 100) / 100
}

/** Only explicit Review bodies count as reviews. Aggregate stars, promotional
 * copy and arbitrary extracted paragraphs are never customer observations. */
export function extractPublicReviews(html: string, pageUrl: string, fetchedAt = new Date().toISOString(), max = 20): PublicReviewPage {
  const target = publicWebUrl(pageUrl)
  const { document } = parseHTML(html.slice(0, 1_000_000))
  const now = Date.parse(fetchedAt)
  const reviews = new Map<string, PublicReview>()
  let extractionCapped = false
  let visited = 0
  const add = (body: unknown, rating: unknown, occurred: unknown) => {
    if (typeof body !== 'string') return
    const content = cleanFeedbackText(body)
    if (content.length < 12) return
    const normalized = content.toLowerCase().normalize('NFKC')
    if (reviews.has(normalized)) return
    if (reviews.size >= 200) { extractionCapped = true; return }
    const stars = normalizedRating(rating)
    reviews.set(normalized, { content, rating: stars, occurredAt: date(occurred, now), suggestedSentiment: suggestSentiment(content, stars) })
  }
  const visit = (value: unknown, depth = 0) => {
    if (++visited > 12_000 || depth > 12) { extractionCapped = true; return }
    if (!value || typeof value !== 'object') return
    if (Array.isArray(value)) { if (value.length > 500) extractionCapped = true; for (const child of value.slice(0, 500)) visit(child, depth + 1); return }
    const record = value as Record<string, unknown>
    if (reviewType(record['@type'])) add(record.reviewBody, record.reviewRating, record.datePublished)
    for (const child of Object.values(record)) if (typeof child === 'object') visit(child, depth + 1)
  }
  const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
  if (scripts.length > 30) extractionCapped = true
  for (const script of scripts.slice(0, 30)) {
    const text = script.textContent ?? ''
    if (text.length > 250_000) { extractionCapped = true; continue }
    try { visit(JSON.parse(text)) } catch { /* Invalid structured markup is not review evidence. */ }
  }
  const scoped = Array.from(document.querySelectorAll('[itemscope][itemtype]'))
  if (scoped.length > 500) extractionCapped = true
  for (const element of scoped.slice(0, 500)) {
    if (!reviewType(element.getAttribute('itemtype'))) continue
    const propertyNode = (scope: Element, name: string) => Array.from(scope.querySelectorAll('[itemprop~="' + name + '"]'))
      .find(node => node.parentElement?.closest('[itemscope]') === scope) ?? null
    const property = (scope: Element, name: string) => {
      const node = propertyNode(scope, name)
      return node?.getAttribute('content') ?? node?.getAttribute('datetime') ?? node?.textContent ?? null
    }
    const ratingScope = propertyNode(element, 'reviewRating')
    const ratingOwner = ratingScope?.hasAttribute('itemscope') ? ratingScope : element
    add(property(element, 'reviewBody'), { ratingValue: property(ratingOwner, 'ratingValue'), bestRating: property(ratingOwner, 'bestRating') ?? 5,
      worstRating: property(ratingOwner, 'worstRating') ?? 1 }, property(element, 'datePublished'))
  }
  const selected = [...reviews.values()].slice(0, Math.max(1, Math.min(20, Math.floor(max))))
  const limits = ['These are unique review texts exposed by this page, not a representative sample or verified unique customers.',
    'Review markup does not establish a purchase, an independent reviewer, or demand for your idea. Missing review dates remain unknown.',
    'Only accessible structured review bodies were read; dynamic, login-only or blocked reviews may be missing.']
  if (extractionCapped) limits.push('Extraction reached a bounded scan limit. At least ' + reviews.size + ' unique texts were found; the page may contain more. Only the first ' + selected.length + ' are supplied.')
  else if (reviews.size > selected.length) limits.push('The result is limited to ' + selected.length + ' of ' + reviews.size + ' accessible unique texts in page order.')
  return { reviews: selected, availableReviewCount: reviews.size, extractionCapped, limitations: limits, source: {
    title: (document.title || target.hostname + ' public reviews').slice(0, 250), url: target.href, source: target.hostname,
    fetchedAt, retrievalKind: 'page', dataPeriod: 'Review dates are recorded individually; unknown dates are not inferred.',
    content: JSON.stringify({ kind: 'public_review_markup', reviews: selected.map(item => ({ ...item, content: item.content.slice(0, 600), excerpted: item.content.length > 600 })),
      sampleSize: selected.length, accessibleUniqueTexts: reviews.size, countIsLowerBound: extractionCapped, limitations: limits }),
  } }
}

export async function readPublicReviews(url: string, options: { signal?: AbortSignal; maxReviews?: number } = {}): Promise<PublicReviewPage> {
  const target = publicWebUrl(url).href
  const wordpress = wordpressReviewTarget(target)
  const readFeed = async (feedUrl: string) => {
    const feed = await readPublicWeb(feedUrl, { signal: options.signal, maxBytes: 250_000 })
    const final = wordpressReviewTarget(feed.url)
    if (final?.kind !== 'feed' || final.slug !== wordpress?.slug || !/\b(?:application\/(?:rss\+xml|xml)|text\/xml)\b/i.test(feed.contentType)) throw new Error('The official WordPress review feed is unavailable.')
    const result = extractWordpressReviewFeed(feed.text, feed.url, new Date().toISOString(), options.maxReviews)
    if (!result.reviews.length) throw new Error('No accessible review topics were found in this feed.')
    return result
  }
  if (wordpress?.kind === 'feed') return readFeed(wordpress.feedUrl)
  let page
  try { page = await readPublicWeb(target, { signal: options.signal }) }
  catch (error) { if (wordpress?.kind === 'page') return readFeed(wordpress.feedUrl); throw error }
  if (!/\btext\/html\b/i.test(page.contentType)) throw new Error('A public HTML review page is required.')
  const result = extractPublicReviews(page.text, page.url, new Date().toISOString(), options.maxReviews)
  if (!result.reviews.length && wordpress?.kind === 'page') return readFeed(discoverWordpressReviewFeed(page.text, page.url) ?? wordpress.feedUrl)
  if (!result.reviews.length) throw new Error('No accessible structured reviews found. Paste individual review excerpts with their source instead.')
  return result
}
