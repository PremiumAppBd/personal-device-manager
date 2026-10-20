import { Hono } from "hono";
import { API_BASE_PATH } from "@pdm/shared";
import type { Env, Vars } from "./env.js";
import { requestId, securityHeaders } from "./middleware.js";
import { fail } from "./lib/responses.js";
import { ApiError, errors } from "./lib/errors.js";
import { healthRoutes } from "./routes/health.js";
import { authRoutes } from "./routes/auth.js";
import { pairingRoutes } from "./routes/pairing.js";
import { deviceRoutes } from "./routes/devices.js";
import { deviceSelfRoutes } from "./routes/device-self.js";
import { cameraRoutes } from "./routes/camera.js";
import { auditRoutes } from "./routes/audit.js";

export function createApp(): Hono<{ Bindings: Env; Variables: Vars }> {
  const app = new Hono<{ Bindings: Env; Variables: Vars }>();

  app.use("*", requestId);
  app.use("*", securityHeaders);

  app.onError((err, c) => {
    if (err instanceof ApiError) return fail(c, err);
    // Never leak internal error details or secrets to clients.
    console.error("unhandled_error", {
      requestId: c.get("requestId"),
      name: (err as Error)?.name,
    });
    return fail(c, errors.internal());
  });

  app.notFound((c) => fail(c, errors.notFound("Route not found")));

  const api = new Hono<{ Bindings: Env; Variables: Vars }>();
  api.route("/", healthRoutes);
  api.route("/", authRoutes);
  api.route("/", pairingRoutes);
  api.route("/", deviceRoutes);
  api.route("/", deviceSelfRoutes);
  api.route("/", cameraRoutes);
  api.route("/", auditRoutes);

  app.route(API_BASE_PATH, api);

  // Unversioned liveness probe.
  app.get("/", (c) =>
    c.json({ ok: true, service: "pdm-api", apiBase: API_BASE_PATH }),
  );

  return app;
}
