import { Hono } from "hono";
import { listQuerySchema } from "@pdm/shared";
import type { Env, Vars } from "../env.js";
import { ok } from "../lib/responses.js";
import { parse } from "../lib/validate.js";
import { auditRowToView } from "../db.js";
import { ownerAuth } from "../middleware.js";

export const auditRoutes = new Hono<{ Bindings: Env; Variables: Vars }>();
auditRoutes.use("/audit", ownerAuth);

interface AuditRow {
  id: string;
  action: string;
  actor_type: "owner" | "device" | "system";
  actor_id: string | null;
  device_id: string | null;
  request_id: string | null;
  metadata_json: string | null;
  created_at: number;
}

/**
 * Owner audit log viewer. Scoped to the owner's own devices plus owner/system
 * actions. Cursor is the created_at of the last row seen (keyset pagination).
 */
auditRoutes.get("/audit", async (c) => {
  const ownerId = c.get("ownerId")!;
  const q = parse(listQuerySchema, {
    limit: c.req.query("limit"),
    cursor: c.req.query("cursor"),
  });
  const before = q.cursor ? Number(q.cursor) : Number.MAX_SAFE_INTEGER;

  const rows = await c.env.DB.prepare(
    `SELECT a.* FROM audit_logs a
     LEFT JOIN devices d ON d.id = a.device_id
     WHERE a.created_at < ?
       AND (a.actor_id = ? OR d.owner_id = ? OR a.actor_type = 'system')
     ORDER BY a.created_at DESC
     LIMIT ?`,
  )
    .bind(before, ownerId, ownerId, q.limit)
    .all<AuditRow>();

  const items = rows.results.map(auditRowToView);
  const nextCursor =
    items.length === q.limit
      ? String(rows.results[rows.results.length - 1]!.created_at)
      : null;
  return ok(c, { items, nextCursor });
});
