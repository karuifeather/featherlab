// `featherlab start` (default command) — provision the workstation, start the HTTP server,
// open the browser, and run until SIGINT/SIGTERM.

import { createApp } from "../../app.mjs";
import { startServer } from "../../server.mjs";
import { createRuntime } from "../../lib/runtime.mjs";
import { LifecycleCoordinator } from "../../lifecycle/coordinator.mjs";
import { checkForUpdate } from "../../lib/update-check.mjs";
import { writePidFile, writePortFile, removePidFiles } from "../pid-file.mjs";
import { openBrowser } from "../browser.mjs";
import { printBanner, printReady, printInfo, printWarn, printError } from "../output.mjs";

/** Shared logger that routes through the CLI output helpers. */
const cliLogger = {
  log: (msg) => printInfo(msg),
  warn: (msg) => printWarn(msg),
  error: (msg) => printError(msg),
};

/**
 * @param {{ version: string, stateDir: string, port: number, noOpen: boolean }} ctx
 */
export async function run({ version, stateDir, port, noOpen }) {
  printBanner(version);
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error("FEATHERLAB_PORT must be a non-privileged TCP port.");

  const runtime = createRuntime({}, { log: cliLogger });
  const { service, knowledgeCheckService, persistence } = createApp({
    stateDir: runtime.config.stateDir,
    workstation: runtime.config.workstation,
    cluster: runtime.config.cluster,
  });
  const coordinator = new LifecycleCoordinator({ runtime, log: cliLogger });

  let shutdownInProgress = false;
  let startupComplete = false;

  const releaseLocalState = () => {
    // Closing flushes WAL frames and releases the file lock safely.
    try {
      persistence?.close();
    } catch {
      // Non-fatal — database data is durable via WAL even without an explicit close.
    }
    removePidFiles(runtime.config.stateDir);
  };

  const onSignal = async () => {
    if (shutdownInProgress) {
      // Second Ctrl+C: give the terminal back now. Container stops run detached from this
      // process, so they finish on their own — the user never needs to run `docker stop`.
      coordinator.stopInBackground();
      releaseLocalState();
      process.stderr.write("\n");
      printWarn("Exiting now. Containers will finish stopping in the background.");
      process.exit(130);
    }
    shutdownInProgress = true;
    printInfo("Shutting down (press Ctrl+C again to exit without waiting)...");
    const errorCount = (await coordinator.requestShutdown()) ?? 0;
    releaseLocalState();
    // Exit nonzero if startup was interrupted or cleanup had errors.
    process.exit(startupComplete && errorCount === 0 ? 0 : 1);
  };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);

  const { port: actualPort } = await coordinator.start({
    serverFactory: (p) =>
      startServer(p, {
        service,
        knowledgeCheckService,
        workstation: runtime.config.workstation,
        cluster: runtime.config.cluster,
        version,
        stateDir: runtime.config.stateDir,
      }),
    port,
  });

  startupComplete = true;
  try {
    writePidFile(runtime.config.stateDir);
    // `featherlab reset` sends its request here so the server stays the only mutator.
    writePortFile(runtime.config.stateDir, actualPort);
  } catch {
    // stateDir is created by provision(), but guard against unexpected failures.
  }
  printReady(actualPort);
  if (!noOpen) openBrowser(`http://127.0.0.1:${actualPort}`);
  // Warm the update-check cache while the server is long-running.
  // Short-lived commands (status, reset, …) read this cache and show the notice immediately.
  checkForUpdate(stateDir, version).catch(() => {});
}
