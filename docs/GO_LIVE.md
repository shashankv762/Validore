# Validore public beta and custom-domain setup

The application is live at **https://validore.onrender.com** on Render Free, using external Supabase PostgreSQL/Auth, Redis, Inngest, email and AI services. Application commit `6538a6bad5c612290cf6b3e027e759c22c314208` passed CI and hosted acceptance. See the [release evidence](RELEASE_EVIDENCE_2026-10-31.md) and [implementation status](IMPLEMENTATION_STATUS.md).

`validore.tech` was purchased through .TECH Domains. The apex and `www` names are attached to Render but are not routed or verified. Existing OrderBox nameservers can remain.

## Current service

| Item | Current state |
| --- | --- |
| GitHub | https://github.com/shashankv762/Validore |
| Render | Free plan, Singapore; automatic deployment off |
| Service dashboard | https://dashboard.render.com/web/srv-dbipj6142hec73b5bor0 |
| Supabase | Auth/database connected; SQL deltas, application-table RLS and browser-role denial verified |
| AI | Native Google fallback chain completed all six agents; direct-provider priority enabled, KIOS fallback |
| Redis | REST credentials configured; PONG verified |
| Inngest | Hosted endpoint registered; real queued lite validation completed |
| Email | Confirmation/reset delivery and hosted recovery/password change verified |
| Google OAuth | Provider enabled and initiation verified; interactive completion still needs verification |
| Billing | Unconfigured; purchase actions remain unavailable |

Render Free sleeps when idle and has usage limits. Render advises against free instances for production applications; review capacity before paid-customer commitments. AI, email, database and queue quotas are separate. References: [Render Free](https://render.com/docs/free), [Next.js on Render](https://render.com/docs/deploy-nextjs-app), [Redis pricing](https://upstash.com/pricing/redis), [Inngest pricing](https://www.inngest.com/pricing).

## Finish the custom domain

Dashboard access was stopped/unavailable in this session, so DNS changes remain outstanding. In the [.TECH domain dashboard](https://namify.get.tech/dashboard/manage-domain), open DNS Service and add/update:

| Type | Host | Value |
| --- | --- | --- |
| A | `@` | `216.24.57.1` |
| CNAME | `www` | `validore.onrender.com` |

Use the default TTL. Replace conflicting records only for these web hosts, including any stale apex AAAA record; preserve Resend MX, TXT, DKIM and unrelated records. Targets come from this service and [Render's DNS instructions](https://render.com/docs/configure-other-dns).

Once DNS resolves, verify both names in Render's Custom Domains panel and wait for TLS issuance. Check `https://validore.tech/api/health` against the deployed SHA, the landing page, sign-in, a fresh recovery callback and report history. Verify `www` redirects to the apex. Keep the working Render hostname available during this transition.

Deployed settings already include:

```dotenv
NEXT_PUBLIC_APP_URL=https://validore.tech
AUTH_ALLOWED_ORIGINS=https://validore.onrender.com
INNGEST_SERVE_ORIGIN=https://validore.onrender.com
VALIDATION_RUNNER=inngest
TRUSTED_PROXY_HOPS=1
```

Inngest can continue using the reachable Render hostname after domain activation. Any endpoint change requires registration and a queue check. Keep the auth alias while users or email flows use the Render hostname.

## Auth provider configuration

The user reported saving Supabase URLs and enabling Google. Hosted recovery independently verified the Render callback. Keep these entries when completing the domain:

| Setting | Value |
| --- | --- |
| Supabase Site URL | `https://validore.tech` |
| Supabase apex callbacks | `https://validore.tech/auth/callback` and `https://validore.tech/auth/callback?next=/auth/reset-password` |
| Supabase Render callbacks | `https://validore.onrender.com/auth/callback` and `https://validore.onrender.com/auth/callback?next=/auth/reset-password` |
| Supabase local callback allowlist | `http://localhost:3000/**` |
| Google authorized redirect URI | `https://zuxbogoxodcxvpwglyum.supabase.co/auth/v1/callback` |
| Google authorized JavaScript origins | `https://validore.tech`, `https://validore.onrender.com`, and `http://localhost:3000` for local testing |

Google redirects to Supabase; Supabase redirects to the app. Use only identity scopes `openid`, `email` and `profile`, and check Google's audience/publication settings for intended users. Keep the OAuth secret in Supabase, never source control or a `NEXT_PUBLIC_` variable. The Google AI key is unrelated to OAuth. See [Google provider setup](https://supabase.com/docs/guides/auth/social-sign-in/auth-google).

Email uses configured external SMTP. Preserve the verified Resend domain's records. Supabase's default mail service is insufficient for general public onboarding; see [SMTP setup](https://supabase.com/docs/guides/auth/auth-smtp).

## Future releases and rollback

Automatic Render deployment remains off. Push source, wait for the exact commit's CI to pass, then deploy it explicitly. Documentation-only commits after the release do not change the deployed application SHA.

`scripts/render-deployment.mjs` performs the operator-run release and is deliberately excluded from CI. Run it from the trusted R-drive checkout with `BUILD_PROFILE=release` and real public settings:

| Variable | Value |
| --- | --- |
| `RENDER_API_KEY` | Local secret; never source control or PR builds |
| `RENDER_SERVICE_ID` | `srv-dbipj6142hec73b5bor0` |
| `GIT_SHA_FULL` | Full SHA that passed CI |
| `NEXT_PUBLIC_APP_URL` | `https://validore.tech` |
| `RENDER_ROLLBACK_ON_FAILURE` | `true` to restore the previous live release if checks fail and this deployment is still current |

The script submits the commit, waits for live status, then checks health revision and landing page. Ambiguous trigger responses are resolved by commit instead of blindly submitting another deployment. A rollback remains a failed release with a recorded outcome. Successful real deployment was exercised this session; rollback was not induced against the live service.

Keep secrets, test credentials and cookies out of release evidence. Rotate credentials exposed in chat and update dependent services together; rotation remains unverified. Never point development seeds at the hosted database. Use reviewed migrations for existing deployments. If IPv4 is needed, use the appropriate Supabase pooler connection string with `prepare=false`.

## Acceptance boundaries

Hosted email/password auth, recovery, queue completion, balance charging, owned report retrieval, anonymous denial and report history passed. A full six-agent run passed locally on R. Domain DNS/TLS, interactive Google completion, billing, browser accessibility/responsiveness and induced production failure/refund remain unverified. `/api/health` proves liveness and revision, not external dependency readiness.
