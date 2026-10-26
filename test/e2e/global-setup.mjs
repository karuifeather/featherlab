import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createApp } from "../../src/app.mjs";
import { startServer } from "../../src/server.mjs";
import { IsolatedEnvironment } from "../helpers/isolated-environment.mjs";
import { E2E_PORT } from "./playwright.config.mjs";

const quiet = { warn() {}, error() {} };

/**
 * Provision a disposable `featherlab-test-<id>` cluster + workstation and serve the real
 * application against it. Nothing here can address the learner's environment: the harness
 * refuses non-test names (see test/helpers/isolated-environment.mjs).
 */
export default async function globalSetup() {
  const index = fileURLToPath(new URL("../../dist/web/index.html", import.meta.url));
  if (!existsSync(index)) throw new Error("dist/web is missing. Run `npm run build` first.");

  const env = new IsolatedEnvironment({ log: console }).start();
  let server;
  try {
    const { workstation, cluster } = env.config;
    server = await startServer(E2E_PORT, {
      service: createApp({ workstation, logger: quiet }).service,
      workstation,
      cluster,
    });
  } catch (error) {
    env.teardown();
    throw error;
  }
  process.env.FEATHERLAB_E2E_WORKSTATION = env.config.workstation;
  return async () => {
    await server.close();
    env.teardown();
  };
}
