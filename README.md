# Personal Device Manager (PDM)

Private, self-hosted, **consent-based** management of Android devices you own,
through a secure web dashboard. It does device enrollment, per-device
authentication, and non-sensitive monitoring (battery, storage, network), plus
a command queue, settings, and an audit log.

> **Scope note.** PDM includes an **overt, own-device camera mode**: a phone
> you own can act as a private camera you view from your dashboard, with a
> visible notification and the system camera indicator always on (no hidden
> capture). See `docs/camera.md`. It does **not** implement hidden/stealth
> capture or any SMS reading, by design.

## What's in the repo

```
apps/api         Cloudflare Worker API (Hono + Zod + D1)        @pdm/api
apps/dashboard   React web dashboard (Vite + Tailwind)          @pdm/dashboard
apps/android     Android agent app (Kotlin + Jetpack Compose)
packages/shared  Shared types, schemas, signing contract        @pdm/shared
infrastructure/cloudflare   Deploy script + provisioning docs
docs/            Full documentation (architecture, security, etc.)
```

---

## 1. Install (one time)

You need **Node 20+** and **pnpm 9+** (`npm i -g pnpm`).

```bash
git clone https://github.com/PremiumAppBd/personal-device-manager.git
cd personal-device-manager
pnpm install
```

---

## 2. Run locally

Everything below runs on your machine, no Cloudflare account needed.

```bash
# a) Backend secret (local): copy the example and set a random secret
cp apps/api/.dev.vars.example apps/api/.dev.vars
# edit apps/api/.dev.vars and set OWNER_SESSION_SECRET (any long random string)

# b) Create the local database tables
pnpm --filter @pdm/api run db:migrate:local

# c) Create your owner login
OWNER_EMAIL=you@example.com OWNER_PASSWORD='a-long-passphrase' \
  node apps/api/scripts/seed-owner.mjs --local

# d) Start the API (terminal 1)
pnpm --filter @pdm/api run dev            # http://127.0.0.1:8787

# e) Start the dashboard (terminal 2)
VITE_API_BASE_URL=http://127.0.0.1:8787 pnpm --filter @pdm/dashboard run dev
#                                            opens http://127.0.0.1:5173
```

Open the dashboard, log in with the email/password from step (c), and create a
pairing code under "Pair device".

### Dashboard demo mode (no backend at all)

```bash
VITE_DEMO_MODE=true pnpm --filter @pdm/dashboard run dev
```

This shows clearly-labeled **mock** data so you can click around without the
API running. It is never used in a production build.

---

## 3. Test the API by hand

The API base path is `/api/v1`. Owner endpoints use a Bearer token.

```bash
BASE=http://127.0.0.1:8787/api/v1

# Health check (no auth)
curl -s $BASE/health

# Log in and grab a token (needs the owner you seeded in step 2c)
TOKEN=$(curl -s $BASE/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"you@example.com","password":"a-long-passphrase"}' \
  | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
echo "$TOKEN"

# Who am I
curl -s $BASE/auth/me -H "authorization: Bearer $TOKEN"

# Create a single-use pairing code
curl -s -X POST $BASE/pairings \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"label":"My Pixel"}'

# List devices
curl -s $BASE/devices -H "authorization: Bearer $TOKEN"
```

**Device endpoints** (`/device/*`, `/enroll`) require an ECDSA signature from a
device's Keystore key, so they are not practical to call with raw `curl`. They
are fully exercised by the automated test suite (which does real signing) and by
the Android app. See `docs/api-testing.md` for the full endpoint list.

---

## 4. Run the automated tests

```bash
pnpm -r run typecheck          # type-check everything
pnpm -r run test               # shared + API (real Workers runtime) + dashboard
pnpm --filter @pdm/dashboard run test:e2e   # browser smoke test (demo mode)
```

Current status: shared 7, API 19, dashboard unit 5, dashboard e2e 2 — all pass.
The Android app builds in CI (needs the Android SDK); it is not compiled in
environments without the SDK.

---

## 5. Deploy to Cloudflare

You need a Cloudflare account and `wrangler` logged in
(`pnpm --filter @pdm/api exec wrangler login`). Nothing is deployed until you
run these commands.

### Easy way (script)

```bash
# one time: create the database, then paste the printed database_id into
# apps/api/wrangler.toml (replace the 00000000-... placeholder)
PDM_CREATE_D1=1 ./infrastructure/cloudflare/deploy.sh

# set the production session secret (one time)
pnpm --filter @pdm/api exec wrangler secret put OWNER_SESSION_SECRET

# migrate + deploy (asks before deploying)
./infrastructure/cloudflare/deploy.sh

# create your owner login on the remote database (one time)
cd apps/api
OWNER_EMAIL=you@example.com OWNER_PASSWORD='a-long-passphrase' \
  node scripts/seed-owner.mjs
```

### Manual way (same steps)

```bash
cd apps/api
pnpm exec wrangler d1 create pdm_db          # paste database_id into wrangler.toml
pnpm exec wrangler d1 migrations apply pdm_db --remote
pnpm exec wrangler secret put OWNER_SESSION_SECRET
pnpm exec wrangler deploy                    # your API is now live at a workers.dev URL
```

### Deploy the dashboard

Build it pointing at your deployed API, then host the static `dist/` folder
(Cloudflare Pages, or any static host):

```bash
VITE_API_BASE_URL=https://pdm-api.<your-subdomain>.workers.dev \
  pnpm --filter @pdm/dashboard run build
# upload apps/dashboard/dist/  (e.g. `wrangler pages deploy apps/dashboard/dist`)
```

### Point the Android app at your API

In Android Studio build with the API URL:

```bash
cd apps/android
./gradlew :app:assembleDebug -Ppdm.apiBaseUrl=https://pdm-api.<your-subdomain>.workers.dev
```

Full detail and troubleshooting: `docs/deployment.md`.

---

## 6. Cost

For a few personal test devices this runs on Cloudflare's **free** tier
(Workers + D1 + Pages + Access). See `docs/costs.md` for the numbers and what
would ever cost money.

---

## Documentation

- `docs/camera.md` — use your own phone as a private camera
- `docs/local-development.md` — local run, in depth
- `docs/deployment.md` — Cloudflare deploy, in depth
- `docs/api-testing.md` — every endpoint, with examples
- `docs/costs.md` — free-tier limits and when charges start
- `docs/architecture.md`, `docs/security.md`, `docs/threat-model.md`,
  `docs/api-contract.md`, `docs/database-design.md`,
  `docs/android-16-compatibility.md`, `docs/implementation-roadmap.md`
- `docs/architecture-decisions/` — ADRs

## License

Private. See `LICENSE`. Not for use against devices without the informed consent
of their owner/primary user.
