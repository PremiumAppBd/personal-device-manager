import { Hono } from "hono";
import {
  buildEnrollmentSigningString,
  createPairingSchema,
  enrollDeviceSchema,
  PAIRING,
  type EnrollmentResultView,
  type PairingChallengeView,
} from "@pdm/shared";
import type { Env, Vars } from "../env.js";
import { ok } from "../lib/responses.js";
import { errors } from "../lib/errors.js";
import { parse, readJson } from "../lib/validate.js";
import { pairingCode as makeCode, randomToken, uuid } from "../lib/ids.js";
import {
  sha256HexString,
  verifyDeviceSignature,
} from "../lib/crypto.js";
import { writeAudit, type PairingRow } from "../db.js";
import { ownerAuth } from "../middleware.js";

export const pairingRoutes = new Hono<{ Bindings: Env; Variables: Vars }>();

/** Owner creates a single-use, short-lived pairing challenge. */
pairingRoutes.post("/pairings", ownerAuth, async (c) => {
  const body = parse(createPairingSchema, await readJson(c.req.raw));
  const ownerId = c.get("ownerId")!;
  const now = Date.now();

  const code = makeCode(PAIRING.codeLength, PAIRING.alphabet);
  const codeHash = await sha256HexString(code);
  const nonce = randomToken(24);
  const id = uuid();
  const expiresAt = now + PAIRING.ttlMs;

  await c.env.DB.prepare(
    `INSERT INTO pairing_challenges (id, owner_id, code_hash, nonce, label, status, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, 'issued', ?, ?)`,
  )
    .bind(id, ownerId, codeHash, nonce, body.label ?? null, now, expiresAt)
    .run();

  await writeAudit(c.env.DB, {
    id: uuid(),
    action: "pairing.created",
    actorType: "owner",
    actorId: ownerId,
    requestId: c.get("requestId"),
    metadata: { pairingId: id, label: body.label ?? null },
    createdAt: now,
  });

  const view: PairingChallengeView = {
    pairingCode: code,
    challengeNonce: nonce,
    expiresAt: new Date(expiresAt).toISOString(),
    label: body.label ?? null,
  };
  return ok(c, view, 201);
});

/**
 * Device enrollment. No owner/device auth: the device proves it holds the
 * pairing code AND possession of its private key by signing the challenge.
 * The pairing code is single-use and short-lived.
 */
pairingRoutes.post("/enroll", async (c) => {
  const body = parse(enrollDeviceSchema, await readJson(c.req.raw));
  const now = Date.now();
  const codeHash = await sha256HexString(body.pairingCode);

  const pairing = await c.env.DB.prepare(
    "SELECT * FROM pairing_challenges WHERE code_hash = ?",
  )
    .bind(codeHash)
    .first<PairingRow>();

  const fail = async (reason: string): Promise<never> => {
    await writeAudit(c.env.DB, {
      id: uuid(),
      action: "pairing.failed",
      actorType: "system",
      requestId: c.get("requestId"),
      metadata: { reason },
      createdAt: now,
    });
    throw errors.pairing();
  };

  if (!pairing) await fail("code_not_found");
  if (pairing!.status !== "issued") await fail("code_not_reusable");
  if (pairing!.expires_at < now) {
    await c.env.DB.prepare(
      "UPDATE pairing_challenges SET status = 'expired' WHERE id = ? AND status = 'issued'",
    )
      .bind(pairing!.id)
      .run();
    await fail("code_expired");
  }

  // Prove possession of the private key: signature over the enrollment string.
  const message = buildEnrollmentSigningString(
    body.pairingCode,
    pairing!.nonce,
  );
  const sigValid = await verifyDeviceSignature(
    body.publicKeySpki,
    body.challengeSignature,
    message,
  );
  if (!sigValid) await fail("challenge_signature_invalid");

  const fingerprint = await sha256HexString(body.publicKeySpki);

  // Reject re-enrollment of an already-known key.
  const existing = await c.env.DB.prepare(
    "SELECT id FROM devices WHERE public_key_fingerprint = ?",
  )
    .bind(fingerprint)
    .first<{ id: string }>();
  if (existing) await fail("public_key_already_enrolled");

  const deviceId = uuid();
  const deviceToken = randomToken(32);
  const tokenHash = await sha256HexString(deviceToken);

  // Atomically consume the pairing, create the device + default settings.
  const consume = c.env.DB.prepare(
    `UPDATE pairing_challenges SET status = 'consumed', device_id = ?, consumed_at = ?
     WHERE id = ? AND status = 'issued'`,
  ).bind(deviceId, now, pairing!.id);

  const insertDevice = c.env.DB.prepare(
    `INSERT INTO devices
       (id, owner_id, label, public_key_spki, public_key_fingerprint, install_id,
        model, manufacturer, os_version, sdk_int, status, token_hash, enrolled_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
  ).bind(
    deviceId,
    pairing!.owner_id,
    pairing!.label,
    body.publicKeySpki,
    fingerprint,
    body.device.installId,
    body.device.model,
    body.device.manufacturer,
    body.device.osVersion,
    body.device.sdkInt,
    tokenHash,
    now,
  );

  const insertSettings = c.env.DB.prepare(
    `INSERT INTO device_settings (device_id, updated_at) VALUES (?, ?)`,
  ).bind(deviceId, now);

  // Order matters: the device row must exist before the pairing row's
  // device_id foreign key is set to it.
  await c.env.DB.batch([insertDevice, insertSettings, consume]);

  await writeAudit(c.env.DB, {
    id: uuid(),
    action: "device.enrolled",
    actorType: "device",
    actorId: deviceId,
    deviceId,
    requestId: c.get("requestId"),
    metadata: { fingerprint, model: body.device.model },
    createdAt: now,
  });

  const result: EnrollmentResultView = {
    deviceId,
    status: "active",
    deviceToken,
    settings: {
      statusIntervalSeconds: 900,
      cameraFeatureEnabled: false,
      smsFeatureEnabled: false,
      diagnosticsEnabled: true,
    },
  };
  return ok(c, result, 201);
});
