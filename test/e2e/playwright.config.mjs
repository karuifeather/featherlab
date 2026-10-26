import { defineConfig } from "@playwright/test";

/**
 * Browser smoke test against the REAL backend and a disposable kind cluster (see
 * global-setup.mjs). Port 4399 keeps it away from a learner's running app on 4317.
 *
 * Locally, PLAYWRIGHT_CHANNEL=chrome reuses the installed Chrome; CI installs Chromium
 * with `npx playwright install --with-deps chromium`.
 */
export const E2E_PORT = Number(process.env.FEATHERLAB_E2E_PORT || 4399);

export default defineConfig({
  testDir: ".",
  testMatch: "*.spec.mjs",
  globalSetup: "./global-setup.mjs",
  outputDir: "../../test-results",
  // One learner, one cluster, one ordered story.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 8 * 60_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${E2E_PORT}`,
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
