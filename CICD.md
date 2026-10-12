# Validore CI/CD contract

The version-controlled Jenkinsfile is the source of truth. Demo CI runs on Windows or Linux. Container delivery uses a configured Linux Docker/Trivy agent, and staging deployment invokes a real downstream deployment job.

## Stages

| Stage | Gate or output |
| --- | --- |
| Checkout | SCM commit SHA, build-specific image tag, trusted branch identity |
| Validate Environment | Node engines, public config, clean CI checkout, optional Docker/Trivy availability |
| Install Dependencies | npm ci with the committed lockfile, no legacy peer-dependency bypass |
| Lint | npm run lint:ci; zero warnings |
| Typecheck | npm run typecheck |
| Unit and Regression Tests | npm run test:ci; real JUnit file required |
| Dependency Security | npm audit --omit=dev --audit-level=high |
| Production Build | npm run build; archive .next/BUILD_ID |
| Production Smoke Test | Start built Next.js app; check health, landing, logo, cache policy; stop child process |
| Docker Build | Optional Linux build with public environment arguments |
| Container Security | Optional Trivy vulnerability scan; HIGH/CRITICAL fail by default |
| Publish Image | Opt-in trusted main/master release job; record immutable digest |
| Deploy Render | Opt-in trusted release; deploy tested commit, wait, verify public revision/landing, guarded rollback |
| Deploy Staging | Opt-in container approval followed by configured deployment job; propagate its result |

Demo defaults select the first nine stages. They use nonfunctional public Supabase build fixtures and no live service keys. Skipping Docker skips both container build and its Trivy scan; the production dependency audit still runs.

## Inputs and credentials

Public Supabase URL/key and public app origin are parameters because Next.js embeds public variables during the build. The release profile requires HTTPS and rejects private Supabase keys in the public key parameter. Demo fixtures are not suitable for deployment.

Registry access uses the scoped validore-registry username/password credential only while publishing. Docker authentication gets a temporary build-specific directory removed by a shell trap. Private application credentials never belong in build arguments, .env files in Jenkins, or archived reports.

Only trusted release jobs should have registry/deployment credentials. A malicious PR can edit its pipeline definition, so Jenkins credential scope and separate agents are required in addition to branch checks.

## Artifacts and lifecycle

JUnit is produced once, without rerunning failed tests to create a report. A missing JUnit file fails reporting rather than producing a false green build. Trivy's execution/scan exit status is retained and its JSON is archived. The published digest is fingerprinted for the downstream job.

Tags include the complete commit SHA and build number; no mutable latest tag is published. Build retention is limited to twenty builds and ten sets of artifacts. Concurrent builds of the same job are disabled. Cleanup removes the current build's local image; it does not prune shared Docker resources or delete the checkout.

## Render release contract

DEPLOY_RENDER=true selects the Render target with BUILD_PROFILE=release, a trusted main/master multibranch identity, and RENDER_SERVICE_ID. It does not require Docker. The Secret text credential validore-render-api is injected only into this stage. Automatic Render deploys must remain off.

scripts/render-deployment.mjs deploys the tested full commit, polls provider status, and checks the public health revision and landing page. Queued responses are resolved by commit rather than submitting duplicate mutations. Failed public checks can roll back the previous release only if this deployment is still current; rollback verification is recorded and CI remains failed. Any ambiguous or unverified result requires operator review before retrying. The stage is prepared but has not run against a live Render account.

See [Free beta launch](docs/GO_LIVE.md) for account, DNS and credentials setup. Select one deployment target per run.

## Deployment job contract

STAGING_DEPLOY_JOB must refer to an existing job that accepts IMAGE_REF as a string. It must pull that digest, inject runtime secrets, deploy to the selected target, check HTTP health and essential service connectivity, and roll back on failure. It must return a nonzero result if deployment or checks fail. The upstream pipeline waits and propagates failure.

No target-specific deployment command is invented in the Jenkinsfile. The project's public host, registry namespace, and deployment credentials remain operator configuration. Local docker-compose.yml builds/runs app plus Nginx on loopback HTTP; it is not this downstream release deployment job.

## Test boundaries

The CI suite mocks external AI, payments, and search. DB-dependent integration suites can be skipped without a test database. The production smoke verifies HTTP rendering/liveness and asset delivery; it does not validate an authenticated user journey, provider billing, RLS, queue delivery, or database persistence.

Before release, obtain the full gate output, a controller linter result, a successful Jenkins run, a scanned container, and separate live staging integration evidence. See [Implementation status](docs/IMPLEMENTATION_STATUS.md) for this workspace's current verification limits.

See [Jenkins setup](JENKINS_SETUP.md) and the official [Declarative Pipeline reference](https://www.jenkins.io/doc/book/pipeline/syntax/) for controller configuration.
