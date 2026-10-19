import type { Context } from "hono";

/** Typed Cloudflare bindings and environment variables for the PDM Worker. */
export interface Env {
  /** D1 database binding. */
  DB: D1Database;
  /** R2 bucket for private media (FUTURE PHASE). */
  MEDIA: R2Bucket;
  /** Durable Object namespace for WebRTC signaling (FUTURE PHASE). */
  SIGNALING: DurableObjectNamespace;

  /** "development" | "production". */
  ENVIRONMENT: string;

  /** HMAC secret for owner session tokens (set via `wrangler secret put`). */
  OWNER_SESSION_SECRET?: string;
  /** Owner session lifetime in seconds. */
  OWNER_SESSION_TTL_SECONDS?: string;

  /** Optional Cloudflare Access front door. */
  CF_ACCESS_TEAM_DOMAIN?: string;
  CF_ACCESS_AUD?: string;
}

/** Per-request context variables set by middleware. */
export interface Vars {
  requestId: string;
  /** Set by ownerAuth middleware on success. */
  ownerId?: string;
  /** Set by deviceAuth middleware on success. */
  deviceId?: string;
}

export type AppContext = Context<{ Bindings: Env; Variables: Vars }>;

export function isProduction(env: Env): boolean {
  return env.ENVIRONMENT === "production";
}
