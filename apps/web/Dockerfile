# syntax=docker/dockerfile:1.7
#
# Web image. Build from the REPO ROOT:
#   docker build -f apps/web/Dockerfile --build-arg VITE_API_URL=https://api.example.com -t web .
#
# ┌─────────────────────────────────────────────────────────────────────────┐
# │ VITE_* VARIABLES ARE BUILD-TIME, NOT RUNTIME.                           │
# │                                                                         │
# │ Vite inlines import.meta.env.VITE_* into the JavaScript bundle during   │
# │ `vite build`. Once the bundle exists the values are literals in the     │
# │ shipped files. Setting VITE_API_URL in docker-compose `environment:` or │
# │ in the server's .env changes NOTHING — nginx only serves static files.  │
# │                                                                         │
# │ So: pass every VITE_* as a --build-arg here, and rebuild the image when │
# │ one of them changes. A staging build and a production build are two     │
# │ different images, not one image with two configs.                       │
# │                                                                         │
# │ Corollary: never put a secret in a VITE_* variable. It is readable by   │
# │ anyone who opens the bundle.                                            │
# └─────────────────────────────────────────────────────────────────────────┘

FROM node:20-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /repo

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm fetch --frozen-lockfile

FROM deps AS build
# Declared after the dependency layers so changing a VITE_* value rebuilds the
# bundle without re-fetching packages.
ARG VITE_API_URL
ARG VITE_APP_NAME
ARG VITE_OTEL_EXPORTER_OTLP_ENDPOINT
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_APP_NAME=$VITE_APP_NAME
ENV VITE_OTEL_EXPORTER_OTLP_ENDPOINT=$VITE_OTEL_EXPORTER_OTLP_ENDPOINT

COPY . .
RUN pnpm install --frozen-lockfile --offline
RUN pnpm exec turbo run build --filter=@repo/web...

# ── runtime: static files behind nginx ───────────────────────────────────────
FROM nginx:alpine AS runtime
# The default site would shadow ours and has no SPA fallback.
RUN rm -f /etc/nginx/conf.d/default.conf
COPY infra/nginx/web.conf /etc/nginx/conf.d/web.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --quiet --spider http://127.0.0.1/ || exit 1

# nginx's own entrypoint handles SIGTERM and drains connections; no init needed.
