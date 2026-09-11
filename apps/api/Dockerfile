# syntax=docker/dockerfile:1.7
#
# API image. Build from the REPO ROOT, not from apps/api:
#   docker build -f apps/api/Dockerfile -t api .
#
# The layer order exists to keep rebuilds cheap: the lockfile alone seeds the
# package store, so editing source code never re-downloads dependencies.

# ── base: pnpm, once, shared by every stage ──────────────────────────────────
FROM node:20-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /repo

# ── deps: populate the pnpm store from the lockfile only ─────────────────────
# `pnpm fetch` reads nothing but pnpm-lock.yaml, so this layer is invalidated
# only by a dependency change — not by a source change.
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm fetch --frozen-lockfile

# ── build: install offline from the store, then compile ──────────────────────
FROM deps AS build
COPY . .
RUN pnpm install --frozen-lockfile --offline
# `@repo/api...` includes the workspace packages the API depends on, so their
# dist/ output exists before pnpm deploy tries to copy it.
RUN pnpm exec turbo run build --filter=@repo/api...
# --legacy is required on pnpm 10: the default (non-legacy) deploy refuses to run
# outside a workspace with an injected node_modules layout.
RUN pnpm deploy --filter @repo/api --prod --legacy /app/out

# ── runtime: only the pruned production tree ─────────────────────────────────
FROM node:20-alpine AS runtime
ENV NODE_ENV=production
ENV PORT=3000
# dumb-init is PID 1 so SIGTERM actually reaches Node. Without it Node runs as
# PID 1, ignores the default signal disposition, and graceful shutdown
# (doc 08 §6) never starts — every deploy drops in-flight requests.
RUN apk add --no-cache dumb-init
WORKDIR /app
COPY --from=build --chown=node:node /app/out ./
USER node
EXPOSE 3000

# /healthz is liveness only and never touches the database, so a flaky database
# cannot get the container killed and restarted in a loop.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/main.js"]
