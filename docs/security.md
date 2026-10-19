# PDM Security Design

## Identities and credentials

### Owner

- Password stored as PBKDF2-HMAC-SHA256 (210k iterations, 16-byte random salt,
  256-bit output), never in plaintext. See `apps/api/src/lib/crypto.ts`.
- Sessions are compact HMAC-SHA256 tokens `base64url(payload).base64url(sig)`
  with `sub`, `iat`, `exp`. Signed with `OWNER_SESSION_SECRET` (a Wrangler
  secret). Verified in constant time.
- Production front door: Cloudflare Access. When `CF_ACCESS_TEAM_DOMAIN` and
  `CF_ACCESS_AUD` are set, the API validates the `Cf-Access-Jwt-Assertion`
  (RS256, team JWKS, `aud`, `exp`) and maps the identity to an owner by email.

### Device

- EC P-256 key generated in the Android Keystore; private key is
  non-exportable and used only for signing via the Keystore.
- The server stores the public key (SPKI) and its SHA-256 fingerprint. Identity
  is the verified key, never the client-reported device id or install id.

## Pairing and enrollment

- Pairing codes are single-use and short-lived (10 minutes). Only a SHA-256
  hash of the code is stored; the plaintext is shown once to the owner.
- Enrollment requires a signature over `PDM-enroll-v1\n<code>\n<nonce>` that
  verifies against the submitted public key — proving possession of the private
  key. The code is consumed atomically (status flips `issued` -> `consumed` in
  the same batch that inserts the device), so it cannot be reused.
- A public key already enrolled cannot be re-enrolled.

## Request signing (device -> API)

Canonical string (see `packages/shared/src/signing.ts`,
`apps/android/.../RequestSigner.kt`):

```
PDM-v1
<METHOD>
<path incl. /api/v1, no query>
<deviceId>
<unix-millis>
<nonce>
<sha256-hex of raw body>
```

- Algorithm: ECDSA P-256 / SHA-256. Android/JCA emits ASN.1 DER; the server
  converts DER -> IEEE P1363 (`derEcdsaToP1363`) before `crypto.subtle.verify`,
  which only accepts P1363. This interop is covered by a round-trip test.
- **Freshness**: the timestamp must be within +/- 5 minutes of server time.
- **Replay protection**: `(device_id, nonce)` is inserted into `request_nonces`
  with a unique primary key; a duplicate insert is surfaced as
  `replay_detected`. Nonces are retained 10 minutes (longer than the freshness
  window), so a replay either collides with a stored nonce or fails freshness.
- **Body binding**: the body hash is part of the signed string, so a tampered
  body fails verification.

## Transport

- TLS only. The Android app sets a network security config disabling cleartext.
  Certificate validation is never weakened anywhere.

## Authorization

- Every owner endpoint enforces ownership: a device is loaded only if its
  `owner_id` matches the session owner, else `404` (no existence disclosure).
- Device endpoints act only on the authenticated device's own rows.

## Feature gating

- Camera/SMS request types exist in the schema but are rejected with
  `feature_disabled` in Phase 1. Enabling the camera/SMS consent flags records
  consent only and never starts capture/collection.

## Logging and secrets

- No secrets, private keys, device tokens, or raw sensitive content are logged.
  The global error handler logs only an error name + request id.
- `.gitignore` excludes `.dev.vars`, `*.key`, `*.pem`, keystores, and
  `local.properties`. Secrets are set via `wrangler secret put`.

## Audit trail

- Security-relevant actions (login success/failure, pairing, enrollment,
  settings change, revoke, auth rejections, replay) are written to `audit_logs`
  with actor, device, request id, and metadata. The trail survives device
  deletion (`ON DELETE SET NULL`).

## Known security limitations (Phase 1)

- Single shared `OWNER_SESSION_SECRET`; no token revocation list (logout is
  client-side). Rotate the secret to invalidate all sessions.
- No server-side rate limiting yet on `/auth/login` and `/enroll` (brute-force
  mitigation is TODO; see roadmap). Cloudflare WAF/rate-limiting rules are the
  intended production control.
- Device token (returned at enrollment) is stored encrypted on-device but is not
  yet used as a second factor; per-request signing is the primary auth.
