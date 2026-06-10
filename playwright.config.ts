import { defineConfig, devices } from "@playwright/test";

/**
 * E2E smoke config. Runs against `npm run dev` + the seeded Supabase dev
 * project (see e2e/smoke.spec.ts). Not hermetic — the app's auth needs
 * Supabase, so the smoke can't run on the embedded-postgres fixtures the
 * integration tests use. Kept out of the default CI gate for that reason;
 * run locally with `npm run test:e2e`.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  // next dev occasionally throws a first-compile webpack chunk error on a
  // freshly-compiled route; a reload recompiles cleanly, so retry the smoke.
  retries: 2,
  timeout: 90_000,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
