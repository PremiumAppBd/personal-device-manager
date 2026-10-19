import { defineWorkersConfig, readD1Migrations } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig(async () => {
  // Load SQL migrations so the test setup can apply them to the isolated D1.
  const migrations = await readD1Migrations("./migrations");

  return {
    test: {
      setupFiles: ["./src/test/apply-migrations.ts"],
      poolOptions: {
        workers: {
          singleWorker: true,
          wrangler: { configPath: "./wrangler.toml" },
          miniflare: {
            // Test-only bindings (secrets + migration payload).
            bindings: {
              OWNER_SESSION_SECRET: "test-only-session-secret-change-me-0123456789",
              OWNER_SESSION_TTL_SECONDS: "3600",
              ENVIRONMENT: "test",
              TEST_MIGRATIONS: migrations,
            },
          },
        },
      },
    },
  };
});
