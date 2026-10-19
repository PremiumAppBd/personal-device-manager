# PDM Requirements

## Purpose and consent model

PDM lets an operator manage Android devices they own through a private web
dashboard. It is explicitly consent-based device management. The device user is
the owner or has given informed consent. Covert surveillance is out of scope and
is actively designed against: sensitive capabilities require visible, on-device
authorization and the OS privacy indicators are never suppressed.

## Actors

- **Owner** — authenticates to the dashboard/API; manages their own devices.
- **Device** — an enrolled Android device with a Keystore identity key.
- **System** — background jobs and the audit subsystem.

## Functional requirements (Phase 1)

1. Owner authentication (session token; Cloudflare Access supported in prod).
2. Secure pairing: single-use, short-lived codes; enrollment proves possession
   of the device private key.
3. Device enrollment storing the verified public key as identity.
4. Per-request device authentication with replay protection.
5. Non-sensitive monitoring: battery, storage, network; periodic sync.
6. Device management: list, detail, rename, revoke.
7. Owner-controlled settings (incl. consent flags) synced to the device.
8. Command queue for non-sensitive request types (ping, refresh, sync).
9. Audit logging of security-relevant actions, viewable by the owner.
10. Dashboard with protected routes and an explicitly isolated demo mode.

## Non-functional requirements

- TLS everywhere; no cleartext. No weakening of certificate validation.
- No secrets, private keys, or raw sensitive messages in logs or source.
- Least-privilege Android permissions; nothing beyond what a feature needs.
- Ownership isolation enforced on every owner endpoint.
- Deterministic, testable security logic with automated tests.

## Explicit non-goals / hard rules for Phase 1

- No remote camera capture, live video, or snapshots.
- No SMS reading, collection, or OTP interception.
- No hidden/background camera activation, ever (all phases).
- No bypass of Android permission dialogs or privacy indicators.
- No provisioning of paid infrastructure and no production deploy without
  explicit owner approval.

## Future phases (designed for, not built)

CameraX capture behind a visible foreground session and on-device authorization;
WebRTC signaling via Durable Objects; Cloudflare Realtime TURN; authorized live
viewing and snapshots; encrypted media prep and private R2 uploads; retention;
permission-based SMS management. See `implementation-roadmap.md`.

## Acceptance criteria (Phase 1)

Tracked in `implementation-roadmap.md` with current pass/fail status and exactly
what could not be verified in the scaffolding environment.
