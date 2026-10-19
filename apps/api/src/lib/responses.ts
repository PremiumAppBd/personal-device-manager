import type { Context } from "hono";
import type { ApiErrorBody, ApiOk } from "@pdm/shared";
import type { AppContext } from "../env.js";
import { ApiError } from "./errors.js";

export function ok<T>(c: AppContext, data: T, status = 200): Response {
  const body: ApiOk<T> = { ok: true, data, requestId: c.get("requestId") };
  return c.json(body, status as 200);
}

export function fail(c: Context, err: ApiError): Response {
  const requestId = (c.get("requestId") as string) ?? "unknown";
  const body: ApiErrorBody = {
    ok: false,
    error: { code: err.code, message: err.message, details: err.details },
    requestId,
  };
  return c.json(body, err.status as 400);
}
