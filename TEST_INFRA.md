# Validore — Test Infrastructure Specification (TEST_INFRA)

## 1. Overview & Architecture

This document defines the automated test infrastructure and testing methodology for **Validore**, a Next.js 16 SaaS application for AI-powered startup idea validation.

The test infrastructure is designed according to **opaque-box, requirement-driven principles**:
- **Test Integrity**: Every test verifies observable behavior, external API contracts, and specifications defined in `ORIGINAL_REQUEST.md` and `PROJECT.md`, without coupling to private implementation internals.
- **Progressive Testability**: Tests validate milestone deliverables (M1: Database & Seeding, M2: Export Subsystems, M3: Credits & Settings, M4: Polish & Auth, M5: Lint & Build) independently and reproducibly.
- **Adversarial Verification**: Edge cases, malformed payloads, unauthenticated access, tenant isolation, and character escaping (RFC 4180 CSV escaping, XSS in HTML portfolio export, binary format headers) are explicitly exercised.

---

## 2. Test Runner & Framework

- **Test Runner**: [Vitest](https://vitest.dev/) v5.0.2
- **Runtime Environment**: Node.js (`environment: 'node'`)
- **Configuration**: `vitest.config.ts` with module alias `@` mapped to `./src`
- **Execution Engine**: Fast parallel execution with isolated worker threads
- **Assertion Framework**: Vitest `expect`, `describe`, `it`, `beforeEach`, `vi`

### Running the Test Suite

```bash
# Run the entire test suite once
npm test

# Run tests in watch mode during development
npx vitest

# Run only E2E tests across all 4 tiers
npx vitest run tests/e2e/

# Run a specific test tier
npx vitest run tests/e2e/tier1-feature-coverage.test.ts
npx vitest run tests/e2e/tier2-boundary-corner-cases.test.ts
npx vitest run tests/e2e/tier3-cross-feature-interactions.test.ts
npx vitest run tests/e2e/tier4-real-world-scenarios.test.ts
```

---

## 3. Directory Layout

The tests are organized in `tests/e2e/` at the project root alongside existing domain unit tests in `src/lib/`:

```
validore/
├── src/
│   └── lib/
│       ├── financial.test.ts                  # Unit: Financial modeling & formulas
│       └── scoring.test.ts                    # Unit: Idea scoring & weights
├── tests/
│   └── e2e/
│       ├── helpers/
│       │   └── test-fixtures.ts               # Shared mock schemas, factories, oracle data
│       ├── tier1-feature-coverage.test.ts     # Tier 1: Feature Coverage (>=5 per feature group)
│       ├── tier2-boundary-corner-cases.test.ts# Tier 2: Boundary & Corner Cases (>=5 per feature group)
│       ├── tier3-cross-feature-interactions.test.ts # Tier 3: Cross-Feature Interactions
│       └── tier4-real-world-scenarios.test.ts # Tier 4: Real-World Founder Journeys
├── TEST_INFRA.md                              # This specification
└── TEST_READY.md                              # Test suite execution status & results summary
```

---

## 4. 4-Tier Test Architecture

The test suite is structured into four distinct verification tiers:

### Tier 1: Feature Coverage (Opaque-Box Requirement Verification)
Focuses on baseline happy paths and contract conformance for all 22 inventory features:
1. **Configuration & Credentials (Features 1-3)**: Supabase URL, anon key, service key, DATABASE_URL format in `.env.local`, `drizzle.config.ts` configuration, and all 12 Drizzle schema tables and enums.
2. **Seeding & Database Baseline (Features 4-6)**: `tier_config` limits for free (2), premium (15), max_premium (50), `founding_member_counter` initialization, and synthetic campaigns dataset (>=300 rows, 9 categories, 'SYNTHETIC DATA' label).
3. **Export Endpoints (Features 7-10)**:
   - `GET /api/export/csv`: `text/csv` Content-Type, RFC 4180 columns and metrics.
   - `GET /api/export/pdf/white-label`: `application/pdf` Content-Type, `%PDF` binary header, strict zero Validore branding.
   - `GET /api/export/portfolio`: `application/zip` Content-Type, `PK` header, `index.html` structure, styles.
   - `GET /api/export/pptx`: `application/vnd.openxmlformats-...` Content-Type, `PK\x03\x04` header, 12 slides.
4. **Credits & Purchasing (Features 11-13)**:
   - `POST /api/credits/purchase`: accepts crowdfunding ($49), pitch_deck ($49), bundle ($79), handles Stripe/Razorpay sessions, returns structured fallback if unconfigured.
   - `/dashboard/credits`: balances display, buy buttons, transaction history table.
   - `/dashboard/settings`: profile info, subscription status, notification preferences, signout.
5. **Quality, Auth, Middleware & Core Modules (Features 14-18)**:
   - Footer and legal pages text replacement: "Shashank V" instead of `[Your Name]`.
   - Middleware route protection for `/dashboard/*`.
   - Core validation, pricing, lean-canvas, crowdfunding, and pitch-deck logic engines.

### Tier 2: Boundary & Corner Cases
Focuses on adversarial inputs, security boundaries, and extreme operating conditions:
1. **Authentication Boundaries**: 401 Unauthorized across all export and credit endpoints when session is missing.
2. **Tier-Gating Boundaries**: 403 Forbidden when a free or premium user attempts unauthorized export types (e.g. CSV on Free, White-label PDF on Free/Pro, Portfolio on Free/Pro, PPTX on Free/Pro).
3. **Parameter Validation**: 400 Bad Request on missing `reportId`, missing `ideaId`/`deckId`, or malformed UUID strings.
4. **Input Malformation**: 400 Bad Request on invalid `creditType`, zero or negative quantity in purchase requests.
5. **Tenant Isolation**: 404/403 when User A attempts to access or export User B's reports or decks.
6. **Data Escaping Integrity**:
   - RFC 4180 escaping: Commas, double quotes (`"foo, "bar"` -> `"\"foo, \"bar\""`), and newlines in startup names and rationale.
   - Character encoding: Full UTF-8 support for unicode, emojis, accents, and international text without truncation.
   - XSS sanitization: HTML tags within startup descriptions safely rendered without script execution in portfolio exports.
7. **Resource & Quota Limits**: Exactly 0 credits handling, boundary limit values (0, 1, 2, 14, 15, 49, 50), and division-by-zero resilience in pricing formulas.

### Tier 3: Cross-Feature Interactions
Validates multi-subsystem workflows and state transitions:
1. **Auth + Tier Gating + Export Matrix**: Multi-tier access matrix across 3 tiers (`free`, `premium`, `max_premium`) against all 5 export types.
2. **Credits Purchase -> Webhook Simulation -> Balance Increment -> Feature Unlock**:
   - Free user initially has 0 credits (access denied to Crowdfunding/Pitch Deck).
   - Simulates payment webhook receiving `checkout.session.completed`.
   - Balances updated in database -> feature unlocks via credit allowance.
   - Execution consumes credit -> balance decrements -> access relocks when balance reaches 0.
3. **Idea -> Validation -> Report -> Multi-Format Export Chain**: End-to-end data fidelity: startup name, scores, and rationale remain identical across Database, CSV rows, PDF headings, and Portfolio HTML.
4. **Monthly Validation Quota Reset & Renewal**: User exhausts monthly validations -> billing period expires -> counter automatically resets to 0 with new billing cycle date.
5. **Founding Member Counter Enrollment & Cap**: Counter increments from 0 up to 100 cap; enrollment is closed once cap is reached.

### Tier 4: Real-World Scenarios
Exercises end-to-end user journeys from the perspective of external actors:
1. **Scenario 1: Bootstrapped Founder on Free Tier**:
   - Registration -> Free idea creation -> Lite validation run -> Report inspection -> Upgrade barrier on export -> Credit pack purchase -> Pitch deck generation.
2. **Scenario 2: Pro Tier Founder Scaling Up**:
   - Serial entrepreneur on Pro tier ($29/mo) -> Multiple idea validations within 15/month limit -> AI Lean Canvas generation -> Pricing simulator with 5x5 sensitivity matrix -> CSV data export -> White-label upgrade prompt.
3. **Scenario 3: Max Premium Enterprise Founder Full-Lifecycle Generation**:
   - Enterprise user on Max tier ($79/mo) -> Full validation -> Crowdfunding predictor benchmarked against synthetic campaigns -> 12-slide Pitch Deck -> White-label PDF export -> Portfolio site ZIP export -> PPTX export.
4. **Scenario 4: Payment Provider Downtime & Error Recovery**:
   - Unconfigured Stripe/Razorpay keys or network timeout -> Graceful 400/503 response with actionable JSON error -> Server remains healthy -> Success once gateway recovers.

---

## 5. Expected Output Derivation & Oracles

Every test case derives its expected output from authoritative sources:
1. **Database Schema & Tiers**: Directly derived from `src/db/schema.ts`, `ORIGINAL_REQUEST.md §R1`, and `PROJECT.md §Tier Gating & Quotas`.
2. **Export Specifications**:
   - CSV: RFC 4180 standard and `PROJECT.md §Export Endpoints Contracts`.
   - White-Label PDF: `@react-pdf/renderer` specifications and `ORIGINAL_REQUEST.md §R2` (zero Validore branding).
   - Portfolio ZIP: `jszip` standards, containing responsive `index.html`, `styles.css`, and `README.md`.
   - PPTX: OpenXML presentation standards (`pptxgenjs`), 12 slides matching `pitchDecks.slides`.
3. **Pricing & Credit Rules**: `ORIGINAL_REQUEST.md §R2` ($49 for crowdfunding, $49 for pitch deck, $79 for bundle).
4. **Financial & Scoring Engines**: Mathematical formulas in `src/lib/financial.ts` and weighting algorithms in `src/lib/scoring.ts`.

---

## 6. Implementation Bug Escalation Protocol

When tests encounter an implementation defect or missing milestone feature:
1. Tests assert the authoritative requirement without compromising test integrity (no facade tests).
2. The discrepancy is documented in the test execution output (expected status/format vs actual).
3. The defect is recorded in `TEST_READY.md` and escalated to the orchestrator for assignment to the responsible implementation worker.
