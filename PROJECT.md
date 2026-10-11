# Project: Validore — Production Readiness

## Architecture
- **Framework**: Next.js 16.3.7 (App Router, Turbopack, React 19)
- **Database & ORM**: PostgreSQL (Supabase) via Drizzle ORM (`drizzle-orm@^0.45.3`, `postgres@^3.4.9`, `drizzle-kit@^0.31.11`)
- **Authentication**: Supabase Auth (`@supabase/ssr@^0.9.0`, `@supabase/supabase-js@^2.100.0`) synchronized with `users` PostgreSQL table
- **Validation Modules**:
  1. Validation Reports (`/api/validate`, `/dashboard/report/[reportId]`)
  2. Lean Canvas Automation (`/api/lean-canvas`, `/dashboard/lean-canvas`)
  3. Pricing Simulator (`/api/pricing`, `/dashboard/pricing`)
  4. Crowdfunding Predictor (`/api/crowdfunding`, `/dashboard/crowdfunding`, `synthetic_campaigns`)
  5. Pitch Deck Builder (`/api/pitch-deck`, `/dashboard/pitch-deck`)
- **Export Engines**:
  - CSV: native streaming / formatting
  - PDF & White-label PDF: `@react-pdf/renderer`
  - Portfolio ZIP: `jszip` with HTML/CSS templates
  - PPTX: `pptxgenjs`
- **Payment & Credits**:
  - Providers: Stripe (`stripe`), Razorpay (`razorpay`)
  - Purchase Endpoint: `POST /api/credits/purchase`
  - Webhooks: `/api/webhooks/stripe`, `/api/webhooks/razorpay`
  - Balance Management: `users.crowdfundingCredits`, `users.pitchDeckCredits`, `creditPurchases`

---

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Supabase Credentials in `.env.local` | Configure valid Supabase URL, anon key, service key, and DATABASE_URL | M1 | ORIGINAL_REQUEST §R1 |
| 2 | Drizzle Configuration Update | Load `.env.local` in `drizzle.config.ts` so CLI push works | M1 | Survey DB Report |
| 3 | Schema Push to Supabase | Push all 12 tables and 4 enums to Supabase PostgreSQL database | M1 | ORIGINAL_REQUEST §R1 |
| 4 | Tier Config Seeding | Seed `tier_config` with free, premium, and max_premium limits | M1 | ORIGINAL_REQUEST §R1 |
| 5 | Founding Member Counter Seeding | Seed `founding_member_counter` with id=1, count=0, cap=100 | M1 | ORIGINAL_REQUEST §R1 |
| 6 | Synthetic Campaigns Seeding | Run seed script to populate >=300 rows in `synthetic_campaigns` | M1 | ORIGINAL_REQUEST §R1 |
| 7 | `GET /api/export/csv` | Export validation report as CSV with comprehensive metrics and scores | M2 | ORIGINAL_REQUEST §R2 |
| 8 | `GET /api/export/pdf/white-label` | White-labeled PDF export (no Validore branding) via @react-pdf/renderer | M2 | ORIGINAL_REQUEST §R2 |
| 9 | `GET /api/export/portfolio` | Generate portfolio site ZIP containing functioning HTML/CSS with report data | M2 | ORIGINAL_REQUEST §R2 |
| 10 | `GET /api/export/pptx` | Export pitch deck as PPTX with real slide content (support ideaId and deckId) | M2 | ORIGINAL_REQUEST §R2 |
| 11 | `POST /api/credits/purchase` | Create checkout session (Stripe/Razorpay) or graceful error fallback | M3 | ORIGINAL_REQUEST §R2 |
| 12 | `/dashboard/credits` Page | Full credits page: balances, buy buttons, transaction history | M3 | ORIGINAL_REQUEST §R2 |
| 13 | `/dashboard/settings` Page | Settings page: profile info, subscription, notifications, account actions | M3 | ORIGINAL_REQUEST §R2 |
| 14 | Landing & Legal Footer Polish | Replace `[Your Name]` with "Shashank V" in page.tsx and legal pages | M4 | ORIGINAL_REQUEST §R3 |
| 15 | Auth Flow & DB User Sync | Implement signin/signup API routes and user auto-provisioning in Postgres | M4 | ORIGINAL_REQUEST §R3 |
| 16 | Middleware Route Protection | Verify route protection and auth redirection for `/dashboard/*` | M4 | ORIGINAL_REQUEST §R3 |
| 17 | UI Error, Loading & Empty States | Polish dashboard pages, replace alert() calls, handle empty data | M4 | ORIGINAL_REQUEST §R3 |
| 18 | Existing API Route Verification | Ensure existing API routes operate properly with live database | M4 | ORIGINAL_REQUEST §R3 |
| 19 | Test Suite Expansion | Ensure financial and scoring tests pass, add unit tests for new logic | M5 | ORIGINAL_REQUEST §R4 |
| 20 | ESLint Cleanliness | Resolve all 26 ESLint errors and warnings across codebase | M5 | ORIGINAL_REQUEST §R4 |
| 21 | Build & Runtime Verification | Clean compile and start via `npm run build && npm run start` with zero errors | M5 | ORIGINAL_REQUEST §R5 |
| 22 | Requirement-driven E2E Tests | Independent test suite covering R1-R5 across all 4 tiers | E2E | Project Pattern |

---

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Database Setup & Seeding | Credential config, Drizzle push, seed tier_config, founding_member_counter, synthetic_campaigns | None | DONE |
| M2 | Export Endpoints & Utilities | CSV, white-label PDF, portfolio ZIP, PPTX export routes | M1 | DONE |
| M3 | Credits & Settings Modules | `POST /api/credits/purchase`, `/dashboard/credits`, `/dashboard/settings` | M1 | DONE |
| M4 | Bug Fixes, Auth, Middleware & UI Polish | Footer "Shashank V", auth routes & DB sync, middleware, UI states | M1 | DONE |
| M5 | Testing, Linting & Build Verification | Business logic unit tests, ESLint clean (0 errors), `npm run build && npm run start` | M2, M3, M4 | DONE |
| E2E | E2E Testing Track | Independent requirement-driven test suite (Tiers 1-4) published via `TEST_READY.md` | M1 | DONE |

---

## Interface Contracts

### Auth & User Sync
- **Supabase Auth**: provides `user.id` (UUID string), `user.email`.
- **Database User**: `users` table record where `supabaseId === user.id`.
- **Contract**: Every authenticated request handler queries:
  ```typescript
  const [dbUser] = await db.select().from(users).where(eq(users.supabaseId, user.id));
  ```
  If not found, auto-upsert user record with default tier `'free'`.

### Tier Gating & Quotas
- `tier_config` specifies feature booleans:
  - `canExportCsv`: premium, max_premium
  - `canWhitelabelPdf`: max_premium
  - `canPortfolioExport`: max_premium
  - `canExportPptx`: max_premium
- Module credits fallback:
  - `pitchDeckCredits`: allows pitch deck access if > 0 even on free tier
  - `crowdfundingCredits`: allows crowdfunding access if > 0 even on free tier

### Credits Purchase Contract
- Request: `POST /api/credits/purchase`
  - Payload: `{ creditType: 'crowdfunding' | 'pitch_deck' | 'bundle', quantity?: number, provider?: 'stripe' | 'razorpay' }`
  - Response: `{ url: string }` or `{ error: string }` with HTTP 400/503 if provider unconfigured.

### Export Endpoints Contracts
- `GET /api/export/csv?reportId=<uuid>` -> `Content-Type: text/csv; filename=validation-report-<id>.csv`
- `GET /api/export/pdf/white-label?reportId=<uuid>` -> `Content-Type: application/pdf; filename=white-label-report-<id>.pdf`
- `GET /api/export/portfolio?reportId=<uuid>` -> `Content-Type: application/zip; filename=portfolio-<id>.zip`
- `GET /api/export/pptx?ideaId=<uuid>` or `?deckId=<uuid>` -> `Content-Type: application/vnd.openxmlformats-officedocument.presentationml.presentation`

---

## Code Layout
- `src/db/`: Database schema, connection pool (`src/db/index.ts`, `src/db/schema.ts`)
- `scripts/`: Database seeding and migration scripts (`scripts/seed-*.ts`)
- `src/app/api/`: Next.js App Router API endpoints
  - `src/app/api/credits/purchase/route.ts`
  - `src/app/api/export/{csv, pdf, pdf/white-label, portfolio, pptx}/route.ts`
  - `src/app/api/auth/{signin, signup}/route.ts`
  - `src/app/auth/callback/route.ts`
- `src/app/dashboard/`: Dashboard pages
  - `src/app/dashboard/credits/page.tsx`
  - `src/app/dashboard/settings/page.tsx`
- `src/app/`: Landing page (`src/app/page.tsx`), legal pages (`src/app/legal/`)
- `src/middleware.ts`: Next.js middleware for auth & route protection
- `tests/`: Vitest test suites (`src/lib/__tests__/`, `tests/`)
