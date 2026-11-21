import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ read: vi.fn() }))
vi.mock('@/lib/ai/public-web', async importOriginal => ({ ...await importOriginal<typeof import('@/lib/ai/public-web')>(), readPublicWeb: mocks.read }))
import { extractWordpressReviewFeed, discoverWordpressReviewFeed, wordpressPublicationDate, wordpressReviewTarget } from '@/lib/customer-feedback/wordpress-review-feed'
import { readPublicReviews } from '@/lib/customer-feedback/public-reviews'

const pageUrl = 'https://wordpress.org/support/plugin/woocommerce/reviews/'
const feedUrl = pageUrl + 'feed/'
const fetchedAt = '2026-11-15T12:00:00Z'
const topic = (slug: string) => `https://wordpress.org/support/topic/${slug}/`
const item = (index: number, options: { title?: string; link?: string; body?: string; date?: string; creator?: string } = {}) => {
  const link = options.link ?? topic('review-' + index)
  return `<item><title>${options.title ?? 'Useful review (5 stars)'}</title><link>${link}</link><guid>${link}</guid><pubDate>${options.date ?? 'Fri, 13 Nov 2026 23:30:10 -0500'}</pubDate><dc:creator>${options.creator ?? 'Unique Reviewer Identity'}</dc:creator><description><![CDATA[${options.body ?? '<p>Replies: 1</p><p>Rating: 5 stars</p><p>This plugin is easy to use but support is slow. Review ' + index + '.</p>'}]]></description></item>`
}
const feed = (items: string, self = feedUrl) => `<?xml version="1.0"?><rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>WordPress.org Forums - [WooCommerce] Reviews</title><atom:link href="${self}" rel="self" type="application/rss+xml"/>${items}</channel></rss>`
const response = (text: string, url = feedUrl, contentType = 'application/rss+xml') => ({ text, url, contentType, status: 200 })
beforeEach(() => mocks.read.mockReset())

describe('Explicit WordPress review-topic RSS extraction', () => {
  it('retains topic attribution, explicit rating and publication offset while removing identities and forum metadata', () => {
    const value = extractWordpressReviewFeed(feed(item(1, { body: '<p>Replies: 1</p><p>Rating: 5 stars</p><p>This plugin is easy to use but support is slow.</p><ul class="bbp-topic-revision-log"><li>This topic was modified by <a class="bbp-author-link" href="https://wordpress.org/support/users/hidden/">Unique Reviewer Identity</a>.</li></ul><p>Signed, Unique Reviewer Identity</p><p>Contact person@example.org for details.</p>' })), feedUrl, fetchedAt)
    expect(value.provenance).toBe('public_review_feed')
    expect(value.reviews).toHaveLength(1)
    expect(value.reviews[0]).toMatchObject({ sourceUrl: topic('review-1'), rating: 5, suggestedSentiment: 'mixed', occurredAt: '2026-11-13T23:30:10-05:00' })
    expect(Date.parse(value.reviews[0].occurredAt!)).toBe(Date.parse('2026-11-14T04:30:10Z'))
    const saved = JSON.stringify(value)
    for (const removed of ['Unique Reviewer Identity', '/support/users/', 'person@example.org', 'Replies:', 'Rating:', 'This topic was modified', 'dc:creator']) expect(saved).not.toContain(removed)
    expect(saved).toContain('[email removed]')
    expect(JSON.parse(value.source.content)).toMatchObject({ kind: 'public_review_feed', feedItems: 1, sampleSize: 1, countIsLowerBound: true })
  })

  it('excludes replies, moderator/system notices, unrelated paths and profile links from the review count', () => {
    const items = [item(1), item(2, { title: 'Re: Useful review (5 stars)' }), item(3, { link: topic('review-3') + '#post-123' }),
      item(4, { body: '<span class="bbp-author-role">Moderator</span><p>Please do not open duplicate topics.</p>' }),
      item(5, { title: 'Moderator note: topic closed', body: '<p>Moderator note: this topic is closed.</p>' }),
      item(6, { body: '<div class="bbp-template-notice">This topic has been closed by the system.</div>' }),
      item(7, { link: 'https://wordpress.org/news/a-blog-post/' }), item(8, { link: 'https://attacker.example/review/' })].join('')
    const value = extractWordpressReviewFeed(feed(items), feedUrl, fetchedAt)
    expect(value.availableReviewCount).toBe(1)
    expect(value.reviews).toHaveLength(1)
    expect(JSON.parse(value.source.content)).toMatchObject({ feedItems: 8, eligibleTopicItems: 1 })
  })

  it('does not infer ratings from prose and treats conflicting or invalid star metadata as unknown', () => {
    const value = extractWordpressReviewFeed(feed([
      item(1, { title: 'A detailed review', body: '<p>I would personally give this plugin four stars for its useful features.</p>' }),
      item(2, { body: '<p>Rating: 1 star</p><p>The documentation is useful but the setup is difficult.</p>' }),
      item(3, { body: '<p>Rating: 9 stars</p><p>The interface is reliable and easy to use in this example.</p>' }),
    ].join('')), feedUrl, fetchedAt)
    expect(value.reviews.map(review => review.rating)).toEqual([null, null, null])
    expect(value.reviews[2].content).not.toContain('Rating:')
  })
  it('accepts genuine concise review text but excludes a body containing only an author identity', () => {
    const value = extractWordpressReviewFeed(feed(item(1, { body: '<p>Good</p>' }) + item(2, { body: '<p>Unique Reviewer Identity</p>' })), feedUrl, fetchedAt)
    expect(value.reviews).toHaveLength(1)
    expect(value.reviews[0]).toMatchObject({ content: 'Good', rating: 5 })
    expect(JSON.stringify(value)).not.toContain('Unique Reviewer Identity')
  })

  it('deduplicates topics/texts, bounds supplied reviews and discloses the feed and scan limits', () => {
    const items = Array.from({ length: 205 }, (_, index) => item(index)).join('')
    const value = extractWordpressReviewFeed(feed(items), feedUrl, fetchedAt, 50)
    expect(value.reviews).toHaveLength(20)
    expect(value.availableReviewCount).toBe(200)
    expect(value.extractionCapped).toBe(true)
    expect(value.limitations.join(' ')).toContain('publisher-limited')
    expect(value.limitations.join(' ')).toContain('stopped after 200')
    expect(extractWordpressReviewFeed(feed(item(1) + item(1)), feedUrl, fetchedAt).availableReviewCount).toBe(1)
  })

  it('preserves timestamp precision and rejects impossible, future and timezone-free publication dates', () => {
    const now = Date.parse(fetchedAt)
    expect(wordpressPublicationDate('Sat, 14 Nov 2026 09:03:22 +0530', now)).toBe('2026-11-14T09:03:22+05:30')
    expect(wordpressPublicationDate('Sat, 14 Nov 2026 09:03 GMT', now)).toBe('2026-11-14T09:03+00:00')
    for (const value of ['Tue, 31 Feb 2026 10:00:00 +0000', 'Tue, 10 Nov 2026 10:00:00 +1499', 'Tue, 10 Nov 2026 10:00:00', '2026-11-14', 'Tue, 10 Nov 2027 10:00:00 +0000']) expect(wordpressPublicationDate(value, now)).toBeNull()
  })

  it('rejects arbitrary/blog feeds, mismatched plugin identity, external XML entities and truncated XML', () => {
    for (const url of ['https://wordpress.org/news/feed/', 'https://wordpress.org/support/plugin/woocommerce/feed/', 'https://wordpress.org.attacker.example/support/plugin/woocommerce/reviews/feed/']) expect(wordpressReviewTarget(url)).toBeNull()
    expect(() => extractWordpressReviewFeed(feed(item(1), 'https://wordpress.org/support/plugin/other-plugin/reviews/feed/'), feedUrl, fetchedAt)).toThrow('identity')
    expect(() => extractWordpressReviewFeed('<!DOCTYPE rss [<!ENTITY value SYSTEM "file:///private">]>' + feed(item(1)), feedUrl, fetchedAt)).toThrow('XML declarations')
    expect(() => extractWordpressReviewFeed(feed(item(1)).replace('</rss>', ''), feedUrl, fetchedAt)).toThrow()
  })
})

describe('Protected WordPress feed retrieval and discovery', () => {
  it('reads an exact review feed through the existing size-bounded public-web transport', async () => {
    mocks.read.mockResolvedValueOnce(response(feed(item(1))))
    const value = await readPublicReviews(feedUrl)
    expect(value.provenance).toBe('public_review_feed')
    expect(mocks.read).toHaveBeenCalledWith(feedUrl, expect.objectContaining({ maxBytes: 250000 }))
    expect(mocks.read).toHaveBeenCalledOnce()
  })

  it('discovers only the matching official review RSS link and falls back from HTML with no structured reviews', async () => {
    const html = '<link rel="alternate" type="application/rss+xml" href="/support/plugin/woocommerce/reviews/feed/"><p>A directory page, not a review body.</p>'
    expect(discoverWordpressReviewFeed(html, pageUrl)).toBe(feedUrl)
    expect(discoverWordpressReviewFeed('<link rel="alternate" type="application/rss+xml" href="https://attacker.example/feed/">', pageUrl)).toBeNull()
    mocks.read.mockResolvedValueOnce(response(html, pageUrl, 'text/html')).mockResolvedValueOnce(response(feed(item(1))))
    expect((await readPublicReviews(pageUrl)).reviews).toHaveLength(1)
    expect(mocks.read.mock.calls.map(call => call[0])).toEqual([pageUrl, feedUrl])
  })

  it('uses the known public review feed when recognized HTML is unavailable, and never guesses APIs for other sites', async () => {
    mocks.read.mockRejectedValueOnce(new Error('Public HTML unavailable')).mockResolvedValueOnce(response(feed(item(1))))
    expect((await readPublicReviews(pageUrl)).source.url).toBe(feedUrl)
    mocks.read.mockReset().mockResolvedValueOnce(response('<p>Promotional copy.</p>', 'https://addons.mozilla.org/product', 'text/html'))
    await expect(readPublicReviews('https://addons.mozilla.org/product')).rejects.toThrow('No accessible structured reviews')
    expect(mocks.read).toHaveBeenCalledOnce()
  })

  it('rejects a redirected or non-XML feed instead of treating other public content as reviews', async () => {
    mocks.read.mockResolvedValueOnce(response(feed(item(1)), 'https://attacker.example/feed/'))
    await expect(readPublicReviews(feedUrl)).rejects.toThrow('official WordPress review feed')
    mocks.read.mockResolvedValueOnce(response('<p>Not a review feed</p>', feedUrl, 'text/html'))
    await expect(readPublicReviews(feedUrl)).rejects.toThrow('official WordPress review feed')
  })
})
