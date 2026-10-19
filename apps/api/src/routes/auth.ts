import { Hono } from "hono";
import { ownerLoginSchema } from "@pdm/shared";
import type { Env, Vars } from "../env.js";
import { ok } from "../lib/responses.js";
import { errors } from "../lib/errors.js";
import { parse, readJson } from "../lib/validate.js";
import { issueSessionToken, verifyPassword } from "../lib/crypto.js";
import { uuid } from "../lib/ids.js";
import { writeAudit, type OwnerRow } from "../db.js";
import { ownerAuth } from "../middleware.js";

export const authRoutes = new Hono<{ Bindings: Env; Variables: Vars }>();

const DEFAULT_TTL_SECONDS = 12 * 60 * 60;

authRoutes.post("/auth/login", async (c) => {
  const body = parse(ownerLoginSchema, await readJson(c.req.raw));
  const secret = c.env.OWNER_SESSION_SECRET;
  if (!secret) throw errors.internal("Owner session secret not configured");

  const owner = await c.env.DB.prepare("SELECT * FROM owners WHERE email = ?")
    .bind(body.email.toLowerCase())
    .first<OwnerRow>();

  // Verify password even when the owner is missing is not possible without a
  // stored hash; we still avoid leaking which part failed via a uniform error.
  const valid =
    owner != null &&
    (await verifyPassword(body.password, owner.password_hash, owner.password_salt));

  if (!owner || !valid) {
    await writeAudit(c.env.DB, {
      id: uuid(),
      action: "owner.login_failed",
      actorType: "system",
      requestId: c.get("requestId"),
      metadata: { email: body.email.toLowerCase() },
      createdAt: Date.now(),
    });
    throw errors.unauthorized("Invalid credentials");
  }

  const ttl = Number(c.env.OWNER_SESSION_TTL_SECONDS) || DEFAULT_TTL_SECONDS;
  const token = await issueSessionToken(owner.id, secret, ttl);
  await writeAudit(c.env.DB, {
    id: uuid(),
    action: "owner.login",
    actorType: "owner",
    actorId: owner.id,
    requestId: c.get("requestId"),
    createdAt: Date.now(),
  });

  return ok(c, {
    token,
    tokenType: "Bearer",
    expiresInSeconds: ttl,
    owner: { id: owner.id, email: owner.email },
  });
});

authRoutes.get("/auth/me", ownerAuth, async (c) => {
  const owner = await c.env.DB.prepare(
    "SELECT id, email, created_at FROM owners WHERE id = ?",
  )
    .bind(c.get("ownerId"))
    .first<{ id: string; email: string; created_at: number }>();
  if (!owner) throw errors.unauthorized();
  return ok(c, {
    id: owner.id,
    email: owner.email,
    createdAt: new Date(owner.created_at).toISOString(),
  });
});
