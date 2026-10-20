# Local Development

Everything here runs on your machine. No Cloudflare account is required.

## Prerequisites

- Node 20 or newer
- pnpm 9 or newer (`npm i -g pnpm`)
- (optional) Android Studio + Android SDK (API 36) to build the app

## First-time setup

```bash
pnpm install
```

## Backend (API)

```bash
# 1. Local secret
cp apps/api/.dev.vars.example apps/api/.dev.vars
#    Edit apps/api/.dev.vars → set OWNER_SESSION_SECRET to any long random string.
#    Generate one:  openssl rand -base64 48

# 2. Create local DB tables (uses a local SQLite managed by wrangler)
pnpm --filter @pdm/api run db:migrate:local

# 3. Seed your owner login
OWNER_EMAIL=you@example.com OWNER_PASSWORD='a-long-passphrase' \
  node apps/api/scripts/seed-owner.mjs --local

# 4. Run it
pnpm --filter @pdm/api run dev       # http://127.0.0.1:8787
```

Quick check: `curl http://127.0.0.1:8787/api/v1/health` should return
`"status":"ok"`.

## Dashboard

```bash
VITE_API_BASE_URL=http://127.0.0.1:8787 pnpm --filter @pdm/dashboard run dev
# http://127.0.0.1:5173
```

Log in with the owner you seeded. To click around with no backend at all, use
demo mode:

```bash
VITE_DEMO_MODE=true pnpm --filter @pdm/dashboard run dev
```

## Android app

Open `apps/android` in Android Studio with the Android SDK (API 36) installed.
Create `apps/android/local.properties` (copy from `local.properties.example`)
with `sdk.dir` pointing to your SDK. Then:

```bash
cd apps/android
./gradlew :app:assembleDebug -Ppdm.apiBaseUrl=http://10.0.2.2:8787
# 10.0.2.2 is how the Android emulator reaches your host's 127.0.0.1
```

Install the debug APK on your own device/emulator, open it, and enter a pairing
code generated from the dashboard.

## Common tasks

```bash
pnpm -r run typecheck     # type-check all packages
pnpm -r run test          # run all tests
pnpm --filter @pdm/api run db:migrate:local    # re-apply migrations locally
```

## Resetting local data

The local database lives under `apps/api/.wrangler/`. Delete that folder to
start fresh, then re-run the migrate + seed steps.
