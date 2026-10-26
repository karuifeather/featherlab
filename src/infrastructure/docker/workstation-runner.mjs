import { execFile as nodeExecFile } from "node:child_process";
import { EnvironmentError } from "../../core/errors.mjs";
import { DEFAULT_WORKSTATION } from "../environment.mjs";

const DOCKER_LEVEL_FAILURE =
  /Cannot connect to the Docker daemon|Error response from daemon|No such container|is not running/i;
const MAX_OUTPUT_BYTES = 4 * 1024 * 1024;

/**
 * CommandRunner backed by `docker exec` into the learner workstation container.
 *
 * Contract (implemented by every runner):
 *   run(argv: string[], {stdin?, timeoutMs?, signal?}) -> {stdout, stderr, exitCode}
 *   - A non-zero exit code RESOLVES; callers decide what it means (e.g. kubectl NotFound).
 *   - Docker/container/timeout problems REJECT with EnvironmentError.
 *
 * Security notes:
 *   - argv is passed as an array to `execFile`: there is never a shell, so exercise data
 *     cannot inject commands.
 *   - Only binaries in `allowedBinaries` may run. Exercise content cannot widen this list.
 *   - This is the application's management channel. It is a separate `docker exec` from the
 *     learner's terminal session (no TTY, no login shell, no learner dotfiles). Both use the
 *     workstation's kubeconfig today; a dedicated grader credential is a planned hardening.
 */
export function createWorkstationRunner({
  container = DEFAULT_WORKSTATION,
  allowedBinaries = ["kubectl"],
  execFile = nodeExecFile,
} = {}) {
  return {
    run(argv, { stdin, timeoutMs = 30_000, signal } = {}) {
      if (!allowedBinaries.includes(argv[0]))
        return Promise.reject(new Error(`Binary "${argv[0]}" is not permitted.`));
      const args = ["exec", ...(stdin === undefined ? [] : ["-i"]), container, ...argv];
      return new Promise((resolve, reject) => {
        const child = execFile(
          "docker",
          args,
          { encoding: "utf8", timeout: timeoutMs, signal, maxBuffer: MAX_OUTPUT_BYTES },
          (error, stdout = "", stderr = "") => {
            if (!error) return resolve({ stdout, stderr, exitCode: 0 });
            if (error.code === "ENOENT")
              return reject(
                new EnvironmentError("The Docker CLI was not found.", { reason: "unavailable" }),
              );
            if (error.name === "AbortError" || error.killed || error.signal)
              return reject(
                new EnvironmentError("The command timed out.", { reason: "timeout", cause: error }),
              );
            if (typeof error.code === "number") {
              if (DOCKER_LEVEL_FAILURE.test(stderr))
                return reject(
                  new EnvironmentError(
                    "The practice workstation is not reachable. Is featherlab running?",
                    { reason: "unavailable", details: { stderr: stderr.slice(0, 300) } },
                  ),
                );
              return resolve({ stdout, stderr, exitCode: error.code });
            }
            reject(new EnvironmentError("Could not run the command.", { cause: error }));
          },
        );
        if (stdin !== undefined) {
          // EPIPE races with fast child exit (process closes the read end before we write).
          // The execFile callback handles the exit outcome; silence the socket error.
          child.stdin.on?.("error", () => {});
          child.stdin.end(stdin);
        }
      });
    },
  };
}
