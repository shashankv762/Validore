# ─── Build stage ──────────────────────────────────────────────────────────────
# Node 20 Alpine: minimal surface area, fast pulls.
FROM node:20-alpine AS base

# Build-time metadata (injected by Jenkins --build-arg).
ARG BUILD_DATE="unknown"
ARG GIT_COMMIT="unknown"
ARG VERSION="dev"

WORKDIR /app

# ── 1. Install dependencies (cached layer) ────────────────────────────────────
# Copy manifests first so Docker cache reuses this layer when only source changes.
COPY package*.json ./
RUN npm ci --legacy-peer-deps

# ── 2. Build the Next.js standalone bundle ────────────────────────────────────
COPY . .

# Telemetry disabled for deterministic, hermetic builds.
ENV NEXT_TELEMETRY_DISABLED=1

# Build — this produces .next/standalone (a self-contained Node server).
RUN npm run build

# ─── Runtime stage ────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

# OCI-standard image labels (visible in registries and Trivy reports).
LABEL org.opencontainers.image.title="Validore" \
      org.opencontainers.image.description="Startup idea validation platform" \
      org.opencontainers.image.created="${BUILD_DATE}" \
      org.opencontainers.image.revision="${GIT_COMMIT}" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.source="https://github.com/your-org/validore"

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# ── Security hardening ────────────────────────────────────────────────────────
# Run as a non-root user: reduces blast radius if a CVE is exploited.
RUN addgroup --system --gid 1001 validore \
 && adduser  --system --uid  1001 --ingroup validore validore

# ── Copy only what the runtime needs ─────────────────────────────────────────
COPY --from=base --chown=validore:validore /app/.next/standalone ./
COPY --from=base --chown=validore:validore /app/.next/static     ./.next/static
COPY --from=base --chown=validore:validore /app/public           ./public

USER validore

EXPOSE 3000

# ── Container-native health probe ─────────────────────────────────────────────
# Orchestrators (Kubernetes, ECS, Compose) use this to gate traffic.
# /api/health is unauthenticated and DB-free (pure liveness check).
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Start the standalone Next.js server directly with Node — no shell wrapper needed.
CMD ["node", "server.js"]
