# Cloudflare migration verification — November 1, 2026

The source is prepared for **Cloudflare Workers with Static Assets**, using Next.js 16.4.3, OpenNext 1.20.15 and Wrangler 4.156.0. It has not been published, pushed to Git, or connected to a Cloudflare account/custom domain. No production schema, external scheduler or provider account was modified. Follow [GO_LIVE.md](GO_LIVE.md) to configure and publish.

**Policy correction from the subsequent prototype review:** the earlier compressed-size comparison was outdated. Cloudflare [removed compressed limits on 4 September 2026](https://developers.cloudflare.com/changelog/post/2026-09-04-increased-worker-size-limit/); both plans now allow 64 MiB uncompressed. The newer reward release passes build/dry-run/14 runtime smoke checks at **20,351.99 KiB uncompressed / 4,986.50 KiB gzip**. It fits the size limit. Free-plan CPU compliance is unverified; this repository retains a Paid CPU configuration. See [current status](IMPLEMENTATION_STATUS.md) and [free hosting comparison](FREE_PROTOTYPE_DEPLOYMENT.md).

## Implemented

- Removed hosting configuration, upload rules, starter logo, provider-specific environment handling and launch instructions for the previous platform. Updated privacy disclosures and the static portfolio's hosting instructions. Third-party license attribution and framework dependency names are preserved.
- Added OpenNext/Wrangler configuration, static asset cache headers, manual build/preview/dry-run/deploy commands, production environment template and a repeatable local Workers smoke runner.
- Added the daily UTC credit/retention Cron Trigger. The scheduled handler supplies CRON_SECRET internally and reports failures; Inngest remains responsible for durable AI jobs.
- Scoped PostgreSQL pools to each Worker request, with cleanup after streaming completion/cancellation. Node development retains a process-local pool. Forwarded client IPs are replaced using Cloudflare ingress information.
- Added a Workers fetch path for public research, with URL/redirect checks, timeouts, byte limits and no user/provider credentials. Node hosting retains its DNS-pinned transport.
- Loaded fonts/logos through the ASSETS binding on Workers. Replaced the PDF renderer whose runtime WebAssembly compilation was rejected by workerd with pdf-lib/fontkit. Standard and white-label exports use the shared renderer; the latter keeps its tier/ownership gates and excludes product branding.
- Regenerated the public templates and visually reviewed all five PDF pages. The Word renderer/content layout is unchanged.
- Retained ordinary Next.js development and optional local Node/container commands. The Cloudflare build uses webpack; Turbopack's traced junctions caused Windows packaging failure during initial verification.

## Completed checks

| Check | Result |
| --- | --- |
| Strict ESLint | Passed |
| Route type generation and TypeScript | Passed |
| Unit/regression suite | 494 passed; 8 database-dependent tests skipped (56 files passed, 1 skipped) |
| Release-file boundaries | 36 exclusions and 27 required inputs passed; no currently tracked ignored files |
| npm clean-install dry run | Passed |
| Next.js + OpenNext production build | Passed on Windows with Node 24.14.1 |
| Wrangler deployment dry run | Passed; preceding artifact **4,944.28 KiB gzip**. This is an informational compression metric, not the current plan limit. |
| Local workerd smoke | **14 checks passed**: health, public/sample/legal pages, metadata, images, template, unauthorized cron, synthetic multi-page PDF/white-label PDF/DOCX/PPTX |
| Public PDF template | Five pages rendered and visually reviewed; no orphan overflow page |
| Production dependency audit | 0 vulnerabilities |
| Full dependency audit | 20 moderate development-tool findings remain; new high-severity glob dependency findings were resolved with scoped overrides |
| Diff whitespace validation | Passed |

Local results are in ignored reports/cloudflare-smoke.json. The smoke runner creates an isolated temporary Worker entry point with synthetic export routes under .tmp; these routes are not part of cloudflare/worker.mjs or the deploy configuration. Tests do not establish real authenticated export/database behavior on a hosted Worker.

## Limits and launch requirements

- The checked-in 300,000 ms CPU configuration targets **Workers Paid**, starting at US$5/month plus usage; the free DNS/site plan is separate. Bundle size does not rule out Free under the current policy. Qualify the real workload against Free's 10 ms CPU budget before changing runtime configuration. No subscription was purchased.
- OpenNext emits upstream cautions about Windows and experimental Node middleware support. Wrangler emits a direct-eval warning from the CSSOM dependency's fallback error-constructor lookup. The build and tested runtime paths pass; this is not a claim of a warning-free dependency stack.
- The local build used the existing local public settings. Rebuild in a clean checkout with the production environment before publishing; build-time NEXT_PUBLIC_* values and runtime Worker variables/secrets must agree.
- Configure the production database/Redis/AI/Inngest secrets, required reviewed SQL deltas, SMTP, Google callbacks, payment webhooks, nameservers and Worker Custom Domains. None were provisioned or exercised end-to-end in this migration.
- Complete hosted signup/recovery, two-account isolation, real Full/Lite queue completion, refunds, authenticated exports, Stripe acceptance and CPU/memory/load checks. Local workerd does not enforce all account-plan limits.
- Retire old external deploy hooks, domains and schedulers only as part of the controlled cutover. Local file removal does not delete remote projects/accounts or cancel subscriptions.
