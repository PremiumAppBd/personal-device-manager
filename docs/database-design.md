# PDM Database Design (D1 / SQLite)

Migration: `apps/api/migrations/0001_init.sql`. Conventions: UUID TEXT primary
keys, INTEGER epoch-millis timestamps (UTC), INTEGER 0/1 booleans with CHECK
constraints, status columns pinned by CHECK, foreign keys with ON DELETE
CASCADE for owned rows. D1 enforces foreign keys by default.

## Tables

| table | purpose | key relations |
| --- | --- | --- |
| `owners` | operators | unique `email` |
| `devices` | enrolled devices | `owner_id` -> owners; unique `public_key_fingerprint` |
| `device_settings` | per-device config/consent | PK `device_id` -> devices |
| `device_status` | telemetry samples | `device_id` -> devices; unique `(device_id, sequence)` |
| `pairing_challenges` | single-use pairing codes | `owner_id` -> owners; `device_id` -> devices (SET NULL); unique `code_hash` |
| `device_requests` | owner->device command queue | `device_id`, `owner_id` |
| `camera_sessions` | FUTURE: camera session lifecycle | `device_id`, `owner_id` |
| `media_assets` | FUTURE: R2 object metadata | `device_id`, `camera_session_id` |
| `request_nonces` | replay protection | PK `(device_id, nonce)` |
| `audit_logs` | security event trail | `device_id` -> devices (SET NULL) |

## Notable constraints and indexes

- `devices.status IN ('pending','active','revoked')`; indexes on `owner_id`,
  `status`, and a unique index on `public_key_fingerprint` (identity).
- `device_status`: `battery_level` 0..100, non-negative storage, `network_type`
  enumerated; unique `(device_id, sequence)` makes status reporting idempotent
  and drops replays; index `(device_id, reported_at DESC)` for recent-first.
- `pairing_challenges`: unique `code_hash` (plaintext never stored); index on
  `(status, expires_at)` for expiry sweeps.
- `device_requests`: `type` and `status` CHECK-pinned; indexes on
  `(device_id, status)` and `(status, expires_at)`.
- `request_nonces`: composite PK guarantees single use; `expires_at` index for
  cleanup.
- `audit_logs`: `device_id` uses ON DELETE SET NULL so the trail is retained;
  indexes on `created_at DESC`, `device_id`, `action`.

## Transactions

Multi-statement atomicity uses D1 `batch()` (e.g. enrollment inserts the device
and settings, then consumes the pairing, in one batch — ordered so the device
row exists before the pairing FK references it). Lazy expiry updates (pending
requests, pairing codes) run as single statements.

## Migration conventions

Additive, numbered files (`0001_`, `0002_`, ...). Never edit an applied
migration; add a new one. Apply locally with
`pnpm --filter @pdm/api run db:migrate:local` and to remote (after approval)
with `db:migrate:remote`.
