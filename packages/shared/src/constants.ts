/**
 * Shared constants for the Personal Device Manager (PDM) platform.
 *
 * These values are the single source of truth for API versioning, status
 * vocabularies, and the signing contract shared between the backend and the
 * Android client. The Android app re-declares the signing contract in Kotlin;
 * any change here MUST be mirrored there (see apps/android .../net/RequestSigner).
 */

export const API_VERSION = "v1" as const;
export const API_BASE_PATH = `/api/${API_VERSION}` as const;

/** HTTP header names used by the device-auth and request-id machinery. */
export const HEADERS = {
  requestId: "x-request-id",
  deviceId: "x-pdm-device-id",
  timestamp: "x-pdm-timestamp",
  nonce: "x-pdm-nonce",
  signature: "x-pdm-signature",
  ownerAuth: "authorization",
} as const;

/** Lifecycle of an enrolled device. */
export const DEVICE_STATUS = ["pending", "active", "revoked"] as const;
export type DeviceStatus = (typeof DEVICE_STATUS)[number];

/** Lifecycle of a one-time pairing challenge. */
export const PAIRING_STATUS = ["issued", "consumed", "expired"] as const;
export type PairingStatus = (typeof PAIRING_STATUS)[number];

/**
 * Outbound command requests queued for a device. Phase 1 only defines the
 * envelope and non-sensitive command types; camera/SMS command types are
 * reserved for future phases and are intentionally NOT executable yet.
 */
export const DEVICE_REQUEST_STATUS = [
  "pending",
  "acknowledged",
  "completed",
  "failed",
  "expired",
  "cancelled",
] as const;
export type DeviceRequestStatus = (typeof DEVICE_REQUEST_STATUS)[number];

export const DEVICE_REQUEST_TYPE = [
  "ping",
  "refresh_status",
  "sync_settings",
  // Reserved for future, consent-gated phases. Declared so the schema and
  // audit log can represent them, but Phase 1 rejects execution of these.
  "camera_session_request",
  "sms_summary_request",
] as const;
export type DeviceRequestType = (typeof DEVICE_REQUEST_TYPE)[number];

/** Request types that Phase 1 is allowed to create/execute. */
export const PHASE1_ALLOWED_REQUEST_TYPES: readonly DeviceRequestType[] = [
  "ping",
  "refresh_status",
  "sync_settings",
];

/**
 * Camera session lifecycle (FUTURE PHASE — schema + interface only).
 * A session never advances past "authorized" without an on-device,
 * user-visible authorization step. No state here starts capture on its own.
 */
export const CAMERA_SESSION_STATUS = [
  "requested",
  "authorized",
  "active",
  "ended",
  "denied",
  "expired",
] as const;
export type CameraSessionStatus = (typeof CAMERA_SESSION_STATUS)[number];

/** Media asset lifecycle (FUTURE PHASE — schema + interface only). */
export const MEDIA_ASSET_STATUS = [
  "pending",
  "uploaded",
  "available",
  "deleted",
] as const;
export type MediaAssetStatus = (typeof MEDIA_ASSET_STATUS)[number];

/** Audit log action vocabulary. Extend additively; never remove values. */
export const AUDIT_ACTION = [
  "owner.login",
  "owner.login_failed",
  "pairing.created",
  "pairing.consumed",
  "pairing.failed",
  "device.enrolled",
  "device.status_reported",
  "device.settings_updated",
  "device.revoked",
  "device.request_created",
  "device.request_updated",
  "camera.session_started",
  "camera.session_ended",
  "camera.snapshot_received",
  "auth.device_rejected",
  "auth.owner_rejected",
  "auth.replay_detected",
] as const;
export type AuditAction = (typeof AUDIT_ACTION)[number];

/**
 * Device request signing contract (ECDSA P-256 / SHA-256).
 *
 * The device signs the canonical string produced by buildSigningString() with
 * its Android Keystore private key. The server verifies against the enrolled
 * public key. Signatures are transmitted base64url. See docs/security.md.
 */
export const SIGNING = {
  /** Named curve for device identity keys. */
  curve: "P-256",
  hash: "SHA-256",
  /** Max allowed clock skew (ms) between device timestamp and server time. */
  maxClockSkewMs: 5 * 60 * 1000,
  /** How long a consumed nonce is remembered for replay protection (ms). */
  nonceRetentionMs: 10 * 60 * 1000,
} as const;

/** A device is considered offline if no status was reported within this window. */
export const DEVICE_OFFLINE_AFTER_MS = 3 * 60 * 1000;

/**
 * Camera (own-device IP-camera / CCTV mode) parameters.
 *
 * This is overt, owner-operated camera use: capture runs in a visible
 * foreground service with an ongoing notification and the OS camera indicator;
 * it is gated behind the device's cameraFeatureEnabled consent flag. There is
 * no hidden or background capture.
 */
export const CAMERA = {
  /** Default seconds between snapshot captures (near-live refresh). */
  defaultSnapshotIntervalSeconds: 3,
  minSnapshotIntervalSeconds: 1,
  maxSnapshotIntervalSeconds: 60,
  /** Reject snapshot uploads larger than this many bytes. */
  maxSnapshotBytes: 5_000_000,
  /** An active camera session with no snapshot within this window is stale. */
  sessionStaleAfterMs: 2 * 60 * 1000,
} as const;

/** Pairing code: single-use, short-lived. */
export const PAIRING = {
  codeLength: 10,
  /** Base32 alphabet without ambiguous chars (no 0/O/1/I). */
  alphabet: "ABCDEFGHJKLMNPQRSTUVWXYZ23456789",
  ttlMs: 10 * 60 * 1000,
} as const;
