import { describe, expect, it } from 'vitest'
import { suggestSentiment, cleanFeedbackText, sentimentCounts } from '@/lib/customer-feedback/analysis'
import { extractPublicReviews } from '@/lib/customer-feedback/public-reviews'
import { groundedFeedbackSchema } from '@/lib/customer-feedback/schema'
import { compactFeedbackContext } from '@/lib/customer-feedback/context'
import { feedbackDigest } from '@/lib/customer-feedback/store'
import { buildFeedbackPrompt, feedbackModelContext, FEEDBACK_CONTEXT_MAX_CHARS } from '@/lib/customer-feedback/prompt'
import { feedbackAnalysis, feedbackRecords } from './fixtures/customer-feedback'

describe('customer feedback integrity', () => {
  it('retains a late opposing clause and its exact quote in complete stored-record analysis', () => {
    const ending = 'However, the invoices are unreliable and I cancelled after losing my records.'
    const record = { ...feedbackRecords[0], content: 'The first screen looked easy. ' + 'I used the weekly stock screen. '.repeat(65) + ending }
    const value = JSON.parse(feedbackModelContext([record]))
    expect(value.coverage).toBe('complete_stored_records')
    expect(value.records[0].content).toBe(record.content)
    expect(value.records[0]).toMatchObject({ recordId: record.id, excerpted: false })
    expect(value.records[0].content.endsWith(ending)).toBe(true)
    const analysis = { ...feedbackAnalysis, observations: [{ ...feedbackAnalysis.observations[0], recordId: record.id, quote: ending }],
      themes: feedbackAnalysis.themes.map(theme => ({ ...theme, recordIds: [record.id] })) }
    expect(groundedFeedbackSchema([record]).safeParse(analysis).success).toBe(true)
    expect(buildFeedbackPrompt([record], { name: 'Shop tool', coreProblem: 'Stock errors', targetCustomer: 'Shop owners' }, 60)).toContain('60 records')
  })
  it('fits forty maximum-length records with escaped text and long source URLs without truncation', () => {
    const records = Array.from({ length: 40 }, (_, index) => ({ ...feedbackRecords[0],
      id: `11111111-2222-4333-8444-${String(index).padStart(12, '0')}`,
      content: '"\\'.repeat(1500), sourceLabel: '"'.repeat(120), sourceUrl: 'https://example.org/' + 'a'.repeat(1980) }))
    const context = feedbackModelContext(records)
    expect(context.length).toBeLessThanOrEqual(FEEDBACK_CONTEXT_MAX_CHARS)
    const value = JSON.parse(context)
    expect(value.records).toHaveLength(40)
    expect(value.records.map((record: { content: string }) => record.content)).toEqual(records.map(record => record.content))
    expect(() => feedbackModelContext([...records, records[0]])).toThrow('at most 40')
  })
  it('interprets opposite aspects, negation and ratings as provisional suggestions', () => {
    expect(suggestSentiment('It is easy to use, but very expensive.')).toBe('mixed')
    expect(suggestSentiment('The support is not good.')).toBe('negative')
    expect(suggestSentiment('It is not bad but expensive.')).toBe('mixed')
    expect(suggestSentiment('It is not expensive.')).toBe('positive')
    expect(suggestSentiment('It is terrible.', 5)).toBe('mixed')
    expect(suggestSentiment('यह सेवा धीमी है।')).toBe('unknown')
    expect(suggestSentiment('Weekly stock reminder proposal')).toBe('unknown')
    expect(sentimentCounts(feedbackRecords, feedbackAnalysis)).toEqual({ positive: 0, negative: 1, mixed: 1, neutral: 1, unknown: 0 })
  })
  it('removes contact details and credentials before storing a pasted review', () => {
    const clean = cleanFeedbackText('Contact owner@example.org or 555-123-4567. Bearer abcdefghijklmnopqrstuvwxyz123456. The app is slow.\u0000')
    expect(clean).not.toContain('owner@example.org'); expect(clean).not.toContain('555-123-4567'); expect(clean).not.toContain('abcdefghijklmnopqrstuvwxyz123456')
    expect(clean).toContain('The app is slow.')
  })
  it('requires exact record quotes and unique real record references', () => {
    const schema = groundedFeedbackSchema(feedbackRecords)
    expect(schema.safeParse(feedbackAnalysis).success).toBe(true)
    const invented = structuredClone(feedbackAnalysis); invented.observations[0].quote = 'Customers love our proposed startup'
    expect(schema.safeParse(invented).success).toBe(false)
    const duplicate = structuredClone(feedbackAnalysis); duplicate.observations[1].recordId = feedbackRecords[0].id
    expect(schema.safeParse(duplicate).success).toBe(false)
    const unknownTheme = structuredClone(feedbackAnalysis); unknownTheme.themes[0].recordIds = ['99999999-2222-4333-8444-000000000009']
    expect(schema.safeParse(unknownTheme).success).toBe(false)
    const override = structuredClone(feedbackAnalysis); override.observations[2].sentiment = 'positive'
    expect(schema.safeParse(override).success).toBe(false)
    const unclearRecords = feedbackRecords.map((record, index) => index === 0 ? { ...record, sentiment: 'unknown' as const } : record)
    expect(groundedFeedbackSchema(unclearRecords).safeParse(feedbackAnalysis).success).toBe(false)
    const unclearAnalysis = structuredClone(feedbackAnalysis); unclearAnalysis.observations[0].sentiment = 'unknown'
    expect(groundedFeedbackSchema(unclearRecords).safeParse(unclearAnalysis).success).toBe(true)
    const alteredCase = structuredClone(feedbackAnalysis); alteredCase.observations[0].quote = alteredCase.observations[0].quote.toUpperCase()
    expect(schema.safeParse(alteredCase).success).toBe(false)
    const alteredUnicode = structuredClone(feedbackAnalysis); alteredUnicode.observations[0].quote = 'ｅａｓｙ to use'
    expect(schema.safeParse(alteredUnicode).success).toBe(false)
  })
  it('keeps private context bounded with provenance, selection and opposing signals', () => {
    const context = compactFeedbackContext(feedbackRecords, { id: 'saved', sourceDigest: feedbackDigest(feedbackRecords), methodVersion: 'test', data: feedbackAnalysis, analyzedRecords: 3, totalRecords: 3, createdAt: '2026-11-14' }, 20_000)
    const value = JSON.parse(context)
    expect(context.length).toBeLessThanOrEqual(20_000); expect(value.records).toHaveLength(3)
    expect(value.analysis.opposingSignals).toHaveLength(1); expect(value.instruction).toContain('shared research memory')
    expect(compactFeedbackContext([], null)).toBe('')
  })
})

describe('actual public review extraction', () => {
  const url = 'https://reviews.example.org/product'
  const fetched = '2026-11-14T12:00:00.000Z'
  it('reads explicit JSON-LD reviews without copying reviewer identities or executing scripts', () => {
    const html = '<title>Shop tool reviews</title><script type="application/ld+json">' + JSON.stringify({ '@type': 'Product', review: [
      { '@type': 'Review', author: { name: 'Private name', email: 'person@example.org' }, reviewBody: 'Easy to use but expensive for a small shop.', datePublished: '2026-11-01', reviewRating: { ratingValue: '7', bestRating: '10', worstRating: '0' } },
      { '@type': 'Review', reviewBody: 'Easy to use but expensive for a small shop.', datePublished: '2030-01-01' },
    ] }) + '</script><script>throw new Error("must not execute")</script>'
    const value = extractPublicReviews(html, url, fetched)
    expect(value.reviews).toHaveLength(1); expect(value.reviews[0]).toMatchObject({ rating: 3.8, occurredAt: '2026-11-01', suggestedSentiment: 'mixed' })
    expect(JSON.stringify(value)).not.toContain('Private name'); expect(JSON.stringify(value)).not.toContain('person@example.org')
    expect(value.source).toMatchObject({ url, fetchedAt: fetched, retrievalKind: 'page' }); expect(JSON.parse(value.source.content).sampleSize).toBe(1)
  })
  it('does not call marketing paragraphs or aggregate stars customer reviews', () => {
    const html = '<p>Our customers love this amazing platform.</p><script type="application/ld+json">{"@type":"Product","aggregateRating":{"ratingValue":5,"reviewCount":999}}</script>'
    expect(extractPublicReviews(html, url, fetched).reviews).toEqual([])
  })
  it('supports microdata bodies and preserves unknown/invalid dates and rating scales', () => {
    const html = '<section itemscope itemtype="https://schema.org/Review"><p itemprop="reviewBody">Support is slow and the app crashes.</p><meta itemprop="ratingValue" content="9"><meta itemprop="bestRating" content="5"><time itemprop="datePublished" datetime="2030-01-01"></time></section>'
    expect(extractPublicReviews(html, url, fetched).reviews[0]).toMatchObject({ rating: null, occurredAt: null, suggestedSentiment: 'negative' })
  })
  it('keeps nested item ratings separate from the review rating and rejects invented calendar dates', () => {
    const html = '<section itemscope itemtype="https://schema.org/Review"><div itemprop="itemReviewed" itemscope itemtype="https://schema.org/Product"><div itemprop="aggregateRating" itemscope itemtype="https://schema.org/AggregateRating"><meta itemprop="ratingValue" content="5"></div></div><p itemprop="reviewBody">This app is terrible and frustrating.</p><div itemprop="reviewRating" itemscope itemtype="https://schema.org/Rating"><meta itemprop="ratingValue" content="1"></div><time itemprop="datePublished" datetime="2026-02-30"></time></section>'
    const value = extractPublicReviews(html, url, fetched)
    expect(value.reviews[0]).toMatchObject({ rating: 1, occurredAt: null, suggestedSentiment: 'negative' })
  })
  it('discloses bounded extraction without presenting a lower bound as an exact page count', () => {
    const reviews = Array.from({ length: 250 }, (_, index) => ({ '@type': 'Review', reviewBody: 'This is the accessible review number ' + index + ' about the stock screen.' }))
    const value = extractPublicReviews('<script type="application/ld+json">' + JSON.stringify(reviews) + '</script>', url, fetched)
    expect(value.extractionCapped).toBe(true); expect(value.reviews).toHaveLength(20)
    expect(value.limitations.join(' ')).toContain('At least 200'); expect(value.limitations.join(' ')).not.toContain('20 of 200')
    expect(JSON.parse(value.source.content).countIsLowerBound).toBe(true)
  })
  it('bounds extraction, ignores invalid markup and rejects unsafe pages', () => {
    const markup = Array.from({ length: 35 }, (_, index) => ({ '@type': 'Review', reviewBody: 'This is review number ' + index + ' about the stock screen.' }))
    const value = extractPublicReviews('<script type="application/ld+json">' + JSON.stringify(markup) + '</script>', url, fetched, 20)
    expect(value.reviews).toHaveLength(20); expect(value.availableReviewCount).toBe(35)
    expect(value.limitations.some(text => text.includes('20 of 35'))).toBe(true); expect(JSON.parse(value.source.content)).toBeTruthy()
    expect(extractPublicReviews('<script type="application/ld+json">bad json</script>', url, fetched).reviews).toEqual([])
    expect(() => extractPublicReviews('', 'http://127.0.0.1/private', fetched)).toThrow()
  })
})
