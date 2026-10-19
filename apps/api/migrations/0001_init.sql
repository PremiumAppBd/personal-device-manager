-- PDM initial schema (D1 / SQLite).
-- Conventions:
--   * Primary keys are application-generated UUID v4 TEXT.
--   * Timestamps are INTEGER Unix epoch milliseconds (UTC).
--   * Booleans are INTEGER 0/1 with CHECK constraints.
--   * Status columns use CHECK constraints to pin the allowed vocabulary.
--   * Foreign keys use ON DELETE CASCADE for owned rows; audit_logs is retained.
-- D1 enforces foreign keys by default.

-- ---------------------------------------------------------------------------
-- owners: platform operators (device owners).
-- ---------------------------------------------------------------------------
CREATE TABLE owners (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);
CREATE UNIQUE INDEX idx_owners_email ON owners (email);

-- ---------------------------------------------------------------------------
-- devices: enrolled Android devices. Identity == verified public key, never
-- the client-reported id / install_id.
-- ---------------------------------------------------------------------------
CREATE TABLE devices (
  id                      TEXT PRIMARY KEY,
  owner_id                TEXT NOT NULL REFERENCES owners (id) ON DELETE CASCADE,
  label                   TEXT,
  public_key_spki         TEXT NOT NULL,
  public_key_fingerprint  TEXT NOT NULL,
  install_id              TEXT NOT NULL,
  model                   TEXT NOT NULL,
  manufacturer            TEXT NOT NULL,
  os_version              TEXT NOT NULL,
  sdk_int                 INTEGER NOT NULL,
  status                  TEXT NOT NULL DEFAULT 'active'
                            CHECK (status IN ('pending', 'active', 'revoked')),
  token_hash              TEXT,
  enrolled_at             INTEGER NOT NULL,
  revoked_at              INTEGER,
  last_seen_at            INTEGER
);
CREATE UNIQUE INDEX idx_devices_fingerprint ON devices (public_key_fingerprint);
CREATE INDEX idx_devices_owner ON devices (owner_id);
CREATE INDEX idx_devices_status ON devices (status);

-- ---------------------------------------------------------------------------
-- device_settings: owner-controlled config synced to the device. Sensitive
-- features (camera/SMS) default OFF and require explicit owner opt-in.
-- ---------------------------------------------------------------------------
CREATE TABLE device_settings (
  device_id                TEXT PRIMARY KEY REFERENCES devices (id) ON DELETE CASCADE,
  status_interval_seconds  INTEGER NOT NULL DEFAULT 900
                             CHECK (status_interval_seconds BETWEEN 60 AND 86400),
  camera_feature_enabled   INTEGER NOT NULL DEFAULT 0 CHECK (camera_feature_enabled IN (0, 1)),
  sms_feature_enabled      INTEGER NOT NULL DEFAULT 0 CHECK (sms_feature_enabled IN (0, 1)),
  diagnostics_enabled      INTEGER NOT NULL DEFAULT 1 CHECK (diagnostics_enabled IN (0, 1)),
  updated_at               INTEGER NOT NULL
);

-- ---------------------------------------------------------------------------
-- device_status: non-sensitive telemetry samples (battery/storage/network).
-- ---------------------------------------------------------------------------
CREATE TABLE device_status (
  id                   TEXT PRIMARY KEY,
  device_id            TEXT NOT NULL REFERENCES devices (id) ON DELETE CASCADE,
  captured_at          INTEGER NOT NULL,
  reported_at          INTEGER NOT NULL,
  sequence             INTEGER NOT NULL,
  battery_level        INTEGER NOT NULL CHECK (battery_level BETWEEN 0 AND 100),
  battery_charging     INTEGER NOT NULL CHECK (battery_charging IN (0, 1)),
  battery_temp_decic   INTEGER,
  storage_total_bytes  INTEGER NOT NULL CHECK (storage_total_bytes >= 0),
  storage_free_bytes   INTEGER NOT NULL CHECK (storage_free_bytes >= 0),
  network_type         TEXT NOT NULL
                         CHECK (network_type IN ('wifi', 'cellular', 'ethernet', 'none', 'unknown')),
  network_metered      INTEGER CHECK (network_metered IN (0, 1)),
  app_version          TEXT NOT NULL
);
CREATE INDEX idx_device_status_recent ON device_status (device_id, reported_at DESC);
CREATE UNIQUE INDEX idx_device_status_seq ON device_status (device_id, sequence);

-- ---------------------------------------------------------------------------
-- pairing_challenges: single-use, short-lived enrollment codes. The plaintext
-- code is never stored; only its hash. The device signs `nonce` to prove key
-- possession at enrollment.
-- ---------------------------------------------------------------------------
CREATE TABLE pairing_challenges (
  id           TEXT PRIMARY KEY,
  owner_id     TEXT NOT NULL REFERENCES owners (id) ON DELETE CASCADE,
  code_hash    TEXT NOT NULL,
  nonce        TEXT NOT NULL,
  label        TEXT,
  status       TEXT NOT NULL DEFAULT 'issued'
                 CHECK (status IN ('issued', 'consumed', 'expired')),
  device_id    TEXT REFERENCES devices (id) ON DELETE SET NULL,
  created_at   INTEGER NOT NULL,
  expires_at   INTEGER NOT NULL,
  consumed_at  INTEGER
);
CREATE UNIQUE INDEX idx_pairing_code_hash ON pairing_challenges (code_hash);
CREATE INDEX idx_pairing_owner ON pairing_challenges (owner_id);
CREATE INDEX idx_pairing_status_exp ON pairing_challenges (status, expires_at);

-- ---------------------------------------------------------------------------
-- device_requests: owner -> device command queue. Phase 1 executes only
-- non-sensitive types; camera/SMS types are reserved and gated.
-- ---------------------------------------------------------------------------
CREATE TABLE device_requests (
  id              TEXT PRIMARY KEY,
  device_id       TEXT NOT NULL REFERENCES devices (id) ON DELETE CASCADE,
  owner_id        TEXT NOT NULL REFERENCES owners (id) ON DELETE CASCADE,
  type            TEXT NOT NULL
                    CHECK (type IN ('ping', 'refresh_status', 'sync_settings',
                                    'camera_session_request', 'sms_summary_request')),
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'acknowledged', 'completed',
                                      'failed', 'expired', 'cancelled')),
  payload_json    TEXT,
  result_summary  TEXT,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  expires_at      INTEGER NOT NULL
);
CREATE INDEX idx_requests_device_status ON device_requests (device_id, status);
CREATE INDEX idx_requests_status_exp ON device_requests (status, expires_at);

-- ---------------------------------------------------------------------------
-- camera_sessions: FUTURE PHASE. Schema only. No state advances to capture
-- without an on-device, user-visible authorization step.
-- ---------------------------------------------------------------------------
CREATE TABLE camera_sessions (
  id                  TEXT PRIMARY KEY,
  device_id           TEXT NOT NULL REFERENCES devices (id) ON DELETE CASCADE,
  owner_id            TEXT NOT NULL REFERENCES owners (id) ON DELETE CASCADE,
  status              TEXT NOT NULL DEFAULT 'requested'
                        CHECK (status IN ('requested', 'authorized', 'active',
                                          'ended', 'denied', 'expired')),
  authorization_note  TEXT,
  created_at          INTEGER NOT NULL,
  authorized_at       INTEGER,
  ended_at            INTEGER
);
CREATE INDEX idx_camera_device_status ON camera_sessions (device_id, status);

-- ---------------------------------------------------------------------------
-- media_assets: FUTURE PHASE. Metadata for private R2 objects. Schema only.
-- ---------------------------------------------------------------------------
CREATE TABLE media_assets (
  id                 TEXT PRIMARY KEY,
  device_id          TEXT NOT NULL REFERENCES devices (id) ON DELETE CASCADE,
  camera_session_id  TEXT REFERENCES camera_sessions (id) ON DELETE SET NULL,
  r2_key             TEXT,
  status             TEXT NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending', 'uploaded', 'available', 'deleted')),
  content_type       TEXT NOT NULL,
  size_bytes         INTEGER CHECK (size_bytes IS NULL OR size_bytes >= 0),
  sha256             TEXT,
  created_at         INTEGER NOT NULL
);
CREATE INDEX idx_media_device ON media_assets (device_id);

-- ---------------------------------------------------------------------------
-- request_nonces: replay protection for signed device requests. A (device,
-- nonce) pair may be used at most once within the retention window.
-- ---------------------------------------------------------------------------
CREATE TABLE request_nonces (
  device_id   TEXT NOT NULL REFERENCES devices (id) ON DELETE CASCADE,
  nonce       TEXT NOT NULL,
  seen_at     INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL,
  PRIMARY KEY (device_id, nonce)
);
CREATE INDEX idx_nonces_expiry ON request_nonces (expires_at);

-- ---------------------------------------------------------------------------
-- audit_logs: append-only record of security-relevant actions. device_id uses
-- ON DELETE SET NULL so the trail survives device deletion.
-- ---------------------------------------------------------------------------
CREATE TABLE audit_logs (
  id            TEXT PRIMARY KEY,
  action        TEXT NOT NULL,
  actor_type    TEXT NOT NULL CHECK (actor_type IN ('owner', 'device', 'system')),
  actor_id      TEXT,
  device_id     TEXT REFERENCES devices (id) ON DELETE SET NULL,
  request_id    TEXT,
  metadata_json TEXT,
  created_at    INTEGER NOT NULL
);
CREATE INDEX idx_audit_created ON audit_logs (created_at DESC);
CREATE INDEX idx_audit_device ON audit_logs (device_id);
CREATE INDEX idx_audit_action ON audit_logs (action);
