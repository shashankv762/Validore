# Validore — Enterprise CI/CD Pipeline with Jenkins

> **End-to-end industrial CI/CD implementation for a production Next.js SaaS application.**
> This document explains every stage, decision, and component — ideal for a presentation.

---

## Table of Contents

1. [What is CI/CD?](#1-what-is-cicd)
2. [Architecture Overview](#2-architecture-overview)
3. [Pipeline Stages (Detailed)](#3-pipeline-stages-detailed)
4. [Jenkins Setup Guide](#4-jenkins-setup-guide)
5. [Running Locally (Same as CI)](#5-running-locally-same-as-ci)
6. [Docker Strategy](#6-docker-strategy)
7. [Security Scanning (Trivy)](#7-security-scanning-trivy)
8. [Test Strategy (Hermetic CI Tests)](#8-test-strategy-hermetic-ci-tests)
9. [Secrets Management](#9-secrets-management)
10. [Deployment Flow](#10-deployment-flow)
11. [Files Reference](#11-files-reference)
12. [Industry Standards Used](#12-industry-standards-used)

---

## 1. What is CI/CD?

| Term | Meaning |
|------|---------|
| **CI** — Continuous Integration | Every commit triggers an automated pipeline: install → lint → typecheck → test → build. Catches bugs early, keeps `main` always green. |
| **CD** — Continuous Delivery | After CI passes, the production-ready artifact (Docker image) is automatically published to a registry, ready to deploy. |
| **CD** — Continuous Deployment | The final step: the image is deployed to staging automatically (with a manual approval gate before production). |

**Why Jenkins?**  
Jenkins is the most widely deployed open-source automation server in the world, used by companies like Netflix, LinkedIn, and eBay. It runs on-premise, is fully customisable, and integrates with every major tool in the DevOps ecosystem.

---

## 2. Architecture Overview

```
Developer pushes a commit
         │
         ▼
  ┌──────────────┐
  │  GitHub SCM  │  (webhook or polling)
  └──────┬───────┘
         │  triggers
         ▼
  ┌────────────────────────────────────────────────────────────────┐
  │                     Jenkins Pipeline                            │
  │                                                                 │
  │  Checkout → Env Info → Install → Lint → Typecheck → Tests      │
  │       → Build → Docker Build → Trivy Scan → Publish → Deploy   │
  └─────────────────────────────┬──────────────────────────────────┘
                                │
                     ┌──────────┴──────────┐
                     │  On success (main)  │
                     │                     │
              ┌──────▼──────┐     ┌────────▼────────┐
              │  Container  │     │   Staging Host  │
              │  Registry   │     │  (Docker/K8s)   │
              │  (GHCR)     │     │                 │
              └─────────────┘     └─────────────────┘
```

---

## 3. Pipeline Stages (Detailed)

The `Jenkinsfile` defines a **Declarative Pipeline** with 11 stages. Each stage is a quality gate — if it fails, subsequent stages are skipped (`skipStagesAfterUnstable`).

### Stage 1 — Checkout

```groovy
checkout scm
```

- Fetches the source from the configured SCM (GitHub).
- Prints the last 5 commits and sets environment variables (`GIT_BRANCH_CLEAN`, `GIT_SHA_FULL`) used in later stages.
- Works with Multibranch Pipeline jobs automatically.

---

### Stage 2 — Environment Info

```sh
node --version && npm --version && docker --version && trivy --version
```

- Verifies that the Jenkins agent has all required tools.
- Validates that Node.js `>= v20` (configurable via `NODE_VERSION_EXPECTED` parameter).
- All versions are printed in the build log for **full traceability**.

---

### Stage 3 — Install Dependencies

```sh
npm ci --legacy-peer-deps --prefer-offline
```

- `npm ci` (not `npm install`) installs **exactly** what `package-lock.json` specifies.
- `--prefer-offline` uses the npm cache when possible → **faster builds**.
- `--legacy-peer-deps` is required for the React 19 / Next.js 16 peer dependency graph.

---

### Stage 4 — Lint

```sh
npm run lint
```

- Runs ESLint across the entire codebase.
- Any lint error **fails the build** immediately.
- Configuration in `eslint.config.mjs` (flat config format).

---

### Stage 5 — Typecheck

```sh
npx tsc --noEmit
```

- Runs TypeScript's compiler in check-only mode (no output files).
- Catches type mismatches, missing imports, and API contract violations.
- Does **not** re-compile the app — just validates types.

---

### Stage 6 — Unit Tests

```sh
CI=true npx vitest run --reporter=default --reporter=junit \
  --outputFile.junit=reports/junit.xml
```

- `CI=true` prevents Vitest from loading `.env.local` — tests are fully hermetic.
- DB-backed integration tests **self-skip** (via `describeIfDb` guard in the test files).
- All AI providers (Anthropic, OpenAI, Google) and web-search are **mocked** — zero API credits spent in CI.
- JUnit XML is emitted to `reports/junit.xml` and published to Jenkins for:
  - Test result trend graphs
  - Per-test failure details in the Jenkins UI

---

### Stage 7 — Build

```sh
CI=true NEXT_TELEMETRY_DISABLED=1 npm run build
```

- Builds the Next.js app with `output: 'standalone'` → produces a self-contained Node.js server.
- `NEXT_TELEMETRY_DISABLED=1` keeps builds deterministic (no outbound network call).
- The standalone bundle is **archived as a build artifact** in Jenkins.

---

### Stage 8 — Docker Build

```sh
docker build \
  --build-arg BUILD_DATE=... \
  --build-arg GIT_COMMIT=... \
  --label "org.opencontainers.image.revision=..." \
  -t ghcr.io/your-org/validore:<SHA> \
  -t ghcr.io/your-org/validore:latest .
```

- Multi-stage Dockerfile: build stage installs deps + compiles; **runtime stage** copies only the minimal output.
- Image tagged with the **7-character commit SHA** (immutable, traceable) and `latest` (on `main` only).
- OCI standard labels (`org.opencontainers.image.*`) embedded for registry visibility.
- Non-root user `validore` (UID 1001) runs the process — security hardening.
- Skipped on feature branches when `SKIP_DOCKER=true`.

---

### Stage 9 — Security Scan (Trivy)

```sh
trivy image --exit-code 1 --severity HIGH,CRITICAL ghcr.io/your-org/validore:<SHA>
```

- **Trivy** by Aqua Security is the industry standard for container image vulnerability scanning.
- Scans all OS packages and NPM dependencies in the image.
- **HIGH and CRITICAL CVEs fail the build** — the image is never published if it's insecure.
- MEDIUM/LOW findings are reported but non-blocking.
- JSON report archived for compliance evidence.

---

### Stage 10 — Publish Image

```groovy
withCredentials([usernamePassword(credentialsId: 'validore-registry', ...)]) {
  docker push ghcr.io/your-org/validore:<SHA>
  docker push ghcr.io/your-org/validore:latest
}
```

- Runs **only on the `main` branch** — feature branches never publish to the registry.
- Registry credentials are stored in Jenkins Managed Credentials (never in code).
- The password is passed via `--password-stdin` (not as a CLI argument — prevents exposure in process lists).

---

### Stage 11 — Deploy Staging

```groovy
input {
  message 'Deploy to staging?'
  ok 'Yes, deploy to staging'
  submitter 'admin,deployer'
}
```

- **Manual approval gate**: the pipeline pauses and waits for a human click.
- Only authorised users (`admin`, `deployer` role) can approve.
- Runs only on `main` branch with `DEPLOY_STAGING=true`.
- Deployment is pluggable: swap the `echo` block for:
  - **Docker Compose** (SSH + `docker compose pull && up -d`)
  - **Kubernetes** (`kubectl set image` + `rollout status`)
  - **AWS ECS** (`aws ecs update-service`)

---

## 4. Jenkins Setup Guide

### Prerequisites

| Requirement | Version |
|------------|---------|
| Jenkins | ≥ 2.440 LTS |
| Node.js (on agent) | ≥ 20 |
| Docker (on agent) | ≥ 24 |
| Trivy (on agent) | ≥ 0.50 |

### Required Plugins

```
docker-workflow
git
junit
pipeline-utility-steps
timestamper
ansicolor
credentials-binding
build-discarder
```

Install via: **Manage Jenkins → Plugins → Available**

### Creating the Pipeline Job

1. **New Item** → **Multibranch Pipeline** → name it `validore`.
2. **Branch Sources** → **GitHub** → add your repo URL.
3. Set **Script Path** to `Jenkinsfile` (the default).
4. Jenkins auto-discovers all branches and runs the pipeline for each.

### Adding Credentials

**Manage Jenkins → Credentials → System → Global credentials:**

| ID | Type | Used for |
|----|------|---------|
| `validore-registry` | Username/Password | Docker push to GHCR |
| `validore-git-token` | Secret text (optional) | Private repo checkout |

### Setting the Registry

In the `Jenkinsfile` `environment` block, change:
```groovy
REGISTRY = 'ghcr.io/your-org'   // ← replace with your actual registry
```

Or set it as a Jenkins **Global Environment Variable** to override per controller.

---

## 5. Running Locally (Same as CI)

Run exactly the same quality gates Jenkins runs:

```bash
# Install (lockfile-exact, same as npm ci in Jenkins)
npm ci --legacy-peer-deps

# Lint (Stage 4)
npm run lint

# Typecheck (Stage 5)
npm run typecheck

# Unit tests in CI mode (Stage 6)
npm run test:ci        # emits reports/junit.xml

# Build (Stage 7)
CI=true NEXT_TELEMETRY_DISABLED=1 npm run build

# Or run all CI gates in one command:
npm run ci
```

---

## 6. Docker Strategy

### Multi-Stage Dockerfile

```
┌─────────────────────────────────────┐
│  Stage 1: base (node:20-alpine)     │
│  - npm ci (all deps)                │
│  - npm run build                    │
│  - produces .next/standalone/       │
└───────────────┬─────────────────────┘
                │  COPY --from=base
                ▼
┌─────────────────────────────────────┐
│  Stage 2: runner (node:20-alpine)   │
│  - Non-root user (validore:1001)    │
│  - Only standalone server files     │
│  - HEALTHCHECK on /api/health       │
│  - No dev deps, no source code      │
│  Final image: ~150 MB               │
└─────────────────────────────────────┘
```

**Benefits:**
- Dev dependencies are **never in the final image** (smaller attack surface)
- Source code is **not in the final image** (IP protection + size)
- Non-root user reduces privilege escalation risk
- `HEALTHCHECK` lets orchestrators know when the app is ready

### Image Tags

| Tag | When | Purpose |
|-----|------|---------|
| `ghcr.io/your-org/validore:abc1234` | Every build | Immutable, traceable to exact commit |
| `ghcr.io/your-org/validore:latest` | `main` branch only | Convenience for pulling the newest |

---

## 7. Security Scanning (Trivy)

Trivy scans:
- **OS packages** (Alpine apk packages)
- **Application dependencies** (npm packages via package-lock.json)

### Severity Levels

| Severity | Action |
|---------|--------|
| CRITICAL | ❌ Fails the build |
| HIGH | ❌ Fails the build |
| MEDIUM | ⚠️ Reported, non-blocking |
| LOW | ℹ️ Reported, non-blocking |

Output formats:
- **Table** → printed in the build log for immediate visibility
- **JSON** → archived as `reports/trivy-report.json` for compliance evidence

---

## 8. Test Strategy (Hermetic CI Tests)

The key design principle: **CI tests never touch real infrastructure**.

| Layer | CI approach |
|-------|------------|
| AI providers (Anthropic, OpenAI, Google) | Mocked with `vi.mock()` |
| Web search (Tavily, Serper) | Mocked with `vi.mock()` |
| Database (Supabase / PostgreSQL) | Tests skip themselves via `describeIfDb` guard |
| Stripe / Razorpay webhooks | Mocked |

This means:
- ✅ No API keys needed in CI
- ✅ No database provisioned in CI
- ✅ Tests run fast and deterministically
- ✅ No API costs

**JUnit reporting** — vitest emits `reports/junit.xml` in CI mode. Jenkins' `junit()` step parses this and shows:
- ✅ / ❌ per test in the Jenkins UI
- Test trend graphs over time
- Failure details with stack traces

---

## 9. Secrets Management

```
Source code   ──► NEVER contains secrets
.env.local    ──► git-ignored, developer-only
.env*         ──► git-ignored (.gitignore)
Docker image  ──► .dockerignore excludes all .env* files
Jenkins       ──► Managed Credentials store (encrypted at rest)
Runtime       ──► Injected by orchestrator (env vars / K8s secrets)
```

The pipeline uses `withCredentials()` to inject secrets only into the stage that needs them — they are never printed in logs and never stored in environment variables globally.

---

## 10. Deployment Flow

```
git push origin main
       │
       ▼
Jenkins detects change (webhook / 1-min poll)
       │
       ▼
Stages 1–7: Checkout → Install → Lint → Types → Test → Build
       │ all pass?
       ▼
Stage 8: Docker Build (immutable SHA tag)
       │
       ▼
Stage 9: Trivy scan — no HIGH/CRITICAL CVEs?
       │ passes?
       ▼
Stage 10: Push to GHCR registry
          ghcr.io/your-org/validore:abc1234
          ghcr.io/your-org/validore:latest
       │
       ▼
Stage 11: ⏸ MANUAL APPROVAL (Jenkins UI)
          "Deploy ghcr.io/your-org/validore:abc1234 to STAGING?"
          [Yes, deploy to staging]
       │ approved?
       ▼
Staging server pulls and runs the new image
Health check passes → ✅ Deployment complete

For production: repeat approval pattern with `production` branch or tag.
```

---

## 11. Files Reference

| File | Purpose |
|------|---------|
| [`Jenkinsfile`](./Jenkinsfile) | Declarative pipeline — the single source of truth for CI/CD |
| [`Dockerfile`](./Dockerfile) | Multi-stage build: base (build) → runner (runtime) |
| [`docker-compose.yml`](./docker-compose.yml) | Local/staging stack: app + nginx reverse proxy |
| [`infra/nginx/default.conf`](./infra/nginx/default.conf) | Nginx reverse proxy and health endpoint config |
| [`vitest.config.ts`](./vitest.config.ts) | Test runner config; JUnit output in CI mode |
| [`package.json`](./package.json) | `test:ci`, `lint:ci`, `typecheck`, `ci` scripts |
| [`.dockerignore`](./.dockerignore) | Prevents secrets + build artifacts entering Docker image |
| [`.gitignore`](./.gitignore) | Excludes CI artifacts, secrets, and generated files |
| [`reports/.gitkeep`](./reports/.gitkeep) | Ensures `reports/` dir exists for JUnit XML output |
| [`src/app/api/health/route.ts`](./src/app/api/health/route.ts) | Unauthenticated liveness probe for HEALTHCHECK + uptime |
| [`.env.example`](./.env.example) | Template for all required environment variables |

---

## 12. Industry Standards Used

| Standard / Tool | What it is | Why we use it |
|----------------|-----------|---------------|
| **Jenkins Declarative Pipeline** | Industry-standard CI/CD server | On-premise, fully customisable, used by Netflix, LinkedIn |
| **npm ci** | Lockfile-exact install | Reproducible, deterministic builds — no "works on my machine" |
| **ESLint** | Static code analysis | Catches bugs before runtime |
| **TypeScript strict mode** | Static type checking | Prevents type errors in production |
| **Vitest** | Fast unit test runner | Vite-native, ES-module compatible |
| **JUnit XML** | Test report standard | Universal format supported by Jenkins, GitHub Actions, GitLab CI |
| **Multi-stage Docker** | Minimal runtime images | Reduces attack surface and image size |
| **Trivy** | Container security scanner | Used by CNCF, Docker, and thousands of enterprises |
| **OCI image labels** | Open Container Initiative standard | Registry visibility, compliance traceability |
| **Non-root container user** | Security hardening | Principle of least privilege |
| **HEALTHCHECK** | Container readiness signal | Enables zero-downtime rolling deployments |
| **Manual approval gate** | Human-in-the-loop for production | Prevents accidental production pushes |
| **`withCredentials()`** | Jenkins secret injection | Secrets never in code or image |
| **`skipStagesAfterUnstable`** | Fail-fast | Saves CI time; no point linting after tests fail |
| **`disableConcurrentBuilds`** | Serialised builds per ref | Prevents race conditions on same branch |
| **`buildDiscarder`** | Log rotation | Prevents disk exhaustion on long-lived Jenkins instances |
