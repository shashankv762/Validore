FROM node:24-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --include=dev --no-fund

FROM dependencies AS builder
COPY . .
# Public values are inlined by Next.js. Private credentials belong only at runtime.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_APP_URL
ENV NEXT_TELEMETRY_DISABLED=1
RUN test -n "$NEXT_PUBLIC_SUPABASE_URL" && test -n "$NEXT_PUBLIC_SUPABASE_ANON_KEY" && test -n "$NEXT_PUBLIC_APP_URL" \
 && npm run build

FROM node:24-alpine AS runner
WORKDIR /app
ARG GIT_COMMIT="unknown"
ARG VERSION="dev"
LABEL org.opencontainers.image.title="Validore" \
      org.opencontainers.image.revision="$GIT_COMMIT" \
      org.opencontainers.image.version="$VERSION"
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup --system --gid 1001 validore \
 && adduser --system --uid 1001 --ingroup validore validore
COPY --from=builder --chown=validore:validore /app/.next/standalone ./
COPY --from=builder --chown=validore:validore /app/.next/static ./.next/static
COPY --from=builder --chown=validore:validore /app/public ./public
USER validore
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health',{signal:AbortSignal.timeout(4000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
