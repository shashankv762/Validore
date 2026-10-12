# Classroom presentation: localhost and Jenkins

The current priority is the local presentation. Domain/DNS, Render, Redis, Inngest and public releases are deferred. The normal Jenkinsfile retains those release options for later.

Current environment evidence: Node 24.14.1 and npm 11.11.0 are available; node_modules and .env.local exist. Java/Jenkins were not found at the checked locations, and localhost:8080 refused a read-only connection. The latest automated application and pipeline checks have not run because the required Luna R: environment is unavailable.

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

Preload the pages and complete a rehearsal before presenting. The dev server compiles routes on first visit. Do not expose .env.local, the provider text file, or Jenkins secrets on the projector.

## 3. Start a portable Jenkins controller

Install/extract Java 21 or Java 25 first. For a ZIP distribution, pass the full path to bin/java.exe; it need not be a system-wide installation. Use an official JDK distribution such as [Eclipse Temurin](https://adoptium.net/temurin/releases/?version=21). Jenkins documents its [Java support](https://www.jenkins.io/doc/book/platform-information/support-policy-java/).

In a second PowerShell terminal:

~~~powershell
.\scripts\Start-ClassroomJenkins.ps1
# If Java is not on PATH:
.\scripts\Start-ClassroomJenkins.ps1 -JavaPath 'C:\path\to\jdk-21\bin\java.exe'
~~~

The launcher downloads Jenkins 2.580.1 LTS to ignored .classroom/tools and checks the SHA-256 published on the [official download page](https://www.jenkins.io/download/). It stores controller state in .classroom/jenkins-home, binds to 127.0.0.1:8080, and runs in the foreground. It does not install a Windows service or disable Jenkins authentication. Download/startup scripts are authored but have not been executed here.

Open http://localhost:8080, unlock it using the local password file indicated by the terminal, install suggested plugins, and create your administrator account. Ensure Pipeline, Pipeline: Declarative, Pipeline: Stage View, JUnit, Timestamper and Durable Task are installed. See the [official WAR setup guide](https://www.jenkins.io/doc/book/installing/war-file/). Keep this terminal open.

## 4. Create the classroom pipeline for the current local source

The working tree has not been committed/pushed. A GitHub checkout would use the remote revision, not necessarily these edits. For tomorrow, use the separate local-source pipeline:

1. In Jenkins choose New Item → validore-classroom → Pipeline.
2. Under Pipeline, choose Pipeline script and paste the contents of Jenkinsfile.classroom. Use the Groovy sandbox.
3. Save, then Build Now once. Jenkins discovers its parameters on that first run; an empty SOURCE_DIR fails with a clear configuration message.
4. Choose Build with Parameters and set SOURCE_DIR to the full project folder:
   C:\Users\2025\IIT DELHI\entrepreneur\Validore
5. Run the build and open Stage View, Console Output, Test Results and Build Artifacts.

Node and npm must be on the Jenkins process PATH. The portable controller inherits the terminal's environment, so reopen its terminal after installing Node. No GitHub token, cloud account, Docker, Trivy, or production secret is needed for this local-source job.

Each build copies an explicit source allowlist to a new source-BUILD_NUMBER directory in the Jenkins workspace. .env.local, Git state, node_modules, generated output, Jenkins home, and private key file extensions are excluded. Symlinks/junctions are rejected. The source manifest records hashes of the copied files. No existing source/workspace is deleted. Stop editing while the snapshot stage runs.

The pipeline installs from the lockfile and runs the same strict checks:
- Environment/secret-file guard
- npm ci with dev tools
- Lint, Next route type generation and TypeScript
- Unit/regression tests with actual JUnit output
- Production dependency audit
- Production standalone build
- Local deployment and HTTP/asset smoke checks

The last stage starts the built standalone artifact on an available loopback port, checks health/landing/sample/logo/cache behavior, and stops the server. Its report is reports/production-smoke.json. This demonstrates deployment and verification of a build artifact; the separately running app at port 3000 is your persistent presentation instance. The local pipeline does not publish a release.

Dependency installation/audit and initial Jenkins plugin setup require internet. Install plugins and rehearse before class. A failure stays failed; security gates and tests are not skipped to create a green demonstration. Small laptops may need the dev app closed during the production build to free memory.

## 5. Presentation outline

1. Show the product on localhost, explain the idea workflow, agents, evidence labels and reports.
2. Show Jenkins Stage View and explain the local source snapshot and isolated build directory.
3. Explain how lint, route types, tests and dependency audit prevent a bad change from reaching the deployment stage.
4. Open a test result, the build ID, source manifest and smoke report. Show actual outcomes rather than describing an unexecuted run as passing.
5. Explain the local deployment lifecycle. Then show the normal Jenkinsfile's Git checkout and opt-in release stages as the later hosting path.

For a controlled failure demonstration, make a small temporary type error locally, run the classroom job, show Typecheck failing and later stages skipping, then undo that exact edit and rerun. Rehearse this beforehand and never change a test/security rule to force a pass.

## Acceptance still pending

Luna previously passed an earlier backend checkpoint: TypeScript, 60 focused tests, and a production build. Many edits followed it. Current lint/types/tests/build/standalone smoke, the new PowerShell launchers, Jenkins Declarative validation, and live app journeys remain unverified.

Codex Luna's global worker definition still requires its R-only runner and forbids SSD fallback. These ordinary user/Jenkins commands are not used by the agent to bypass that rule. Restore writable R:\CodexLuna or update that global worker configuration through its owner to enable the final agent verification. See IMPLEMENTATION_STATUS.md.
