#!/usr/bin/env bash
#
# Deploy one commit to this server. Runs ON the EC2 box, run over SSH
# by .github/workflows/deploy.yml, which copies it over and runs it:
#
#   bash deploy/aws/deploy.sh <commit-sha>     (copied to the box and run there)
#
# What it does, in order — each step safe to repeat, because SSH to this box
# drops now and then and the workflow retries the whole thing:
#
#   1. take a lock, so two deploys never overlap
#   2. fast-forward the checkout to the commit (refuses if the box has diverged)
#   3. install dependencies only when a lockfile changed
#   4. build the frontend into dist.new — ON the server, because its
#      frontend/.env.production.local holds the VITE_* values — then swap it in,
#      keeping the old build as dist.prev
#   5. restart the API under PM2 and wait for /api/health/live
#   6. if the API does not come up, put the previous code and build back
#
# Environment (all optional): APP_DIR (~/mern-estate), PM2_APP (mern-estate-api),
# HEALTH_URL (http://127.0.0.1:3000/api/health/live).

set -euo pipefail

SHA="${1:?usage: deploy.sh <commit-sha>}"
APP_DIR="${APP_DIR:-$HOME/mern-estate}"
PM2_APP="${PM2_APP:-mern-estate-api}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3000/api/health/live}"

# A non-interactive SSH shell does not load the profile that puts node on PATH.
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
# shellcheck disable=SC1091
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" >/dev/null 2>&1 || true
export PATH="$HOME/.local/bin:/usr/local/bin:$PATH"

log() { printf '\n==> %s\n' "$*"; }

exec 9>"$HOME/.deploy.lock"
flock -w 600 9 || { echo "another deploy is running"; exit 1; }

cd "$APP_DIR"
OLD="$(git rev-parse HEAD)"
log "Deploying ${SHA:0:8} (currently ${OLD:0:8})"

git fetch origin main --quiet
git merge --ff-only "$SHA" --quiet

CHANGED="$(git diff --name-only "$OLD" "$SHA" || true)"

rollback() {
  log "FAILED — rolling back to ${OLD:0:8}"
  git reset --hard "$OLD" --quiet || true
  if [ -d "$APP_DIR/frontend/dist.prev" ]; then
    rm -rf "$APP_DIR/frontend/dist"
    mv "$APP_DIR/frontend/dist.prev" "$APP_DIR/frontend/dist"
  fi
  (cd "$APP_DIR/backend" && pm2 restart "$PM2_APP" --update-env) || true
  exit 1
}
trap rollback ERR

# ── backend ────────────────────────────────────────────────────────────────
log "Backend dependencies"
if [ ! -d backend/node_modules ] || grep -q '^backend/package-lock.json$' <<<"$CHANGED"; then
  (cd backend && npm ci --omit=dev)
else
  echo "lockfile unchanged — skipped"
fi

# ── frontend ───────────────────────────────────────────────────────────────
log "Frontend dependencies"
if [ ! -d frontend/node_modules ] || grep -q '^frontend/package-lock.json$' <<<"$CHANGED"; then
  (cd frontend && npm ci --legacy-peer-deps)
else
  echo "lockfile unchanged — skipped"
fi

log "Frontend build"
(
  cd frontend
  rm -rf dist.new
  npx vite build --outDir dist.new --emptyOutDir
  test -f dist.new/index.html
  rm -rf dist.prev
  [ -d dist ] && mv dist dist.prev
  mv dist.new dist
)

# ── restart and verify ─────────────────────────────────────────────────────
log "Restarting $PM2_APP"
(cd backend && pm2 restart "$PM2_APP" --update-env)

log "Waiting for $HEALTH_URL"
for i in $(seq 1 30); do
  if curl -fsS --max-time 3 "$HEALTH_URL" >/dev/null 2>&1; then
    trap - ERR
    log "Healthy after ${i}s — deployed ${SHA:0:8}"
    exit 0
  fi
  sleep 1
done

echo "API did not become healthy"
false   # trips the ERR trap, which rolls back
