# Rewarded ads, publisher payouts and crypto

Reviewed 1 November 2026. **Implemented provider: AppLixir's HTML5 rewarded video integration.** The user has no approved publisher account yet. Code is prepared and tested with synthetic callbacks; live delivery, account approval and payouts have not been verified.

## What users get

- A voluntary ad in **Dashboard → Credits**, loaded only after opting in.
- Exactly **10 earned credits** when a valid provider completion is saved by the server.
- Earned credits carry forward and appear separately from plan and purchased credits.
- Normally, spending uses expiring plan credits first, earned credits next, and purchased credits last.
- After the Free plan's two included validations, an additional Lite run costs **50 earned credits only**. Rewards do not upgrade the plan or bypass paid-plan limits.
- Failed validation refunds restore the original source pools once. Browser events, screenshots, timers and clicking an ad are not reward proof.

These are internal usage credits with **no cash value**. The publisher's advertising income belongs in the ad provider's dashboard; users cannot withdraw Validore credits as money or crypto.

## AppLixir setup

1. Publish the working HTTPS site with ads disabled, including accessible privacy/cookie/terms pages and the Credits feature. Apply `drizzle/0004_rewarded_ads.sql` first, even if you keep ads disabled.
2. Create a publisher account through [AppLixir](https://www.applixir.com/) / its linked publisher dashboard. Enter the real site, country, operator and traffic information. Explain that Validore is a small SaaS prototype, approximately ten users, offering internal AI-usage credits for completed videos. Approval and suitable inventory for this use case are AppLixir's decision.
3. Add the HTML5 website/app placement. Get its **public placement API key** and numeric **game ID**. These are not an account administration credential.
4. Generate a random secret of at least 32 characters, separately from your other keys. Store it as `APPLIXIR_S2S_SECRET` in the hosting environment and in AppLixir's server reward webhook settings.
5. Set the webhook URL to `https://YOUR-ACTUAL-ORIGIN/api/webhooks/applixir`. Select **MD5 and TID** mode. This exact mode is required by the implementation. AppLixir calls the endpoint with HTTP GET; successful and already-processed deliveries return HTTP 200, while storage failure returns 503 so delivery can be retried.
6. Confirm with AppLixir that the placement serves the intended offer of one completed video per requested session, displayed as 10 Validore credits. The server fixes the amount at 10 and ignores caller-supplied amounts. The temporary session ID is passed as `userId`; the provider must return it unchanged.
7. Obtain the **current authorized ads.txt lines** from your approved placement/account. Put those exact lines in `public/ads.txt`, deploy, and verify `https://YOUR-ACTUAL-ORIGIN/ads.txt` returns plain text. No seller IDs have been invented or supplied in this repository. If the provider requires an owned root domain for authorization, use your existing domain and follow its instructions; a free host subdomain does not establish publisher-domain eligibility.
8. Configure AppLixir's applicable consent management, geographic requirements and suitable ad categories. The app's opt-in dialog describes the ad but is not a replacement for the provider's required CMP. Confirm the player exposes the necessary choices before enabling live inventory for your users.
9. Set the following runtime configuration. Begin with the flag false while completing setup, then enable it in a restricted staging/test deployment for the provider's approved test procedure.

```dotenv
REWARDED_ADS_ENABLED=true
APPLIXIR_API_KEY=<public placement API key>
APPLIXIR_GAME_ID=<numeric game ID>
APPLIXIR_S2S_SECRET=<private random secret shared with webhook settings>
REWARDED_ADS_DAILY_LIMIT=5
REWARDED_ADS_GLOBAL_DAILY_LIMIT=50
```

10. Verify completion, skip, consent decline, blocked SDK, no fill, refresh while pending, delayed callback and duplicate callback. The actual provider callback must produce one `AD_REWARD` ledger entry and ten earned credits; a browser-only completion must not. Use test inventory as directed by the provider, and do not repeatedly click real ads to manufacture revenue.
11. After hosted acceptance, enable the reviewed settings for the pilot. Watch callback errors, grant counts, memory, provider quota and actual ad availability. Setting `REWARDED_ADS_ENABLED=false` disables new ad activity; earned balances remain intact. If you need to drain in-flight sessions, stop new participation and let them finish before disabling callbacks.

Sources: [initialization](https://support.applixir.com/applixir-integration/integration-for-html5-sites-apps/step-3-initializing-video-ad-360053982853), [callback contract](https://support.applixir.com/applixir-integration/integration-for-html5-sites-apps/step-4-setting-up-local-callback-360053188774), [React SDK](https://support.applixir.com/applixir-integration/react-integration/step-2-use-rewarded-ad-hook), [ads.txt](https://support.applixir.com/applixir-integration/integration-for-html5-sites-apps/step-6-updating-ads-txt-360053188694).

## Credit integrity and operating limits

The server validates AppLixir's specified signature against the stored secret and checks the placement, session and transaction reference. The random session ID is in the signed `userId` field; unsigned `customData` is not used to select an account. A PostgreSQL transaction writes the balance, ledger and completion together. Shared transaction and row locks serialize awards, with a unique provider transaction index protecting against replay.

Sessions expire after 30 minutes. Starts reserve daily capacity; daily limits default to five per user and fifty globally, reset at midnight UTC, with a 60-second cooldown after a reward. Limits have bounded administrative ranges. A cancelled session may receive a late verified reward before expiry only if daily capacity remains. No fill, expiry or a cap does not produce free credits. After confirmed completion, the client polls for a bounded period, then offers a manual pending-reward check. A server confirmation can arrive later even if a tab has been closed.

The player document is separate from the main workspace bundle and removed on close. Its CSP allows HTTPS ad assets; the workspace CSP allows only a same-origin frame. The SDK uses a same-origin document, so this is lifecycle separation, **not** a separate security origin for third-party code. Review the trusted SDK and provider privacy configuration before rollout. A separate ad subdomain with an appropriately secured session bridge would be a future stronger isolation option.

Do not log raw webhook query strings: provider versions may include a plaintext callback secret as well as the signature. The application logs no raw callback parameters. Review host/proxy access-log settings too. Successful references are kept for accounting/idempotency; scheduled maintenance removes abandoned sessions more than seven days after expiry. Account exports include the user's reward records.

## Can publisher earnings be withdrawn in crypto?

**Not through a verified AppLixir crypto payout flow.** Its published payment documentation specifies bank wire or PayPal, a standard US$100 threshold and Net-30 settlement; fees apply. Configure bank/PayPal details in AppLixir's account settings, complete its required identity/tax steps, reach the threshold and follow the payout/invoice process for the account. Direct crypto support would need written confirmation from AppLixir before it could be promised.

Source: [AppLixir payment FAQ](https://support.applixir.com/frequently-asked-questions/payment-questions/applixir-payment-faq-360053980313).

There are crypto-paying alternatives, with meaningful differences:

| Provider | Published crypto payout support | Fit for the requested feature |
| --- | --- | --- |
| AdMaven | Bitcoin and USDT; its October 25, 2026 help page lists a US$5 Bitcoin threshold and 3% Bitcoin/ERC20 fee, with network-specific USDT terms | Has rewarded **tasks** for regular websites, but public documentation does not establish that every task is a single watched video or document authenticated completion verification. Candidate if you accept its task format and the provider confirms a secure callback contract. No AdMaven SDK is installed. |
| Monetag | Bitcoin, USDT TRC20/ERC20/BEP20 and TON via payment providers; US$100 crypto minimum; availability depends on country/account | Its documented rewarded SDK targets **Telegram Mini Apps**. Ordinary website formats are a different product and should not be substituted for verified rewarded video. No Telegram migration or Monetag integration was made. |

Sources: [AdMaven website reward tasks](https://publishers-help.ad-maven.com/en/article/website-telegram-mini-apps-reactjs-td463j/), [AdMaven payment terms](https://publishers-help.ad-maven.com/en/article/payment-method-fees-policy-1ltqfqd/), [Monetag SDK scope](https://docs.monetag.com/), [Monetag crypto methods](https://help.monetag.com/en/articles/6745951-payment-methods-available-in-monetag).

If **direct crypto payout is your priority**, evaluate AdMaven before activating AppLixir:

1. Register through AdMaven's official publisher website and submit the real SaaS domain/use case. Ask whether its incentive policy permits 10 internal AI credits for a completed web ad.
2. Ask the account manager to confirm the actual task format, approval for your traffic volume/geography, the secure server completion mechanism, unique transaction ID, replay/chargeback handling and test inventory. Request its exact callback contract; the public `CLICK_ID` postback description alone is not sufficient evidence to award spendable credits securely.
3. In its publisher payment details, select a crypto/network actually available to your account. New Bitcoin payout setup requires identity verification under the current help page. Enter a receiving address for the exact network, check the dashboard threshold, fees and settlement schedule, then follow its payout instructions. No wallet secret phrase or private key belongs in Validore or the ad configuration.
4. Implement and test that confirmed provider contract before switching the in-app provider. Do not connect its task script to the AppLixir webhook or describe a click/popunder as a completed video.

Alternatively, AppLixir earnings can be received by bank/PayPal and converted separately through a service available to you. That is a separate transaction with its own fees and eligibility, not a direct crypto withdrawal from AppLixir. No publisher account, identity document, bank account, exchange or wallet was created or connected in this work.

## Revenue expectations for ten users

At the default caps the whole app can issue at most 500 ad credits per UTC day, corresponding to 50 confirmed ads. That is an application budget, not an earnings forecast. Fill, advertiser demand, geography, invalid-traffic review and payout thresholds can leave income very small or zero. Do not plan on immediate withdrawals or assume ad revenue will pay for unlimited AI. Keep the free-model budget independent of expected ad income.
