import { DOMParser, parseHTML } from 'linkedom'
import { publicWebUrl } from '@/lib/ai/public-web'
import { cleanFeedbackText, suggestSentiment } from './analysis'
import type { PublicReview, PublicReviewPage } from './public-reviews'

const MAX_FEED_CHARACTERS = 250_000
const MAX_ITEMS = 200
type WordPressReviewTarget = { slug: string; kind: 'page' | 'feed'; pageUrl: string; feedUrl: string }

/** Only the official plugin-review directory and its exact review RSS route. */
export function wordpressReviewTarget(value: string): WordPressReviewTarget | null {
  let target: URL
  try { target = publicWebUrl(value) } catch { return null }
  if (target.protocol !== 'https:' || target.hostname !== 'wordpress.org' || target.search) return null
  const match = /^\/support\/plugin\/([a-z0-9]+(?:-[a-z0-9]+)*)\/reviews(\/feed)?\/?$/.exec(target.pathname)
  if (!match || match[1].length > 80) return null
  const pageUrl = `https://wordpress.org/support/plugin/${match[1]}/reviews/`
  return { slug: match[1], kind: match[2] ? 'feed' : 'page', pageUrl, feedUrl: pageUrl + 'feed/' }
}

export function discoverWordpressReviewFeed(html: string, pageUrl: string): string | null {
  const page = wordpressReviewTarget(pageUrl)
  if (!page || page.kind !== 'page') return null
  const { document } = parseHTML(html.slice(0, 1_000_000))
  for (const link of Array.from(document.querySelectorAll('link[rel~="alternate"][href]')).slice(0, 30)) {
    if (!/^application\/rss\+xml(?:\s*;|$)/i.test(link.getAttribute('type') ?? '')) continue
    let href: string
    try { href = new URL(link.getAttribute('href')!, pageUrl).href } catch { continue }
    const feed = wordpressReviewTarget(href)
    if (feed?.kind === 'feed' && feed.slug === page.slug) return feed.feedUrl
  }
  return null
}

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** RFC-822 dates retain their stated offset and second/minute precision. */
export function wordpressPublicationDate(value: string, now: number): string | null {
  const match = /^(?:[a-z]{3},\s*)?(\d{1,2})\s+([a-z]{3})\s+(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?\s+([+-]\d{4}|GMT|UTC|UT)$/i.exec(value.trim())
  if (!match) return null
  const month = months.findIndex(name => name.toLowerCase() === match[2].toLowerCase()) + 1
  const day = Number(match[1]); const year = Number(match[3]); const hour = Number(match[4]); const minute = Number(match[5]); const second = Number(match[6] ?? 0)
  if (!month || day < 1 || hour > 23 || minute > 59 || second > 59) return null
  const calendar = `${match[3]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  const calendarTime = Date.parse(calendar + 'T00:00:00Z')
  if (!Number.isFinite(calendarTime) || new Date(calendarTime).getUTCFullYear() !== year || new Date(calendarTime).toISOString().slice(0, 10) !== calendar) return null
  const rawOffset = /^[+-]/.test(match[7]) ? match[7] : '+0000'
  const offsetHour = Number(rawOffset.slice(1, 3)); const offsetMinute = Number(rawOffset.slice(3, 5))
  if (offsetHour > 14 || offsetMinute > 59 || (offsetHour === 14 && offsetMinute !== 0)) return null
  const offset = rawOffset.slice(0, 3) + ':' + rawOffset.slice(3)
  const timestamp = `${calendar}T${match[4]}:${match[5]}${match[6] === undefined ? '' : ':' + match[6]}${offset}`
  const parsed = Date.parse(timestamp)
  return Number.isFinite(parsed) && parsed <= now ? timestamp : null
}

function topicUrl(value: string): string | null {
  try {
    const url = new URL(value)
    if (url.hash || url.search || url.protocol !== 'https:' || url.hostname !== 'wordpress.org' || !/^\/support\/topic\/[^/]+\/$/.test(url.pathname) || /%2f|%5c/i.test(url.pathname)) return null
    return publicWebUrl(url.href).href
  } catch { return null }
}
const systemNotice = /^(?:moderator(?:'s)?\s+note\s*:|moderation\s+notice\s*:|system\s+notice\s*:|this\s+topic\s+(?:was|has\s+been)\s+(?:closed|deleted|removed))/i
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function reviewBody(html: string, title: string, author: string): { content: string; rating: number | null } | null {
  const { document } = parseHTML('<html><body>' + html + '</body></html>')
  const body = document.body
  if (!body || Array.from(body.querySelectorAll('.bbp-author-role,[data-author-role]')).some(node => /moderator|keymaster|administrator/i.test(node.textContent + ' ' + node.getAttribute('data-author-role')))) return null
  const stars = /\((\d+(?:\.\d+)?)\s+stars?\)\s*$/i.exec(title)?.[1]
  let invalidRating = Boolean(stars && !/^[1-5]$/.test(stars))
  const ratings: number[] = stars && !invalidRating ? [Number(stars)] : []
  // bbPress puts Replies/Rating metadata before the actual topic body. Text
  // elsewhere that merely says "five stars" is not a published rating field.
  for (const node of Array.from(body.children).slice(0, 3)) {
    const text = (node.textContent ?? '').replace(/\s+/g, ' ').trim()
    if (node.tagName.toLowerCase() !== 'p' || node.hasAttribute('class') || node.hasAttribute('id')) break
    if (/^Replies:\s*\d+$/i.test(text)) { node.remove(); continue }
    const rating = /^Rating:\s*(\d+(?:\.\d+)?)\s+stars?$/i.exec(text)
    if (rating) { if (/^[1-5]$/.test(rating[1])) ratings.push(Number(rating[1])); else invalidRating = true; node.remove(); continue }
    break
  }
  for (const node of Array.from(body.querySelectorAll('script,style,noscript,template,iframe,form,svg,.bbp-topic-revision-log,.bbp-reply-revision-log,.bbp-template-notice,.bbp-meta,.bbp-author-link,.bbp-author-name,.bbp-author-role,[rel~="author"]'))) node.remove()
  for (const node of Array.from(body.querySelectorAll('a[href]'))) {
    try { if (new URL(node.getAttribute('href')!, 'https://wordpress.org').pathname.startsWith('/support/users/')) node.remove() } catch { /* No link is fetched. */ }
  }
  for (const node of Array.from(body.querySelectorAll('p,li,blockquote,br'))) node.appendChild(document.createTextNode(' '))
  let content = cleanFeedbackText(body.textContent ?? '')
  if (systemNotice.test(content)) return null
  const identity = author.replace(/\s+/g, ' ').trim().slice(0, 120)
  if (identity) content = content.replace(new RegExp('(^|[^\\p{L}\\p{N}_])' + escapeRegex(identity) + '(?=$|[^\\p{L}\\p{N}_])', 'giu'), '$1[name removed]')
  content = content.replace(/\s+/g, ' ').trim()
  if (content.replace(/\[(?:name|email|phone|credential) removed\]/gi, '').trim().length < 3 || systemNotice.test(content)) return null
  return { content, rating: !invalidRating && ratings.length && ratings.every(value => value === ratings[0]) ? ratings[0] : null }
}

/** Parse only official review-topic items; comments, profiles and arbitrary
 * RSS/blog paragraphs never enter the customer-evidence notebook. */
export function extractWordpressReviewFeed(xml: string, feedUrl: string, fetchedAt = new Date().toISOString(), max = 20): PublicReviewPage {
  const target = wordpressReviewTarget(feedUrl)
  if (!target || target.kind !== 'feed') throw new Error('An official WordPress.org plugin review feed is required.')
  if (xml.length > MAX_FEED_CHARACTERS || /<!DOCTYPE|<!ENTITY/i.test(xml) || !/<\/rss>\s*$/i.test(xml)) throw new Error('The review feed is oversized or has unsupported XML declarations.')
  const document = new DOMParser().parseFromString(xml, 'text/xml')
  const root = document.documentElement as unknown as Element
  const channel = Array.from(root?.children ?? []).find(node => node.tagName.toLowerCase() === 'channel')
  if (root?.tagName.toLowerCase() !== 'rss' || root.getAttribute('version') !== '2.0' || !channel) throw new Error('A WordPress review RSS 2.0 channel is required.')
  const direct = (node: Element, name: string) => Array.from(node.children).find(child => child.tagName.toLowerCase() === name.toLowerCase())
  const self = Array.from(channel.children).find(node => node.tagName.toLowerCase() === 'atom:link' && node.getAttribute('rel') === 'self')
  const selfTarget = self?.getAttribute('href') ? wordpressReviewTarget(self.getAttribute('href')!) : null
  const channelTitle = direct(channel, 'title')?.textContent ?? ''
  if (selfTarget?.kind !== 'feed' || selfTarget.slug !== target.slug || !/^WordPress\.org Forums.*\bReviews\b/i.test(channelTitle)) throw new Error('Feed identity does not match the requested plugin reviews.')
  const items = Array.from(channel.children).filter(node => node.tagName.toLowerCase() === 'item')
  const reviews = new Map<string, PublicReview>()
  const seenTopics = new Set<string>()
  let eligibleTopicItems = 0
  for (const item of items.slice(0, MAX_ITEMS)) {
    const title = direct(item, 'title')?.textContent ?? ''
    if (/^\s*(?:re\s*:|reply\s+to\s*:|comment\s+on\s*:)/i.test(title) || systemNotice.test(title)) continue
    const sourceUrl = topicUrl((direct(item, 'link')?.textContent ?? '').trim())
    if (!sourceUrl || seenTopics.has(sourceUrl)) continue
    const guid = (direct(item, 'guid')?.textContent ?? '').trim()
    if (guid && /^https?:/i.test(guid) && topicUrl(guid) !== sourceUrl) continue
    const description = direct(item, 'description')?.textContent ?? direct(item, 'content:encoded')?.textContent ?? ''
    const parsed = reviewBody(description, title, direct(item, 'dc:creator')?.textContent ?? '')
    if (!parsed) continue
    seenTopics.add(sourceUrl); eligibleTopicItems++
    const key = parsed.content.toLowerCase().normalize('NFKC')
    if (reviews.has(key)) continue
    reviews.set(key, { ...parsed, sourceUrl, occurredAt: wordpressPublicationDate(direct(item, 'pubDate')?.textContent ?? '', Date.parse(fetchedAt)),
      suggestedSentiment: suggestSentiment(parsed.content, parsed.rating) })
  }
  const limit = Math.max(1, Math.min(20, Number.isFinite(max) ? Math.floor(max) : 20))
  const selected = [...reviews.values()].slice(0, limit)
  const extractionCapped = items.length > MAX_ITEMS
  const limitations = [
    `This single publisher-limited WordPress review feed exposes ${items.length} items; ${eligibleTopicItems} review-topic items and ${reviews.size} unique cleaned texts qualified. Only the first ${selected.length} are supplied (limit ${limit}).`,
    'The feed can omit older, removed or unavailable reviews. These counts describe this selected feed, not all plugin reviews or verified unique customers.',
    'Replies, moderator/system notices, revision logs, author identities and profile links are excluded. At least three characters of review text must remain after privacy removal. Ratings stay unknown unless explicit published star metadata agrees; missing/invalid dates remain unknown.',
    'Public reviews of an existing plugin do not prove a purchase, an independent reviewer or demand for your startup. Exact quotes must refer to the imported, anonymized record text.',
  ]
  if (extractionCapped) limitations.push('The scan stopped after ' + MAX_ITEMS + ' feed items; the qualified count is a lower bound.')
  return { reviews: selected, provenance: 'public_review_feed', availableReviewCount: reviews.size, extractionCapped,
    countIsLowerBound: true, limitations, source: { title: channelTitle.slice(0, 250), url: target.feedUrl, source: 'wordpress.org', fetchedAt,
      retrievalKind: 'page', dataPeriod: 'Individual review publication dates; unknown dates are not inferred.',
      content: JSON.stringify({ kind: 'public_review_feed', provider: 'WordPress.org review RSS', sourceUrl: target.feedUrl, reviewPageUrl: target.pageUrl,
        feedItems: items.length, eligibleTopicItems, sampleSize: selected.length, accessibleUniqueTexts: reviews.size,
        countScope: 'One publisher-limited RSS feed, not the plugin review population', countIsLowerBound: true, limitations,
        reviews: selected.map(review => ({ ...review, content: review.content.slice(0, 600), excerpted: review.content.length > 600 })) }) } }
}
