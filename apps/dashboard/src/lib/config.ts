/**
 * Runtime configuration from Vite env vars.
 *
 * Demo mode is an EXPLICIT opt-in (VITE_DEMO_MODE="true"). It is never a
 * fallback: a failed real API call surfaces an error, it does not switch to
 * mock data. A production build that is accidentally shipped with demo mode on
 * is surfaced loudly via `demoMisconfigured`.
 */
const demoFlag = import.meta.env.VITE_DEMO_MODE === "true";

export const config = {
  apiBaseUrl: (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, ""),
  demoMode: demoFlag,
  isProd: import.meta.env.PROD,
  /** True if a production build still has demo mode enabled (not allowed). */
  demoMisconfigured: import.meta.env.PROD && demoFlag,
} as const;
