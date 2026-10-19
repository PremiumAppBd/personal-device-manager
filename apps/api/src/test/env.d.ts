import type { D1Migration } from "@cloudflare/vitest-pool-workers/config";
import type { Env } from "../env.js";

declare module "cloudflare:test" {
  // Merge the Worker's own bindings with the test-only migration payload.
  interface ProvidedEnv extends Env {
    TEST_MIGRATIONS: D1Migration[];
  }
}
