# Cloudflare Infrastructure

Phase 1 uses Cloudflare Workers + D1. R2 and Durable Objects are declared as
binding placeholders for future phases. **No resources are provisioned and
nothing is deployed by this repo without the owner explicitly running the
commands below.** Do not deploy to production without approval.

## Prerequisites

- A Cloudflare account and `wrangler` authenticated: `wrangler login`.
- Node 20+ and pnpm 9+.

## 1. Provision D1 (one time)

```bash
cd apps/api
wrangler d1 create pdm_db
# Copy the printed database_id into apps/api/wrangler.toml (replace the
# placeholder 00000000-... value).
```

## 2. Apply migrations

```bash
# Local (no account needed):
pnpm --filter @pdm/api run db:migrate:local
# Remote (after the database exists; this touches your account):
pnpm --filter @pdm/api run db:migrate:remote
```

## 3. Secrets (never commit these)

```bash
cd apps/api
# Strong random secret, e.g. openssl rand -base64 48
wrangler secret put OWNER_SESSION_SECRET
# Optional session lifetime override is a plain var (wrangler.toml / .dev.vars).
```

For local dev, copy `apps/api/.dev.vars.example` to `apps/api/.dev.vars` and set
`OWNER_SESSION_SECRET`.

## 4. Seed the owner account

```bash
cd apps/api
# Local:
OWNER_EMAIL=you@example.com OWNER_PASSWORD='a-long-passphrase' \
  node scripts/seed-owner.mjs --local
# Remote: same without --local (writes to the remote D1 after approval).
```

## 5. Future-phase resources (do NOT create until that phase is approved)

```bash
# R2 (Phase 4):
wrangler r2 bucket create pdm-media
# Durable Objects + Realtime TURN: configured per Cloudflare docs at that time.
```

## 6. Run locally

```bash
pnpm --filter @pdm/api run dev        # wrangler dev (http://127.0.0.1:8787)
pnpm --filter @pdm/dashboard run dev  # vite dev (http://127.0.0.1:5173)
```

## 7. Deploy (requires explicit approval)

```bash
cd apps/api
wrangler deploy                  # default environment
wrangler deploy --env production # production
```

## Cost note

D1 has generous free limits for personal use. Durable Objects and Realtime TURN
have their own pricing; confirm current limits before enabling future phases.
See `docs/architecture.md` for the VERIFY list.
