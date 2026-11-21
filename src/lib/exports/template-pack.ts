import { designedSection as section, TEMPLATE_VERSION, type DesignedReport, type LayoutBlock } from './design'

const text = (value: string): LayoutBlock => ({ kind: 'text', text: value })
const field = (label: string, prompt: string, lines = 2): LayoutBlock => ({ kind: 'writing', label, prompt, lines })
const table = (headers: string[], rows: string[][], widths?: number[]): LayoutBlock => ({ kind: 'table', headers, rows, widths })
const caveat = 'A planning document is not proof of demand. Label observations, founder reports, assumptions and projections; record what would change your decision.'
function report(title: string, subtitle: string, sections: DesignedReport['sections'], options: Partial<DesignedReport['design']> = {}): DesignedReport {
  return { title, subtitle, date: `Template ${TEMPLATE_VERSION} | [Review date]`, partial: false, sections,
    design: { version: TEMPLATE_VERSION, paper: 'a4', orientation: 'portrait', workbook: true, ...options } }
}
const scoreRows = [['Problem', '20'], ['Customer', '20'], ['Market', '15'], ['Competition', '10'], ['Willingness to pay', '15'], ['Business model', '10'], ['Financial feasibility', '5'], ['Execution', '5']]

export function buildDecisionBrief(example = false): DesignedReport {
  return report(example ? 'Stock reconciliation pilot' : '[Business or idea name]', 'Validore | Decision brief', [
    section('The decision', [
      { kind: 'callout', text: example ? 'FICTIONAL EXAMPLE — TEST FURTHER. A narrow stock-reconciliation pilot is proposed. No customers have been interviewed and no purchase evidence is claimed.' : '[Test further / Refine / Proceed to an evidence-gated test / Stop]\n[State the decision, its strongest support and the main uncertainty.]' },
      field('Customer and problem', example ? 'Hypothesis: independent shop owners may lose time reconciling weekly stock. The actual frequency, cost and payer are unknown.' : '[Who experiences the problem? Who buys/pays? What happens today?]', 2),
      table(['Evidence available', 'Limits / missing evidence'], example ? [['Founder hypothesis only', 'No independent problem or payment evidence'], ['Illustrative pilot design', 'Not a completed experiment']] : [['[Observation / source ID]', '[Period, sample and what it does not establish]'], ['[Opposing observation]', '[How it changes the decision]']], [0.48, 0.52]),
    ]),
    section('The next commitment', [
      table(['Hypothesis', 'Action / owner / review'], [[example ? 'Some eligible owners will pay for a narrow pilot.' : '[Riskiest assumption]', example ? 'Founder: recruit 20 eligible owners; offer the same paid pilot within two weeks.' : '[Smallest useful test / responsible person / date]']], [0.45, 0.55]),
      field('Pass / stop rule', example ? 'Proposed test, not a forecast: at least 3 paid deposits from 20 comparable offers. Otherwise stop expansion and interview non-buyers.' : '[Observable behavior / denominator / pass threshold / failure decision]', 2),
      text(caveat),
    ]),
  ], { example })
}

export function buildDesignedWorkbook(example = false): DesignedReport {
  if (example) {
    const brief = buildDecisionBrief(true)
    return { ...brief, subtitle: 'Validore | Fictional worked report', sections: [...brief.sections,
      section('Illustrative economics — assumptions only', [
        text('No market prices, interviews, traction or operating results are asserted. These invented inputs demonstrate the method.'),
        table(['Input', 'Value / unit', 'Evidence state'], [['Pilot price', 'INR 1,000 per shop / month', 'ASSUMPTION'], ['Variable delivery cost', 'INR 300 per shop / month', 'ASSUMPTION'], ['Fixed costs', 'INR 14,000 / month', 'ASSUMPTION'], ['Payment fees', '0% for this illustration', 'ASSUMPTION — verify actual fees']], [0.35, 0.30, 0.35]),
        table(['Calculation', 'Illustrative result'], [['Contribution before acquisition/tax', 'INR 700 per shop / month'], ['Operating break-even', '20 paying shops'], ['At 10 shops', 'INR 7,000 operating loss / month']], [0.55, 0.45]),
        text('This is a deterministic illustration, not a demand forecast. Acquisition, tax, refunds and opening cash were not modeled.'),
      ]),
      section('Evidence and decisions still needed', [
        table(['Gap', 'How to resolve it'], [['Problem severity', 'Ask about the last actual reconciliation, time spent and current workaround.'], ['Payment and repeat use', 'Run the explicit offer test, then observe paid repeat use.'], ['Cost and delivery', 'Time the pilot and obtain actual fee/cost quotes.']], [0.35, 0.65]),
        field('Outcome', 'Not performed. Do not replace this with invented positive results.', 2),
      ]),
    ] }
  }
  return report('[Business or idea name]', 'Validore | Founder decision workbook', [
    section('Executive decision', [
      { kind: 'callout', text: '[Recommendation and why]\n[Most important evidence, opposing signal and unresolved constraint.]' },
      field('Customer / buyer / payer / geography', '[Specific segment, real problem, existing alternative and intended decision]', 2),
      table(['Criterion', 'Score / max', 'Evidence or unreviewed reason'], scoreRows.map(([name, max]) => [name, `[  / ${max}]`, '[Source/test ID or not reviewed]']), [0.31, 0.18, 0.51]),
      field('Next test and decision threshold', '[Action / owner / date / behavior and denominator / pass or stop rule]', 3),
    ]),
    section('Customer and opportunity', [
      field('Problem in one sentence', '[Recent occurrence, frequency, consequence and current workaround]', 3),
      table(['Observed / opposing signal', 'Evidence ID', 'Sample, date and limitation'], [['[Customer observation]', '[R-01]', '[Recorded, not representative]'], ['[Contrary signal]', '[R-02]', '[What remains unknown]']], [0.4, 0.16, 0.44]),
      table(['Market input', 'Count / spend / unit', 'Source and period'], [['Eligible customer count', '[Not established]', '[Original table / geography]'], ['Annual spending', '[Not established]', '[Currency / billing period]'], ['Serviceable / obtainable limits', '[Capacity / reach assumptions]', '[Method and test needed]']], [0.33, 0.32, 0.35]),
      table(['Alternative', 'Offer / current workflow', 'Source / uncertainty'], [['[Direct competitor]', '[Plan, amount, currency, cadence]', '[Original page and date]'], ['[Substitute / workaround]', '[How it solves the same job]', '[Evidence and limitation]']], [0.27, 0.4, 0.33]),
    ]),
    section('Product and economics', [
      field('Smallest useful product', '[Core workflow, customer outcome, what is excluded and the hypothesis it tests]', 3),
      table(['Input', 'Value / currency / period', 'Observed or assumed / source'], [['Price / purchase unit', '[  ]', '[  ]'], ['Variable cost and fees', '[  ]', '[  ]'], ['Fixed cost / acquisition', '[  ]', '[  ]'], ['Customers / retention / cash', '[  ]', '[  ]']], [0.3, 0.35, 0.35]),
      table(['Scenario', 'Contribution / break-even', 'Cash impact / constraint'], [['Downside', '[Calculated or unavailable]', '[  ]'], ['Base', '[Calculated or unavailable]', '[  ]'], ['Upside', '[Calculated or unavailable]', '[  ]']], [0.22, 0.39, 0.39]),
      field('Critical risk and dependency', '[Mechanism, early warning, mitigation, owner and stopping condition]', 3),
    ]),
    section('Experiments and execution', [
      table(['Test / hypothesis', 'Measurement and decision', 'Owner / time / cost'], [['[Problem / buyer test]', '[Behavior, denominator, pass and fail]', '[  ]'], ['[Payment / repeat-use test]', '[Behavior, denominator, pass and fail]', '[  ]'], ['[Channel or delivery test]', '[Prerequisites and stopping rule]', '[  ]']], [0.3, 0.43, 0.27]),
      field('Record actual outcome', '[Leave blank until performed; keep contrary results and sample limitations]', 5),
      field('Next decision', '[Continue / change / stop, why, and which downstream work is now justified]', 3),
    ]),
    section('Evidence and review', [
      table(['ID / claim', 'Original source / dates', 'Support, excerpt and limitation'], [['[S-01 / claim]', '[URL or owned record; observation/retrieval dates]', '[Supports / refutes / inconclusive; exact passage]'], ['[S-02 / claim]', '[  ]', '[  ]']], [0.23, 0.35, 0.42]),
      field('Research incomplete / source gaps', '[Missing specialist work and the smallest task needed to resolve it]', 3),
      field('Founder review and revision', '[Reviewer/date; corrections, previous version and remaining reservations]', 3),
      text(caveat),
    ]),
  ])
}

const canvasPrompts = {
  problem: 'Top customer problems\n[Recent event / consequence]\n\nExisting alternatives\n[Current workaround]',
  solution: '[Smallest proposed solution]\n[One mechanism per problem]',
  uvp: '[Specific customer outcome]\n[Why choose this approach?]\n\nHigh-level concept\n[Plain-language explanation]',
  unfairAdvantage: '[A defensible advantage]\n[Unknown is acceptable]',
  customerSegments: '[User / buyer / payer]\n[Specific geography and segment]\n\nEarly adopters\n[Who has this problem now?]',
  keyMetrics: '[Observable behavior]\n[Unit and denominator]',
  channels: '[How to reach this segment]\n[Unproven channel hypothesis]',
  costStructure: '[Fixed / variable / acquisition / delivery costs]\n[Currency, period and assumptions]',
  revenueStreams: '[Who pays / price / billing unit and cadence]\n[Payment evidence or assumption]',
}
const canvasTitles = { problem: '1 Problem', solution: '4 Solution', uvp: '3 Unique value proposition', unfairAdvantage: '9 Unfair advantage', customerSegments: '2 Customer segments', keyMetrics: '8 Key metrics', channels: '5 Channels', costStructure: '7 Cost structure', revenueStreams: '6 Revenue streams' }
const canvasExample: Record<keyof typeof canvasPrompts, string> = {
  problem: 'HYPOTHESIS\nWeekly stock reconciliation may take too long.\n\nCurrent alternative: manual spreadsheet; not independently observed.',
  solution: 'PROPOSAL\nA narrow upload-and-review pilot for weekly stock totals.',
  uvp: 'HYPOTHESIS\nHelp a shop owner find discrepancies before the next order.\n\nBenefit is not measured.',
  unfairAdvantage: 'UNKNOWN\nNo defensible advantage established yet.',
  customerSegments: 'HYPOTHESIS\nIndependent shops in one city.\nUser/payer: owner, to confirm.\nEarly adopter: recent reconciliation difficulty.',
  keyMetrics: 'PROPOSED TEST\nPaid deposits / comparable offers; observed paid repeat use.',
  channels: 'HYPOTHESIS\nDirect recruitment through local shop groups, subject to permission.',
  costStructure: 'ILLUSTRATIVE ASSUMPTIONS\nINR 300 variable cost / shop / month; INR 14,000 fixed / month. Fees/acquisition/tax excluded.',
  revenueStreams: 'ILLUSTRATIVE ASSUMPTION\nINR 1,000 / shop / month. No willingness-to-pay evidence or completed sales.',
}
export function buildCanvasTemplate(paper: 'a4' | 'a3' = 'a4', example = false): DesignedReport {
  return report(example ? 'Stock reconciliation pilot' : '[Idea name]', 'Validore | Lean Canvas', [
    section('', [{ kind: 'canvas', cells: Object.entries(canvasPrompts).map(([key, content]) => ({ key, title: canvasTitles[key as keyof typeof canvasTitles], content: example ? canvasExample[key as keyof typeof canvasExample] : content })) }]),
    section('Next test', [text(example ? 'FICTIONAL: test payment before expansion; proposed criterion 3 deposits / 20 eligible offers. No test has occurred.' : 'Riskiest assumption [ID / statement] · Next experiment [ID] · Owner/date [  ] · Evidence state [  ]')]),
  ], { orientation: 'landscape', paper, example })
}
export function buildCanvasEvidenceWorkbook(): DesignedReport {
  return report('[Idea name and canvas version]', 'Validore | Canvas evidence and experiment workbook', [
    section('Assumption register', [table(['Canvas block / hypothesis', 'Evidence / contrary signal', 'Status / next test'], Object.values(canvasTitles).map(title => [title + '\n[Specific hypothesis]', '[Source or owned record ID; date and limit]', '[Untested / tested / invalidated]\n[Test ID]']), [0.32, 0.38, 0.3])]),
    section('Design a falsifiable experiment', [field('Hypothesis and participant', '[Customer job / user, buyer and payer / recruitment method]', 3), field('Measurement', '[Behavior / numerator and denominator / sample and limitations]', 3), field('Pass / fail and cost limit', '[Distinct thresholds / timebox / budget / owner]', 3), field('Observed outcome', '[Leave blank until performed. Keep opposing evidence.]', 5)]),
    section('Revision and evidence record', [table(['Claim / source ID', 'Original passage / date', 'Support and limitation'], [['[  ]', '[  ]', '[  ]'], ['[  ]', '[  ]', '[  ]']], [0.23, 0.42, 0.35]), field('Revision decision', '[Parent version / changed blocks / why / retained or invalidated tests / next step]', 4), text(caveat)]),
  ])
}
export function templatePack(): { name: string; document: DesignedReport; formats: ('pdf' | 'docx')[] }[] {
  return [
    { name: 'validore-report-template', document: buildDesignedWorkbook(), formats: ['pdf', 'docx'] },
    { name: 'validore-decision-brief-template', document: buildDecisionBrief(), formats: ['pdf', 'docx'] },
    { name: 'validore-lean-canvas-template', document: buildCanvasTemplate(), formats: ['pdf', 'docx'] },
    { name: 'validore-lean-canvas-a3-template', document: buildCanvasTemplate('a3'), formats: ['pdf'] },
    { name: 'validore-canvas-evidence-workbook', document: buildCanvasEvidenceWorkbook(), formats: ['pdf', 'docx'] },
    { name: 'validore-report-example', document: buildDesignedWorkbook(true), formats: ['pdf', 'docx'] },
    { name: 'validore-lean-canvas-example', document: buildCanvasTemplate('a4', true), formats: ['pdf', 'docx'] },
  ]
}
