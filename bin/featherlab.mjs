#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import { createApp, validateContent } from "../src/app.mjs";
import { startServer } from "../src/server.mjs";
import { createRuntime } from "../src/lib/runtime.mjs";
import { LifecycleCoordinator } from "../src/lifecycle/coordinator.mjs";
import {
  printBanner,
  printReady,
  printInfo,
  printError,
  printWarn,
  printStep,
} from "../src/cli/output.mjs";
import pkg from "../package.json" with { type: "json" };

const { version } = pkg;
const args = process.argv.slice(2);
const noOpen = args.includes("--no-open");
const cmdArgs = args.filter((a) => a !== "--no-open");
const cmd = cmdArgs[0] || "start";
const port = Number(process.env.featherlab_PORT || 4317);

function openBrowser(url) {
  const command =
    process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const flags = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  const proc = spawn(command, flags, { detached: true, stdio: "ignore" });
  proc.on("error", () => {});
  proc.unref();
}

/**
 * Returns the process start time (clock ticks since boot) from /proc/<pid>/stat.
 * The (comm) field can contain spaces and parens, so we locate it via the last ')'.
 * Returns null on non-Linux platforms or when the file is unreadable.
 *
 * PID + start time together uniquely identify a process instance: a recycled PID will
 * have a different start time, so stale PID files cannot match a new, unrelated process.
 */
function processStartTime(pid) {
  if (process.platform !== "linux") return null;
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
    const afterComm = stat.slice(stat.lastIndexOf(")") + 2);
    return afterComm.split(" ")[19]; // field 22 overall (1-indexed); index 19 after (comm)
  } catch {
    return null;
  }
}

/**
 * Returns true only if the process at `pid` is running the FeatherLab CLI entry point
 * (an argv element ends with "bin/featherlab.mjs") AND, when `expectedStartTime` is given,
 * its start time matches.
 *
 * A substring match on "featherlab" would accept any process whose argument list merely
 * mentions the name — e.g. `cat /home/user/featherlab-notes.txt`. Checking the full
 * entry-point path prevents that false positive.
 */
function isFeatherLabProcess(pid, expectedStartTime) {
  try {
    let entryPointMatches;
    if (process.platform === "linux") {
      const args = readFileSync(`/proc/${pid}/cmdline`, "utf8").split("\0").filter(Boolean);
      entryPointMatches = args.some((a) => a.endsWith("bin/featherlab.mjs"));
    } else {
      const { stdout } = spawnSync("ps", ["-p", String(pid), "-o", "args="], { encoding: "utf8" });
      entryPointMatches = stdout.includes("bin/featherlab.mjs");
    }
    if (!entryPointMatches) return false;
    if (expectedStartTime != null) {
      const actualStart = processStartTime(pid);
      if (actualStart != null && actualStart !== expectedStartTime) return false;
    }
    return true;
  } catch {
    return false;
  }
}

const cliLogger = {
  log: (msg) => printInfo(msg),
  warn: (msg) => printWarn(msg),
  error: (msg) => printError(msg),
};

async function runStart() {
  printBanner(version);
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error("featherlab_PORT must be a non-privileged TCP port.");

  const { service } = createApp();
  const runtime = createRuntime({}, { log: cliLogger });
  const coordinator = new LifecycleCoordinator({ runtime, log: cliLogger });
  // PID file path is known upfront; the file is only written after successful startup.
  const pidFile = path.join(runtime.config.stateDir, "featherlab.pid");

  let shutdownInProgress = false;
  let startupComplete = false;

  const onSignal = async () => {
    if (shutdownInProgress) {
      process.stderr.write("\nForcing exit...\n");
      process.exit(130);
    }
    shutdownInProgress = true;
    // Re-register so a second Ctrl+C during shutdown forces an immediate exit.
    process.once("SIGINT", onSignal);
    process.once("SIGTERM", onSignal);
    const errorCount = (await coordinator.requestShutdown()) ?? 0;
    try {
      rmSync(pidFile, { force: true });
    } catch {
      // Ignore — PID file may not exist if startup was interrupted.
    }
    // Exit nonzero if startup was interrupted or cleanup had errors.
    process.exit(startupComplete && errorCount === 0 ? 0 : 1);
  };
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);

  const { port: actualPort } = await coordinator.start({
    serverFactory: (p) =>
      startServer(p, {
        service,
        workstation: runtime.config.workstation,
        cluster: runtime.config.cluster,
      }),
    port,
  });

  startupComplete = true;
  try {
    const startTime = processStartTime(process.pid);
    const pidContent = startTime != null ? `${process.pid} ${startTime}` : String(process.pid);
    writeFileSync(pidFile, pidContent, { mode: 0o600 });
  } catch {
    // stateDir is created by provision(), but guard against unexpected failures.
  }
  printReady(actualPort);
  if (!noOpen) openBrowser(`http://127.0.0.1:${actualPort}`);
}

try {
  switch (cmd) {
    case "--version":
    case "-V":
      console.log(version);
      break;

    case "--help":
    case "-h":
    case "help":
      console.log(
        "featherlab [start|doctor|status|exercises|reset [id]|validate-content [dir]|stop] [--no-open]\n" +
          "featherlab --version\n\n" +
          "Environment: FEATHERLAB_IMAGE, featherlab_PORT",
      );
      break;

    case "doctor":
      process.exitCode = createRuntime().doctor() ? 0 : 1;
      break;

    case "status":
      createRuntime().status();
      break;

    case "stop": {
      const quiet = { log: () => {}, warn: () => {}, error: () => {} };
      const rt = createRuntime({}, { log: quiet });
      const pidFile = path.join(rt.config.stateDir, "featherlab.pid");

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
          rt.stop();
          printStep("Workstation stopped");
        } catch (e) {
          printStep("Workstation", { ok: false, detail: e.message });
          process.exitCode = 1;
        }
        try {
          const result = await rt.stopNodes();
          if (result.stopped.length > 0)
            printStep(`Cluster nodes stopped (${result.stopped.length})`);
          for (const { node, error } of result.errors) {
            printStep(`Stop ${node}`, { ok: false, detail: error.message });
            process.exitCode = 1;
          }
        } catch (e) {
          printWarn(`Could not check cluster nodes: ${e.message}`);
        }
      }
      break;
    }

    case "reset": {
      const id = cmdArgs[1] && !cmdArgs[1].startsWith("-") ? cmdArgs[1] : "k8s-0001";
      const { steps } = await createApp().service.reset(id);
      console.log(`Exercise ${id} reset (${steps.length} step${steps.length === 1 ? "" : "s"}).`);
      break;
    }

    case "exercises":
      for (const e of createApp().service.list())
        console.log(`${e.id}  L${e.level}  ${e.difficulty.padEnd(12)} ${e.title}`);
      break;

    case "validate-content": {
      const dir = cmdArgs[1] && !cmdArgs[1].startsWith("-") ? cmdArgs[1] : undefined;
      const result = validateContent({ contentRoot: dir });
      if (!result.ok) {
        console.error("Invalid exercise content:");
        for (const p of result.problems)
          console.error(`  - ${p.file}${p.path ? ` [${p.path}]` : ""}: ${p.message}`);
        process.exitCode = 1;
      } else {
        console.log(`Validated ${result.count} exercise${result.count === 1 ? "" : "s"}: OK`);
      }
      break;
    }

    case "start":
      await runStart();
      break;

    default:
      throw new Error(`Unknown command: ${cmd}`);
  }
} catch (error) {
  const hint = error.code === "EADDRINUSE" ? "Try: featherlab_PORT=<other-port> featherlab" : "";
  printError(error.message, { hint });
  process.exitCode = 1;
}
