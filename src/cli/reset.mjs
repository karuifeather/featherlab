import { readFileSync } from "node:fs";
import path from "node:path";
import { FeatherLabError } from "../core/errors.mjs";

export const PID_FILE = "featherlab.pid";
/** Written next to the PID file by `featherlab start`, holding the server's actual port. */
export const PORT_FILE = "featherlab.port";

function readRunningServer(stateDir, isAlive) {
  let pid;
  let startTime;
  try {
    const [pidStr, startTimeStr] = readFileSync(path.join(stateDir, PID_FILE), "utf8")
      .trim()
      .split(" ");
    pid = Number(pidStr);
    startTime = startTimeStr || null;
  } catch {
    return null; // No PID file: nothing is running.
  }
  if (!Number.isFinite(pid) || pid <= 0 || !isAlive(pid, startTime)) return null;
  let port = null;
  try {
    port = Number(readFileSync(path.join(stateDir, PORT_FILE), "utf8").trim()) || null;
  } catch {
    // Unknown address; handled by the caller.
  }
  return { pid, port };
}

/**
 * `featherlab reset`. There is one authoritative path that changes the practice environment:
 * the EnvironmentSession of the running server, which serializes every operation. So when
 * featherlab is running, the reset is sent to it over HTTP; only when nothing is running
 * does the CLI build its own app and change the cluster directly.
 *
 * A server that is alive but unreachable is never bypassed: changing the cluster behind
 * its back is exactly the race this exists to prevent.
 *
 * @param {object} options
 * @param {string} options.id
 * @param {boolean} options.discardActive - `--yes`: may reset another exercise's work
 * @param {string} options.stateDir
 * @param {(pid: number, startTime: string|null) => boolean} options.isAlive
 * @param {() => {service: object, persistence: object|null}} options.createLocalApp
 * @param {typeof fetch} [options.fetch]
 * @returns {Promise<{steps: string[], via: "server"|"direct"}>}
 * @throws {FeatherLabError} with the service's code (e.g. ENVIRONMENT_IN_USE)
 */
export async function resetExercise({
  id,
  discardActive,
  stateDir,
  isAlive,
  createLocalApp,
  fetch = globalThis.fetch,
}) {
  const running = readRunningServer(stateDir, isAlive);
  if (running) {
    const refuse = (why) =>
      new FeatherLabError(
        "SERVER_UNREACHABLE",
        `featherlab is running (PID ${running.pid}) but ${why}. Refusing to change the practice environment behind its back: use Reset in the browser, or stop featherlab first.`,
      );
    if (!running.port) throw refuse("its address is unknown");
    const query = discardActive ? "?discardActive=true" : "";
    let response;
    try {
      response = await fetch(
        `http://127.0.0.1:${running.port}/api/exercises/${encodeURIComponent(id)}/reset${query}`,
        { method: "POST" },
      );
    } catch {
      throw refuse(`it did not answer on port ${running.port}`);
    }
    const body = await response.json().catch(() => ({}));
    if (!response.ok)
      throw new FeatherLabError(
        body.code ?? "INTERNAL_ERROR",
        body.error ?? `Reset failed (${response.status}).`,
        { details: body.details },
      );
    return { steps: body.steps ?? [], via: "server" };
  }

  const { service, persistence } = createLocalApp();
  try {
    const { steps } = await service.reset(id, { discardActive });
    return { steps, via: "direct" };
  } finally {
    persistence?.close();
  }
}
