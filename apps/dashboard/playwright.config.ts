import { defineConfig, devices } from "@playwright/test";

const PORT = 4318;

/**
 * Demo-mode E2E smoke test. Runs the dashboard with VITE_DEMO_MODE=true so the
 * suite exercises the real built UI against the isolated mock data source with
 * no backend. Uses the preinstalled Chromium via executablePath.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: true,
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    launchOptions: { executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `pnpm exec vite --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: { VITE_DEMO_MODE: "true" },
  },
});
