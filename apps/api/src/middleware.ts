import type { MiddlewareHandler } from "hono";
import {
  buildSigningString,
  HEADERS,
  isTimestampFresh,
  SIGNING,
  sha256Hex,
} from "@pdm/shared";
import type { Env, Vars } from "./env.js";
import { uuid } from "./lib/ids.js";
import { verifyDeviceSignature, verifySessionToken } from "./lib/crypto.js";
import { ApiError, errors } from "./lib/errors.js";
import { writeAudit, type DeviceRow } from "./db.js";
import { validateAccessJwt } from "./auth/access.js";

type MW = MiddlewareHandler<{ Bindings: Env; Variables: Vars }>;

/** Assign/propagate a request id and expose it on the response. */
export const requestId: MW = async (c, next) => {
  const incoming = c.req.header(HEADERS.requestId);
  const id = incoming && /^[\w-]{1,128}$/.test(incoming) ? incoming : uuid();
  c.set("requestId", id);
  c.header(HEADERS.requestId, id);
  await next();
};

/** Conservative security headers for a JSON API. */
export const securityHeaders: MW = async (c, next) => {
  await next();
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  c.header("Referrer-Policy", "no-referrer");
  c.header("Cross-Origin-Resource-Policy", "same-origin");
  c.header("Cache-Control", "no-store");
  c.header(
    "Content-Security-Policy",
    "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  );
  // API is JSON-only and not browser-navigable; HSTS is set at the edge/proxy.
};

/**
 * Owner authentication. Two accepted mechanisms:
 *   1. Bearer session token (issued by POST /auth/login), verified via HMAC.
 *   2. Cloudflare Access JWT (Cf-Access-Jwt-Assertion) when CF_ACCESS_* vars
 *      are configured — the production front door. Mapped to an owner by email.
 * Rejects all unauthenticated requests with 401.
 */
export const ownerAuth: MW = async (c, next) => {
  const env = c.env;

  // Cloudflare Access path (only when configured).
  if (env.CF_ACCESS_TEAM_DOMAIN && env.CF_ACCESS_AUD) {
    const assertion = c.req.header("cf-access-jwt-assertion");
    if (assertion) {
      const identity = await validateAccessJwt(assertion, {
        teamDomain: env.CF_ACCESS_TEAM_DOMAIN,
        aud: env.CF_ACCESS_AUD,
      });
      if (!identity?.email) throw errors.unauthorized("Invalid Access identity");
      const owner = await c.env.DB.prepare(
        "SELECT id FROM owners WHERE email = ?",
      )
        .bind(identity.email.toLowerCase())
        .first<{ id: string }>();
      if (!owner) throw errors.forbidden("Access identity is not a known owner");
      c.set("ownerId", owner.id);
      await next();
      return;
    }
  }

  // Bearer session token path.
  const header = c.req.header(HEADERS.ownerAuth) ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) throw errors.unauthorized();
  const secret = env.OWNER_SESSION_SECRET;
  if (!secret) throw errors.internal("Owner session secret not configured");
  const ownerId = await verifySessionToken(match[1]!, secret);
  if (!ownerId) throw errors.unauthorized("Invalid or expired session");

  // Confirm the owner still exists.
  const owner = await c.env.DB.prepare("SELECT id FROM owners WHERE id = ?")
    .bind(ownerId)
    .first<{ id: string }>();
  if (!owner) throw errors.unauthorized("Session owner no longer exists");

  c.set("ownerId", ownerId);
  await next();
};

/**
 * Device authentication for device-originated endpoints. Verifies:
 *   - all required signature headers are present;
 *   - the device exists and is active;
 *   - the timestamp is within the allowed clock skew;
 *   - the (device, nonce) pair has not been used (replay protection);
 *   - the ECDSA signature over the canonical string verifies against the
 *     enrolled public key.
 * The device id header is treated as a lookup key ONLY; identity is proven by
 * the signature, never by the id alone.
 */
export const deviceAuth: MW = async (c, next) => {
  const deviceId = c.req.header(HEADERS.deviceId);
  const timestampRaw = c.req.header(HEADERS.timestamp);
  const nonce = c.req.header(HEADERS.nonce);
  const signature = c.req.header(HEADERS.signature);

  if (!deviceId || !timestampRaw || !nonce || !signature) {
    throw errors.unauthorized("Missing device authentication headers");
  }
  if (!/^[\w-]{8,200}$/.test(nonce)) {
    throw errors.badRequest("Malformed nonce");
  }
  const timestamp = Number(timestampRaw);
  if (!isTimestampFresh(timestamp)) {
    await auditReject(c, deviceId, "stale_timestamp");
    throw errors.unauthorized("Stale or invalid timestamp");
  }

  const device = await c.env.DB.prepare(
    "SELECT * FROM devices WHERE id = ?",
  )
    .bind(deviceId)
    .first<DeviceRow>();
  if (!device || device.status !== "active") {
    await auditReject(c, deviceId, "unknown_or_inactive_device");
    throw errors.unauthorized("Unknown or inactive device");
  }

  // Recompute the canonical signing string. Body hash must match exactly.
  const rawBody = await c.req.raw.clone().text();
  const bodyHashHex = await sha256Hex(rawBody);
  const message = buildSigningString({
    method: c.req.method,
    path: new URL(c.req.url).pathname,
    deviceId,
    timestamp: timestampRaw,
    nonce,
    bodyHashHex,
  });

  const valid = await verifyDeviceSignature(
    device.public_key_spki,
    signature,
    message,
  );
  if (!valid) {
    await auditReject(c, deviceId, "signature_invalid");
    throw errors.signature();
  }

  // Replay protection: claim the nonce atomically. A duplicate insert fails the
  // UNIQUE/PK constraint, which we surface as replay_detected.
  const now = Date.now();
  try {
    await c.env.DB.prepare(
      `INSERT INTO request_nonces (device_id, nonce, seen_at, expires_at)
       VALUES (?, ?, ?, ?)`,
    )
      .bind(deviceId, nonce, now, now + SIGNING.nonceRetentionMs)
      .run();
  } catch {
    await writeAudit(c.env.DB, {
      id: uuid(),
      action: "auth.replay_detected",
      actorType: "device",
      actorId: deviceId,
      deviceId,
      requestId: c.get("requestId"),
      createdAt: now,
    });
    throw errors.replay();
  }

  c.set("deviceId", deviceId);
  await next();
};

async function auditReject(
  c: Parameters<MW>[0],
  deviceId: string,
  reason: string,
): Promise<void> {
  try {
    await writeAudit(c.env.DB, {
      id: uuid(),
      action: "auth.device_rejected",
      actorType: "device",
      actorId: deviceId,
      deviceId,
      requestId: c.get("requestId"),
      metadata: { reason },
      createdAt: Date.now(),
    });
  } catch {
    // Never let audit failures mask the auth rejection.
  }
}

/** Shared error-to-response boundary. */
export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError;
}
