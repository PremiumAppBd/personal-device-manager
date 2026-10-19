import type { Env } from "./env.js";
import { createApp } from "./app.js";

export { SignalingRoom } from "./signaling.js";

const app = createApp();

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext): Response | Promise<Response> {
    return app.fetch(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
