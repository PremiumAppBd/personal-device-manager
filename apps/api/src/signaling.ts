import type { Env } from "./env.js";

/**
 * SignalingRoom — Durable Object for future WebRTC signaling between an
 * authorized dashboard viewer and a device during a user-authorized camera
 * session.
 *
 * FUTURE PHASE: this is a binding placeholder. It intentionally does NOT relay
 * any media or start any capture. It exists so the DO binding, WebSocket
 * hibernation wiring, and migration are valid now, and so the signaling
 * topology can be implemented later behind the camera authorization flow.
 *
 * When implemented, this DO will:
 *   - accept WebSocket connections only after owner + device authorization,
 *   - use the Hibernation API (ctx.acceptWebSocket) to survive idle periods,
 *   - relay SDP offers/answers and ICE candidates between exactly two peers,
 *   - never originate capture; capture starts only from an on-device,
 *     user-visible foreground session.
 */
export class SignalingRoom {
  private readonly ctx: DurableObjectState;
  private readonly env: Env;

  constructor(ctx: DurableObjectState, env: Env) {
    this.ctx = ctx;
    this.env = env;
  }

  async fetch(_request: Request): Promise<Response> {
    // Feature not enabled in Phase 1.
    return new Response(
      JSON.stringify({
        ok: false,
        error: {
          code: "feature_disabled",
          message: "WebRTC signaling is not enabled in Phase 1",
        },
      }),
      { status: 403, headers: { "content-type": "application/json" } },
    );
  }
}
