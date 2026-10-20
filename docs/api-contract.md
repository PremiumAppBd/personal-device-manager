# PDM API Contract (v1)

Base path: `/api/v1`. All responses use a consistent envelope.

## Response envelope

Success:
```json
{ "ok": true, "data": { ... }, "requestId": "uuid" }
```
Error:
```json
{ "ok": false, "error": { "code": "unauthorized", "message": "...", "details": [] }, "requestId": "uuid" }
```

Error codes and HTTP status (see `packages/shared/src/types.ts`):

| code | status |
| --- | --- |
| bad_request | 400 |
| validation_error | 422 |
| unauthorized | 401 |
| forbidden | 403 |
| not_found | 404 |
| conflict | 409 |
| rate_limited | 429 |
| replay_detected | 409 |
| signature_invalid | 401 |
| pairing_invalid | 400 |
| feature_disabled | 403 |
| internal_error | 500 |

Every response carries `x-request-id` and conservative security headers.

## Authentication

- **Owner**: `Authorization: Bearer <session-token>` (or Cloudflare Access JWT
  in production).
- **Device**: signature headers on every device request —
  `x-pdm-device-id`, `x-pdm-timestamp`, `x-pdm-nonce`, `x-pdm-signature`
  (see `security.md` for the canonical signing string).

## Endpoints

### Public / health
- `GET /health` — service + DB liveness.

### Owner auth
- `POST /auth/login` — `{ email, password }` -> `{ token, expiresInSeconds, owner }`.
- `GET /auth/me` — current owner profile. *(owner)*

### Pairing & enrollment
- `POST /pairings` *(owner)* — `{ label? }` -> `{ pairingCode, challengeNonce, expiresAt, label }` (201).
- `POST /enroll` *(device proof)* — `{ pairingCode, publicKeySpki, challengeSignature, device }` -> `{ deviceId, status, deviceToken, settings }` (201).

### Devices *(owner, ownership-checked)*
- `GET /devices` -> `{ devices: DeviceView[], offlineAfterMs }`.
- `GET /devices/:id` -> `DeviceView`.
- `PATCH /devices/:id` — `{ label }` -> `DeviceView`.
- `POST /devices/:id/revoke` -> `{ id, status, revokedAt }`.
- `GET /devices/:id/settings` -> settings.
- `PUT /devices/:id/settings` — partial settings -> settings.
- `GET /devices/:id/status` -> `{ latest, history[] }`.
- `POST /devices/:id/requests` — `{ type, payload? }` -> `DeviceRequestView` (201). Camera/SMS types -> `feature_disabled`.
- `GET /devices/:id/requests` -> `{ requests[] }`.

### Camera — own-device camera mode
Owner *(ownership-checked; requires `cameraFeatureEnabled`)*:
- `POST /devices/:id/camera/start` -> `{ sessionId, status }` (201). Off-consent -> `feature_disabled`.
- `POST /devices/:id/camera/stop` -> `{ stopped: true }`.
- `GET /devices/:id/camera` -> `CameraStateView` (session, `lenses`, `snapshots.back/front`).
- `GET /camera/snapshots/:assetId` -> raw `image/jpeg` bytes (owner-auth).

Device *(device-signed)*:
- `GET /device/camera/active` -> `{ active, sessionId, intervalSeconds, lenses }`.
- `POST /device/camera/snapshot?lens=back|front` — raw JPEG body -> `{ assetId, lens, sizeBytes }` (201).

Settings include `cameraLens` (`back|front|both`), which drives the lenses the
device captures.

### Device self-service *(device-signed)*
- `GET /device/settings` -> settings.
- `POST /device/status` — status sample -> `{ accepted, serverTime }`.
- `GET /device/requests` -> `{ requests[] }` (pending/acknowledged).
- `POST /device/requests/:id` — `{ status, resultSummary? }` -> `{ id, status }`.

### Audit *(owner)*
- `GET /audit?limit=&cursor=` -> `{ items[], nextCursor }` (keyset by `created_at`).

## Validation

All request bodies are validated with Zod (`packages/shared/src/schemas.ts`).
Validation failures return `422 validation_error` with field-level `details`.
