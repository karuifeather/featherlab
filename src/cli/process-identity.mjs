// Process identity helpers: detect and validate a running featherlab instance.
// Used by `stop` (to decide whether to signal) and by `reset` (injected as `isAlive`).

import { readFileSync, realpathSync } from "node:fs";
import { spawnSync } from "node:child_process";

/**
 * Returns the process start time (clock ticks since boot) from /proc/<pid>/stat.
 * The (comm) field can contain spaces and parens, so we locate it via the last ')'.
 * Returns null on non-Linux platforms or when the file is unreadable.
 *
 * PID + start time together uniquely identify a process instance: a recycled PID will
 * have a different start time, so stale PID files cannot match a new, unrelated process.
 *
 * @param {number} pid
 * @returns {string|null}
 */
export function processStartTime(pid) {
  if (process.platform !== "linux") return null;
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
    const afterComm = stat.slice(stat.lastIndexOf(")") + 2);
    return afterComm.split(" ")[19]; // field 22 overall (1-indexed); index 19 after (comm)
  } catch {
    return null;
  }
}

const isEntryPoint = (arg) => arg.endsWith("bin/featherlab.mjs");

function resolvedPath(arg) {
  try {
    return realpathSync(arg);
  } catch {
    return arg;
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
 *
 * @param {number} pid
 * @param {string|null} expectedStartTime
 * @returns {boolean}
 */
export function isFeatherLabProcess(pid, expectedStartTime) {
  try {
    let entryPointMatches;
    if (process.platform === "linux") {
      const args = readFileSync(`/proc/${pid}/cmdline`, "utf8").split("\0").filter(Boolean);
      // A global npm install runs through a symlink (e.g. /usr/local/bin/featherlab).
      entryPointMatches = args.some((a) => isEntryPoint(a) || isEntryPoint(resolvedPath(a)));
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
