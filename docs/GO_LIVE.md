# Free beta launch on validore.tech

Deferred until after the localhost/Jenkins classroom presentation. Render, Upstash and Inngest accounts have been created; their service settings and public deployment acceptance remain pending. See CLASSROOM_DEMO.md for the current priority.

Domain: validore.tech, purchased through .TECH Domains. The supplied screenshot shows OrderBox nameservers; it does not show the current A/CNAME/TXT record set. DNS has not been changed.

The proposed first host is Render Free, keeping the existing Node.js/Next.js architecture and external Supabase database. It supports custom-domain TLS but sleeps when idle and has usage limits. Render advises against free instances for production applications, so treat this as a public beta and review capacity before paid-customer commitments. See [Render Free](https://render.com/docs/free) and [Next.js on Render](https://render.com/docs/deploy-nextjs-app).

## Accounts and configuration needed

| Item | What to provide/configure |
| --- | --- |
| GitHub | Repository is https://github.com/shashankv762/Validore; connect the owner account to Render |
| Render | Account created; web service configuration, service ID and onrender.com hostname pending |
| Supabase | Rotate the exposed DB password/private key; configure the server connection, schema/grants and Auth redirects |
| AI | Three gateway profiles and 13 model candidates configured in ignored .env.local; availability unverified; future host secrets pending |
| Upstash | Account created; REST URL/token setup pending |
| Inngest | Account created; event/signing keys and hosted endpoint setup pending |
| Email | Custom SMTP in Supabase for public confirmation/reset emails, plus the provider's domain-verification records |
| Jenkins | Controller URL and trusted multibranch release job; its API credential must stay in Jenkins |

Upstash and Inngest publish free tiers with usage caps: [Redis pricing](https://upstash.com/pricing/redis), [Inngest pricing](https://www.inngest.com/pricing). Supabase's default SMTP restricts recipients to project-team addresses, so it is insufficient for public onboarding: [SMTP setup](https://supabase.com/docs/guides/auth/auth-smtp).

Leave Stripe/Razorpay settings empty for the first free beta if billing is not ready. Unconfigured billing actions return an unavailable message. Hosting at zero cost does not mean unlimited AI, email, database, or queue capacity.

## Deployment sequence

1. Finish final source verification and staging acceptance. Current evidence/blocks are in IMPLEMENTATION_STATUS.md.
2. Apply reviewed database deltas and seed only the intended development/staging database. Verify hosted data access is denied to browser roles.
3. Create the Free Render service from the Git repository using render.yaml. It provisions no paid DB, worker, or disk. Automatic deployment is off so unchecked pushes do not become releases.
4. Populate the service environment, including the selected AI provider key. Public app origin is https://validore.tech. The build installs dev tools explicitly, runs CI/audit, builds standalone output, and copies its assets.
5. Use the first successful service deployment to obtain the onrender.com hostname and the Custom Domains record instructions. Inspect the preview before routing the domain.
6. In .TECH DNS Records, add the exact apex/www and verification records Render supplies. Preserve unrelated mail/TXT records. Existing nameservers can remain; do not invent an IP or delete unrelated DNS records from the screenshot alone.
7. Verify validore.tech in Render and check HTTPS. Configure Supabase Site URL and callback allowlist for that exact origin. Verify SMTP delivery with a non-team test user.
8. Configure Inngest to reach https://validore.tech/api/inngest. Exercise complete, partial, failed and retried jobs using test accounts.
9. Configure Jenkins's Render release stage and run a monitored release of the tested commit.

If the hosting environment needs IPv4, use Supabase's appropriate pooler connection string from its Connect panel rather than guessing a hostname. Keep prepare=false in the application's PostgreSQL client. Preserve localhost in .env.local for development; production host settings are separate.

## Jenkins controller and live release

The controller URL is the address used to open Jenkins, often http://localhost:8080 for a local install. Check Manage Jenkins → System → Jenkins Location → Jenkins URL. See [Jenkins configuration](https://www.jenkins.io/doc/book/managing/system-configuration/). A local controller can run classroom CI and trigger Render releases while your computer is running.

For a live Render release, use a trusted main/master multibranch job with BUILD_PROFILE=release, DEPLOY_RENDER=true, a valid RENDER_SERVICE_ID and real public settings. SKIP_DOCKER can remain true. Store the Render API key as Secret text credential validore-render-api, scoped to the trusted job; never expose it to PR builds. Keep the controller and agents patched and access-restricted.

The stage requests approval, deploys GIT_SHA_FULL through Render's API, waits for live status, and checks the public health commit and landing page. If public checks fail after activation, its optional rollback only acts when that deployment is still current. A rollback remains a failed CI release, with a recorded outcome. Ambiguous trigger responses do not blindly trigger a second deploy.

reports/render-deploy.json stores revision/status evidence without the API key. Timeout, rollback, DNS or health failure needs operator review in Render before retrying. Source automation and mocked regressions have not yet been exercised against a live Render service.

## Still required before saying live and usable

Confirm HTTPS routing, public signup/confirmation/reset, idea ownership, validation completion/failure/refund, report history, module-pack use, real balances, and responsive keyboard-accessible UI. Record the final full CI run, dependency audit, Jenkins controller validation and release result. Do not treat the liveness endpoint as proof that Supabase, Redis, AI or Inngest is ready.
