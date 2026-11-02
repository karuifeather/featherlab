// `featherlab update` — upgrade to the latest published version via npm.
//
// Guards (in order, so the cheapest check surfaces first):
//   D3  — refuse if featherlab is already running (check PID file before network).
//   D5  — warn if the workstation container uses an image from an older release.

import path from "node:path";
import { readFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createRuntime } from "../../lib/runtime.mjs";
import { checkForUpdate } from "../../lib/update-check.mjs";
import { PID_FILE, PORT_FILE } from "../reset.mjs";
import { printInfo, printWarn, printStep, printError } from "../output.mjs";

/**
 * @param {{ stateDir: string, version: string }} ctx
 */
export async function run({ stateDir, version }) {
  const quietLog = { log: () => {}, warn: () => {}, error: () => {} };
  const rt = createRuntime({}, { log: quietLog });
  const pidFile = path.join(stateDir, PID_FILE);

  // Guard: refuse if a featherlab process is already running.
  // This check runs before the registry call so a running-instance error
  // surfaces first and no network request is wasted. (D3)
  try {
    const [pidStr] = readFileSync(pidFile, "utf8").trim().split(" ");
    const pid = Number(pidStr);
    if (Number.isFinite(pid) && pid > 0) {
      let alive = false;
      try {
        process.kill(pid, 0);
        alive = true;
      } catch {
        alive = false;
      }
      if (alive) {
        printWarn("featherlab is running — stop it first with: featherlab stop");
        process.exitCode = 1;
        return;
      }
      // Dead PID — clean the stale file silently before continuing.
      rmSync(pidFile, { force: true });
      rmSync(path.join(stateDir, PORT_FILE), { force: true });
    }
  } catch {
    // No PID file or unreadable — nothing to clean.
  }

  // Now check the registry for an available update.
  printStep("Checking npm registry...");
  const info = await checkForUpdate(stateDir, version, { force: true });
  if (!info) {
    printWarn("Could not reach the npm registry. Check your connection and try again.");
    printInfo(`Manual upgrade: npm install -g featherlab@latest`);
    process.exitCode = 1;
    return;
  }
  if (!info.isOutdated) {
    printStep(`Already on the latest version (${info.current})`);
    return;
  }
  printInfo(`Current: ${info.current}  →  Latest: ${info.latest}`);

  // Run npm install and stream its output directly to the terminal.
  printStep(`Installing featherlab@${info.latest}...`);
  const result = spawnSync("npm", ["install", "-g", `featherlab@${info.latest}`], {
    stdio: "inherit",
    encoding: "utf8",
  });

  if (result.error) {
    // npm itself was not found on PATH (ENOENT) or another spawn-level error.
    printError(`Could not run npm: ${result.error.message}`, {
      hint: `Is npm installed? npx featherlab@${info.latest} also works.`,
    });
    process.exitCode = 1;
    return;
  }
  if (result.status === null) {
    // npm was killed by a signal before it could exit normally.
    printError("npm was interrupted before completing.", {
      hint: `Re-run: npm install -g featherlab@${info.latest}`,
    });
    process.exitCode = 1;
    return;
  }
  if (result.status !== 0) {
    // npm exited with a nonzero code — it will have printed its own error.
    printError("npm install failed. See output above.", {
      hint: `Possible fix: sudo npm install -g featherlab@${info.latest}`,
    });
    process.exitCode = 1;
    return;
  }

  printStep(`Updated to featherlab ${info.latest}`);
  // Clear the update-check cache so the notification doesn't immediately re-fire.
  rmSync(path.join(stateDir, "update-check.json"), { force: true });

  // Warn if the running workstation container uses an image from an older release. (D5)
  // Skip this check when FEATHERLAB_IMAGE is set — the user controls the image directly.
  if (!process.env.FEATHERLAB_IMAGE) {
    try {
      const wsState = rt.containerState(); // "true" | "false" | "missing"
      if (wsState === "true" || wsState === "false") {
        const { stdout: wsOut } = spawnSync(
          "docker",
          ["inspect", "--format", "{{.Config.Image}}", rt.config.workstation],
          { encoding: "utf8" },
        );
        const wsImage = wsOut.trim();
        const expectedImage = `ghcr.io/karuifeather/featherlab-workstation:${info.latest}`;
        if (wsImage && wsImage !== expectedImage) {
          printWarn(`Workstation image does not match the new CLI version.`);
          printInfo(`  Running:  ${wsImage}`);
          printInfo(`  Expected: ${expectedImage}`);
          printInfo(`Your existing workstation has not been modified. The updated image will`);
          printInfo(`be used when a new workstation is created. Replacing the existing`);
          printInfo(`container may delete files stored only inside it.`);
        }
      }
    } catch {
      // Docker unavailable or inspect failed — skip the mismatch check.
    }
  }
}
