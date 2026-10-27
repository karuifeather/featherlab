import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const bin = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../bin/featherlab.mjs");

/**
 * Run the CLI with a fake `docker` first (and only) on PATH, so it can never reach a real
 * workstation or cluster, and with a temporary FEATHERLAB_STATE_DIR, so it never opens the
 * learner's ~/.featherlab (or finds a running server's PID file there).
 *
 * The fake records its arguments. By default it answers the few kubectl reads a reset makes
 * like an empty practice cluster (`kind-featherlab` context, nothing found). With `stderr`
 * set, every call fails with that message and `exitCode`.
 */
export function cliWithFakeDocker(args, { exitCode = 0, stderr = "", env = {} } = {}) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "featherlab-fake-docker-"));
  const log = path.join(dir, "calls.log");
  const responses = stderr
    ? `echo "${stderr}" >&2\nexit ${exitCode}\n`
    : `case "$*" in
  *"config current-context"*) echo kind-featherlab ;;
  *"get --raw /readyz"*) echo ok ;;
  *"--all-namespaces"*) echo '{"items":[]}' ;;
  *" get "*" -o json"*) echo 'Error from server (NotFound): not found' >&2; exit 1 ;;
esac
exit ${exitCode}
`;
  writeFileSync(path.join(dir, "docker"), `#!/bin/sh\necho "$@" >> "${log}"\n${responses}`);
  chmodSync(path.join(dir, "docker"), 0o755);
  const result = spawnSync(process.execPath, [bin, ...args], {
    encoding: "utf8",
    // FEATHERLAB_NO_UPDATE_CHECK suppresses background network calls so tests stay fast and offline-safe.
    env: {
      ...process.env,
      FEATHERLAB_NO_UPDATE_CHECK: "1",
      FEATHERLAB_STATE_DIR: path.join(dir, "state"),
      ...env,
      PATH: dir,
    },
  });
  let calls = [];
  try {
    calls = readFileSync(log, "utf8").trim().split("\n").filter(Boolean);
  } catch {
    // The CLI never reached docker.
  }
  rmSync(dir, { recursive: true, force: true });
  return { ...result, calls };
}
