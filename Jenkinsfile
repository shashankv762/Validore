// Validore: Windows/Linux classroom CI, with opt-in Linux container releases.
// Release credentials belong on trusted branch jobs, never untrusted PR jobs.
def runNpm(String arguments) {
  if (isUnix()) { sh "npm ${arguments}" }
  else { bat "call npm ${arguments}" }
}

pipeline {
  agent any
  options {
    skipDefaultCheckout(true)
    disableConcurrentBuilds()
    skipStagesAfterUnstable()
    timestamps()
    timeout(time: 45, unit: 'MINUTES')
    buildDiscarder(logRotator(numToKeepStr: '20', artifactNumToKeepStr: '10'))
  }
  parameters {
    choice(name: 'BUILD_PROFILE', choices: ['demo', 'release'], description: 'Demo builds need no live service credentials. Release validates public configuration.')
    booleanParam(name: 'SKIP_DOCKER', defaultValue: true, description: 'Classroom CI runs lint, types, tests, build and smoke on Windows or Linux. Uncheck on a Linux Docker/Trivy agent.')
    booleanParam(name: 'PUBLISH_IMAGE', defaultValue: false, description: 'Publish a scanned release image from main/master only.')
    booleanParam(name: 'DEPLOY_RENDER', defaultValue: false, description: 'Deploy the tested commit to the configured Render service after approval; Docker is optional.')
    booleanParam(name: 'ROLLBACK_RENDER_ON_FAILURE', defaultValue: true, description: 'Restore the previous live Render release if public checks fail and this deployment is still current.')
    string(name: 'RENDER_SERVICE_ID', defaultValue: '', description: 'Render service ID (srv-...) for the free beta or configured live service.')
    booleanParam(name: 'DEPLOY_STAGING', defaultValue: false, description: 'After approval, invoke the configured staging deployment job with an immutable image digest.')
    booleanParam(name: 'FORCE_TRIVY_FAIL', defaultValue: false, description: 'Fail on all vulnerability severities instead of HIGH/CRITICAL.')
    string(name: 'REGISTRY', defaultValue: '', description: 'Registry host and namespace, for example ghcr.io/my-org; required to publish.')
    string(name: 'STAGING_DEPLOY_JOB', defaultValue: '', description: 'Existing deployment job accepting IMAGE_REF; must deploy and health-check the image.')
    string(name: 'PUBLIC_SUPABASE_URL', defaultValue: 'https://example.supabase.co', description: 'Public Supabase project URL, baked into the client build.')
    string(name: 'PUBLIC_SUPABASE_ANON_KEY', defaultValue: 'demo-anon-key', description: 'Public anon/publishable key. Never enter a service-role or secret key.')
    string(name: 'PUBLIC_APP_URL', defaultValue: 'http://localhost:3000', description: 'Public app origin. Release requires HTTPS.')
  }
  // Multibranch webhooks are configured in Jenkins; polling is a portable fallback.
  triggers { pollSCM('H/5 * * * *') }
  environment {
    CI = 'true'
    NEXT_TELEMETRY_DISABLED = '1'
    VITE_CONFIG_NATIVE_IGNORE_WARNING = 'true'
    NODE_OPTIONS = '--max-old-space-size=4096'
    BUILD_PROFILE = "${params.BUILD_PROFILE}"
    NEXT_PUBLIC_SUPABASE_URL = "${params.PUBLIC_SUPABASE_URL}"
    NEXT_PUBLIC_SUPABASE_ANON_KEY = "${params.PUBLIC_SUPABASE_ANON_KEY}"
    NEXT_PUBLIC_APP_URL = "${params.PUBLIC_APP_URL}"
    npm_config_cache = "${WORKSPACE}/.npm-cache"
    TRIVY_CACHE_DIR = "${WORKSPACE}/.trivy-cache"
    TMPDIR = "${WORKSPACE}/.tmp"
    TEMP = "${WORKSPACE}/.tmp"
    TMP = "${WORKSPACE}/.tmp"
  }
  stages {
    stage('Checkout') {
      steps {
        script {
          def checkoutResult = checkout scm
          env.GIT_SHA_FULL = checkoutResult.GIT_COMMIT
          if (!env.GIT_SHA_FULL || !(env.GIT_SHA_FULL ==~ /[a-fA-F0-9]{40,64}/)) { error('Checkout did not return a valid commit SHA') }
          env.IMAGE_TAG = "${env.GIT_SHA_FULL}-${env.BUILD_NUMBER}-${env.BUILD_TAG}".replaceAll('[^A-Za-z0-9_.-]', '-').take(128)
          env.IMAGE_REF = "validore:${env.IMAGE_TAG}"
          env.CAN_RELEASE = (!env.CHANGE_ID && (env.BRANCH_NAME == 'main' || env.BRANCH_NAME == 'master')) ? 'true' : 'false'
          if (isUnix()) { sh 'mkdir -p reports .tmp' }
          else { bat '''if not exist reports mkdir reports
if not exist .tmp mkdir .tmp''' }
          echo "Commit: ${env.GIT_SHA_FULL}; profile: ${params.BUILD_PROFILE}"
        }
      }
    }
    stage('Validate Environment') {
      steps {
        script {
          if (isUnix()) { sh 'node scripts/prepare-ci.mjs && node scripts/ci-config.mjs' }
          else { bat 'node scripts/prepare-ci.mjs && node scripts/ci-config.mjs' }
          runNpm('--version')
          if ((params.PUBLISH_IMAGE || params.DEPLOY_STAGING) && (params.SKIP_DOCKER || params.BUILD_PROFILE != 'release' || env.CAN_RELEASE != 'true')) {
            error('Publishing/deployment requires a release profile, Docker stages, and a trusted main/master multibranch job')
          }
          if (params.DEPLOY_RENDER && (params.BUILD_PROFILE != 'release' || env.CAN_RELEASE != 'true' || !(params.RENDER_SERVICE_ID.trim() ==~ 'srv-[A-Za-z0-9_-]{5,80}'))) {
            error('Render deployment requires release profile, a trusted main/master multibranch job, and a valid service ID')
          }
          if (params.DEPLOY_RENDER && params.DEPLOY_STAGING) { error('Select one deployment target per release') }
          if (!params.SKIP_DOCKER) {
            if (!isUnix()) { error('Container release stages require a Linux agent with Docker and Trivy. Use SKIP_DOCKER for Windows classroom CI.') }
            sh 'docker version && trivy --version'
          }
          if (params.PUBLISH_IMAGE || params.DEPLOY_STAGING) {
            def registry = params.REGISTRY.trim()
            if (!(registry ==~ '[a-z0-9.-]+(:[0-9]+)?(/[a-z0-9._-]+)+')) { error('Set REGISTRY to a registry host/namespace') }
            env.REGISTRY_HOST = registry.tokenize('/')[0]
            env.IMAGE_REF = "${registry}/validore:${env.IMAGE_TAG}"
          }
          if (params.DEPLOY_STAGING && (!params.PUBLISH_IMAGE || !params.STAGING_DEPLOY_JOB.trim())) {
            error('Staging requires PUBLISH_IMAGE and an existing STAGING_DEPLOY_JOB')
          }
        }
      }
    }
    stage('Install Dependencies') { steps { script { runNpm('ci --include=dev --prefer-offline --no-fund') } } }
    stage('Lint') { steps { script { runNpm('run lint:ci') } } }
    stage('Typecheck') { steps { script { runNpm('run typecheck') } } }
    stage('Unit and Regression Tests') {
      steps { script { runNpm('run test:ci') } }
      post {
        always {
          junit testResults: 'reports/junit.xml', allowEmptyResults: false
          archiveArtifacts artifacts: 'reports/junit.xml', allowEmptyArchive: false
        }
      }
    }
    stage('Dependency Security') { steps { script { runNpm('audit --omit=dev --audit-level=high') } } }
    stage('Production Build') {
      steps { script { runNpm('run build') } }
      post { success { archiveArtifacts artifacts: '.next/BUILD_ID', fingerprint: true } }
    }
    stage('Production Smoke Test') { steps { script { runNpm('run smoke:production') } } }
    stage('Docker Build') {
      when { expression { !params.SKIP_DOCKER } }
      steps {
        sh '''#!/bin/sh
set -eu
docker build --build-arg GIT_COMMIT="$GIT_SHA_FULL" --build-arg VERSION="$IMAGE_TAG" \
  --build-arg NEXT_PUBLIC_SUPABASE_URL --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY \
  --build-arg NEXT_PUBLIC_APP_URL -t "$IMAGE_REF" .
'''
      }
    }
    stage('Container Security') {
      when { expression { !params.SKIP_DOCKER } }
      steps {
        script {
          env.TRIVY_SEVERITY = params.FORCE_TRIVY_FAIL ? 'UNKNOWN,LOW,MEDIUM,HIGH,CRITICAL' : 'HIGH,CRITICAL'
        }
        sh '''#!/bin/sh
set -eu
trivy image --scanners vuln --format json --output reports/trivy-report.json \
  --severity "$TRIVY_SEVERITY" --exit-code 1 --no-progress "$IMAGE_REF"
'''
      }
      post { always { archiveArtifacts artifacts: 'reports/trivy-report.json', allowEmptyArchive: false } }
    }
    stage('Publish Image') {
      when { expression { params.PUBLISH_IMAGE && env.CAN_RELEASE == 'true' } }
      steps {
        withCredentials([usernamePassword(credentialsId: 'validore-registry', usernameVariable: 'REGISTRY_USER', passwordVariable: 'REGISTRY_PASS')]) {
          sh '''#!/bin/sh
set -eu
# Isolate credentials to this build and clean them even when a push fails.
DOCKER_CONFIG="$(mktemp -d "$WORKSPACE/.docker-auth.XXXXXX")"
export DOCKER_CONFIG
trap 'rm -rf -- "$DOCKER_CONFIG"' EXIT HUP INT TERM
printf '%s' "$REGISTRY_PASS" | docker login "$REGISTRY_HOST" --username "$REGISTRY_USER" --password-stdin
docker push "$IMAGE_REF"
docker image inspect "$IMAGE_REF" --format '{{index .RepoDigests 0}}' > reports/image-digest.txt
'''
        }
        script {
          env.IMAGE_DIGEST = readFile('reports/image-digest.txt').trim()
          if (!(env.IMAGE_DIGEST ==~ '[a-z0-9.:_/-]+@sha256:[a-f0-9]{64}')) { error('Registry did not produce a valid image digest') }
        }
        archiveArtifacts artifacts: 'reports/image-digest.txt', fingerprint: true
      }
    }
    stage('Deploy Render') {
      when {
        beforeInput true
        expression { params.DEPLOY_RENDER && env.CAN_RELEASE == 'true' }
      }
      options { timeout(time: 30, unit: 'MINUTES') }
      input { message 'Deploy the tested commit to the configured Render service?'; ok 'Deploy' }
      steps {
        script {
          env.RENDER_SERVICE_ID = params.RENDER_SERVICE_ID.trim()
          env.RENDER_ROLLBACK_ON_FAILURE = params.ROLLBACK_RENDER_ON_FAILURE ? 'true' : 'false'
        }
        withCredentials([string(credentialsId: 'validore-render-api', variable: 'RENDER_API_KEY')]) {
          script {
            if (isUnix()) { sh 'node scripts/render-deployment.mjs' }
            else { bat 'node scripts/render-deployment.mjs' }
          }
        }
      }
      post { always { archiveArtifacts artifacts: 'reports/render-deploy.json', allowEmptyArchive: false } }
    }
    stage('Deploy Staging') {
      when {
        beforeInput true
        expression { params.DEPLOY_STAGING && params.PUBLISH_IMAGE && env.CAN_RELEASE == 'true' }
      }
      options { timeout(time: 10, unit: 'MINUTES') }
      input { message 'Deploy the scanned image to staging?'; ok 'Deploy' }
      steps {
        build job: params.STAGING_DEPLOY_JOB.trim(), wait: true, propagate: true,
          parameters: [string(name: 'IMAGE_REF', value: env.IMAGE_DIGEST)]
      }
    }
  }
  post {
    always {
      archiveArtifacts artifacts: 'reports/junit.xml,reports/trivy-report.json,reports/image-digest.txt,reports/render-deploy.json', allowEmptyArchive: true
      script {
        if (!params.SKIP_DOCKER && isUnix() && env.IMAGE_REF) {
          sh(script: 'docker image rm "$IMAGE_REF"', returnStatus: true)
        }
        echo "Result: ${currentBuild.currentResult}; commit: ${env.GIT_SHA_FULL ?: 'unavailable'}"
      }
    }
    failure { echo 'Review the failed stage and archived reports before rerunning.' }
    success { echo 'All selected CI stages passed. Staging runs only when explicitly configured and selected.' }
  }
}
