import { applyD1Migrations, env } from "cloudflare:test";

// Apply all SQL migrations to the isolated per-test D1 database before the
// suite runs. TEST_MIGRATIONS is injected by vitest.config.ts.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
