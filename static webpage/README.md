# Publish the Validore website and connect the Render app

The website is fully contained in this folder. **Only `public/` is served.** It has no framework, dependencies, database, build step, API keys, or server functions.

- Marketing website: **https://validore.tech**
- Existing SaaS: **https://validore.onrender.com**
- GitHub repository: **https://github.com/shashankv762/Validore**
- Main application setup: [free prototype deployment guide](../docs/FREE_PROTOTYPE_DEPLOYMENT.md)

This implementation is prepared locally. The Render dashboard, GitHub branch, database, Vercel project and DNS still need the publishing steps below. A checked-in configuration does not change an existing remote service on its own.

## 1. Choose the static host

| Choice | Use for this website | Cost consideration |
| --- | --- | --- |
| **Cloudflare Pages Free** | Recommended if a $0 hosting bill for a commercial prototype is essential. Upload/connect this independent static folder. | Static hosting has a Free plan; domain renewal and the SaaS providers remain separate. |
| **Vercel Pro** | Use if you prefer Vercel for your commercial project. The included `vercel.json` is ready. | Paid plan, with usage limits/possible overages. |
| Vercel Hobby | Suitable only if the project actually meets Vercel's non-commercial, personal-use rules. | Making a commercial marketing website static does not remove that restriction. |

Render Free continues to serve the SaaS. Visiting this page can start its wake-up earlier, but cannot guarantee an instant app, ad inventory, AI quota, or continuous availability.

Sources, checked 1 November 2026: [Vercel Hobby restrictions](https://vercel.com/docs/plans/hobby), [Vercel static project configuration](https://vercel.com/docs/project-configuration/vercel-json), [Cloudflare Pages limits](https://developers.cloudflare.com/pages/platform/limits/), [Render Free behavior](https://render.com/docs/free).

## 2. Fix the existing Render build first

The error `Cannot find module '/opt/render/project/src/scripts/ci-config.mjs'` comes from an outdated build command. Commit `5b4e9fe` removed both `scripts/ci-config.mjs` and the old `ci` package script. The former Render configuration still invoked both. Reinstalling dependencies or deleting only the first invocation will not fix the whole command.

**Compatibility repair:** `scripts/ci-config.mjs`, the `npm run ci` entry point, and `scripts/test-ci.mjs` are now restored. The old saved command can work after a commit containing those files and the updated root `package.json` reaches Render. These are real public-configuration, lint, type and test checks, not empty stubs. Tests run with `NODE_ENV=test` even when the host is configured for production. The shorter command below remains recommended when release checks have already been run locally.

1. Review the complete local release, including the earlier credit/ad changes, and commit/push the intended files to the branch Render deploys. Keep `.env.local`, credentials, `.tmp`, and `reports` out of Git. Do not discard the other uncommitted work.
2. Open [Render Dashboard](https://dashboard.render.com/), select the **existing `validore` Web Service**, then **Settings → Build & Deploy**. Do not create a second service just to fix this error.
3. Replace the **entire** Build Command with:

   ```sh
   npm ci --include=dev --no-fund && npm run build:deploy
   ```

4. Replace the Start Command with:

   ```sh
   npm run start:standalone
   ```

5. Use these settings:

   | Setting | Value |
   | --- | --- |
   | Runtime | Node |
   | Root Directory | Empty / repository root |
   | Instance Type | Free |
   | Health Check Path | `/api/health` |
   | Auto-Deploy | Off until the release has been verified |
   | `NODE_VERSION` | `24` |
   | `NODE_ENV` | `production` |
   | `HOSTNAME` | `0.0.0.0` |
   | `NEXT_PUBLIC_APP_URL` | `https://validore.onrender.com` |
   | `INNGEST_SERVE_ORIGIN` | `https://validore.onrender.com` |
   | `VALIDATION_RUNNER` | `inngest` |
   | `VALIDATION_GLOBAL_CONCURRENCY` | `1` for the small pilot |
   | `CREDIT_MAINTENANCE_RUNNER` | `inngest` |
   | `REWARDED_ADS_ENABLED` | `false` until publisher approval and integration testing |

   Retain the existing working Supabase, PostgreSQL, Redis, AI and Inngest credentials. Render supplies `PORT`. Remove any old start command/redirect that sends the app back to `validore.tech`.

6. **Before deploying the current app revision, apply and verify the required database changes through `drizzle/0004_rewarded_ads.sql`.** The new account queries require `reward_credits` even when ads are off. Follow the backed-up/staging database procedure in the [main guide](../docs/FREE_PROTOTYPE_DEPLOYMENT.md#4-prepare-postgresql-before-deploying-the-new-code); do not rerun seeds as a repair action against existing user data.
7. Save settings, then use **Manual Deploy → Deploy latest commit**. If an old build artifact is still being reused, choose **Clear build cache & deploy** after correcting the command. With the recommended shorter command, the logs run `build:deploy` and prepare `.next/standalone` directly. If retaining the older command, confirm the deployed commit contains the restored compatibility files first; local changes do not reach Render until committed and pushed.
8. Open `https://validore.onrender.com/api/health`. Expect JSON with `status: "ok"` and `service: "validore"`. Check sign-in and a real pilot validation as well: liveness alone cannot verify external services.

The root [render.yaml](../render.yaml) records these commands. If the existing service is already Blueprint-managed, review and sync that Blueprint. Otherwise, edit the existing service manually; adding YAML to Git alone cannot change its dashboard settings. The blueprint intentionally attaches no `validore.tech` domain and creates no database.

## 3. Keep sign-in and jobs on the app domain

The static website cannot handle authentication callbacks or jobs.

1. Supabase → **Authentication → URL Configuration**:
   - Site URL: `https://validore.onrender.com`
   - Allowed app callback: `https://validore.onrender.com/auth/callback`
   - Add only deliberately used development/staging callbacks.
2. If Google sign-in is enabled, its authorized redirect URI remains the Supabase callback: `https://YOUR-PROJECT.supabase.co/auth/v1/callback`. Where Google requests an authorized JavaScript origin for the app, use `https://validore.onrender.com`.
3. Confirm production SMTP and email confirmation/password-recovery links. Keep credentials out of the static project.
4. Inngest: sync the existing app to `https://validore.onrender.com/api/inngest`, with matching event/signing keys. Verify validation and maintenance functions. Retire any old duplicate maintenance scheduler.
5. Rebuild after changing `NEXT_PUBLIC_*` values: they are compiled into Next.js browser assets.

Existing `/auth/*`, `/dashboard/*`, `/legal/*`, and `/demo` marketing URLs have convenience redirects to the SaaS in both hosting configurations. They preserve navigation; they do not transfer cookies or sign-in state between domains. Restart an old in-progress sign-in flow directly on Render if necessary. No `/api/*` proxy or broad cross-origin permission is added.

## 4. Publish on Vercel

Use an eligible Vercel plan as explained above.

1. Open [Vercel](https://vercel.com/new), select **Add New → Project**, and import `shashankv762/Validore`. Use a **separate marketing project** from any old full-app deployment.
2. Set **Root Directory** to **`static webpage`** (the space is intentional).
3. Set **Framework Preset** to **Other**. Do not choose Next.js.
4. Confirm:

   | Setting | Value |
   | --- | --- |
   | Root Directory | `static webpage` |
   | Framework | Other |
   | Install Command | Override to empty; no install |
   | Build Command | Override to empty; no build |
   | Output Directory | `public` |
   | Environment Variables | None |

   The local `vercel.json` supplies the empty commands, output directory, headers and redirects. The small local `package.json` has no dependencies and keeps the folder independent of the parent Next.js package. Do not select the repository root, `.next`, or `.next/standalone` as marketing output.

5. Deploy. Check the assigned `*.vercel.app` URL: typography, artwork, report selection, mobile layout, all launch links, and 404 page. Temporary preview domains are not automatically trusted to read the app's health response; see section 6.
6. In the marketing project's **Settings → Domains**, add **`validore.tech`** and **`www.validore.tech`**. Make the apex domain primary and configure `www` to redirect there.
7. In the domain's current DNS manager, use the **exact A/CNAME/TXT records Vercel displays for your project**. Replace conflicting old web records for `@` and `www`; preserve email MX/SPF/DKIM/DMARC and other unrelated records. Do not copy an IP from an old tutorial.
8. If an old Vercel project already owns the domain, move it to this marketing project. If a Cloudflare Worker route or forwarding rule intercepts the domain, remove/update that specific route. Keep the Render service reachable on its `onrender.com` address.
9. Wait for domain verification and HTTPS, then test both apex and `www`. Confirm `validore.tech` renders this static website rather than redirecting immediately to the app. The landing page must have time to make its visit-triggered request.

Vercel documentation: [build settings](https://vercel.com/docs/builds/configure-a-build), [adding a domain](https://vercel.com/docs/domains/working-with-domains/add-a-domain).

## 5. Free commercial alternative: Cloudflare Pages

This is for **the new static folder only**. It is independent of the repository's full-app Workers migration.

1. In Cloudflare, open **Workers & Pages → Create application → Pages** and connect the same GitHub repository.
2. Select the intended production branch and set:

   | Setting | Value |
   | --- | --- |
   | Root Directory | `static webpage` |
   | Framework | None |
   | Build Command | Empty; if the form requires a command, `exit 0` |
   | Build Output Directory | `public` |
   | Environment Variables | None |

3. Deploy. Alternatively, use Pages Direct Upload and upload **only the contents of `static webpage/public`**, with `index.html` at the upload root. Git integration is easier for subsequent updates. Choose one method when creating the Pages project; account setup can limit switching later.
4. Add `validore.tech` in that Pages project's **Custom domains**. For an apex Pages domain, the domain must be a Cloudflare zone with its assigned nameservers. If changing DNS providers, inventory and preserve all existing DNS/email records first. Use Cloudflare's domain wizard; do not leave an old Worker route claiming the hostname.
5. Add `www.validore.tech` if desired and configure its redirect to the apex. Test TLS and the app launch links.

`public/_headers` supplies the same security/cache policy, and `public/_redirects` forwards legacy app navigation. No Worker, Pages Function, paid CPU setting, or Next adapter is needed for this folder. Domain renewal, AI, database and queue quotas remain separate from static hosting.

Cloudflare documentation: [static HTML](https://developers.cloudflare.com/pages/framework-guides/deploy-anything/), [custom domains](https://developers.cloudflare.com/pages/configuration/custom-domains/), [Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/).

## 6. How the wake-up works

- A visible visitor opening the website starts a credential-free `GET` to `https://validore.onrender.com/api/health`.
- Render treats an inbound HTTP request as a reason to wake an idle Free instance. Its initial loading HTML or cross-origin failure is expected and is never marked as success.
- The website checks for HTTP success, JSON content, and the exact `status: "ok"`, `service: "validore"` response.
- It retries serially, at most **nine requests within 90 seconds**, with an eight-second request timeout and a ten-second gap after failure. It stops on success or expiry. Hidden/offline pages stop sending requests; returning after the window does not restart a keep-alive loop.
- It never makes account, AI, credit, ad or database calls. Readiness means the web process answered, not that every dependency is healthy.
- Launch anchors always work immediately, including without JavaScript. There is no countdown gate, forced scrolling, auto-redirect, background schedule, or fabricated readiness.
- A status-check failure leaves a usable link. Users who reach the app too quickly may still see Render's loading page. Free hosting cannot remove that possibility.

The backend allows health responses to be read from `https://validore.tech` and `https://www.validore.tech` by default. No cookie credentials or mutation access is enabled. Deploy the new health route before expecting status checks to succeed across origins.

For a Vercel/Pages preview, you can optionally set the following **on Render**, then deploy/restart the app:

```dotenv
HEALTH_CHECK_ALLOWED_ORIGINS=https://YOUR-EXACT-PREVIEW.vercel.app
```

Use exact HTTPS origins without a trailing slash, separated by commas if needed. No wildcards. A preview without this setting can still send a wake request, but cannot read the result and will correctly leave readiness unconfirmed. Local development of the backend additionally allows `http://127.0.0.1:4174` and `http://localhost:4174`; these are never permitted automatically in production.

## 7. Preview and verify before sharing

From the repository root:

```powershell
python -m http.server 4174 --bind 127.0.0.1 --directory "static webpage/public"
```

Open `http://127.0.0.1:4174`. Stop the server with Ctrl+C. This lightweight preview serves the files; Vercel/Pages apply their respective redirects and response headers in production. Use HTTP preview rather than double-clicking `index.html`, because asset paths are rooted at the website origin.

Manual checks:

1. At phone and desktop widths, read the page and switch all three sample-report sections using both pointer and arrow keys.
2. Try keyboard navigation, FAQ disclosure, Pause motion, and your system's reduced-motion setting.
3. Inspect Network: only local assets and the bounded `/api/health` checks should load. No ads, external fonts, tracking scripts or secret values belong here.
4. On the published domain, inspect the health response for `Access-Control-Allow-Origin: https://validore.tech`. It must not include `Access-Control-Allow-Credentials`.
5. Let Render sleep naturally (15 minutes without app traffic), open the landing site, explore it, and then use the final **Open Validore** link. Check both slow and already-awake cases. Never use a recurring monitor to keep the free instance awake for this feature.
6. Try offline and disabled JavaScript. The page and direct links remain available; network-dependent app use still needs connectivity.
7. In the app, verify the actual login/callback, account balance, Lite validation, saved report, export and job lifecycle. An attractive landing page cannot substitute for those checks.

Developer verification from the repository root:

```powershell
npm run check --prefix "static webpage"
npx vitest run tests/health-route.test.ts "static webpage/tests/wake.test.ts"
npm run lint
npm run typecheck
npm test
npm run build:deploy
npm run smoke:production
```

Browser regression helper: `python "static webpage/tests/browser.py"` while the local preview is running. It uses native Python Playwright; install its test dependency/browser separately if needed. It intercepts app traffic with fixtures, uses no production accounts, and writes screenshots/results under ignored `reports/static-website/`. Provider headers/DNS and a real cold start still require the published-domain checks above.

## Design and maintenance

The design develops the existing Validore gold-ore mark into a faceted sculpture. Palette: navy `#0b2132`, raised navy `#132e40`, paper `#f5f3ec`, gold `#e9bd6c`, pale gold `#f5daa4`, slate `#aabdc8`. Self-hosted Geist carries the type; its SIL license is included. The asymmetrical hero, founder note and explorable fictional report tie the visuals to this product rather than invented customer metrics or testimonials.

Motion serves first-visit explanation/delight: a short entrance and one continuous sculpture, animated with CSS transforms/opacity. Controls, background-tab pausing and reduced-motion support ship with it. The reading sections remain steady. Native radio controls and disclosure elements keep the sample and FAQs usable without JavaScript. Layouts reflow down to small phones; the Lean Canvas becomes a readable grid.

Edit `public/index.html` for copy and links, `public/styles.css` for design, and `public/wake.js` for the bounded liveness check. If moving the SaaS host, update its links, `HEALTH_URL`, both hosting policies/redirects, and the app/Auth/Inngest configuration together. `assets/social.png` is the social preview; it does not load as part of the webpage. Neither README, tests nor application secrets are in the published `public/` directory.
