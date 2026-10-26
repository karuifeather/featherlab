import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const bin = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../bin/featherlab.mjs");

/**
 * The CLI is exercised with a fake `docker` first on PATH, so these tests can never reach
 * a real workstation or cluster. The fake records its arguments and exits with a
 * configurable code and stderr.
 */
function cliWithFakeDocker(args, { exitCode = 0, stderr = "", env = {} } = {}) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "featherlab-fake-docker-"));
  const log = path.join(dir, "calls.log");
  writeFileSync(
    path.join(dir, "docker"),
    `#!/bin/sh\necho "$@" >> "${log}"\n${stderr ? `echo "${stderr}" >&2\n` : ""}exit ${exitCode}\n`,
  );
  chmodSync(path.join(dir, "docker"), 0o755);
  const result = spawnSync(process.execPath, [bin, ...args], {
    encoding: "utf8",
    env: { ...process.env, ...env, PATH: dir },
  });
  let calls = [];
  try {
    calls = readFileSync(log, "utf8").trim().split("\n");
  } catch {
    // The CLI never reached docker.
  }
  return { ...result, calls };
}

test("`exercises` lists the packaged exercises without any environment", () => {
  const out = cliWithFakeDocker(["exercises"]);
  assert.equal(out.status, 0);
  assert.match(out.stdout, /k8s-0001\s+L0\s+beginner\s+Your first Pod/);
  assert.match(out.stdout, /k8s-0002/);
  assert.deepEqual(out.calls, []);
});

test("`reset` defaults to k8s-0001 and only deletes that exercise's Pod", () => {
  const out = cliWithFakeDocker(["reset"]);
  assert.equal(out.status, 0, out.stderr);
  assert.match(out.stdout, /Exercise k8s-0001 reset/);
  const deletes = out.calls.filter((c) => c.includes(" delete "));
  assert.equal(deletes.length, 1);
  assert.match(deletes[0], /^exec featherlab-workstation kubectl delete pods web -n default /);
  assert.ok(out.calls.every((c) => c.startsWith("exec featherlab-workstation kubectl ")));
});

test("`reset <id>` resets the named exercise and nothing else", () => {
  const out = cliWithFakeDocker(["reset", "k8s-0002"]);
  assert.equal(out.status, 0, out.stderr);
  const deletes = out.calls.filter((c) => c.includes(" delete "));
  assert.equal(deletes.length, 1);
  assert.match(deletes[0], /deployments\.apps api -n staging /);
});

test("`reset` with an unknown id fails without touching docker", () => {
  const out = cliWithFakeDocker(["reset", "nope"]);
  assert.equal(out.status, 1);
  assert.match(out.stderr, /does not exist|not found/i);
  assert.deepEqual(out.calls, []);
});

test("`reset` exits non-zero with a clear message when the workstation is unreachable", () => {
  const out = cliWithFakeDocker(["reset"], {
    exitCode: 1,
    stderr: "Error response from daemon: No such container: featherlab-workstation",
  });
  assert.equal(out.status, 1);
  assert.match(out.stderr, /workstation is not reachable/);
  assert.ok(
    out.calls.every((c) => !c.includes(" delete ")),
    "no deletion was attempted",
  );
});

test("unknown commands exit non-zero", () => {
  const out = cliWithFakeDocker(["bogus"]);
  assert.equal(out.status, 1);
  assert.match(out.stderr, /Unknown command: bogus/);
});

test("`help` documents every command and the environment overrides", () => {
  const out = cliWithFakeDocker(["help"]);
  assert.equal(out.status, 0);
  for (const word of [
    "start",
    "doctor",
    "status",
    "exercises",
    "reset",
    "validate-content",
    "stop",
  ])
    assert.ok(out.stdout.includes(word), word);
  assert.match(out.stdout, /FEATHERLAB_IMAGE/);
  assert.match(out.stdout, /featherlab_PORT/);
});

test("`doctor` exits non-zero when Docker is unavailable", () => {
  const out = cliWithFakeDocker(["doctor"], { exitCode: 1, stderr: "Cannot connect" });
  assert.equal(out.status, 1);
});

test("`start` rejects an invalid featherlab_PORT before any Docker work", () => {
  for (const port of ["80", "abc", "70000"]) {
    const out = cliWithFakeDocker(["start", "--no-open"], { env: { featherlab_PORT: port } });
    assert.equal(out.status, 1, port);
    assert.match(out.stderr, /featherlab_PORT must be a non-privileged TCP port/);
    assert.deepEqual(out.calls, [], "provisioning must not start");
  }
});
