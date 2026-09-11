#!/usr/bin/env -S just --justfile
# justfile — single entry point for every command this repo uses.
#
# `just` is a thin, typo-proof wrapper around the pnpm/turbo/docker scripts
# that already exist (see package.json and scripts/); it does not replace
# them, it organises them. Everything here still just shells out to the same
# commands documented in README.md and GUIDE.md.
#
# Run `just` with no arguments to see this list.

set dotenv-load := true
set dotenv-filename := ".env"
set shell := ["bash", "-euo", "pipefail", "-c"]

# Show all recipes (default when you run `just` with no arguments).
default:
    @just --list --unsorted

# ── Setup ─────────────────────────────────────────────────────────────────────

# Install every workspace dependency.
[group('setup')]
install:
    pnpm install

# Interactive first-run initialiser: name, secrets, .env files. Safe to re-run.
[group('setup')]
bootstrap:
    pnpm bootstrap

# Install, start infra, apply the schema. Run `just bootstrap` first (interactive, not chained here).
[group('setup')]
fresh: install up db-migrate
    @echo "Ready. Run 'just dev' to start the API and web app."

# ── Development ───────────────────────────────────────────────────────────────

# Start Postgres + Redis (if not already up) and both apps in watch mode.
[group('dev')]
dev: up
    pnpm dev

# Start only the API in watch mode.
[group('dev')]
dev-api:
    pnpm --filter @repo/api dev

# Start only the web app in watch mode.
[group('dev')]
dev-web:
    pnpm --filter @repo/web dev

# Production build of every package, in dependency order.
[group('dev')]
build:
    pnpm build

# Remove build output, caches and node_modules.
[group('dev')]
clean:
    pnpm clean

# ── Quality ───────────────────────────────────────────────────────────────────

# ESLint across the workspace, including the architectural boundary rules.
[group('quality')]
lint:
    pnpm lint

# ESLint with --fix applied everywhere it's safe to.
[group('quality')]
lint-fix:
    pnpm -r exec eslint . --fix

# TypeScript across the whole workspace, no emit.
[group('quality')]
typecheck:
    pnpm typecheck

# Prettier — write.
[group('quality')]
format:
    pnpm format

# Prettier — verify only, exits non-zero on drift (what CI runs).
[group('quality')]
format-check:
    pnpm format:check

# Unit tests with coverage.
[group('quality')]
test:
    pnpm test

# Integration tests (real Postgres via Testcontainers, includes the RLS suite). Needs Docker running.
[group('quality')]
test-integration:
    pnpm test:integration

# Both test suites back to back.
[group('quality')]
test-all: test test-integration

# Per-area coverage gate. Run after test-all, or it reads a stale/partial report.
[group('quality')]
coverage:
    pnpm exec tsx scripts/check-coverage.ts

# Verify .env.example matches the Zod env schema.
[group('quality')]
check-env:
    pnpm check:env

# Everything CI's `static` + `test` jobs check, run locally before you push.
[group('quality')]
check: lint typecheck format-check check-env test test-integration coverage
    @echo "All checks passed."

# ── Database ──────────────────────────────────────────────────────────────────

# Generate a migration from changes to the Drizzle schema.
[group('database')]
db-generate:
    pnpm db:generate

# Apply pending migrations (creates roles, tables, RLS policies).
[group('database')]
db-migrate:
    pnpm db:migrate

# Seed development data.
[group('database')]
db-seed:
    pnpm db:seed

# Drizzle Studio — browse the database in the browser.
[group('database')]
db-studio:
    pnpm db:studio

# psql shell into the local Postgres container, as the owner role.
[group('database')]
db-shell:
    docker compose exec postgres psql -U "${POSTGRES_USER:-app_owner}" -d "${POSTGRES_DB:-boilerplate}"

# DESTRUCTIVE: drop the local DB volume and rebuild from scratch.
[group('database')]
db-reset:
    @echo "This deletes the local postgres_data volume. Ctrl+C to abort."
    @sleep 3
    docker compose down -v
    just up
    just db-migrate
    just db-seed

# ── Docker (local infra) ────────────────────────────────────────────────────────

# Start Postgres + Redis in the background and wait for both to be healthy.
[group('docker')]
up:
    docker compose up -d --wait

# Stop Postgres + Redis, keep their data.
[group('docker')]
down:
    docker compose down

# Stop Postgres + Redis and delete their data volumes.
[group('docker')]
down-v:
    docker compose down -v

# Tail logs from the local infra containers.
[group('docker')]
logs:
    docker compose logs -f

# Status of the local infra containers.
[group('docker')]
ps:
    docker compose ps

# ── Contract & codegen ───────────────────────────────────────────────────────

# Regenerate openapi.json and the typed client from it. Commit both after.
[group('contract')]
contract:
    pnpm api:contract

# ── Scaffolding ───────────────────────────────────────────────────────────────

# Scaffold a new backend feature slice from the `items` reference, e.g. `just new-module invoices`.
[group('scaffold')]
new-module name:
    pnpm gen:module {{ name }}

# ── Release ───────────────────────────────────────────────────────────────────

# Build both Docker images locally (what CI's `build` job runs).
[group('release')]
docker-build:
    docker build -f apps/api/Dockerfile -t boilerplate-api .
    docker build -f apps/web/Dockerfile -t boilerplate-web .

# Deploy a ref on the server this runs on (default: main). Run ON the VPS, not a laptop.
[group('release')]
deploy ref="main":
    ./scripts/deploy.sh {{ ref }}

# ── Diagnostics ───────────────────────────────────────────────────────────────

# Print versions of everything the boilerplate needs, and flag what's missing.
[group('diagnostics')]
doctor:
    #!/usr/bin/env bash
    set -euo pipefail
    ok=true
    check() {
      if command -v "$1" >/dev/null 2>&1; then
        printf "  \033[32m✓\033[0m %-10s %s\n" "$1" "$("$1" "$2" 2>&1 | head -1)"
      else
        printf "  \033[31m✗\033[0m %-10s not found\n" "$1"
        ok=false
      fi
    }
    echo "Toolchain:"
    check node --version
    check pnpm --version
    check docker --version
    check just --version
    echo
    if docker compose version >/dev/null 2>&1; then
      echo "  ✓ docker compose v2 plugin present"
    else
      echo "  ✗ docker compose v2 plugin missing"; ok=false
    fi
    echo
    if [ -f apps/api/.env ]; then echo "  ✓ apps/api/.env exists"; else echo "  ✗ apps/api/.env missing — run 'just bootstrap'"; ok=false; fi
    if [ -f apps/web/.env ]; then echo "  ✓ apps/web/.env exists"; else echo "  ✗ apps/web/.env missing — run 'just bootstrap'"; ok=false; fi
    echo
    $ok && echo "Looks good." || { echo "Fix the items above, then re-run 'just doctor'."; exit 1; }
