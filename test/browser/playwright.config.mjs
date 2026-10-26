import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

/**
 * Fast UI regression suite that runs against the dev server with the backend and terminal
 * socket stubbed (see stubs.mjs) — no kind cluster, no Docker. It guards two layout
 * regressions (terminal maximize sizing, code-block clipping) across Chromium and Firefox.
 * The real-cluster story lives in test/e2e and is unaffected by this config.
 */
const PORT = Number(process.env.FEATHERLAB_UI_PORT || 5199);

export default defineConfig({
  testDir: ".",
  testMatch: "*.spec.mjs",
  outputDir: "../../test-results-browser",
  fullyParallel: true,
  workers: 2,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"], channel: "chrome" } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
  ],
  webServer: {
    command: `npx vite --config web/vite.config.js --port ${PORT} --strictPort`,
    cwd: repoRoot,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
