import { Hono } from "hono";
import { CAMERA, type CameraSessionStatus, type CameraStateView } from "@pdm/shared";
import type { AppContext, Env, Vars } from "../env.js";
import { ok } from "../lib/responses.js";
import { errors } from "../lib/errors.js";
import { uuid } from "../lib/ids.js";
import {
  writeAudit,
  type DeviceRow,
  type DeviceSettingsRow,
} from "../db.js";
import { ownerAuth } from "../middleware.js";

/**
 * Owner-facing camera control for own-device IP-camera / CCTV mode.
 *
 * Overt by design: starting a session only signals intent; the device itself
 * runs a visible foreground camera service and uploads snapshots. Camera
 * endpoints require the device's cameraFeatureEnabled consent flag to be on.
 */
export const cameraRoutes = new Hono<{ Bindings: Env; Variables: Vars }>();
cameraRoutes.use("/devices/:id/camera", ownerAuth);
cameraRoutes.use("/devices/:id/camera/*", ownerAuth);
cameraRoutes.use("/camera/*", ownerAuth);

interface CameraSessionRow {
  id: string;
  device_id: string;
  owner_id: string;
  status: string;
  created_at: number;
  authorized_at: number | null;
  ended_at: number | null;
}

interface MediaAssetRow {
  id: string;
  device_id: string;
  camera_session_id: string | null;
  r2_key: string | null;
  status: string;
  content_type: string;
  size_bytes: number | null;
  lens: string | null;
  created_at: number;
}

function lensesFor(cameraLens: string | undefined): Array<"back" | "front"> {
  if (cameraLens === "both") return ["back", "front"];
  if (cameraLens === "front") return ["front"];
  return ["back"];
}

async function loadOwned(
  c: AppContext,
  deviceId: string,
): Promise<{ device: DeviceRow; settings: DeviceSettingsRow }> {
  const ownerId = c.get("ownerId")!;
  const device = await c.env.DB.prepare("SELECT * FROM devices WHERE id = ?")
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

async function activeSession(
  c: AppContext,
  deviceId: string,
): Promise<CameraSessionRow | null> {
  return c.env.DB.prepare(
    "SELECT * FROM camera_sessions WHERE device_id = ? AND status IN ('requested','authorized','active') ORDER BY created_at DESC LIMIT 1",
  )
    .bind(deviceId)
    .first<CameraSessionRow>();
}

/** Start (or reuse) a camera session for the device. */
cameraRoutes.post("/devices/:id/camera/start", async (c) => {
  const { device, settings } = await loadOwned(c, c.req.param("id"));
  if (settings.camera_feature_enabled !== 1) {
    throw errors.featureDisabled(
      "Enable the camera consent setting for this device before starting the camera",
    );
  }
  const now = Date.now();
  let session = await activeSession(c, device.id);
  if (!session) {
    const id = uuid();
    await c.env.DB.prepare(
      `INSERT INTO camera_sessions (id, device_id, owner_id, status, created_at, authorized_at)
       VALUES (?, ?, ?, 'active', ?, ?)`,
    )
      .bind(id, device.id, c.get("ownerId"), now, now)
      .run();
    session = {
      id,
      device_id: device.id,
      owner_id: c.get("ownerId")!,
      status: "active",
      created_at: now,
      authorized_at: now,
      ended_at: null,
    };
    await writeAudit(c.env.DB, {
      id: uuid(),
      action: "camera.session_started",
      actorType: "owner",
      actorId: c.get("ownerId"),
      deviceId: device.id,
      requestId: c.get("requestId"),
      metadata: { sessionId: id },
      createdAt: now,
    });
  }
  return ok(c, { sessionId: session.id, status: session.status }, 201);
});

/** Stop any active camera session for the device. */
cameraRoutes.post("/devices/:id/camera/stop", async (c) => {
  const { device } = await loadOwned(c, c.req.param("id"));
  const now = Date.now();
  await c.env.DB.prepare(
    "UPDATE camera_sessions SET status = 'ended', ended_at = ? WHERE device_id = ? AND status IN ('requested','authorized','active')",
  )
    .bind(now, device.id)
    .run();
  await writeAudit(c.env.DB, {
    id: uuid(),
    action: "camera.session_ended",
    actorType: "owner",
    actorId: c.get("ownerId"),
    deviceId: device.id,
    requestId: c.get("requestId"),
    createdAt: now,
  });
  return ok(c, { stopped: true });
});

/** Current camera state + latest snapshot metadata per lens. */
cameraRoutes.get("/devices/:id/camera", async (c) => {
  const { device, settings } = await loadOwned(c, c.req.param("id"));
  const session = await activeSession(c, device.id);

  const latestForLens = async (lens: "back" | "front") => {
    // Match this lens, tolerating older rows with a NULL lens as 'back'.
    const row = await c.env.DB.prepare(
      `SELECT * FROM media_assets
       WHERE device_id = ? AND content_type = 'image/jpeg'
         AND (lens = ? OR (lens IS NULL AND ? = 'back'))
       ORDER BY created_at DESC LIMIT 1`,
    )
      .bind(device.id, lens, lens)
      .first<MediaAssetRow>();
    return row
      ? {
          assetId: row.id,
          createdAt: new Date(row.created_at).toISOString(),
          sizeBytes: row.size_bytes,
          lens: (row.lens as "front" | "back" | null) ?? "back",
        }
      : null;
  };

  const view: CameraStateView = {
    enabled: settings.camera_feature_enabled === 1,
    session: session
      ? {
          id: session.id,
          status: session.status as CameraSessionStatus,
          createdAt: new Date(session.created_at).toISOString(),
          startedAt: session.authorized_at ? new Date(session.authorized_at).toISOString() : null,
        }
      : null,
    intervalSeconds: CAMERA.defaultSnapshotIntervalSeconds,
    lenses: lensesFor(settings.camera_lens),
    snapshots: {
      back: await latestForLens("back"),
      front: await latestForLens("front"),
    },
  };
  return ok(c, view);
});

/** Stream a snapshot's JPEG bytes (ownership-checked). */
cameraRoutes.get("/camera/snapshots/:assetId", async (c) => {
  const ownerId = c.get("ownerId")!;
  const asset = await c.env.DB.prepare(
    `SELECT m.* FROM media_assets m
     JOIN devices d ON d.id = m.device_id
     WHERE m.id = ? AND d.owner_id = ?`,
  )
    .bind(c.req.param("assetId"), ownerId)
    .first<MediaAssetRow>();
  if (!asset || !asset.r2_key) throw errors.notFound("Snapshot not found");

  const obj = await c.env.MEDIA.get(asset.r2_key);
  if (!obj) throw errors.notFound("Snapshot data not found");
  return new Response(obj.body, {
    headers: {
      "content-type": asset.content_type || "image/jpeg",
      "cache-control": "no-store",
      "x-request-id": c.get("requestId"),
    },
  });
});
