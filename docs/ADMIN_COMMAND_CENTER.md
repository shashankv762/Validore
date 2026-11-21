# Validore owner command center

The private command center is `/admin`. Only the server-verified, email-confirmed Supabase identity for `shashankv7623@gmail.com` can receive the single pinned owner grant. Sign-in and Google callbacks take that owner to the command center; password recovery still opens the reset flow. Normal account navigation contains no admin controls. Every admin endpoint verifies the current identity and the stored owner grant independently.

The owner has unlimited application credits, validations, ideas, module runs, canvas versions and registered devices, with all plan features unlocked. This does not change the billing tier or invent a balance. Normal provider deadlines, request rates and platform capacity still apply.

## Controls

- **Overview and accounts:** recorded totals, account search by email or ID, status filters, pagination, saved-work counts, balances and recent activity.
- **Credit grants:** select one or multiple accounts, choose general credits, crowdfunding runs or pitch-deck runs, and enter an amount and reason. General grants join the non-expiring general-credit pool. Up to 100 recipients are changed atomically; each receives a matching credit-ledger and audit entry. A failed or uncertain response can be retried with the same request reference without applying the grant twice.
- **Account access:** block/unblock and deactivate/reactivate preserve work and balances. Existing sessions are checked on every server request. Blocking or deactivation stops queued work and refunds unfinished validations; late generated results cannot be saved after access is revoked. The owner cannot be blocked, deactivated or deleted through these controls.
- **Permanent deletion:** deactivate first, then type the selected email and enter a reason. The operation closes that account's app checkouts/subscriptions, deletes its Supabase identity and dependent application records, and retains the administrative audit. Provider failures keep the account deactivated and expose an auditable retry. Pending deletions prevent reactivation until completed or failed.
- **Platform controls:** plain-text announcements, maintenance with a message, and new-registration availability. Maintenance pauses other accounts' workspace access while owner access remains available. Closed registrations do not prevent existing identities from signing in.
- **Plans and limits** cover names, monthly USD prices, monthly credits, validation and idea limits, usage ceilings, listed benefits, visibility and feature flags. Feature changes affect current accounts. New monthly allocations take effect on the next cycle. Existing billing periods retain their allocation snapshot and existing subscriptions retain their price. New checkouts require a matching active monthly Stripe price in USD or INR. The console displays the fixed INR price alongside the Stripe price ID.

## Activation

1. Verify the current application checks and stage SQL delta `drizzle/0006_admin_command_center.sql` on an isolated PostgreSQL schema. Take a verified backup before applying it to the existing database.
2. Apply the additive delta to the current application database. Do not substitute `db:push` for reviewing live SQL. Both new tables use RLS and deny public/browser-role access; the owner index permits only one grant.
3. Configure `SUPABASE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY` in the server environment for permanent Auth identity deletion. This key must never be prefixed `NEXT_PUBLIC_`. Existing public Auth keys remain unchanged. Stripe administration is needed when deleting an account with an active subscription.
4. Run `npx tsx scripts/verify-admin-setup.ts inspect`, then `npx tsx scripts/verify-admin-setup.ts provision-owner` to bind the already registered, confirmed owner before rollout. Deploy the verified revision to the existing Validore service. Trusted sign-in and registration flows can also grant that matching identity; rendering and account reads never promote users. The panel cannot create or promote a second administrator.
5. Verify owner routing and API access, ordinary-account denial, anonymous denial, private cache headers, a grant/retry on disposable accounts, and block/deactivate/delete behavior. Verify `/api/health` matches the deployed revision.

`db:seed` only initializes missing tiers so it preserves later owner edits. The independent marketing site directs plan decisions to the app; the app's landing and account pages read the current configured catalogue.
Legacy plans retain their existing model budgets until an explicit owner plan save sets a token ceiling. Per-role generation budgets and infrastructure concurrency limits remain upper bounds.

The relevant checks are `npm run ci`, `npm run test:postgres`, `npm run build:deploy`, and the isolated browser acceptance. Local tests use disposable identities/data; provider backups and cached durable workflow context follow their separate retention procedures.
