import { Hono } from "hono";
import {
  reportStatusSchema,
  updateDeviceRequestSchema,
  type DeviceRequestView,
} from "@pdm/shared";
import type { Env, Vars } from "../env.js";
import { ok } from "../lib/responses.js";
import { errors } from "../lib/errors.js";
import { parse, readJson } from "../lib/validate.js";
import { uuid } from "../lib/ids.js";
import {
  writeAudit,
  type DeviceRequestRow,
  type DeviceSettingsRow,
} from "../db.js";
import { deviceAuth } from "../middleware.js";

/**
 * Device-authenticated endpoints. Every route requires a valid per-request
 * ECDSA signature (see deviceAuth middleware).
 */
export const deviceSelfRoutes = new Hono<{ Bindings: Env; Variables: Vars }>();
deviceSelfRoutes.use("/device/*", deviceAuth);

/** Device fetches its current owner-controlled settings. */
deviceSelfRoutes.get("/device/settings", async (c) => {
  const deviceId = c.get("deviceId")!;
  const s = await c.env.DB.prepare(
    "SELECT * FROM device_settings WHERE device_id = ?",
  )
    .bind(deviceId)
    .first<DeviceSettingsRow>();
  if (!s) throw errors.notFound("Settings not found");
  return ok(c, {
    statusIntervalSeconds: s.status_interval_seconds,
    cameraFeatureEnabled: s.camera_feature_enabled === 1,
    smsFeatureEnabled: s.sms_feature_enabled === 1,
    diagnosticsEnabled: s.diagnostics_enabled === 1,
  });
});

/** Device reports a non-sensitive status sample. */
deviceSelfRoutes.post("/device/status", async (c) => {
  const deviceId = c.get("deviceId")!;
  const body = parse(reportStatusSchema, await readJson(c.req.raw));
  const now = Date.now();

  // Idempotent on (device, sequence): ignore duplicates/out-of-order replays.
  try {
    await c.env.DB.prepare(
      `INSERT INTO device_status
         (id, device_id, captured_at, reported_at, sequence, battery_level,
          battery_charging, battery_temp_decic, storage_total_bytes,
          storage_free_bytes, network_type, network_metered, app_version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        uuid(),
        deviceId,
        Date.parse(body.capturedAt),
        now,
        body.sequence,
        body.battery.level,
        body.battery.charging ? 1 : 0,
        body.battery.temperatureDeciC ?? null,
        body.storage.totalBytes,
        body.storage.freeBytes,
        body.network.type,
        body.network.metered == null ? null : body.network.metered ? 1 : 0,
        body.appVersion,
      )
      .run();
  } catch {
    // Duplicate sequence -> accepted as a no-op (still refresh last_seen below).
  }

  await c.env.DB.prepare("UPDATE devices SET last_seen_at = ? WHERE id = ?")
    .bind(now, deviceId)
    .run();

  await writeAudit(c.env.DB, {
    id: uuid(),
    action: "device.status_reported",
    actorType: "device",
    actorId: deviceId,
    deviceId,
    requestId: c.get("requestId"),
    metadata: { sequence: body.sequence },
    createdAt: now,
  });

  return ok(c, { accepted: true, serverTime: new Date(now).toISOString() });
});

/** Device polls for pending requests addressed to it. */
deviceSelfRoutes.get("/device/requests", async (c) => {
  const deviceId = c.get("deviceId")!;
  const now = Date.now();
  // Expire stale pending requests lazily.
  await c.env.DB.prepare(
    "UPDATE device_requests SET status = 'expired', updated_at = ? WHERE device_id = ? AND status = 'pending' AND expires_at < ?",
  )
    .bind(now, deviceId, now)
    .run();

  const rows = await c.env.DB.prepare(
    "SELECT * FROM device_requests WHERE device_id = ? AND status IN ('pending','acknowledged') ORDER BY created_at ASC LIMIT 50",
  )
    .bind(deviceId)
    .all<DeviceRequestRow>();

  const requests: DeviceRequestView[] = rows.results.map((r) => ({
    id: r.id,
    deviceId: r.device_id,
    type: r.type,
    status: r.status,
    payload: r.payload_json ? JSON.parse(r.payload_json) : null,
    resultSummary: r.result_summary,
    createdAt: new Date(r.created_at).toISOString(),
    updatedAt: new Date(r.updated_at).toISOString(),
    expiresAt: new Date(r.expires_at).toISOString(),
  }));
  return ok(c, { requests });
});

/** Device updates a request's status (acknowledge / complete / fail). */
deviceSelfRoutes.post("/device/requests/:id", async (c) => {
  const deviceId = c.get("deviceId")!;
  const requestId = c.req.param("id");
  const body = parse(updateDeviceRequestSchema, await readJson(c.req.raw));

  const existing = await c.env.DB.prepare(
    "SELECT * FROM device_requests WHERE id = ? AND device_id = ?",
  )
    .bind(requestId, deviceId)
    .first<DeviceRequestRow>();
  if (!existing) throw errors.notFound("Request not found");

  const now = Date.now();
  await c.env.DB.prepare(
    "UPDATE device_requests SET status = ?, result_summary = ?, updated_at = ? WHERE id = ?",
  )
    .bind(body.status, body.resultSummary ?? existing.result_summary, now, requestId)
    .run();

  await writeAudit(c.env.DB, {
    id: uuid(),
    action: "device.request_updated",
    actorType: "device",
    actorId: deviceId,
    deviceId,
    requestId: c.get("requestId"),
    metadata: { requestId, status: body.status },
    createdAt: now,
  });

  return ok(c, { id: requestId, status: body.status });
});
