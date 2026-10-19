import { Hono } from "hono";
import {
  createDeviceRequestSchema,
  DEVICE_OFFLINE_AFTER_MS,
  PHASE1_ALLOWED_REQUEST_TYPES,
  updateDeviceSchema,
  updateDeviceSettingsSchema,
  type DeviceRequestView,
  type DeviceView,
} from "@pdm/shared";
import type { AppContext, Env, Vars } from "../env.js";
import { ok } from "../lib/responses.js";
import { errors } from "../lib/errors.js";
import { parse, readJson } from "../lib/validate.js";
import { uuid } from "../lib/ids.js";
import {
  deviceRowToView,
  statusRowToView,
  writeAudit,
  type DeviceRequestRow,
  type DeviceRow,
  type DeviceSettingsRow,
  type DeviceStatusRow,
} from "../db.js";
import { ownerAuth } from "../middleware.js";

export const deviceRoutes = new Hono<{ Bindings: Env; Variables: Vars }>();
deviceRoutes.use("/devices", ownerAuth);
deviceRoutes.use("/devices/*", ownerAuth);

/** Load a device owned by the current owner, or throw 404 (no existence leak). */
async function loadOwned(
  c: AppContext,
  deviceId: string,
): Promise<{ device: DeviceRow; settings: DeviceSettingsRow }> {
  const ownerId = c.get("ownerId") as string;
  const device = await c.env.DB.prepare(
    "SELECT * FROM devices WHERE id = ?",
  )
    .bind(deviceId)
    .first<DeviceRow>();
  if (!device || device.owner_id !== ownerId) throw errors.notFound("Device not found");
  const settings = await c.env.DB.prepare(
    "SELECT * FROM device_settings WHERE device_id = ?",
  )
    .bind(deviceId)
    .first<DeviceSettingsRow>();
  if (!settings) throw errors.internal("Device settings missing");
  return { device, settings };
}

async function latestStatus(
  db: D1Database,
  deviceId: string,
): Promise<DeviceStatusRow | null> {
  return db
    .prepare(
      "SELECT * FROM device_status WHERE device_id = ? ORDER BY reported_at DESC LIMIT 1",
    )
    .bind(deviceId)
    .first<DeviceStatusRow>();
}

/** List all devices owned by the current owner. */
deviceRoutes.get("/devices", async (c) => {
  const ownerId = c.get("ownerId")!;
  const rows = await c.env.DB.prepare(
    "SELECT * FROM devices WHERE owner_id = ? ORDER BY enrolled_at DESC",
  )
    .bind(ownerId)
    .all<DeviceRow>();

  const now = Date.now();
  const views: DeviceView[] = [];
  for (const d of rows.results) {
    const settings = await c.env.DB.prepare(
      "SELECT * FROM device_settings WHERE device_id = ?",
    )
      .bind(d.id)
      .first<DeviceSettingsRow>();
    const latest = await latestStatus(c.env.DB, d.id);
    if (settings) views.push(deviceRowToView(d, settings, latest, now));
  }
  return ok(c, { devices: views, offlineAfterMs: DEVICE_OFFLINE_AFTER_MS });
});

deviceRoutes.get("/devices/:id", async (c) => {
  const { device, settings } = await loadOwned(c, c.req.param("id"));
  const latest = await latestStatus(c.env.DB, device.id);
  return ok(c, deviceRowToView(device, settings, latest));
});

deviceRoutes.patch("/devices/:id", async (c) => {
  const { device } = await loadOwned(c, c.req.param("id"));
  const body = parse(updateDeviceSchema, await readJson(c.req.raw));
  if (body.label !== undefined) {
    await c.env.DB.prepare("UPDATE devices SET label = ? WHERE id = ?")
      .bind(body.label, device.id)
      .run();
  }
  const { device: updated, settings } = await loadOwned(c, device.id);
  const latest = await latestStatus(c.env.DB, device.id);
  return ok(c, deviceRowToView(updated, settings, latest));
});

deviceRoutes.post("/devices/:id/revoke", async (c) => {
  const { device } = await loadOwned(c, c.req.param("id"));
  const now = Date.now();
  await c.env.DB.prepare(
    "UPDATE devices SET status = 'revoked', revoked_at = ? WHERE id = ?",
  )
    .bind(now, device.id)
    .run();
  await writeAudit(c.env.DB, {
    id: uuid(),
    action: "device.revoked",
    actorType: "owner",
    actorId: c.get("ownerId"),
    deviceId: device.id,
    requestId: c.get("requestId"),
    createdAt: now,
  });
  return ok(c, { id: device.id, status: "revoked", revokedAt: new Date(now).toISOString() });
});

deviceRoutes.get("/devices/:id/settings", async (c) => {
  const { settings } = await loadOwned(c, c.req.param("id"));
  return ok(c, {
    statusIntervalSeconds: settings.status_interval_seconds,
    cameraFeatureEnabled: settings.camera_feature_enabled === 1,
    smsFeatureEnabled: settings.sms_feature_enabled === 1,
    diagnosticsEnabled: settings.diagnostics_enabled === 1,
  });
});

deviceRoutes.put("/devices/:id/settings", async (c) => {
  const { device, settings } = await loadOwned(c, c.req.param("id"));
  const body = parse(updateDeviceSettingsSchema, await readJson(c.req.raw));
  const now = Date.now();

  const next = {
    status_interval_seconds:
      body.statusIntervalSeconds ?? settings.status_interval_seconds,
    camera_feature_enabled:
      body.cameraFeatureEnabled != null
        ? body.cameraFeatureEnabled ? 1 : 0
        : settings.camera_feature_enabled,
    sms_feature_enabled:
      body.smsFeatureEnabled != null
        ? body.smsFeatureEnabled ? 1 : 0
        : settings.sms_feature_enabled,
    diagnostics_enabled:
      body.diagnosticsEnabled != null
        ? body.diagnosticsEnabled ? 1 : 0
        : settings.diagnostics_enabled,
  };

  await c.env.DB.prepare(
    `UPDATE device_settings
       SET status_interval_seconds = ?, camera_feature_enabled = ?,
           sms_feature_enabled = ?, diagnostics_enabled = ?, updated_at = ?
     WHERE device_id = ?`,
  )
    .bind(
      next.status_interval_seconds,
      next.camera_feature_enabled,
      next.sms_feature_enabled,
      next.diagnostics_enabled,
      now,
      device.id,
    )
    .run();

  await writeAudit(c.env.DB, {
    id: uuid(),
    action: "device.settings_updated",
    actorType: "owner",
    actorId: c.get("ownerId"),
    deviceId: device.id,
    requestId: c.get("requestId"),
    metadata: { changed: Object.keys(body) },
    createdAt: now,
  });

  return ok(c, {
    statusIntervalSeconds: next.status_interval_seconds,
    cameraFeatureEnabled: next.camera_feature_enabled === 1,
    smsFeatureEnabled: next.sms_feature_enabled === 1,
    diagnosticsEnabled: next.diagnostics_enabled === 1,
  });
});

deviceRoutes.get("/devices/:id/status", async (c) => {
  const { device } = await loadOwned(c, c.req.param("id"));
  const rows = await c.env.DB.prepare(
    "SELECT * FROM device_status WHERE device_id = ? ORDER BY reported_at DESC LIMIT 50",
  )
    .bind(device.id)
    .all<DeviceStatusRow>();
  const history = rows.results.map(statusRowToView);
  return ok(c, { latest: history[0] ?? null, history });
});

/** Create a device request. Camera/SMS types are reserved and rejected here. */
deviceRoutes.post("/devices/:id/requests", async (c) => {
  const { device } = await loadOwned(c, c.req.param("id"));
  const body = parse(createDeviceRequestSchema, await readJson(c.req.raw));

  if (!PHASE1_ALLOWED_REQUEST_TYPES.includes(body.type)) {
    throw errors.featureDisabled(
      `Request type "${body.type}" is reserved for a future, consent-gated phase and cannot be created yet`,
    );
  }

  const now = Date.now();
  const id = uuid();
  const expiresAt = now + 24 * 60 * 60 * 1000;
  await c.env.DB.prepare(
    `INSERT INTO device_requests
       (id, device_id, owner_id, type, status, payload_json, created_at, updated_at, expires_at)
     VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?)`,
  )
    .bind(
      id,
      device.id,
      c.get("ownerId"),
      body.type,
      body.payload ? JSON.stringify(body.payload) : null,
      now,
      now,
      expiresAt,
    )
    .run();

  await writeAudit(c.env.DB, {
    id: uuid(),
    action: "device.request_created",
    actorType: "owner",
    actorId: c.get("ownerId"),
    deviceId: device.id,
    requestId: c.get("requestId"),
    metadata: { requestId: id, type: body.type },
    createdAt: now,
  });

  const view: DeviceRequestView = {
    id,
    deviceId: device.id,
    type: body.type,
    status: "pending",
    payload: body.payload ?? null,
    resultSummary: null,
    createdAt: new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString(),
    expiresAt: new Date(expiresAt).toISOString(),
  };
  return ok(c, view, 201);
});

deviceRoutes.get("/devices/:id/requests", async (c) => {
  const { device } = await loadOwned(c, c.req.param("id"));
  const rows = await c.env.DB.prepare(
    "SELECT * FROM device_requests WHERE device_id = ? ORDER BY created_at DESC LIMIT 100",
  )
    .bind(device.id)
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
