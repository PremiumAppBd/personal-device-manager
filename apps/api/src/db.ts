import type {
  AuditAction,
  AuditLogView,
  DeviceRequestStatus,
  DeviceRequestType,
  DeviceStatus,
  DeviceStatusView,
  DeviceView,
} from "@pdm/shared";
import { DEVICE_OFFLINE_AFTER_MS } from "@pdm/shared";

/** ---- Row shapes (snake_case as stored in D1) ---- */
export interface OwnerRow {
  id: string;
  email: string;
  password_hash: string;
  password_salt: string;
  created_at: number;
  updated_at: number;
}

export interface DeviceRow {
  id: string;
  owner_id: string;
  label: string | null;
  public_key_spki: string;
  public_key_fingerprint: string;
  install_id: string;
  model: string;
  manufacturer: string;
  os_version: string;
  sdk_int: number;
  status: DeviceStatus;
  token_hash: string | null;
  enrolled_at: number;
  revoked_at: number | null;
  last_seen_at: number | null;
}

export interface DeviceSettingsRow {
  device_id: string;
  status_interval_seconds: number;
  camera_feature_enabled: number;
  sms_feature_enabled: number;
  diagnostics_enabled: number;
  updated_at: number;
}

export interface DeviceStatusRow {
  id: string;
  device_id: string;
  captured_at: number;
  reported_at: number;
  sequence: number;
  battery_level: number;
  battery_charging: number;
  battery_temp_decic: number | null;
  storage_total_bytes: number;
  storage_free_bytes: number;
  network_type: string;
  network_metered: number | null;
  app_version: string;
}

export interface PairingRow {
  id: string;
  owner_id: string;
  code_hash: string;
  nonce: string;
  label: string | null;
  status: "issued" | "consumed" | "expired";
  device_id: string | null;
  created_at: number;
  expires_at: number;
  consumed_at: number | null;
}

export interface DeviceRequestRow {
  id: string;
  device_id: string;
  owner_id: string;
  type: DeviceRequestType;
  status: DeviceRequestStatus;
  payload_json: string | null;
  result_summary: string | null;
  created_at: number;
  updated_at: number;
  expires_at: number;
}

/** ---- Mappers to API view models ---- */
export function toIso(ms: number | null): string | null {
  return ms == null ? null : new Date(ms).toISOString();
}

export function statusRowToView(r: DeviceStatusRow): DeviceStatusView {
  return {
    capturedAt: new Date(r.captured_at).toISOString(),
    reportedAt: new Date(r.reported_at).toISOString(),
    battery: {
      level: r.battery_level,
      charging: r.battery_charging === 1,
      ...(r.battery_temp_decic != null
        ? { temperatureDeciC: r.battery_temp_decic }
        : {}),
    },
    storage: { totalBytes: r.storage_total_bytes, freeBytes: r.storage_free_bytes },
    network: {
      type: r.network_type,
      ...(r.network_metered != null ? { metered: r.network_metered === 1 } : {}),
    },
    appVersion: r.app_version,
    sequence: r.sequence,
  };
}

export function deviceRowToView(
  d: DeviceRow,
  settings: DeviceSettingsRow,
  latest: DeviceStatusRow | null,
  now = Date.now(),
): DeviceView {
  const online =
    d.status === "active" &&
    d.last_seen_at != null &&
    now - d.last_seen_at <= DEVICE_OFFLINE_AFTER_MS;
  return {
    id: d.id,
    label: d.label,
    status: d.status,
    model: d.model,
    manufacturer: d.manufacturer,
    osVersion: d.os_version,
    sdkInt: d.sdk_int,
    enrolledAt: new Date(d.enrolled_at).toISOString(),
    lastSeenAt: toIso(d.last_seen_at),
    online,
    settings: {
      statusIntervalSeconds: settings.status_interval_seconds,
      cameraFeatureEnabled: settings.camera_feature_enabled === 1,
      smsFeatureEnabled: settings.sms_feature_enabled === 1,
      diagnosticsEnabled: settings.diagnostics_enabled === 1,
    },
    latestStatus: latest ? statusRowToView(latest) : null,
  };
}

/** ---- Audit logging ---- */
export async function writeAudit(
  db: D1Database,
  entry: {
    id: string;
    action: AuditAction;
    actorType: "owner" | "device" | "system";
    actorId?: string | null;
    deviceId?: string | null;
    requestId?: string | null;
    metadata?: Record<string, unknown> | null;
    createdAt: number;
  },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO audit_logs (id, action, actor_type, actor_id, device_id, request_id, metadata_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      entry.id,
      entry.action,
      entry.actorType,
      entry.actorId ?? null,
      entry.deviceId ?? null,
      entry.requestId ?? null,
      entry.metadata ? JSON.stringify(entry.metadata) : null,
      entry.createdAt,
    )
    .run();
}

export function auditRowToView(r: {
  id: string;
  action: string;
  actor_type: "owner" | "device" | "system";
  actor_id: string | null;
  device_id: string | null;
  request_id: string | null;
  metadata_json: string | null;
  created_at: number;
}): AuditLogView {
  return {
    id: r.id,
    action: r.action,
    actorType: r.actor_type,
    actorId: r.actor_id,
    deviceId: r.device_id,
    requestId: r.request_id,
    metadata: r.metadata_json ? JSON.parse(r.metadata_json) : null,
    createdAt: new Date(r.created_at).toISOString(),
  };
}
