// PID file and port file management for the running featherlab server.
// Canonical source for file names is reset.mjs (PID_FILE, PORT_FILE); we import from there
// so the two modules always agree on the filename strings.

import { writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import { PID_FILE, PORT_FILE } from "./reset.mjs";
import { processStartTime } from "./process-identity.mjs";

export { PID_FILE, PORT_FILE };

/**
 * Write the PID file, including the start time when available (Linux only).
 * The start time guards against PID reuse: a recycled PID will have a different start time,
 * so a stale file can never match a new, unrelated process.
 *
 * @param {string} stateDir
 */
export function writePidFile(stateDir) {
  const startTime = processStartTime(process.pid);
  const content = startTime != null ? `${process.pid} ${startTime}` : String(process.pid);
  writeFileSync(path.join(stateDir, PID_FILE), content, { mode: 0o600 });
}

/**
 * Write the port file so `featherlab reset` can reach the running server.
 *
 * @param {string} stateDir
 * @param {number} port
 */
export function writePortFile(stateDir, port) {
  writeFileSync(path.join(stateDir, PORT_FILE), String(port), { mode: 0o600 });
}

/**
 * Remove both the PID file and port file. Errors are swallowed — the files may not
 * exist if startup was interrupted before they were written.
 *
 * @param {string} stateDir
 */
export function removePidFiles(stateDir) {
  try {
    rmSync(path.join(stateDir, PID_FILE), { force: true });
    rmSync(path.join(stateDir, PORT_FILE), { force: true });
  } catch {
    // Ignore — files may not exist.
  }
}
