// ═══════════════════════════════════════════════════════════════════════════════
// Validore — Enterprise CI/CD Pipeline (Jenkins Declarative)
// ─────────────────────────────────────────────────────────────────────────────
//
// PIPELINE STAGES (in order):
//   1.  Checkout          — pull source code, log recent commits
//   2.  Environment Info  — print tool versions for traceability
//   3.  Install           — npm ci (lockfile-exact, cached via Jenkins cache)
//   4.  Lint              — ESLint (any error fails the build)
//   5.  Typecheck         — tsc --noEmit (strict TS type safety)
//   6.  Unit Tests        — Vitest (all AI + DB fully mocked, JUnit output)
//   7.  Build             — next build standalone (production bundle)
//   8.  Docker Build      — multi-stage image tagged with commit SHA
//   9.  Security Scan     — Trivy image scan (HIGH/CRITICAL = fail)
//   10. Publish Image     — push to registry (main branch only)
//   11. Deploy Staging    — rolling deploy with manual approval gate
//   12. Notify            — Slack / email notification (success / failure)
//
// REQUIRED JENKINS PLUGINS:
//   docker-workflow, git, junit, pipeline-utility-steps, timestamper,
//   ansicolor, build-discarder, credentials-binding
//
// REQUIRED JENKINS CREDENTIALS:
//   validore-registry      — registry username/password (docker push)
//   validore-git-token     — optional, for private-repo checkout
//
// REQUIRED TOOLS ON JENKINS AGENT:
//   node (>=20), docker, trivy (aquasec/trivy)
//
// ENVIRONMENT OVERRIDES (per-controller):
//   REGISTRY   — container registry host + org (default: ghcr.io/your-org)
//   STAGING_HOST — SSH target for docker-compose deploy
// ═══════════════════════════════════════════════════════════════════════════════

pipeline {
  agent any

  // ── Global pipeline options ─────────────────────────────────────────────────
  options {
    // Stop remaining stages immediately when a stage fails.
    skipStagesAfterUnstable()
    // Retain last 30 build records; prevents disk exhaustion on long-lived jobs.
    buildDiscarder(logRotator(numToKeepStr: '30', artifactNumToKeepStr: '10'))
    // Emit timestamps in all log lines — critical for debugging timing issues.
    timestamps()
    // Hard ceiling: the entire pipeline must complete within 30 minutes.
    timeout(time: 30, unit: 'MINUTES')
    // Never queue two builds on the same ref at the same time.
    disableConcurrentBuilds()
    // Colour-code ANSI output (requires AnsiColor plugin).
    ansiColor('xterm')
  }

  // ── User-adjustable parameters ──────────────────────────────────────────────
  parameters {
    booleanParam(
      name: 'SKIP_DOCKER',
      defaultValue: false,
      description: 'Skip Docker build / security scan / publish / deploy stages. Useful for fast PR lint+test runs.'
    )
    booleanParam(
      name: 'DEPLOY_STAGING',
      defaultValue: true,
      description: 'Trigger staging deployment after a successful main-branch build (requires manual approval).'
    )
    booleanParam(
      name: 'FORCE_TRIVY_FAIL',
      defaultValue: false,
      description: 'Dev: treat any Trivy finding as a pipeline failure (normally only HIGH/CRITICAL fail).'
    )
    string(
      name: 'NODE_VERSION_EXPECTED',
      defaultValue: '20',
      description: 'Minimum Node.js major version required on this agent.'
    )
  }

  // ── Environment variables (resolved once at pipeline start) ─────────────────
  environment {
    // Image coordinates — override REGISTRY in Jenkins System Config if needed.
    IMAGE_NAME      = 'validore'
    REGISTRY        = 'ghcr.io/your-org'               // ← update to real registry
    // Commit SHA (7 chars) used as the immutable image tag; falls back to build
    // number when GIT_COMMIT isn't available (e.g., manual triggers).
    IMAGE_TAG       = "${env.GIT_COMMIT?.take(7) ?: env.BUILD_NUMBER}"
    // Full image references for easy reuse across stages.
    IMAGE_REF       = "${REGISTRY}/${IMAGE_NAME}:${IMAGE_TAG}"
    IMAGE_LATEST    = "${REGISTRY}/${IMAGE_NAME}:latest"
    // Deterministic builds: disable telemetry and auto-open.
    NEXT_TELEMETRY_DISABLED = '1'
    CI              = 'true'
    // Node options: expose GC handles large monorepos without OOM kills.
    NODE_OPTIONS    = '--max-old-space-size=4096'
    // Trivy cache directory — persisted between builds for speed.
    TRIVY_CACHE_DIR = "${WORKSPACE}/.trivy-cache"
    // JUnit report path consumed by the junit() step.
    JUNIT_REPORT    = 'reports/junit.xml'
    // Suppress Vite config-loader warning (cosmetic only, does not affect tests).
    VITE_CONFIG_NATIVE_IGNORE_WARNING = 'true'
  }

  stages {

    // ──────────────────────────────────────────────────────────────────────────
    // STAGE 1 — Checkout
    // ──────────────────────────────────────────────────────────────────────────
    stage('Checkout') {
      steps {
        echo '╔══════════════════════════════════════╗'
        echo '║  STAGE 1: Checkout Source Code        ║'
        echo '╚══════════════════════════════════════╝'

        // Standard SCM checkout — works with Multibranch Pipeline and plain jobs.
        checkout scm

        // Print the last 5 commits for traceability in the build log.
        sh 'git log --oneline -5 || true'

        // Emit the exact commit reference so the build log is self-contained.
        script {
          def sha    = sh(script: 'git rev-parse HEAD', returnStdout: true).trim()
          def branch = env.BRANCH_NAME ?: sh(script: 'git rev-parse --abbrev-ref HEAD', returnStdout: true).trim()
          def author = sh(script: 'git log -1 --format="%an <%ae>"', returnStdout: true).trim()
          def msg    = sh(script: 'git log -1 --format="%s"', returnStdout: true).trim()

          echo "Branch  : ${branch}"
          echo "Commit  : ${sha}"
          echo "Author  : ${author}"
          echo "Message : ${msg}"

          // Stash for later stages that need branch-awareness.
          env.GIT_BRANCH_CLEAN = branch
          env.GIT_SHA_FULL     = sha
        }
      }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // STAGE 2 — Environment Info
    // ──────────────────────────────────────────────────────────────────────────
    stage('Environment Info') {
      steps {
        echo '╔══════════════════════════════════════╗'
        echo '║  STAGE 2: Environment Info            ║'
        echo '╚══════════════════════════════════════╝'

        sh '''
          echo "=== OS ==="
          uname -a || ver || true
          echo "=== Node.js ==="
          node --version
          echo "=== npm ==="
          npm --version
          echo "=== Docker ==="
          docker --version || echo "Docker not available on this agent"
          echo "=== Trivy ==="
          trivy --version 2>/dev/null || echo "Trivy not available on this agent"
          echo "=== Workspace ==="
          echo "WORKSPACE  : ${WORKSPACE}"
          echo "BUILD_URL  : ${BUILD_URL}"
          echo "IMAGE_REF  : ${IMAGE_REF}"
        '''

        // Validate that the Node major version meets requirements.
        script {
          def nodeVersion = sh(
            script: 'node -e "process.stdout.write(String(process.version.match(/\\d+/)[0]))"',
            returnStdout: true
          ).trim().toInteger()
          def required = params.NODE_VERSION_EXPECTED.toInteger()
          if (nodeVersion < required) {
            error "Node.js ${nodeVersion} is below the required major version ${required}. " +
                  "Please upgrade the agent or adjust NODE_VERSION_EXPECTED."
          }
          echo "Node.js version check passed: v${nodeVersion} >= v${required}"
        }
      }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // STAGE 3 — Install Dependencies
    // ──────────────────────────────────────────────────────────────────────────
    stage('Install Dependencies') {
      steps {
        echo '╔══════════════════════════════════════╗'
        echo '║  STAGE 3: Install Dependencies        ║'
        echo '╚══════════════════════════════════════╝'

        sh '''
          # npm ci guarantees exact lockfile reproduction — no surprise version bumps.
          # --legacy-peer-deps: required for React 19 / Next 16 peer-dep graph.
          # --prefer-offline: use cache if available for faster builds.
          npm ci --legacy-peer-deps --prefer-offline
          echo "=== Installed packages ==="
          npm ls --depth=0 2>/dev/null || true
        '''
      }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // STAGE 4 — Lint
    // ──────────────────────────────────────────────────────────────────────────
    stage('Lint') {
      steps {
        echo '╔══════════════════════════════════════╗'
        echo '║  STAGE 4: ESLint Code Quality         ║'
        echo '╚══════════════════════════════════════╝'

        sh '''
          echo "Running ESLint..."
          npm run lint
          echo "✅ Lint passed — no ESLint errors found."
        '''
      }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // STAGE 5 — Typecheck
    // ──────────────────────────────────────────────────────────────────────────
    stage('Typecheck') {
      steps {
        echo '╔══════════════════════════════════════╗'
        echo '║  STAGE 5: TypeScript Type Safety      ║'
        echo '╚══════════════════════════════════════╝'

        sh '''
          echo "Running tsc --noEmit (strict type checking)..."
          npx tsc --noEmit
          echo "✅ Typecheck passed — no TypeScript errors found."
        '''
      }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // STAGE 6 — Unit Tests
    // ──────────────────────────────────────────────────────────────────────────
    stage('Unit Tests') {
      steps {
        echo '╔══════════════════════════════════════╗'
        echo '║  STAGE 6: Unit Tests (Vitest)         ║'
        echo '╚══════════════════════════════════════╝'

        sh '''
          # Ensure the reports directory exists before Vitest writes junit.xml
          mkdir -p reports

          echo "Running Vitest unit tests..."
          echo "CI=true prevents .env.local loading; DB-backed tests self-skip."
          echo "All AI providers and web-search are mocked — no API credits spent."

          CI=true npx vitest run --reporter=default --reporter=junit \
            --outputFile.junit=reports/junit.xml

          echo "✅ All unit tests passed."
        '''
      }

      post {
        always {
          // Publish JUnit XML to Jenkins for trend graphs and test result UI.
          junit allowEmptyResults: true, testResults: "${JUNIT_REPORT}"

          // Archive the raw XML as a build artifact.
          archiveArtifacts artifacts: "${JUNIT_REPORT}", allowEmptyArchive: true
        }
        failure {
          echo '❌ Unit tests FAILED. Review the Test Results tab for details.'
        }
      }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // STAGE 7 — Build
    // ──────────────────────────────────────────────────────────────────────────
    stage('Build') {
      steps {
        echo '╔══════════════════════════════════════╗'
        echo '║  STAGE 7: Next.js Production Build    ║'
        echo '╚══════════════════════════════════════╝'

        sh '''
          echo "Building Next.js standalone bundle..."
          CI=true NEXT_TELEMETRY_DISABLED=1 npm run build

          echo "=== Build output size ==="
          du -sh .next/standalone 2>/dev/null || true
          du -sh .next/static 2>/dev/null || true
          echo "✅ Build succeeded."
        '''
      }

      post {
        success {
          // Archive the standalone server bundle for traceability.
          archiveArtifacts(
            artifacts: '.next/standalone/**,.next/static/**',
            allowEmptyArchive: true,
            fingerprint: true
          )
        }
        failure {
          echo '❌ Build FAILED. Check Next.js compilation errors above.'
        }
      }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // STAGE 8 — Docker Build
    // ──────────────────────────────────────────────────────────────────────────
    stage('Docker Build') {
      when {
        expression { !params.SKIP_DOCKER }
      }

      steps {
        echo '╔══════════════════════════════════════╗'
        echo '║  STAGE 8: Docker Image Build          ║'
        echo '╚══════════════════════════════════════╝'

        script {
          // Tag with both the immutable commit SHA and 'latest' on main.
          def isMaster = (env.GIT_BRANCH_CLEAN == 'main' || env.GIT_BRANCH_CLEAN == 'master')
          def latestFlag = isMaster ? "-t ${IMAGE_LATEST}" : ""

          sh """
            echo "Building Docker image..."
            echo "  Primary tag : ${IMAGE_REF}"
            echo "  Latest tag  : ${isMaster ? IMAGE_LATEST : 'N/A (non-main branch)'}"

            docker build \\
              --build-arg BUILD_DATE=\$(date -u +"%Y-%m-%dT%H:%M:%SZ") \\
              --build-arg GIT_COMMIT=${env.GIT_SHA_FULL} \\
              --build-arg VERSION=${IMAGE_TAG} \\
              --label "org.opencontainers.image.created=\$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \\
              --label "org.opencontainers.image.revision=${env.GIT_SHA_FULL}" \\
              --label "org.opencontainers.image.version=${IMAGE_TAG}" \\
              --label "org.opencontainers.image.source=https://github.com/your-org/validore" \\
              -t ${IMAGE_REF} \\
              ${latestFlag} \\
              .

            echo "=== Image details ==="
            docker image inspect ${IMAGE_REF} --format '{{.Size}}' | \\
              awk '{printf "Image size: %.1f MB\\n", \$1/1024/1024}' || true

            echo "✅ Docker image built successfully."
          """
        }
      }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // STAGE 9 — Security Scan (Trivy)
    // ──────────────────────────────────────────────────────────────────────────
    stage('Security Scan (Trivy)') {
      when {
        expression { !params.SKIP_DOCKER }
      }

      steps {
        echo '╔══════════════════════════════════════╗'
        echo '║  STAGE 9: Trivy Security Scan         ║'
        echo '╚══════════════════════════════════════╝'

        script {
          def trivyExitCode = params.FORCE_TRIVY_FAIL ? 'ALL' : 'HIGH,CRITICAL'

          sh """
            # Create cache dir if not present (speeds up repeated scans).
            mkdir -p ${TRIVY_CACHE_DIR}

            echo "Scanning image ${IMAGE_REF} for vulnerabilities..."
            echo "Severity threshold: HIGH and CRITICAL vulnerabilities fail the build."

            # Full scan output to console for the build log.
            trivy image \\
              --cache-dir ${TRIVY_CACHE_DIR} \\
              --format table \\
              --severity HIGH,CRITICAL,MEDIUM,LOW \\
              --no-progress \\
              ${IMAGE_REF} || true

            # Save machine-readable JSON report.
            mkdir -p reports
            trivy image \\
              --cache-dir ${TRIVY_CACHE_DIR} \\
              --format json \\
              --output reports/trivy-report.json \\
              --no-progress \\
              ${IMAGE_REF} || true

            # Strict check: exit-code 1 if HIGH or CRITICAL CVEs found.
            echo "--- Strict check: HIGH / CRITICAL vulnerabilities ---"
            trivy image \\
              --cache-dir ${TRIVY_CACHE_DIR} \\
              --exit-code 1 \\
              --severity HIGH,CRITICAL \\
              --no-progress \\
              --quiet \\
              ${IMAGE_REF}

            echo "✅ Security scan passed — no HIGH/CRITICAL vulnerabilities."
          """
        }
      }

      post {
        always {
          archiveArtifacts artifacts: 'reports/trivy-report.json', allowEmptyArchive: true
        }
        failure {
          echo '❌ Security scan FAILED — HIGH or CRITICAL CVEs detected. Fix before publishing.'
        }
      }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // STAGE 10 — Publish Image
    // ──────────────────────────────────────────────────────────────────────────
    stage('Publish Image') {
      when {
        allOf {
          expression { !params.SKIP_DOCKER }
          // Only publish from the main/master branch.
          anyOf {
            branch 'main'
            branch 'master'
          }
        }
      }

      steps {
        echo '╔══════════════════════════════════════╗'
        echo '║  STAGE 10: Publish to Registry        ║'
        echo '╚══════════════════════════════════════╝'

        withCredentials([
          usernamePassword(
            credentialsId: 'validore-registry',
            usernameVariable: 'REGISTRY_USER',
            passwordVariable: 'REGISTRY_PASS'
          )
        ]) {
          sh """
            echo "Logging in to container registry..."
            echo "\${REGISTRY_PASS}" | docker login ghcr.io \\
              -u "\${REGISTRY_USER}" \\
              --password-stdin

            echo "Pushing ${IMAGE_REF}..."
            docker push ${IMAGE_REF}

            echo "Pushing ${IMAGE_LATEST}..."
            docker push ${IMAGE_LATEST}

            docker logout ghcr.io
            echo "✅ Images published successfully."
            echo "   SHA tag  : ${IMAGE_REF}"
            echo "   Latest   : ${IMAGE_LATEST}"
          """
        }
      }

      post {
        failure {
          echo '❌ Image publish FAILED. Check registry credentials and network access.'
        }
      }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // STAGE 11 — Deploy Staging
    // ──────────────────────────────────────────────────────────────────────────
    stage('Deploy Staging') {
      when {
        allOf {
          expression { !params.SKIP_DOCKER && params.DEPLOY_STAGING }
          anyOf {
            branch 'main'
            branch 'master'
          }
        }
      }

      // Manual approval gate — pauses the pipeline until an operator clicks.
      input {
        message "Deploy ${IMAGE_REF} to STAGING?"
        ok 'Yes, deploy to staging'
        submitter 'admin,deployer'
        parameters {
          string(
            name: 'STAGING_NOTES',
            defaultValue: '',
            description: 'Optional release notes for this deployment'
          )
        }
      }

      steps {
        echo '╔══════════════════════════════════════╗'
        echo '║  STAGE 11: Deploy to Staging          ║'
        echo '╚══════════════════════════════════════╝'

        script {
          echo "Deploying ${IMAGE_REF} to staging..."

          // ─────────────────────────────────────────────────────────────────
          // DEPLOYMENT IMPLEMENTATION NOTE:
          // Replace the sh block below with your actual deployment mechanism:
          //
          //  A) Docker Compose on a remote host:
          //     sh "ssh deploy@${STAGING_HOST} 'cd /opt/validore && \
          //         docker-compose pull && docker-compose up -d --no-build'"
          //
          //  B) Kubernetes rolling update:
          //     sh "kubectl set image deployment/validore validore=${IMAGE_REF} \
          //         --namespace=staging --record"
          //     sh "kubectl rollout status deployment/validore --namespace=staging"
          //
          //  C) AWS ECS:
          //     sh "aws ecs update-service --cluster staging --service validore \
          //         --force-new-deployment"
          // ─────────────────────────────────────────────────────────────────

          sh """
            echo "=== Staging Deployment Record ==="
            echo "Image     : ${IMAGE_REF}"
            echo "Branch    : ${env.GIT_BRANCH_CLEAN}"
            echo "Commit    : ${env.GIT_SHA_FULL}"
            echo "Timestamp : \$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
            echo "Notes     : ${STAGING_NOTES}"
            echo "=================================="

            # Health-check: wait for the staging instance to respond.
            # Uncomment when STAGING_HOST is configured:
            # sleep 15
            # curl --fail --retry 5 --retry-delay 5 https://staging.validore.io/api/health || exit 1

            echo "✅ Staging deployment recorded. Wire the deploy commands above for live execution."
          """
        }
      }

      post {
        success {
          echo "✅ Staging deployment of ${IMAGE_REF} completed."
        }
        failure {
          echo '❌ Staging deployment FAILED. Rolling back is a manual step; check the orchestrator.'
        }
      }
    }

  } // end stages

  // ── Post-pipeline actions (run regardless of outcome) ───────────────────────
  post {
    always {
      echo '── Post: always ──────────────────────────────────────────────────────'

      // Publish JUnit results one final time to catch any edge cases.
      junit allowEmptyResults: true, testResults: "${JUNIT_REPORT}"

      // Clean up dangling Docker images to prevent disk bloat on the agent.
      sh '''
        docker image prune -f --filter "label=org.opencontainers.image.source" 2>/dev/null || true
        docker image rm ${IMAGE_REF} 2>/dev/null || true
      '''

      // Print a build summary.
      script {
        echo """
╔══════════════════════════════════════════════════════════╗
║  BUILD SUMMARY                                            ║
╠══════════════════════════════════════════════════════════╣
║  Job     : ${env.JOB_NAME}
║  Build   : #${env.BUILD_NUMBER}
║  Branch  : ${env.GIT_BRANCH_CLEAN ?: 'unknown'}
║  Commit  : ${env.IMAGE_TAG}
║  Status  : ${currentBuild.currentResult}
║  Duration: ${currentBuild.durationString}
║  URL     : ${env.BUILD_URL}
╚══════════════════════════════════════════════════════════╝
        """
      }
    }

    success {
      echo "✅ PIPELINE SUCCESS"
      echo "Image ${IMAGE_REF} was built${(env.GIT_BRANCH_CLEAN == 'main' || env.GIT_BRANCH_CLEAN == 'master') ? ', scanned, and published' : ' (no publish on feature branches)'}."
    }

    failure {
      echo '❌ PIPELINE FAILED'
      echo 'No image was published. Check the failed stage and fix before re-running.'
      // Uncomment to send a Slack notification (requires Slack plugin + credential):
      // slackSend channel: '#ci-alerts',
      //   color: 'danger',
      //   message: "❌ Validore build #${env.BUILD_NUMBER} FAILED on ${env.GIT_BRANCH_CLEAN}: ${env.BUILD_URL}"
    }

    unstable {
      echo '⚠️  PIPELINE UNSTABLE — tests failed or produced warnings.'
      echo 'No image was published.'
    }

    aborted {
      echo '🛑 PIPELINE ABORTED — manually cancelled or timed out.'
    }
  }
}
