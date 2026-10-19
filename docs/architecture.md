# PDM Architecture

Personal Device Manager (PDM) is a private, self-hosted platform for managing
Android devices that the operator owns, through a secure web dashboard. It is
consent-based device management, not covert monitoring: every sensitive
capability is gated behind explicit, visible, on-device authorization.

## System overview

```
+-------------------+        HTTPS (TLS)        +--------------------------+
|   Web Dashboard   |  <--------------------->  |   Cloudflare Worker API  |
|  React + Vite     |   owner session (Bearer)  |   Hono + Zod             |
|  (Cloudflare Pages|                           |                          |
|   or static R2)   |                           |   +------ D1 (SQLite) ---+ |
+-------------------+                           |   +------ R2 (media)* --+ |
                                                |   +-- Durable Objects* -+ |
+-------------------+   HTTPS + signed requests  |   (signaling, future)   |
|   Android App     |  <--------------------->  +--------------------------+
|  Kotlin + Compose |   device identity (ECDSA)
|  Keystore + Work  |
+-------------------+        * = future phase (binding placeholders now)
```

Three deployable apps and one shared package:

- `packages/shared` — TypeScript domain model: constants, Zod schemas, API
  view types, and the canonical signing contract (`signing.ts`). Imported by
  both the API and the dashboard, and re-implemented in Kotlin for the device.
- `apps/api` — Cloudflare Worker (Hono). Versioned REST API, owner + device
  authentication, pairing/enrollment, device status, settings, requests, audit.
- `apps/dashboard` — React SPA. Owner UI with an explicitly isolated demo mode.
- `apps/android` — Native device agent. Keystore identity, signed sync,
  monitoring, WorkManager.

## Trust model (summary)

- **Owner** authenticates to the API (session token, or Cloudflare Access in
  production) and may only act on devices they own.
- **Device** identity is an EC P-256 key generated in the Android Keystore. The
  server enrolls the public key during a pairing flow that proves possession of
  the private key. Thereafter every device request is signed; the device id is
  never trusted as proof of identity.
- **Replay protection**: signed requests carry a timestamp (freshness window)
  and a single-use nonce recorded server-side.

See `security.md` and `threat-model.md` for detail.

## Cloudflare architecture

The backend is Cloudflare-first. Phase 1 uses only D1; R2 and Durable Objects
are declared as bindings (placeholders) for future phases.

| Concern | Choice | Phase 1 status |
| --- | --- | --- |
| Compute | Workers (Hono) | Implemented |
| Relational store | D1 (SQLite) | Implemented, migrations applied |
| Private media | R2 bucket `pdm-media` | Binding placeholder only |
| Realtime signaling | Durable Object `SignalingRoom` | Disabled stub |
| TURN / WebRTC | Cloudflare Realtime TURN | Future, documented |
| Owner identity | Cloudflare Access (prod) + session tokens | Both wired |

### Points to confirm against current Cloudflare docs before relying on them

These are design intentions. Each must be re-verified against current official
Cloudflare documentation before the corresponding feature is built (the
scaffolding environment had no access to `dl.google.com` and limited ability to
confirm live platform behavior):

1. **Durable Objects WebSocket hibernation** — the future `SignalingRoom` plans
   to use the Hibernation API (`state.acceptWebSocket`) so idle signaling
   rooms do not bill for wall-clock time. Confirm the current API surface and
   that SQLite-backed DO classes (`new_sqlite_classes`) are eligible on the
   target plan.
2. **Realtime TURN credential generation** — short-lived TURN credentials are
   intended to be minted by the Worker per authorized camera session. Confirm
   the current API/product name and credential TTL semantics.
3. **WebRTC signaling topology** — exactly two authorized peers (one dashboard
   viewer, one device) per DO room; SDP/ICE relay only, never media.
4. **D1 transactions/migrations** — Phase 1 uses `batch()` for multi-statement
   atomicity (D1 has no interactive multi-statement transactions in the Worker
   API at time of writing). Confirm current transactional guarantees.
5. **R2 private objects + presigned/secure upload** — media uploads will use
   server-mediated or presigned flows; objects are never public.
6. **Cloudflare Access identity** — `Cf-Access-Jwt-Assertion` RS256 validation
   against the team JWKS (`/cdn-cgi/access/certs`). Implemented in
   `apps/api/src/auth/access.ts`; confirm claim names and `aud` handling.
7. **Resource limits / pricing** — D1 row/size limits, DO and Realtime pricing.
   No paid resources are provisioned by this repo.

## Android architecture

See `android-16-compatibility.md` for the Android 16 (API 36) analysis. The app
layers: Keystore identity -> signed API client -> encrypted config + Room queue
-> WorkManager sync -> Compose UI. Phase 1 collects only non-sensitive
telemetry and requests no camera or SMS permission.

## Data flow: enrollment

1. Owner (dashboard) creates a pairing: the API returns a single-use code and a
   server nonce; only a hash of the code is stored.
2. The device generates its Keystore key, signs `PDM-enroll-v1\n<code>\n<nonce>`,
   and posts the code, public key (SPKI), and signature to `/enroll`.
3. The API verifies the signature against the submitted key, consumes the code
   atomically, stores the device + public key, and returns a device token.

## Data flow: status sync

1. WorkManager periodically wakes `StatusSyncWorker`.
2. The worker collects battery/storage/network, enqueues the sample locally
   (Room), and drains the queue by POSTing signed `/device/status` requests.
3. The server verifies signature + freshness + nonce, stores the sample, and
   updates `last_seen_at` (which drives online/offline in the dashboard).
