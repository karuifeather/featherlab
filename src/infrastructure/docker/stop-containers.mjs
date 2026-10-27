import { spawn } from "node:child_process";

/**
 * Runs `docker stop -t <timeoutSec> <names...>` in its own process group.
 *
 * Ctrl+C in a terminal delivers SIGINT to the whole foreground process group. A `docker stop`
 * child in that group dies on the user's second Ctrl+C and leaves the container running.
 * `detached: true` moves docker into a new process group, so it always runs to completion —
 * even if FeatherLab exits first. The call is async so signal handlers keep running while
 * containers stop (execFileSync would block them until docker returned).
 *
 * With `background: true` the child is unref'd and the returned promise resolves immediately;
 * use it when the process is about to exit and the stop should finish on its own.
 *
 * @param {string[]} names
 * @param {{ timeoutSec?: number, background?: boolean }} [options]
 * @returns {Promise<void>}
 */
export function stopContainers(names, { timeoutSec = 10, background = false } = {}) {
  if (names.length === 0) return Promise.resolve();
  const args = ["stop", "-t", String(timeoutSec), ...names];
  const label = `docker ${args.join(" ")}`;

  return new Promise((resolve, reject) => {
    const child = spawn("docker", args, {
      detached: true,
      stdio: ["ignore", "ignore", background ? "ignore" : "pipe"],
      // Backstop for a hung daemon; docker itself SIGKILLs the container after timeoutSec.
      timeout: (timeoutSec + 30) * 1000,
    });

    if (background) {
      child.on("error", () => {});
      child.unref();
      resolve();
      return;
    }

    let stderr = "";
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", (error) => reject(new Error(`${label}: ${error.message}`)));
    child.on("close", (code, signal) => {
      if (code === 0) return resolve();
      const details = stderr.trim() || (signal ? `killed by ${signal}` : `exit code ${code}`);
      reject(new Error(`${label}: ${details}`));
    });
  });
}
