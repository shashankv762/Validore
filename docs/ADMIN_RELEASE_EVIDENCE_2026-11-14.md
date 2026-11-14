# Owner command-center release — 14 November 2026

The owner command center is deployed at `https://validore.onrender.com/admin`.

| Evidence | Verified result |
| --- | --- |
| Application revision | `c2bcb54da793e82c8866985c048d7cbb1177b277` |
| Hosted CI | [43582966721 — all jobs passed](https://github.com/shashankv762/Validore/actions/runs/43582966721) |
| Render deployment | `dep-dbs32dui0phs73c02q5g` — live |
| Owner | Confirmed Supabase identity for `shashankv7623@gmail.com`, pinned to its existing application profile |
| Migration | `0006_admin_command_center.sql`, applied after backup restoration and repeated staging |

The migration preserved all 17 existing tables' data, apart from the documented preservation of pre-existing Free PDF access. All 19 application tables have RLS and server ownership. The new administration tables deny browser-role access. Owner provisioning changed only the owner grant and update timestamp; credit balances were preserved.

## Automated verification

The initial release passed strict lint, generated route types, TypeScript, **800 regression tests**, and a production standalone build. **26 real PostgreSQL checks** passed in a disposable schema, including concurrent grants, duplicate and conflicting request references, owner promotion races, blocking versus spending, credit cycles and migrations. Opt-in PostgreSQL cases are skipped in the ordinary suite and run separately.

The initial overview date filter exposed a production-driver encoding difference absent from PGlite. The release correction uses the column-aware date encoder and includes an actual PostgreSQL regression. Hosted CI also passed the production build, asset smoke tests and dependency audit.

## Hosted acceptance

Nine live acceptance groups verified the deployed revision, owner unlimited entitlement, owner sign-in routing, the private page, all admin read APIs, anonymous and ordinary-user denial, selected-user credit grants with duplicate retries, existing-session block/unblock, and deactivation followed by permanent deletion. Both disposable Auth identities and their application profiles were removed afterward. The activity log intentionally retains their administrative audit entries.

Eleven live browser checks loaded all five command-center sections at 1440px and 390px, waited for their recorded data, checked page overflow, and opened the owner workspace and unlimited Credits view. No JavaScript errors or failed admin requests occurred. Separate isolated component-browser checks covered 1440px, 768px, 390px and 320px, confirmation dialogs, malformed search results, uncertain-response retries, and settings/plan editing.

Platform switches, pricing validation, plan benefits and next-cycle allowances were verified with isolated database and browser tests. Live maintenance and prices were not changed merely for acceptance. Provider limits and disabled payment/reward integrations remain as documented in production setup; unlimited owner entitlement does not remove provider capacity limits.

Native Computer Use was attempted, but the Windows URL check and later browser host were unavailable. Browser acceptance used isolated automated sessions instead. No user passwords were requested or recorded. Temporary credentials, backups, screenshots and detailed reports remain ignored under `.tmp/admin-release`; the isolated owner verification session is revoked during final cleanup.

## Final interface polish

The follow-up review clarified included validation and output-token labels, raised form boundary contrast above 3:1, added direct admin sign-out, and refreshed server-rendered notices after successful settings saves. **801 regression tests** pass, including a test that failed settings saves do not refresh the server notice and retry with the same request identity.

See [Admin operations](ADMIN_COMMAND_CENTER.md) for the controls, identity rules and deployment prerequisites.
