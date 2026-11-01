# Optional local presentation

The production launch path is [Cloudflare Worker and validore.tech](GO_LIVE.md). This page only describes a local demonstration; it does not configure public hosting.

## Start the app

Open PowerShell in the project and run:

```powershell
.\scripts\Start-ClassroomApp.ps1
```

Visit http://127.0.0.1:3100 and keep the terminal open. The launcher binds to this computer, uses the local validation runner, and preserves `.env.local`. `-InstallDependencies` installs missing packages; Ctrl+C stops the server. You can also use `npm run dev -- --hostname 127.0.0.1 --port 3100` with matching development settings. An old process on `localhost:3000` can display a previous design; always use the address printed by this launcher.

Authenticated features still need Supabase and a configured database. AI generation needs a working provider; email confirmation/recovery needs SMTP. Never seed a customer database to prepare a demonstration. Use an existing test account in a development environment. Local background work can stop when the process closes.

## Sample and verification

The `/demo` page contains the clearly labeled fictional CampusBorrow report. It needs no login, database, or paid AI call. Use it to explain scores, assumptions, and next steps when a service is unavailable.

Manual checks:

```powershell
npm run lint
npm run typecheck
npm test
npm run build
npm run smoke:production
npm audit --omit=dev
```

Jenkins and GitHub CI automation have been removed. These commands run only when you invoke them. The smoke check starts and stops a separate built server; it does not keep a presentation instance running. Stop the dev server before building if memory is limited.

Show the idea workflow, a saved report, manual Lean Canvas, and the actual verification results in [Implementation status](IMPLEMENTATION_STATUS.md). Keep credentials, `.env.local`, and account dashboards out of projected content. A fictional sample or passing mock test is not evidence of live AI, email, billing, or queue readiness.
