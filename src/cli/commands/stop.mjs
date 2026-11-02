// `featherlab stop` — gracefully stop a running featherlab, or stop Docker/kind resources directly.
//
// Strategy:
//   1. Read the PID file. If a featherlab process is alive, send SIGTERM and wait up to 15 s
//      for it to exit cleanly (it owns the lifecycle coordinator and will stop containers).
//   2. If no PID file, the process already exited, or it did not stop in time, stop
//      the workstation and cluster nodes directly via the runtime.

import path from "node:path";
import { readFileSync } from "node:fs";
import { createRuntime } from "../../lib/runtime.mjs";
import { PID_FILE } from "../reset.mjs";
import { isFeatherLabProcess } from "../process-identity.mjs";
import { printInfo, printWarn, printStep } from "../output.mjs";

/**
 * @param {object} _ctx  unused — stop reads stateDir from runtime.config directly
 */
export async function run() {
  const quiet = { log: () => {}, warn: () => {}, error: () => {} };
  const rt = createRuntime({}, { log: quiet });
  const pidFile = path.join(rt.config.stateDir, PID_FILE);

  // If a featherlab process is running, signal it to shut down gracefully.
  // It owns its resources (server, workstation, cluster nodes) and will stop them
  // through the lifecycle coordinator, including removing the PID file.
  let signaled = false;
  try {
    const [pidStr, startTimeStr] = readFileSync(pidFile, "utf8").trim().split(" ");
    const pid = Number(pidStr);
    const expectedStartTime = startTimeStr || null;
    if (Number.isFinite(pid) && pid > 0 && isFeatherLabProcess(pid, expectedStartTime)) {
      process.kill(pid, "SIGTERM");
      signaled = true;
      printInfo(`Sent stop signal to running featherlab (PID ${pid})...`);
      let processExited = false;
      const deadline = Date.now() + 15_000;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 500));
        try {
          process.kill(pid, 0); // throws ESRCH if the process is gone
        } catch {
          processExited = true;
          break;
        }
      }
      if (processExited) {
        printStep("featherlab stopped gracefully");
      } else {
        printWarn(
          "Running featherlab did not stop within 15 seconds; stopping resources directly.",
        );
        signaled = false;
      }
    }
  } catch {
    // No PID file, ENOENT, or ESRCH (process already gone) — direct Docker stop below.
  }

  if (!signaled) {
    try {
      await rt.stop();
      printStep("Workstation stopped");
    } catch (e) {
      printStep("Workstation", { ok: false, detail: e.message });
      process.exitCode = 1;
    }
    try {
      const result = await rt.stopNodes();
      if (result.stopped.length > 0) printStep(`Cluster nodes stopped (${result.stopped.length})`);
      for (const { node, error } of result.errors) {
        printStep(`Stop ${node}`, { ok: false, detail: error.message });
        process.exitCode = 1;
      }
    } catch (e) {
      printWarn(`Could not check cluster nodes: ${e.message}`);
    }
  }
}
