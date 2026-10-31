# Free beta launch on validore.tech

Publish the Next.js application on Render with the external Supabase database, then connect validore.tech through its .TECH domain dashboard. Configure the provider accounts and verify the hosted application before routing the domain.

Domain: validore.tech, purchased through .TECH Domains. The supplied screenshot shows OrderBox nameservers; it does not show the current A/CNAME/TXT record set. DNS has not been changed.

The proposed first host is Render Free, keeping the existing Node.js/Next.js architecture and external Supabase database. It supports custom-domain TLS but sleeps when idle and has usage limits. Render advises against free instances for production applications, so treat this as a public beta and review capacity before paid-customer commitments. See [Render Free](https://render.com/docs/free) and [Next.js on Render](https://render.com/docs/deploy-nextjs-app).

## Accounts and configuration needed

| Item | What to provide/configure |
| --- | --- |
| GitHub | Repository is https://github.com/shashankv762/Validore; connect the owner account to Render. CI runs from .github/workflows/ci.yml |
| Render | API access verified; no service exists yet. Create the free web service after final release checks |
| Supabase | Rotate the exposed DB password/private key; configure the server connection, schema/grants and Auth redirects |
| AI | Three gateway profiles and 13 model candidates configured in ignored .env.local; availability unverified; future host secrets pending |
| Upstash | REST credentials configured; PONG verified |
| Inngest | Event/signing keys configured locally; hosted endpoint sync pending |
| Email | User reports Resend/custom SMTP configured; signup accepted, inbox delivery and confirmation still being tested |

Upstash and Inngest publish free tiers with usage caps: [Redis pricing](https://upstash.com/pricing/redis), [Inngest pricing](https://www.inngest.com/pricing). Supabase's default SMTP restricts recipients to project-team addresses, so it is insufficient for public onboarding: [SMTP setup](https://supabase.com/docs/guides/auth/auth-smtp).

Leave Stripe/Razorpay settings empty for the first free beta if billing is not ready. Unconfigured billing actions return an unavailable message. Hosting at zero cost does not mean unlimited AI, email, database, or queue capacity.

## Deployment sequence

1. Finish final source verification and staging acceptance. Current evidence/blocks are in IMPLEMENTATION_STATUS.md.
2. The two reviewed database deltas were applied on 2026-10-31; browser-role denial and owner access were verified. Do not run development seeds against this hosted database.
3. Create the Free Render service from the Git repository using render.yaml. It provisions no paid DB, worker, or disk. Automatic deployment is off so unchecked pushes do not become releases.
4. Populate the service environment, including the selected AI provider key. Public app origin is https://validore.tech. The build installs dev tools explicitly, runs CI/audit, builds standalone output, and copies its assets.
5. Use the first successful service deployment to obtain the onrender.com hostname and the Custom Domains record instructions. Inspect the preview before routing the domain.
6. In .TECH DNS Records, add the exact apex/www and verification records Render supplies. Preserve unrelated mail/TXT records. Existing nameservers can remain; do not invent an IP or delete unrelated DNS records from the screenshot alone.
7. Verify validore.tech in Render and check HTTPS. Configure Supabase Site URL and callback allowlist for that exact origin. Verify SMTP delivery with a non-team test user.
8. Configure Inngest to reach https://validore.tech/api/inngest. Exercise complete, partial, failed and retried jobs using test accounts.
9. Run a monitored release of the tested commit using the Render release procedure below.

If the hosting environment needs IPv4, use Supabase's appropriate pooler connection string from its Connect panel rather than guessing a hostname. Keep prepare=false in the application's PostgreSQL client. Preserve localhost in .env.local for development; production host settings are separate.

## Google sign-in

Create a Web application OAuth client in [Google Auth Platform](https://console.cloud.google.com/auth/clients), using only the identity scopes `openid`, `email`, and `profile`. Complete Google's app branding and audience configuration for the intended users.

| Provider setting | Value |
| --- | --- |
| Google authorized JavaScript origins | `https://validore.tech` and `http://localhost:3000` for local testing |
| Google authorized redirect URI | `https://zuxbogoxodcxvpwglyum.supabase.co/auth/v1/callback` |
| Supabase Google provider | Enable Google and enter the Google OAuth client ID and client secret |
| Supabase Site URL, after public HTTPS works | `https://validore.tech` |
| Supabase redirect URL | `https://validore.tech/auth/callback` |
| Supabase development redirect URL | `http://localhost:3000/**` |

The Google redirect URI points to Supabase; the Supabase redirect URL points back to this app. Keep the Google client secret in Supabase's provider settings, never in source control or a `NEXT_PUBLIC_` variable. The Google AI API key is unrelated to Google OAuth. See [Supabase Google provider setup](https://supabase.com/docs/guides/auth/social-sign-in/auth-google).

Create the Render service before editing DNS. In the [domain dashboard](https://namify.get.tech/dashboard/manage-domain), open the domain's DNS Service and use the records supplied by Render. Keep unrelated mail and verification records. Verify HTTPS before changing the production Supabase Site URL and testing Google sign-in on the public domain.

## Live release

The Render release is an operator-run step, not part of the CI workflow. scripts/render-deployment.mjs performs it and is deliberately kept out of automated CI so that no pull request build can reach a deployment credential.

Run it from a trusted machine against a verified main/master commit, with BUILD_PROFILE=release and real public settings:

| Variable | Value |
| --- | --- |
| RENDER_API_KEY | Render API key; keep it in a local secret store, never in the repository or a PR build |
| RENDER_SERVICE_ID | The srv-... service ID of the free beta or configured live service |
| GIT_SHA_FULL | The full commit SHA that passed CI |
| NEXT_PUBLIC_APP_URL | https://validore.tech |
| RENDER_ROLLBACK_ON_FAILURE | true to restore the previous live release if public checks fail and this deployment is still current |

Automatic Render deploys must remain off, so an unchecked push does not become a release. Deploy only a commit whose CI run passed.

The script deploys GIT_SHA_FULL through Render's API, waits for live status, and checks the public health commit and landing page. Queued responses are resolved by commit rather than submitting duplicate mutations. If public checks fail after activation, its optional rollback only acts when that deployment is still current. A rollback remains a failed release, with a recorded outcome. Ambiguous trigger responses do not blindly trigger a second deploy.

reports/render-deploy.json stores revision/status evidence without the API key. Timeout, rollback, DNS or health failure needs operator review in Render before retrying. Source automation and mocked regressions have not yet been exercised against a live Render service.

## Still required before saying live and usable

Confirm HTTPS routing, public signup/confirmation/reset, idea ownership, validation completion/failure/refund, report history, module-pack use, real balances, and responsive keyboard-accessible UI. Record the final full CI run, dependency audit and release result. Do not treat the liveness endpoint as proof that Supabase, Redis, AI or Inngest is ready.
