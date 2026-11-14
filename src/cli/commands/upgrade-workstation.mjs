// `featherlab upgrade-workstation` — upgrade the workstation container to the image
// that matches the installed CLI version while preserving /home/learner.
//
// This command is called automatically by `featherlab update` after a successful
// CLI upgrade.  Users can also run it manually at any time.

import { createRuntime } from "../../lib/runtime.mjs";
import { printInfo, printStep, printWarn, printError } from "../output.mjs";

/** Shared logger that routes through the CLI output helpers. */
const cliLogger = {
  log: (msg) => printInfo(msg),
  warn: (msg) => printWarn(msg),
  error: (msg) => printError(msg),
};

/**
 * @param {{ stateDir: string }} ctx
 */
export async function run() {
  if (process.env.FEATHERLAB_IMAGE) {
    printStep("FEATHERLAB_IMAGE is set — workstation image is not managed automatically.");
    return;
  }

  const rt = createRuntime({}, { log: cliLogger });
  const wsState = rt.containerState();

  if (wsState === "missing") {
    printStep("No workstation container found — it will be created on next `featherlab start`.");
    return;
  }

  const wsImage = rt.containerImage();
  if (!wsImage || wsImage === rt.config.image) {
    printStep(`Workstation already uses the current image (${rt.config.image}).`);
    return;
  }

  printInfo(`Upgrading workstation: ${wsImage} → ${rt.config.image}`);
  try {
    const { backupDir } = rt.upgradeWorkstation();
    printStep(`Workstation upgraded. Files preserved at: ${backupDir}`);
  } catch (error) {
    printError(`Workstation upgrade failed: ${error.message}`, {
      hint: "Run `featherlab start` — the upgrade will be retried safely then.",
    });
    process.exitCode = 1;
  }
}
