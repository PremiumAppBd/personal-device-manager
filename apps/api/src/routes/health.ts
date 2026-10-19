import { Hono } from "hono";
import type { Env, Vars } from "../env.js";
import { ok } from "../lib/responses.js";

export const healthRoutes = new Hono<{ Bindings: Env; Variables: Vars }>();

healthRoutes.get("/health", async (c) => {
  // Lightweight DB round-trip to confirm the binding is live.
  let dbOk = false;
  try {
    const row = await c.env.DB.prepare("SELECT 1 AS up").first<{ up: number }>();
    dbOk = row?.up === 1;
  } catch {
    dbOk = false;
  }
  return ok(c, {
    service: "pdm-api",
    status: dbOk ? "ok" : "degraded",
    environment: c.env.ENVIRONMENT,
    time: new Date().toISOString(),
    checks: { database: dbOk },
  });
});
