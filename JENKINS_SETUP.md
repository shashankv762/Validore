# Jenkins setup and classroom demonstration

For tomorrow's localhost presentation using the current uncommitted working tree, start with [Classroom demo](docs/CLASSROOM_DEMO.md) and Jenkinsfile.classroom. The instructions below describe the normal Git-based pipeline used after committing/pushing the source.

This guide matches the current Jenkinsfile. Classroom CI runs on Windows or Linux without Docker, live service keys, a registry, or a deployment host. The release profile adds configurable delivery and staging deployment.

## 1. Prepare Jenkins and its build agent

Install a supported Jenkins LTS from [Jenkins downloads](https://www.jenkins.io/download/) and follow its current Java requirements. The controller and agent are separate responsibilities: the machine executing the pipeline needs Git, Node.js 24, npm, outbound access to the package registry, and enough disk/RAM for a Next.js build.

Install the Pipeline/Declarative Pipeline, Git, Credentials Binding, Pipeline: Input Step, Pipeline: Build Step, JUnit, and Timestamper plugins. Add GitHub Branch Source for a GitHub multibranch job. Docker Pipeline and AnsiColor are not required by this Jenkinsfile.

Use dedicated agents for builds. Do not expose an unauthenticated controller or attach host Docker access to untrusted pull requests. The standard Jenkins controller image does not supply the project's Node.js, Docker, and Trivy toolchain automatically.

## 2. Connect the repository

Create a Multibranch Pipeline named validore. Add the repository as a GitHub or Git branch source and use Jenkinsfile as the script path. Public checkout can use anonymous read access; private checkout needs a credential restricted to reading this repository.

A simple Pipeline from SCM job also works for classroom CI, but release publishing requires the multibranch main/master identity. Keep credentials off fork/PR jobs: a PR can change its own Jenkinsfile, so the branch guard alone is not a credential boundary.

Configure the GitHub Branch Source webhook according to the installed plugin/controller URL. Jenkins localhost is not reachable by GitHub. The checked-in pipeline also uses pollSCM('H/5 * * * *') as a fallback that builds when SCM changes; there is no checked-in nightly cron or githubPush() trigger.

## 3. First classroom build

Run once to initialize the job's parameters, then select Build with Parameters:

| Parameter | Classroom value |
| --- | --- |
| BUILD_PROFILE | demo |
| SKIP_DOCKER | true |
| PUBLISH_IMAGE | false |
| DEPLOY_STAGING | false |
| PUBLIC_SUPABASE_URL | Keep the demo URL |
| PUBLIC_SUPABASE_ANON_KEY | Keep demo-anon-key |
| PUBLIC_APP_URL | http://localhost:3000 |

These demo public values are only build fixtures. They do not create a working Supabase login, AI provider, or payment integration. Never use a service-role/secret key for PUBLIC_SUPABASE_ANON_KEY.

Use a clean Jenkins checkout. scripts/prepare-ci.mjs rejects private .env files and removes only five fixed stale generated report files. Do not copy the developer's .env.local into Jenkins. On the first build, Jenkins may display Build Now before the parameters have been materialized.

## 4. Show the pipeline to your teacher

1. Open the version-controlled Jenkinsfile and explain checkout, installation, quality gates, build, and smoke stages.
2. Start a demo build. Show that Windows uses bat with call npm, and Linux uses sh.
3. Open the stage view and Console Output. A nonzero gate stops subsequent stages.
4. Open Test Result to show JUnit test names, failures, and trends. Report the actual count from that run; skipped database suites are visible limitations.
5. Show the archived .next/BUILD_ID and explain that the smoke stage starts the built app, checks HTTP routes/assets, and shuts it down.
6. On a temporary demo branch, introduce a real TypeScript or test assertion error, commit it, and demonstrate the failed stage. Revert that deliberate demo change afterward.
7. Explain that the default run demonstrates CI. Delivery and deployment become active only after a registry and staging job have been configured.

## 5. Enable Linux container releases

The selected agent must have a working Docker daemon and Trivy executable. Configure these parameters:

| Parameter | Release setting |
| --- | --- |
| BUILD_PROFILE | release |
| SKIP_DOCKER | false |
| PUBLIC_SUPABASE_URL | Real HTTPS Supabase URL |
| PUBLIC_SUPABASE_ANON_KEY | Real public anon JWT or publishable key |
| PUBLIC_APP_URL | Real HTTPS app origin |
| REGISTRY | Registry host/namespace, such as ghcr.io/your-org |
| PUBLISH_IMAGE | true when ready to publish |

Create a username/password credential with ID validore-registry on the trusted release job. Use a scoped registry token as its password. CI passes only public configuration into the Docker build. Private database, Redis, billing, encryption, and Inngest keys belong in the deployment environment.

The image tag includes the full commit SHA and build number. Trivy blocks publication for HIGH/CRITICAL vulnerabilities; FORCE_TRIVY_FAIL=true blocks all severities. Scan execution failures also fail the stage. No latest tag is pushed. reports/image-digest.txt records the immutable registry digest.

## 6. Configure staging delivery

Create a separate deployment job accepting a String parameter IMAGE_REF. Give it credentials scoped to staging, and implement target-specific pull/rollout, health checks, and rollback. The current project has no selected host or cluster, so this downstream job is intentionally required rather than simulated.

Set STAGING_DEPLOY_JOB to that job's full Jenkins name and DEPLOY_STAGING=true. Jenkins asks for approval, then invokes the job with the scanned image digest, waits for its result, and propagates failure. Restrict who can build, approve, and configure trusted release jobs using Jenkins access controls.

Before public deployment, complete [Production setup](docs/PRODUCTION_SETUP.md). The included Compose stack exposes HTTP on localhost:8081; it is not a public TLS deployment.

## Troubleshooting

| Symptom | Resolution |
| --- | --- |
| node/npm not found | Install/configure Node on the executing agent and restart its service to refresh PATH |
| Private environment file rejected | Use an isolated SCM checkout and inject runtime secrets only at deployment |
| No junit.xml | Diagnose the install/test failure; do not mark empty results successful |
| Production audit or Trivy fails | Review the advisory/report, update or remediate, and rerun; do not bypass the gate |
| Registry publishing rejected | Use a trusted main/master multibranch job with release profile and Docker enabled |
| Stripe/AI/login unavailable in demo build | Demo public values do not configure live services; use a separate configured development/staging environment |
| Staging job missing | Configure an actual deployment job and IMAGE_REF contract before selecting deployment |

The pipeline has not yet been exercised on a live Jenkins controller in this workspace. The controller's [Declarative Pipeline linter](https://www.jenkins.io/doc/book/pipeline/development/#linter) and a successful demo build are required release evidence.

## Render live releases alongside the college demo

Keep the demo parameters for classroom builds. For a Render release, first finish the [free beta setup](docs/GO_LIVE.md), then use BUILD_PROFILE=release, DEPLOY_RENDER=true, RENDER_SERVICE_ID from the Render service, and real public settings with PUBLIC_APP_URL=https://validore.tech. SKIP_DOCKER may stay true, PUBLISH_IMAGE/DEPLOY_STAGING stay false.

Store the Render API token as a Secret text credential with ID validore-render-api in the trusted release job's credential scope. The pipeline deploys the exact checked-out commit after approval, waits for live status, verifies the public revision and landing page, and records reports/render-deploy.json. Optional guarded rollback restores the previous live release after a failed public check while keeping CI failed. Never expose that credential to pull-request jobs or enable unchecked Render auto-deploys.

Find the controller URL by opening Jenkins and copying its browser address. Manage Jenkins → System → Jenkins Location shows the configured Jenkins URL. A local installation often uses http://localhost:8080. If Jenkins has not been installed or started, that address will not open yet.
