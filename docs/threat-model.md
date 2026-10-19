# PDM Threat Model

Scope: Phase 1 (enrollment, device auth, monitoring, dashboard, API). Method:
lightweight STRIDE over the three trust boundaries (owner<->API,
device<->API, operator<->infrastructure).

## Assets

- Owner credentials and sessions.
- Device identity keys (on-device, Keystore) and enrolled public keys.
- Device telemetry (battery/storage/network) and audit logs.
- Pairing codes (single-use secrets).
- Future: media and SMS data (explicitly out of Phase 1).

## Trust boundaries and key threats

### Owner <-> API

- **Spoofing**: stolen session token. Mitigation: short-lived HMAC tokens;
  Cloudflare Access in production; rotate `OWNER_SESSION_SECRET` to revoke all.
  Residual: no per-token revocation list (roadmap).
- **Elevation / IDOR**: owner A accessing owner B's device. Mitigation:
  ownership check on every endpoint; tested. 404 on non-owned resources.
- **Brute force** on login. Mitigation (intended): Cloudflare rate limiting/WAF;
  app-level throttling is a roadmap TODO. Failed logins are audited.

### Device <-> API

- **Spoofing a device**: forging another device's requests. Mitigation:
  per-request ECDSA signature over a canonical string; the device id alone is
  never trusted. Private key is non-exportable (Keystore).
- **Replay**: capturing and resending a signed request. Mitigation: single-use
  nonce (`request_nonces` PK) + 5-minute timestamp freshness; tested.
- **Tampering** with the body. Mitigation: body SHA-256 is in the signed
  string; tested (tampered body -> `signature_invalid`).
- **Pairing abuse**: reusing/guessing codes. Mitigation: single-use, 10-minute,
  hashed codes from a 32-symbol alphabet x10 chars; enrollment requires a valid
  challenge signature; tested.
- **Rogue enrollment**: enrolling an attacker device. Mitigation: pairing codes
  are owner-generated and shown once; possession of the code + a valid signature
  are both required. Residual: anyone with the code during its short window can
  enroll — keep codes private.

### Operator <-> Infrastructure

- **Secret leakage**: Mitigation: secrets via Wrangler secrets; `.gitignore`
  blocks `.dev.vars`/keys; CI secret scanning; no secrets in logs.
- **Supply chain**: pinned dependencies and a committed `pnpm-lock.yaml`. Build
  scripts are allow-listed (`onlyBuiltDependencies`).
- **Data at rest**: D1 managed by Cloudflare; on-device config encrypted with a
  Keystore AES key; backups exclude the DB/config.

## Explicitly designed-against abuse (all phases)

- **Covert camera/mic**: no hidden or background camera activation. Capture only
  via a visible foreground service started by on-device user authorization; OS
  privacy indicators never suppressed.
- **Silent SMS exfiltration / OTP interception**: not implemented; SMS is
  future, opt-in, permission-based, and visible.
- **Detection evasion**: the app does not hide itself or its activity.

## Out of scope (Phase 1)

A fully compromised/rooted device (the Keystore key could be abused by a local
attacker with the private key's signing capability but cannot be exported);
physical coercion; nation-state adversaries; denial of service against
Cloudflare.
