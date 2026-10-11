# Validore — Jenkins CI/CD Setup, Triggers & Demo Guide

> **For Teacher Presentation** — Step-by-step instructions on how to install Jenkins,
> connect it to the GitHub repository, configure all three automated triggers,
> run the pipeline, and demonstrate the complete CI/CD workflow live.

---

## Table of Contents

1. [GitHub Repository Interface](#1-github-repository-interface)
2. [Jenkins Installation (Local)](#2-jenkins-installation-local)
3. [Jenkins Initial Configuration](#3-jenkins-initial-configuration)
4. [Connect Jenkins to GitHub Repo](#4-connect-jenkins-to-github-repo)
5. [Configure Build Triggers](#5-configure-build-triggers)
6. [GitHub Webhook Setup](#6-github-webhook-setup)
7. [Where Project Files Are Deployed Locally](#7-where-project-files-are-deployed-locally)
8. [Live Demo — Step-by-Step Script](#8-live-demo--step-by-step-script)
9. [Pipeline Stage Reference](#9-pipeline-stage-reference)
10. [Trigger Explanation for Teacher](#10-trigger-explanation-for-teacher)

---

## 1. GitHub Repository Interface

**Repository URL:** https://github.com/shashankv762/Validore

### What to show on GitHub:

| Screen | What to demonstrate |
|--------|-------------------|
| **Code tab** | `Jenkinsfile` at root — the pipeline definition |
| **Code tab** | `Dockerfile` — multi-stage container build |
| **Code tab** | `docker-compose.yml` — local stack orchestration |
| **Code tab** | `CICD.md` — architecture documentation |
| **Settings → Webhooks** | The webhook URL pointing to Jenkins |
| **Commits** | Every commit triggers the pipeline automatically |

### Show teacher this:
1. Open https://github.com/shashankv762/Validore
2. Click on `Jenkinsfile` — explain each section
3. Go to **Settings → Webhooks** — show the webhook configured to Jenkins
4. Go to **Commits** — every commit hash can be traced to a build

---

## 2. Jenkins Installation (Local)

### Option A — Run Jenkins with Docker (Recommended for demo)

```bash
# Pull and run Jenkins with Docker pre-installed inside
docker run -d \
  --name jenkins \
  --restart unless-stopped \
  -p 8080:8080 \
  -p 50000:50000 \
  -v jenkins_home:/var/jenkins_home \
  -v /var/run/docker.sock:/var/run/docker.sock \
  jenkins/jenkins:lts-jdk21
```

Then open: **http://localhost:8080**

### Option B — Windows installer

1. Download from: https://www.jenkins.io/download/
2. Run the `.msi` installer
3. Open: **http://localhost:8080**

### Get the initial admin password:

```bash
# If using Docker:
docker exec jenkins cat /var/jenkins_home/secrets/initialAdminPassword

# If installed natively on Windows:
type "C:\ProgramData\Jenkins\.jenkins\secrets\initialAdminPassword"
```

---

## 3. Jenkins Initial Configuration

After logging in with the initial password:

| Step | Action |
|------|--------|
| **1** | Click **"Install suggested plugins"** |
| **2** | Wait for plugins to install (~3-5 minutes) |
| **3** | Create first admin user: `admin` / `your-password` |
| **4** | Set Jenkins URL: `http://localhost:8080` |
| **5** | Click **"Save and Finish"** |

### Install additional required plugins:

Go to: **Manage Jenkins → Plugins → Available plugins**

Search and install each:

```
GitHub plugin          — GitHub webhook triggers
GitHub Integration     — githubPush() trigger support
Pipeline               — Declarative pipeline support
Docker Pipeline        — Docker build/push inside pipeline
JUnit                  — Test result graph and reporting
AnsiColor              — Colored build logs
Timestamper            — Timestamps in every log line
NodeJS                 — Node.js tool integration
```

After installing → **Restart Jenkins**

---

## 4. Connect Jenkins to GitHub Repo

### Step A — Configure Git credentials in Jenkins

Go to: **Manage Jenkins → Credentials → System → Global credentials → Add Credentials**

```
Kind     : Username with password
Username : shashankv762
Password : <your GitHub Personal Access Token>
ID       : validore-git-token
Description: GitHub token for Validore repo
```

> **How to create a GitHub PAT:**
> GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
> Scopes: `repo`, `admin:repo_hook`

### Step B — Create a new Pipeline job

1. Jenkins Dashboard → **New Item**
2. Name: `Validore-CI-CD`
3. Type: **Pipeline**
4. Click **OK**

### Step C — Configure the Pipeline job

Under **Pipeline section**:

```
Definition  : Pipeline script from SCM
SCM         : Git
Repository  : https://github.com/shashankv762/Validore.git
Credentials : validore-git-token
Branch      : */main
Script Path : Jenkinsfile
```

Click **Save**

---

## 5. Configure Build Triggers

In the Pipeline job configuration, under **Build Triggers**:

### Trigger 1 — GitHub webhook (push events)

Check: **"GitHub hook trigger for GITScm polling"**

> This enables `githubPush()` in the Jenkinsfile.
> When anyone pushes to the GitHub repo, Jenkins starts a build instantly.

### Trigger 2 — Poll SCM (safety net)

Check: **"Poll SCM"**

Schedule:
```
H/5 * * * *
```

> Jenkins checks GitHub every 5 minutes. If a push was missed by the webhook,
> this catches it within 5 minutes maximum.

### Trigger 3 — Nightly build

Check: **"Build periodically"**

Schedule:
```
30 20 * * *
```

> Runs the full pipeline every night at 01:30 IST (20:30 UTC),
> regardless of whether anyone pushed code that day.

Click **Save**

---

## 6. GitHub Webhook Setup

This is what makes the pipeline fire **automatically** on every `git push`.

### Step-by-step in GitHub:

1. Open https://github.com/shashankv762/Validore
2. Go to **Settings** → **Webhooks**
3. Click **"Add webhook"**
4. Fill in:

```
Payload URL    : http://<your-jenkins-ip>:8080/github-webhook/
Content type   : application/json
Secret         : (leave blank for demo, or add a secret)
Events         : Pushes  (check box)
                 Pull requests (check box)
```

5. Click **"Add webhook"**
6. GitHub will send a ping — check for a green checkmark

> **If Jenkins is on localhost (not publicly reachable):**
> Use **ngrok** to expose Jenkins:
> ```bash
> ngrok http 8080
> ```
> Then use the ngrok URL as the webhook payload URL:
> `https://abc123.ngrok.io/github-webhook/`

### Verify webhook works:

1. Make a small change to any file (e.g., add a blank line to README.md)
2. Push to GitHub
3. Watch Jenkins — a new build starts **automatically within seconds**

---

## 7. Where Project Files Are Deployed Locally

### Jenkins workspace (where code is built):

```
Windows (native Jenkins):
  C:\ProgramData\Jenkins\.jenkins\workspace\Validore-CI-CD\

Docker Jenkins:
  /var/jenkins_home/workspace/Validore-CI-CD/
  (inside the jenkins container)
```

### Build artifacts (JUnit XML report):

```
Jenkins Workspace:
  workspace/Validore-CI-CD/reports/junit.xml

Visible in Jenkins UI:
  Job -> Build #N -> Test Results -> All Tests
```

### Docker image (built locally during pipeline):

```bash
# After Stage 8 (Docker Build) runs:
docker images | grep validore

# Output example:
# validore    abc1234     <image-id>    ~150MB
# validore    latest      <image-id>    ~150MB
```

### Running the app locally with docker-compose:

```bash
cd "C:\Users\2025\IIT DELHI\entrepreneur\Validore"

# Fill .env.local with real Supabase keys, then:
docker-compose up -d

# App available at:
#   http://localhost:80    (via Nginx reverse proxy)
#   http://localhost:3000  (direct Next.js port)
```

### Project directory structure:

```
C:\Users\2025\IIT DELHI\entrepreneur\Validore\
|-- Jenkinsfile             <- Pipeline definition (11 stages + 3 triggers)
|-- Dockerfile              <- Multi-stage container build
|-- docker-compose.yml      <- Full stack (app + nginx)
|-- CICD.md                 <- Architecture documentation
|-- JENKINS_SETUP.md        <- This guide
|-- infra/
|   `-- nginx/
|       `-- default.conf    <- Nginx reverse proxy config
|-- reports/
|   `-- junit.xml           <- Generated by npm run test:ci
|-- src/                    <- Next.js application source
|-- tests/                  <- 191 automated test cases
`-- package.json            <- npm scripts: lint, typecheck, test:ci, build
```

---

## 8. Live Demo — Step-by-Step Script

### Demo sequence (10 minutes):

#### Step 1 — Show GitHub Repository (1 min)
```
1. Open: https://github.com/shashankv762/Validore
2. Show: Jenkinsfile at root — explain it's the pipeline definition
3. Show: triggers block inside it — githubPush(), pollSCM, cron
4. Show: Settings -> Webhooks -> the configured endpoint
```

#### Step 2 — Open Jenkins Dashboard (1 min)
```
Open: http://localhost:8080
Show: The "Validore-CI-CD" job exists
Show: Last build status (green checkmark or build history)
```

#### Step 3 — Trigger a build manually (1 min)
```
Click: "Build Now"
Watch: Pipeline starts immediately
Click: The running build -> "Console Output"
```

#### Step 4 — Watch the pipeline execute stage by stage (3 min)
```
Live stages in console:
  Stage 1: Checkout  -> shows git commit, branch, author
  Stage 2: Env Info  -> shows Node 20.x, npm, Docker versions
  Stage 3: Install   -> npm ci installs exact lockfile deps
  Stage 4: Lint      -> ESLint -> 0 errors, 0 warnings
  Stage 5: Typecheck -> tsc --noEmit -> 0 type errors
  Stage 6: Tests     -> 188 passed | 3 skipped
  Stage 7: Build     -> next build standalone
```

#### Step 5 — Show the Test Results graph (1 min)
```
Click: The build -> "Test Results"
Show: 188 tests passed, 3 skipped, 0 failed
Show: Individual test names and durations
```

#### Step 6 — Demonstrate webhook trigger (2 min)
```
In terminal:
  > Open README.md, add a comment line
  > git add . && git commit -m "demo: webhook trigger test"
  > git push origin main

Watch Jenkins: A new build starts AUTOMATICALLY (within 5 seconds)
Explain: "GitHub sent an HTTP POST to Jenkins the moment I pushed"
```

#### Step 7 — Show trigger configuration (1 min)
```
Jenkins -> Validore-CI-CD -> Configure -> Build Triggers
Show:
  [x] GitHub hook trigger for GITScm polling  (webhook)
  [x] Poll SCM: H/5 * * * *                   (every 5 min fallback)
  [x] Build periodically: 30 20 * * *          (nightly at 01:30 IST)
```

---

## 9. Pipeline Stage Reference

| # | Stage | Command | Purpose |
|---|-------|---------|---------|
| 1 | **Checkout** | `checkout scm` | Pull exact git revision, log author + commit |
| 2 | **Env Info** | `node --version` | Validate Node.js >= 20 on agent |
| 3 | **Install** | `npm ci` | Lockfile-exact install, no version drift |
| 4 | **Lint** | `npm run lint` | ESLint — 0 errors, 0 warnings allowed |
| 5 | **Typecheck** | `npm run typecheck` | TypeScript `tsc --noEmit` — no type errors |
| 6 | **Unit Tests** | `npm run test:ci` | 188 tests, JUnit XML -> Jenkins report |
| 7 | **Build** | `npm run build` | Next.js standalone production bundle |
| 8 | **Docker Build** | `docker build` | Multi-stage image tagged with commit SHA |
| 9 | **Trivy Scan** | `trivy image` | CVE scan — HIGH/CRITICAL = pipeline fail |
| 10 | **Publish** | `docker push` | Push to registry (main branch only) |
| 11 | **Deploy** | `docker-compose up` | Staging deploy with manual approval gate |

---

## 10. Trigger Explanation for Teacher

### What is a Jenkins Trigger?

A **trigger** is an event that automatically starts the Jenkins pipeline
without any human clicking "Build Now".

### The Three Triggers in Jenkinsfile:

```groovy
triggers {
    githubPush()            // Trigger 1: GitHub push webhook
    pollSCM('H/5 * * * *') // Trigger 2: Poll every 5 minutes
    cron('30 20 * * *')    // Trigger 3: Nightly at 01:30 IST
}
```

---

### Trigger 1: `githubPush()` — GitHub Webhook

| Property | Detail |
|----------|--------|
| **When** | Instantly when a developer does `git push` |
| **How** | GitHub sends HTTP POST to Jenkins `/github-webhook/` endpoint |
| **Delay** | Seconds — near-instant |
| **Industry use** | Used by Google, Amazon, Meta, Netflix in production |

**Flow:**
```
Developer: git push  ->  GitHub  ->  HTTP POST  ->  Jenkins  ->  Build starts
```

---

### Trigger 2: `pollSCM('H/5 * * * *')` — Poll SCM

| Property | Detail |
|----------|--------|
| **When** | Every 5 minutes, Jenkins checks GitHub for new commits |
| **How** | Jenkins polls the git remote, compares commit hashes |
| **Delay** | Up to 5 minutes after a push |
| **Purpose** | Safety net — catches pushes if webhook missed |

**Cron syntax breakdown:**
```
H/5  *  *  *  *
 |   |  |  |  |
 |   |  |  |  +-- Any day of the week
 |   |  |  +----- Any month
 |   |  +-------- Any day of the month
 |   +----------- Any hour
 +--------------- Every 5 minutes (H = hash-distributed start)
```

---

### Trigger 3: `cron('30 20 * * *')` — Nightly Build

| Property | Detail |
|----------|--------|
| **When** | Every day at 20:30 UTC = 02:00 IST |
| **How** | Jenkins internal scheduler |
| **Purpose** | Detects broken dependencies, security CVEs, environment drift |

**Cron syntax breakdown:**
```
30  20  *  *  *
 |   |  |  |  |
 |   |  |  |  +-- Any day of the week
 |   |  |  +----- Any month
 |   |  +-------- Any day of the month
 |   +----------- Hour 20 (UTC) = 01:30 IST
 +--------------- Minute 30
```

---

### Quick answer to "What happens when you push code?":

> "The moment I run `git push`, GitHub sends a signal to Jenkins via a webhook.
> Jenkins receives that signal, checks out the latest code, and immediately
> starts running all 11 pipeline stages — lint, typecheck, 188 unit tests,
> Docker build, security scan — all automatically.
> I don't click anything. The pipeline is fully automated."

---

*Validore CI/CD — Shashank V | 1dt24cy038@dsatm.edu.in*
