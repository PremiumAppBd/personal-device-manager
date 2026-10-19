# Personal Device Manager (PDM)

Private, self-hosted, **consent-based** management of Android devices you own,
through a secure web dashboard. This is legitimate device management, not covert
surveillance: every sensitive capability is gated behind explicit, visible,
on-device authorization, and the app never hides itself or suppresses OS privacy
indicators.

> Phase 1 (this repo) implements the secure foundation: owner auth, device
> pairing/enrollment, per-request device authentication, non-sensitive
> monitoring, dashboard, and audit logging. **No camera capture and no SMS
> access are implemented.** Those are future, consent-gated phases with
> interfaces designed for here. See `docs/`.

## Layout

```
apps/
  api/         Cloudflare Worker (Hono + Zod + D1)   @pdm/api
  dashboard/   React + Vite + Tailwind + TanStack    @pdm/dashboard
  android/     Kotlin + Jetpack Compose agent
packages/
  shared/      Types, Zod schemas, signing contract  @pdm/shared
infrastructure/cloudflare/   Provisioning + env templates
docs/          Architecture, security, threat model, API, DB, roadmap, ADRs
```

## Quick start

```bash
# 1. Install (Node 20+, pnpm 9+)
pnpm install

# 2. Backend: configure a local secret and the DB
cp apps/api/.dev.vars.example apps/api/.dev.vars      # set OWNER_SESSION_SECRET
pnpm --filter @pdm/api run db:migrate:local
OWNER_EMAIL=you@example.com OWNER_PASSWORD='a-long-passphrase' \
  node apps/api/scripts/seed-owner.mjs --local

# 3. Run API + dashboard
pnpm --filter @pdm/api run dev        # http://127.0.0.1:8787
pnpm --filter @pdm/dashboard run dev  # http://127.0.0.1:5173
# Dashboard demo mode (no backend): VITE_DEMO_MODE=true pnpm --filter @pdm/dashboard run dev
```

Android: open `apps/android` in Android Studio with the Android SDK (API 36),
set `local.properties` `sdk.dir`, align AGP in `gradle/libs.versions.toml` to
your SDK, then `./gradlew :app:assembleDebug`. The app is distributed privately
(no Play Store).

## Test / typecheck / build

```bash
pnpm -r run typecheck
pnpm -r run test                         # shared + api (Workers) + dashboard
pnpm --filter @pdm/dashboard run build
pnpm --filter @pdm/dashboard run test:e2e  # Playwright demo-mode smoke
```

Current status: 7 shared + 17 API integration + 5 dashboard unit + 2 e2e tests
pass; D1 migrations apply locally; all TypeScript builds are clean. The Android
app compiles in CI (Android SDK present) but was not compiled in the scaffolding
environment. Details and exactly-what-was-not-verified: `docs/implementation-roadmap.md`.

## Security

See `docs/security.md` and `docs/threat-model.md`. Highlights: Keystore ECDSA
device identity, signed replay-protected requests, single-use pairing codes,
ownership isolation, audit logging, TLS-only, no secrets in logs or source.

## Deployment

See `infrastructure/cloudflare/README.md`. No resources are provisioned and
nothing is deployed without you running the commands. Do not deploy to
production without explicit approval.

## License

Private. See `LICENSE`. Not for use against devices without the informed consent
of their owner/primary user.
