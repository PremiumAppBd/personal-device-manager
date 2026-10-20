#!/usr/bin/env bash
#
# Cloudflare deploy helper for the PDM API.
#
# What it does, in order:
#   1. checks you are logged in to wrangler
#   2. (optional) creates the D1 database
#   3. applies D1 migrations to the remote database
#   4. reminds you to set the OWNER_SESSION_SECRET (if not already set)
#   5. deploys the Worker
#
# It NEVER provisions paid resources on its own and asks before deploying.
# Run from the repo root:  ./infrastructure/cloudflare/deploy.sh
#
# Env flags:
#   PDM_ENV=production      deploy to the production environment
#   PDM_CREATE_D1=1         run `wrangler d1 create pdm_db` first (one time)
#   PDM_SKIP_MIGRATIONS=1   skip applying migrations
#   PDM_YES=1               do not prompt for confirmation before deploy

set -euo pipefail

API_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../apps/api" && pwd)"
cd "$API_DIR"

ENV_ARG=""
if [ "${PDM_ENV:-}" = "production" ]; then
  ENV_ARG="--env production"
fi

echo "==> Using API dir: $API_DIR"
echo "==> wrangler: $(pnpm exec wrangler --version)"

echo "==> Checking wrangler auth..."
if ! pnpm exec wrangler whoami >/dev/null 2>&1; then
  echo "You are not logged in. Run: pnpm exec wrangler login" >&2
  exit 1
fi

if [ "${PDM_CREATE_D1:-}" = "1" ]; then
  echo "==> Creating D1 database pdm_db (one time)..."
  echo "    Copy the printed database_id into apps/api/wrangler.toml, then re-run without PDM_CREATE_D1."
  pnpm exec wrangler d1 create pdm_db
  exit 0
fi

if [ "${PDM_SKIP_MIGRATIONS:-}" != "1" ]; then
  echo "==> Applying D1 migrations to the REMOTE database..."
  pnpm exec wrangler d1 migrations apply pdm_db --remote
fi

echo "==> Reminder: ensure the session secret is set (one time):"
echo "    pnpm exec wrangler secret put OWNER_SESSION_SECRET $ENV_ARG"
echo "    (generate one with:  openssl rand -base64 48 )"

if [ "${PDM_YES:-}" != "1" ]; then
  read -r -p "==> Deploy the Worker now? [y/N] " answer
  case "$answer" in
    [yY]*) ;;
    *) echo "Aborted. Nothing deployed."; exit 0 ;;
  esac
fi

echo "==> Deploying..."
# shellcheck disable=SC2086
pnpm exec wrangler deploy $ENV_ARG

echo "==> Done. After deploy, seed the owner account (one time):"
echo "    OWNER_EMAIL=you@example.com OWNER_PASSWORD='a-long-passphrase' \\"
echo "      node scripts/seed-owner.mjs    # (remote; omit --local)"
