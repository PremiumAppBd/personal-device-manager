import type { z } from "zod";
import { ApiError } from "./errors.js";

/** Parse data with a Zod schema, throwing a typed validation ApiError. */
export function parse<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const details = result.error.issues.map((i) => ({
      path: i.path.join("."),
      message: i.message,
    }));
    throw new ApiError("validation_error", "Request validation failed", details);
  }
  return result.data;
}

/** Safely read a JSON body, returning {} for an empty body. */
export async function readJson(req: Request): Promise<unknown> {
  const text = await req.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError("bad_request", "Request body is not valid JSON");
  }
}
