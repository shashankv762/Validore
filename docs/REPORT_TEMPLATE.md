# Validore report and document template

The reusable template turns research into a decision, an explicit set of assumptions, and measurable next steps. Download it from **Your reports** or **Research team** in the app. It is also available as a [PDF reference](../public/templates/validore-report-template.pdf) and an [editable Word document](../public/templates/validore-report-template.docx).

Both blank versions have five A4 pages. The Word version uses editable paragraphs with shaded prompts; the PDF is a reading/printing reference, not an interactive form. Replace the bracketed prompts in Word and add as much supporting detail as needed. Filled reports can run longer than five pages.

## Reading order

| Page | Purpose | Content |
| --- | --- | --- |
| 1 | Make the decision clear | Executive recommendation, confidence, evidence limits, weighted scorecard, next action, owner, review date and pass/stop threshold |
| 2 | Explain the opportunity | Idea, target customer, geography, current alternatives, sourced TAM/SAM/SOM methods, customer hypotheses and competitors |
| 3 | Define a practical business | Value proposition, smallest useful product, feature priorities, financial inputs, calculated economics, scenarios, risks and dependencies |
| 4 | Plan the next tests | Experiments, measurement and sampling limits, owners, budgets, weekly plan, decision checkpoints and stopping conditions |
| 5 | Make evidence reviewable | Original source register, supporting/contradictory/inconclusive interpretation, unresolved assumptions, completed specialist work and founder review |

## Content rules

Use one currency and a stated time period. Separate measured inputs from assumptions and calculated projections. A market size needs relevant customer counts and spending inputs; use **Not established** until these are supported. A broad industry total is not automatically the product's addressable market.

For each material claim, retain its original URL or research record, publication date where known, relevant excerpt, retrieval date and limitation. A search result or a matched citation does not establish accuracy. Mark customer interviews, campaign results and traction as observed only after they have actually happened. Proposed product features and experiments remain proposals.

The scorecard totals 100: problem 20, customer 20, market 15, competition 10, willingness to pay 15, business model 10, financial feasibility 5 and execution 5. Scores organize judgment; they are not probabilities of success.

## Relationship to generated reports

The app's saved validation exports open with idea context and assessment, followed by detailed research, plans and evidence. They cover the same subjects as this template using the fields available in the saved result. Full validation includes nine specialists, source review, explicit financial assumptions and calculated projections. Lite reports have fewer sections. Canvas, pricing, crowdfunding and pitch exports retain their own module content and selected versions.

Saved report downloads require sign-in and ownership. The blank templates contain no account information and are public. The template does not regenerate or alter a saved report. An older saved report may lack the newer specialist activity or source-review data.

## Maintaining the template

Edit `src/lib/exports/template.ts` for the outline and prompts. Shared document ordering is in `src/lib/exports/document.ts`; rendering is in `pdf.ts` and `word.ts` alongside it. Run:

```powershell
npm run templates:build
```

The builder uses the same renderers as the export routes and writes the two files in `public/templates/`. Include both generated files in the release. Keep the Noto font files and license for PDF rendering, plus `public/logo/validore-report.png`. Word uses Arial for common office compatibility.

After layout changes, render every PDF and DOCX page and check page breaks, text wrapping, fonts, footer numbering and editable prompts. The current blank templates were reviewed page by page, including a LibreOffice render of the DOCX. Microsoft Word and Google Docs can paginate differently; review again after filling or importing a document.
