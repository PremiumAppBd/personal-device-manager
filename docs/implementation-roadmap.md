# PDM Implementation Roadmap

## Phase 1 acceptance criteria — status

Verified in the scaffolding environment (Node 22, pnpm 10, Wrangler/Workers
runtime). The Android SDK and Google Maven were unavailable, so Android compile
and instrumentation are documented as not-run.

| # | Criterion | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Monorepo installs cleanly | PASS | `pnpm install` (workspaces resolve) |
| 2 | TypeScript builds without errors | PASS | `tsc --noEmit` for shared, api, dashboard |
| 3 | Android Gradle configuration valid | PARTIAL | DSL parses + plugin resolution reached; full build needs SDK + Google Maven (unavailable) |
| 4 | API health endpoint works locally | PASS | Workers integration test `GET /health` |
| 5 | D1 initial migrations apply locally | PASS | `wrangler d1 migrations apply --local` (28 statements) and pool-workers auto-apply |
| 6 | Auth middleware rejects unauthorized | PASS | tests: 401 on `/devices`, bad bearer |
| 7 | Device ownership restrictions tested | PASS | owner A vs B isolation test (404) |
| 8 | Enrollment challenge expiry + reuse tested | PASS | expired-code and single-use tests |
| 9 | Device signature verification tested | PASS | enroll sig + per-request sig + tamper tests; shared DER↔P1363 interop test |
| 10 | Device monitoring data validated | PASS | status accept + invalid-shape (422) tests |
| 11 | Dashboard builds | PASS | `vite build` (110 modules) |
| 12 | Mock mode isolated from production | PASS | source-selection unit test; no live->mock path |
| 13 | No secrets committed | PASS | only `.dev.vars.example`; `.gitignore` + CI secret scan |
| 14 | Unit + integration tests pass | PASS | 7 shared + 23 API + 5 dashboard unit + 3 e2e |
| 15 | Hardware-dependent tests documented | PASS | this table + below |

### Not run in this environment (require external dependencies)

- **Android compile / unit tests / instrumentation** — need Android SDK (API 36)
  and access to `dl.google.com`. To run: install the SDK, set `local.properties`
  `sdk.dir`, align `libs.versions.toml` AGP to the SDK, then
  `./gradlew :app:assembleDebug test`.
- **`wrangler deploy` / remote D1** — needs a Cloudflare account + credentials.
  No remote resources were provisioned (by rule).
- **Cloudflare Access end-to-end** — needs a configured Access application.

## Scope decision: overt own-device camera yes; stealth and SMS no

The owner's use case is running a spare phone **they own** as a private
camera/CCTV that they view from their own dashboard. That is an overt,
owner-operated use (like Alfred Camera / IP Webcam), so an **overt** camera
mode is implemented:

- Capture runs in a VISIBLE foreground service typed `camera`, with an ongoing
  notification and the system camera indicator; it starts only when the owner
  turns it on, and uploads only while an owner session is active.
- It is gated behind the device's `cameraFeatureEnabled` consent flag.
- Remote viewing is snapshot-based (near-live frame refresh). Full WebRTC live
  video is a separate future effort that needs a real device to build/verify.

What is still **intentionally not built**, and should not be:

- Hidden / stealth / disguised operation, icon hiding, or background capture
  without the notification + indicator. (This is the line between a camera app
  and stalkerware.)
- SMS reading / collection / summaries. The `smsFeatureEnabled` flag is a
  reserved placeholder only.

## Future-phase placeholders (interfaces only; not to be built as remote capture)

### Phase 2 — Camera (consent-gated, visible)
- CameraX front/rear capture inside a typed `camera` foreground service.
- On-device user authorization screen that must complete before any capture;
  dashboard only creates a `camera_sessions` row (`requested`).
- `camera_sessions` state machine; snapshots during active sessions.
- Hard rule: no hidden/background activation; privacy indicators never hidden.

### Phase 3 — Live viewing (WebRTC)
- `SignalingRoom` Durable Object (WebSocket hibernation) relays SDP/ICE for
  exactly two authorized peers; never relays media.
- Cloudflare Realtime TURN short-lived credentials minted per session.

### Phase 4 — Media storage
- Encrypted local media prep; private R2 uploads (server-mediated/presigned);
  `media_assets` lifecycle; retention policy.

### Phase 5 — SMS (opt-in, permission-based)
- Visible, permission-gated SMS summaries only. No continuous hidden collection
  and no OTP interception — ever.

## Hardening backlog (pre-production)
- Rate limiting on `/auth/login` and `/enroll` (Cloudflare rules + app-level).
- Session revocation list; device token as optional second factor.
- Structured request/response logging with PII redaction review.
- E2E test of the real Android client against a deployed Worker.
