import type { FeedbackAnalysis, FeedbackRecord } from '@/lib/customer-feedback/schema'

// Synthetic acceptance fixtures, never a shared real-customer dataset.
export const feedbackRecords: FeedbackRecord[] = [
  { id: '11111111-2222-4333-8444-000000000001', kind: 'review', content: 'The stock screen is easy to use, but the monthly price is expensive for my small shop.', sourceLabel: 'Synthetic public-review fixture', sourceUrl: 'https://reviews.example.org/product', occurredAt: '2026-11-01T00:00:00.000Z', rating: 3, sentiment: null, provenance: 'public_review_markup', fetchedAt: '2026-11-14T00:00:00.000Z', createdAt: '2026-11-14T00:00:00.000Z' },
  { id: '11111111-2222-4333-8444-000000000002', kind: 'interview', content: 'I spent two hours reconciling stock last Friday. I still use a paper notebook and have not tried the proposed app.', sourceLabel: 'Synthetic shop-owner interview', sourceUrl: null, occurredAt: '2026-11-06T00:00:00.000Z', rating: null, sentiment: null, provenance: 'owner_recorded', fetchedAt: null, createdAt: '2026-11-13T00:00:00.000Z' },
  { id: '11111111-2222-4333-8444-000000000003', kind: 'idea', content: 'Test a weekly stock reminder before building a complete forecasting system.', sourceLabel: 'Synthetic founder proposal', sourceUrl: null, occurredAt: null, rating: null, sentiment: 'neutral', provenance: 'owner_recorded', fetchedAt: null, createdAt: '2026-11-12T00:00:00.000Z' },
]

export const feedbackAnalysis: FeedbackAnalysis = {
  summary: 'In this selected three-record synthetic notebook, stock reconciliation is a problem to investigate and one existing-product review contains opposing usability and price signals. No purchase demand for the proposed app has been established.',
  observations: [
    { recordId: feedbackRecords[0].id, sentiment: 'mixed', quote: 'easy to use, but the monthly price is expensive', reason: 'The reviewer praises usability while criticizing the price of an existing product.', aspects: ['Usability', 'Price'] },
    { recordId: feedbackRecords[1].id, sentiment: 'negative', quote: 'spent two hours reconciling stock last Friday', reason: 'The recorded past task suggests effort, but this is a self-reported interview note.', aspects: ['Reconciliation effort'] },
    { recordId: feedbackRecords[2].id, sentiment: 'neutral', quote: 'Test a weekly stock reminder', reason: 'This is a founder proposal rather than customer sentiment or observed demand.', aspects: ['Experiment proposal'] },
  ],
  themes: [{ theme: 'Reduce stock reconciliation effort', recordIds: [feedbackRecords[1].id], customerProblem: 'One recorded shop owner reports two hours spent reconciling stock.',
    opportunityHypothesis: 'A weekly reminder may help owners reconcile more regularly; test this before building a forecasting system.',
    nextExperiment: { method: 'Run a two-week reminder pilot with consenting shop owners.', metric: 'Record reconciliation time and completed weekly checks.', passThreshold: 'Continue if at least four of six pilot owners complete both checks and reduce reported effort.', failThreshold: 'Reconsider if two or fewer complete both checks or effort does not improve.' } }],
  opposingSignals: ['Usability praise coexists with a price complaint about an existing product.'],
  unansweredQuestions: ['Who controls the purchase and what has the target customer already paid to solve this problem?'],
  limitations: ['This is a selected three-record synthetic notebook, not a representative sample or verified unique-customer count.', 'The founder proposal is not a customer statement, and one observation date is unknown.'],
}
