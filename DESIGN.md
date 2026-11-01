# Validore interface

## Signed-in workspace revision

The workspace is a founder's research desk. Use the existing faceted ore mark as its memorable element, with a quiet, left-aligned interface around real ideas, sources and decisions. Avoid invented activity counts, simulated agent activity, or marketing claims inside working forms.

- Palette: brand ink `#0B0E13`, workspace ink `#141923`, gold `#E0A526`, paper `#F7F8FA`, slate `#657081`, and rules `#E5E7EB`.
- Type: self-hosted Geist Sans throughout. Use 32–38px medium-weight page headings, 14–16px body copy, and readable sentence-case labels. Reserve tabular numbers for real scores and balances.
- Layout: `[persistent navigation] [page context / actual credit balance]`, then `[four-step idea brief | research-team explanation]`. Reports have direct PDF/Word actions and expandable evidence/activity details. On mobile, navigation becomes a disclosure and the form stays first.
- Structure: use separators for rows and sections, rounded controls for actions, and the brand's clipped corner only on a few primary surfaces. Keep the source register and agent activity connected to the report they produced.

Review against the brief: the old nine-screen input flow and generic account configuration panels made the product feel fragmented. Consolidate the brief into four meaningful steps, remove infrastructure jargon and unsupported notification promises, and make downloads work for the exact saved module selected. Preserve the supplied artwork instead of introducing a new generic logo.

The supplied faceted gold ore/checkmark and custom lowercase vector wordmark define the brand. The web assets preserve their geometry, including the diamond over the i. Dark/light lockups, the favicon, the Apple home-screen icon, and social preview share that artwork. See [logo assets](public/logo/README.md).

## Visual system

| Token | Value / role |
| --- | --- |
| Ink | `#0B0E13`, primary brand surfaces |
| Gold | `#E0A526`, primary action and brand accent |
| Light gold | `#F0C04E`, interaction highlight |
| Deep gold | `#A86A0A`, ore facet |
| Cream | `#F4EFE6`, lettering and warm support surfaces |
| Paper | `#FAFAF7`, readable workspace and report backgrounds |

Geist Sans is self-hosted for interface and display text, with Geist Mono reserved for code/numerical contexts. The logo lettering is vector artwork, not a substitute font. Warm muted accents in charts and report tables retain visual continuity with the existing workspace.

The landing page pairs a clear proposition with an interactive, explicitly fictional report. The report is the main visual explanation. The remaining sections show the actual workflow, modules, evidence boundaries, available plans, and answers to common questions. Plan availability reflects configured Stripe settings; unconfigured paid plans say they are coming soon.

Desktop: `[brand / navigation] → [headline | sample report] → [workflow / modules / plans / questions]`.

Phone: `[brand / menu] → [headline] → [sample report] → [stacked sections]`. Very narrow headers move the signup link into the menu to preserve space for the logo.

Sign-in, signup, and password recovery share a quiet split layout, native forms, visible pending feedback, and safe return paths. On phones, the form and logo take priority. Dashboard navigation becomes an accessible disclosure; persisted job progress and recovery links keep interrupted tasks understandable.

## Motion review

| Before | After | Why |
| --- | --- | --- |
| Broad `transition-all` rules | Explicit color/opacity/transform transitions | Prevent unintended layout animation |
| Animated progress width | `scaleX` with a left origin | Progress changes avoid repeated layout work |
| Generic dialog transition | 220ms scale from `.97`, with a strong ease-out curve | Clear, restrained entry that can be interrupted |
| Decorative loading shimmer | Stable loading copy and functional progress | Less distraction while work is in progress |
| Scattered marketing movement | One 650ms report entrance | Motion explains the first report preview; it does not loop |
| Inconsistent motion preferences | Reduced-motion rules and pointer-gated hover movement | Accommodate motion sensitivity and touch input |

Source review: no remaining `transition-all` rules in application components, movement has reduced-motion handling, and the marketing entrance is isolated. UI feedback uses `cubic-bezier(0.23, 1, 0.32, 1)` with 100–220ms timings. The longer 650ms entrance is reserved for the marketing illustration. **Approve at source level**; this is not a measured device-performance or complete browser-accessibility certification.

Keyboard focus, semantic form labels, native FAQ disclosures, arrow-key report tabs, error recovery, and readable narrow layouts are part of the quality floor. No invented traction, customer endorsements, or guarantees of business success are added.

Desktop and 320px Chrome phone previews were reviewed, including the menu and signup/sign-in/recovery forms. Logos reserve explicit dimensions and load immediately; mobile auth inputs use 16px text. Real-device and signed-in workflow acceptance remain part of the launch checks.
