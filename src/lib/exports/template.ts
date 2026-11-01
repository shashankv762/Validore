import type { DocumentLine, ReportDocument } from './document'

const field = (text: string): DocumentLine => ({ kind: 'field', text })
const paragraph = (text: string): DocumentLine => ({ kind: 'text', text })

/** Blank, reusable companion to the generated report's reading order. */
export function buildReportTemplate(): ReportDocument {
  return {
    title: 'Startup validation report', subtitle: 'A reusable Validore planning template',
    date: 'Version 1.0  |  [Report date]', partial: false,
    sections: [
      { title: 'Executive decision', lines: [
        paragraph('Use this report to decide what to test, change, or build next. Replace the bracketed prompts, retain the evidence labels, and connect important claims to original sources.'),
        field('Business and founder  [Business name]  /  [Founder or team]'),
        field('Recommendation  [Proceed to a test / Refine the concept / Research further / Stop]'),
        field('Decision in one paragraph  [What the evidence suggests, the main constraint, and the next commitment]'),
        field('Confidence and evidence limits  [Low / Medium / High, with reasons]'),
      ] },
      { title: 'Decision scorecard', lines: [
        paragraph('Scores organize judgment; they do not measure the probability of success. Explain the evidence behind each score.'),
        field('Problem  [  /20]     Customer  [  /20]     Market  [  /15]'),
        field('Competition  [  /10]     Willingness to pay  [  /15]'),
        field('Business model  [  /10]     Financial feasibility  [  /5]     Execution  [  /5]'),
        field('Total  [  /100]     Main reason for the decision  [Explain]'),
      ] },
      { title: 'The next commitment', lines: [
        field('Next action  [One measurable experiment or delivery milestone]'),
        field('Owner and review date  [Name]  /  [Date]'),
        field('Pass or stop threshold  [The result that would change this decision]'),
      ] },
      { title: 'Idea and customer', breakBefore: true, lines: [
        field('One sentence concept  [For whom, which problem, and what useful outcome]'),
        field('Customer and geography  [Specific segment, buyer, user, and location]'),
        field('Current alternative  [How this customer solves the problem today]'),
      ] },
      { title: 'Market sizing', lines: [
        paragraph('Use Not established when source-backed customer counts or spending inputs are missing. All market sizes remain projections.'),
        field('Total addressable market  [Customer count x annual spend]  /  [Source and year]'),
        field('Serviceable market  [Reachable segment and geographic limits]  /  [Method]'),
        field('Initial obtainable market  [Delivery capacity and acquisition plan]  /  [Timeframe]'),
      ] },
      { title: 'Customer hypotheses', lines: [
        field('Problem hypothesis  [Frequency, severity, urgency, and current workaround]'),
        field('Willingness to pay  [What is known, what is assumed, and the proposed test]'),
        field('Customer evidence  [Research reference, sample, date, and limitation]'),
      ] },
      { title: 'Competitive alternatives', lines: [
        field('Direct competitor  [Product, customer, pricing source, and date checked]'),
        field('Indirect substitute or partner  [Relationship to the same customer job]'),
        field('Differentiation to test  [Specific advantage and the evidence needed]'),
      ] },
      { title: 'Product direction', breakBefore: true, lines: [
        field('Selected value proposition  [Customer outcome, differentiation, and reason to believe]'),
        field('Smallest useful product  [One core workflow that tests the riskiest hypothesis]'),
        field('Feature priorities  [Must have]  /  [Should have]  /  [Later]  /  [Excluded]'),
      ] },
      { title: 'Financial assumptions', lines: [
        paragraph('State one currency and time period. Keep assumptions separate from measured costs and revenue.'),
        field('Currency and period  [Currency]  /  [Monthly or annual]'),
        field('Price and variable cost  [Selling price]  /  [Cost per customer or unit]'),
        field('Fixed costs and acquisition  [Monthly fixed costs]  /  [CAC per new customer]'),
        field('Customers, churn, and cash  [Count]  /  [Monthly churn]  /  [Available cash]'),
      ] },
      { title: 'Calculated economics', lines: [
        field('Margin and break even  [Contribution margin]  /  [Customers needed to break even]'),
        field('Retention and runway  [LTV method]  /  [LTV to CAC]  /  [Cash runway]'),
        field('Scenario comparison  [Downside, base, and upside inputs and outcomes]'),
      ] },
      { title: 'Risks and mitigations', lines: [
        field('Main risk  [Risk]  /  [Likelihood and impact]  /  [Early signal]  /  [Owner]'),
        field('Critical dependency  [Provider, legal, operational, or delivery constraint]'),
      ] },
      { title: 'Validation experiments', breakBefore: true, lines: [
        paragraph('These are proposed activities. Label outcomes as observed only after the work has been completed and recorded.'),
        field('Experiment 1  [Hypothesis]  /  [Method and target customer]'),
        field('Measurement  [Metric]  /  [Sample and sampling limits]  /  [Pass or fail threshold]'),
        field('Execution  [Owner]  /  [Dates]  /  [Budget]  /  [Results record]'),
        field('Experiment 2  [Next hypothesis and the same measurement details]'),
      ] },
      { title: 'Weekly action plan', lines: [
        field('Weeks 1 and 2  [Customer problem test]  /  [Owner]  /  [Measurable KPI]'),
        field('Weeks 3 and 4  [Pricing or product test]  /  [Owner]  /  [Measurable KPI]'),
        field('Weeks 5 and 6  [Channel or delivery test]  /  [Owner]  /  [Measurable KPI]'),
      ] },
      { title: 'Decision checkpoints', lines: [
        field('Continue when  [Evidence threshold and acceptable cost]'),
        field('Change direction when  [Assumption disproved or constraint reached]'),
        field('Stop when  [Clear stopping condition]'),
        field('Next review  [Date, decision owner, and required evidence]'),
      ] },
      { title: 'Evidence register', breakBefore: true, lines: [
        paragraph('Give every material claim an original source, date, relevant excerpt, and limitation. Distinguish source interpretation, assumptions, projections, and proposed strategy.'),
        field('Source 1  [Claim]  /  [Original URL or research record]  /  [Publication date]'),
        field('Assessment  [Supports / Contradicts / Inconclusive]  /  [Relevant excerpt and reason]'),
        field('Limitations  [Geography, customer segment, sample, and retrieval date]'),
        field('Additional sources  [Repeat this structure for each important claim]'),
      ] },
      { title: 'Unresolved assumptions', lines: [
        field('Unknown input or claim  [What is missing and why it matters]'),
        field('Evidence required  [How to resolve it]  /  [Owner]  /  [Review date]'),
      ] },
      { title: 'Research team contributions', lines: [
        paragraph('Full reports can involve market, customer, competition, finance, risk, source review, product, growth, and lead review specialists. Record the work actually completed.'),
        field('Completed work  [Specialists and useful tool results]'),
        field('Incomplete work  [Missing sections, unavailable sources, or limits reached]'),
      ] },
      { title: 'Founder review', lines: [
        field('Reviewed by  [Name and date]'),
        field('Decision and changes  [Next step, corrections, and remaining reservations]'),
        paragraph('AI research supports a decision. It does not establish demand, certify a source interpretation, or guarantee commercial results.'),
      ] },
    ],
  }
}
