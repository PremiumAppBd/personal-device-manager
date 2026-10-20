# Deployment (Cloudflare)

Nothing is deployed until you run these commands. The API runs on Cloudflare
Workers with a D1 database. The dashboard is static files you host anywhere
(Cloudflare Pages is easiest).

## Prerequisites

- A Cloudflare account.
- `wrangler` logged in:
  ```bash
  pnpm --filter @pdm/api exec wrangler login
  ```

## Step 1 — create the D1 database (one time)

```bash
PDM_CREATE_D1=1 ./infrastructure/cloudflare/deploy.sh
# or:  cd apps/api && pnpm exec wrangler d1 create pdm_db
```

Copy the printed `database_id` into `apps/api/wrangler.toml`, replacing the
`00000000-0000-0000-0000-000000000000` placeholder.

## Step 2 — set the session secret (one time)

```bash
pnpm --filter @pdm/api exec wrangler secret put OWNER_SESSION_SECRET
# paste a long random value, e.g. from: openssl rand -base64 48
```

Secrets are stored by Cloudflare and are never committed to the repo.

## Step 3 — migrate + deploy

```bash
./infrastructure/cloudflare/deploy.sh
# applies migrations to the remote DB, then asks before deploying
```

Manual equivalent:

```bash
cd apps/api
pnpm exec wrangler d1 migrations apply pdm_db --remote
pnpm exec wrangler deploy
```

Your API is now live at `https://pdm-api.<your-subdomain>.workers.dev`.

## Step 4 — create your owner login (one time)

```bash
cd apps/api
OWNER_EMAIL=you@example.com OWNER_PASSWORD='a-long-passphrase' \
  node scripts/seed-owner.mjs          # remote (omit --local)
```

## Step 5 — deploy the dashboard

```bash
VITE_API_BASE_URL=https://pdm-api.<your-subdomain>.workers.dev \
  pnpm --filter @pdm/dashboard run build
pnpm --filter @pdm/dashboard exec wrangler pages deploy dist --project-name pdm-dashboard
```

Make sure `VITE_DEMO_MODE` is **not** `true` for a production build. A
production build with demo mode on shows a loud red misconfiguration banner.

## Step 6 — build the Android app against the deployed API

```bash
cd apps/android
./gradlew :app:assembleDebug -Ppdm.apiBaseUrl=https://pdm-api.<your-subdomain>.workers.dev
```

Install the APK on a device you own and pair it from the dashboard.

## Production hardening (recommended before real use)

- Put the API behind **Cloudflare Access** and set `CF_ACCESS_TEAM_DOMAIN` and
  `CF_ACCESS_AUD` in `wrangler.toml` so logins use your identity provider.
- Add a Cloudflare rate-limiting rule on `/api/v1/auth/login` and
  `/api/v1/enroll`.
- Use a custom domain instead of `workers.dev` if you want.

## Deploy script flags

`./infrastructure/cloudflare/deploy.sh` honors:

| flag | effect |
| --- | --- |
| `PDM_ENV=production` | deploy the `production` environment |
| `PDM_CREATE_D1=1` | create the D1 database and exit |
| `PDM_SKIP_MIGRATIONS=1` | skip applying migrations |
| `PDM_YES=1` | do not prompt before deploying |

## Rollback

Redeploy a previous commit, or use `wrangler deployments list` and
`wrangler rollback`. D1 migrations are additive; to change schema, add a new
migration file rather than editing an applied one.
