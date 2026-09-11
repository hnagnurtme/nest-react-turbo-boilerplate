#!/bin/sh
#
# Deploy the stack on a VPS running Docker Compose.
#
#   ./scripts/deploy.sh [git-ref]
#
# Order of operations matters: migrations run against the database BEFORE the new
# containers start serving. The reverse order gives you a window where new code
# queries columns that do not exist yet. This only works if migrations are
# backwards compatible with the currently running code — expand/contract, never
# rename or drop in the same deploy (doc 08 §8).
#
# On a failed health check the previous images are put back and the script exits
# non-zero. The database is NOT rolled back; that is why migrations must be
# additive.

set -eu
# pipefail is not in POSIX, but bash, dash >= 0.5.12 and busybox ash all honour
# it. Without it, `a | b` reports b's status and a silent failure in a pipeline
# would look like success.
# shellcheck disable=SC3040
(set -o pipefail 2>/dev/null) && set -o pipefail

# ── configuration ────────────────────────────────────────────────────────────
REPO_DIR="$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-$REPO_DIR/docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-$REPO_DIR/.env}"
GIT_REF="${1:-main}"
HEALTH_RETRIES="${HEALTH_RETRIES:-30}"
HEALTH_INTERVAL="${HEALTH_INTERVAL:-2}"

compose() {
  docker compose --file "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"
}

log()  { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
fail() { printf '\n\033[31mDEPLOY FAILED: %s\033[0m\n' "$*" >&2; exit 1; }

# ── step 0: preflight — fail before touching anything ────────────────────────
log "Preflight"
command -v docker >/dev/null 2>&1 || fail "docker is not installed"
docker compose version >/dev/null 2>&1 || fail "the docker compose plugin is not installed"
[ -f "$COMPOSE_FILE" ] || fail "compose file not found: $COMPOSE_FILE"
[ -f "$ENV_FILE" ] || fail "env file not found: $ENV_FILE — copy .env.example and fill it in"
cd "$REPO_DIR"

# Record what is running now, so a failed deploy has something to go back to.
PREVIOUS_SHA="$(git rev-parse HEAD)"
echo "    current revision: $PREVIOUS_SHA"

# ── step 1: fetch the code being deployed ────────────────────────────────────
log "Fetching $GIT_REF"
git fetch --prune origin
git checkout --quiet "$GIT_REF"
git reset --hard "origin/$GIT_REF" 2>/dev/null || git reset --hard "$GIT_REF"
NEW_SHA="$(git rev-parse HEAD)"
echo "    deploying revision: $NEW_SHA"

# ── step 2: build the images ─────────────────────────────────────────────────
# Built before anything is stopped: a build failure must cost zero downtime.
# VITE_* build args come from $ENV_FILE via the compose file — the web bundle is
# compiled here, not configured at runtime.
log "Building images"
compose build || fail "image build failed — nothing was changed"

# ── step 3: infrastructure first ─────────────────────────────────────────────
# Postgres and Redis must be healthy before migrations can run. `up -d` on just
# these two is a no-op when they are already running.
log "Starting database and cache"
compose up -d --wait postgres redis || fail "postgres/redis did not become healthy"

# ── step 4: migrate BEFORE swapping the app containers ───────────────────────
log "Running database migrations"
compose --profile tools run --rm migrate || fail "migrations failed — old containers are untouched and still serving"

# ── step 5: swap in the new containers ───────────────────────────────────────
# --wait blocks until each service reports healthy (or its start_period expires),
# so the health check below is a confirmation rather than a race.
log "Starting new application containers"
if ! compose up -d --wait --remove-orphans api web; then
  ROLLOUT_FAILED=1
else
  ROLLOUT_FAILED=0
fi

# ── step 6: verify, with retries ─────────────────────────────────────────────
# A container can be "running" and still not be serving; poll the real endpoint.
health_ok() {
  compose exec -T api node -e \
    "fetch('http://127.0.0.1:3000/readyz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" \
    >/dev/null 2>&1
}

if [ "$ROLLOUT_FAILED" -eq 0 ]; then
  log "Waiting for /readyz"
  attempt=1
  while [ "$attempt" -le "$HEALTH_RETRIES" ]; do
    if health_ok; then
      printf '    healthy after %s attempt(s)\n' "$attempt"
      ROLLOUT_FAILED=0
      break
    fi
    printf '    attempt %s/%s not ready yet\n' "$attempt" "$HEALTH_RETRIES"
    sleep "$HEALTH_INTERVAL"
    attempt=$((attempt + 1))
    [ "$attempt" -gt "$HEALTH_RETRIES" ] && ROLLOUT_FAILED=1
  done
fi

# ── step 7: roll back on failure ─────────────────────────────────────────────
# Code only. The schema stays at the new version, which is safe precisely because
# step 4 refuses anything but additive migrations.
if [ "$ROLLOUT_FAILED" -ne 0 ]; then
  printf '\n\033[31m==> Health check failed. Rolling back to %s\033[0m\n' "$PREVIOUS_SHA" >&2
  compose logs --tail 100 api >&2 || true
  git reset --hard "$PREVIOUS_SHA"
  compose build api web || fail "rollback build failed — the stack needs manual attention NOW"
  compose up -d --wait api web || fail "rollback failed to start — the stack needs manual attention NOW"
  fail "deploy of $NEW_SHA rolled back to $PREVIOUS_SHA (see the api logs above)"
fi

# ── step 8: tidy up ──────────────────────────────────────────────────────────
log "Pruning images from previous deploys"
docker image prune --force --filter "until=168h" >/dev/null 2>&1 || true

log "Deployed $NEW_SHA"
compose ps
