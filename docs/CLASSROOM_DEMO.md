# Classroom presentation: localhost

The current priority is the local presentation. Domain/DNS, Render, Redis, Inngest and public releases are deferred.

Current environment evidence: Node 24.14.1 and npm 11.11.0 are available; node_modules and .env.local exist. The latest automated application checks have not run because the required Luna R: environment is unavailable.

## 1. Start the real application

Open PowerShell in the Validore project folder:

~~~powershell
.\scripts\Start-ClassroomApp.ps1
~~~

Keep the terminal open and visit http://localhost:3000. The launcher uses the local validation runner and binds the server to this computer. It preserves .env.local and only sets process-scoped overrides. If dependencies are absent, use -InstallDependencies. Ctrl+C stops the server.

The authenticated app still needs its real services:
- Supabase public URL/publishable key and DATABASE_URL are in the existing ignored .env.local. Private credentials remain exposed until rotated.
- The three AI gateway keys and 13 supplied model IDs are configured locally. Model availability and live generation are unverified.
- Database tables/tier configuration must already be present. Review existing schema/deltas before running database commands; db:push and db:seed modify the configured database. Do not seed a live customer database merely to prepare a demo.
- Use an existing confirmed test account. Supabase email confirmation/reset still depends on email configuration. A local app does not make remote Supabase or AI services available offline.
- Empty optional billing/search/Redis/Inngest settings are allowed for development. Without search, evidence is labeled unverified. Payment actions require configured payment services.

Sign in, save an idea, run a validation, open its report/history, and try the manual Lean Canvas. Manual saves do not use AI credits; all canvas writes share the four-version limit. Local background jobs stop if the app process is closed.

## 2. Prepare the sample as a fallback

Open http://localhost:3000/demo. This read-only fictional report needs no database, login, or AI requests. It is explicitly labeled a classroom sample and uses the original logo/colors. Use it to explain weighted scores and assumptions if an external service is unavailable; it is not evidence that live generation succeeded.

Preload the pages and complete a rehearsal before presenting. The dev server compiles routes on first visit. Do not expose .env.local or the provider text file on the projector.

## 3. Show the quality gates

Run the same strict checks the CI workflow runs, in a second terminal:

~~~powershell
npm run lint:ci
npm run typecheck
npm run test:ci
npm run build
npm run smoke:production
npm audit --omit=dev --audit-level=high
~~~

The smoke step starts the built standalone artifact on an available loopback port, checks health/landing/sample/logo/cache behavior, and stops the server. Its report is reports/production-smoke.json. This demonstrates verification of a build artifact; the separately running app at port 3000 is your persistent presentation instance.

[.github/workflows/ci.yml](../.github/workflows/ci.yml) runs this same sequence on push and pull request, and uploads the JUnit and smoke reports. Dependency installation and the audit require internet. A failure stays failed; security gates and tests are not skipped to create a green demonstration. Small laptops may need the dev app closed during the production build to free memory.

## 4. Presentation outline

1. Show the product on localhost, explain the idea workflow, agents, evidence labels and reports.
2. Explain how lint, route types, tests and dependency audit prevent a bad change from reaching a deployment.
3. Open a test result, the build ID and smoke report. Show actual outcomes rather than describing an unexecuted run as passing.
4. Explain the build-and-verify lifecycle, then the CI workflow as the automated form of it and the later public hosting path.

For a controlled failure demonstration, make a small temporary type error locally, run the gates, show typecheck failing, then undo that exact edit and rerun. Rehearse this beforehand and never change a test/security rule to force a pass.

## Acceptance still pending

Luna previously passed an earlier backend checkpoint: TypeScript, 60 focused tests, and a production build. Many edits followed it. Current lint/types/tests/build/standalone smoke, the PowerShell launcher, the CI workflow and live app journeys remain unverified.

Codex Luna's global worker definition still requires its R-only runner and forbids SSD fallback. These ordinary user commands are not used by the agent to bypass that rule. Restore writable R:\CodexLuna or update that global worker configuration through its owner to enable the final agent verification. See IMPLEMENTATION_STATUS.md.
