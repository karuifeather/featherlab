/**
 * Upgrade compatibility: v0.1.2 → M2
 *
 * Verifies that a Kubernetes cluster, workstation container, and state directory
 * created by v0.1.2 survive the upgrade to M2 without modification. All exec
 * calls are intercepted; no real cluster, container, or ~/.featherlab is touched.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_CLUSTER,
  DEFAULT_WORKSTATION,
  DEFAULT_STATE_DIR,
} from "../../src/infrastructure/environment.mjs";
import { createRuntime } from "../../src/lib/runtime.mjs";

const bin = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../bin/featherlab.mjs");
const quiet = { log() {}, error() {} };

// Simulates the exec surface left by a v0.1.2 install: cluster "featherlab" exists,
// workstation is either running ("true") or stopped ("false").
function fakeV012Exec({ containerState = "true" } = {}) {
  const calls = [];
  function exec(binary, args) {
    calls.push({ binary, args: [...args] });
    if (binary === "docker" && args[0] === "--version") return "Docker version 26.0.0\n";
    if (binary === "docker" && args[0] === "info") return "26.0.0\n";
    if (binary === "kind" && args[0] === "version") return "kind v0.24.0 go1.22\n";
    if (binary === "kind" && args[0] === "get" && args[1] === "clusters") return "featherlab\n";
    if (binary === "kind" && args[0] === "get" && args[1] === "kubeconfig")
      return "apiVersion: v1\n";
    if (binary === "docker" && args[0] === "inspect" && args[2]?.includes("State.Running"))
      return `${containerState}\n`;
    if (binary === "docker" && args[0] === "start") return "";
    throw new Error(`Unexpected call in upgrade test: ${binary} ${args.join(" ")}`);
  }
  const mutating = () =>
    calls.filter(
      (c) =>
        (c.binary === "kind" && ["create", "delete"].includes(c.args[0])) ||
        (c.binary === "docker" && ["run", "rm", "stop", "start", "pull"].includes(c.args[0])),
    );
  return { exec, calls, mutating };
}

// Runs the CLI with a fake `docker` (and no `kind`) on PATH so no real environment is reached.
function cliWithFakeDocker(args, { dockerExitCode = 0, dockerStderr = "", env = {} } = {}) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "featherlab-upgrade-cli-"));
  const log = path.join(dir, "calls.log");
  writeFileSync(
    path.join(dir, "docker"),
    `#!/bin/sh\necho "$@" >> "${log}"\n${dockerStderr ? `echo "${dockerStderr}" >&2\n` : ""}exit ${dockerExitCode}\n`,
  );
  chmodSync(path.join(dir, "docker"), 0o755);
  const result = spawnSync(process.execPath, [bin, ...args], {
    encoding: "utf8",
    env: { ...process.env, ...env, PATH: dir },
  });
  let dockerCalls = [];
  try {
    dockerCalls = readFileSync(log, "utf8").trim().split("\n").filter(Boolean);
  } catch {
    /* docker was never reached */
  }
  rmSync(dir, { recursive: true, force: true });
  return { ...result, dockerCalls };
}

// ─── Naming constants ─────────────────────────────────────────────────────────

test("cluster name is unchanged from v0.1.2", () => {
  assert.equal(DEFAULT_CLUSTER, "featherlab");
});

test("workstation container name is unchanged from v0.1.2", () => {
  assert.equal(DEFAULT_WORKSTATION, "featherlab-workstation");
});

test("state directory is unchanged from v0.1.2", () => {
  assert.equal(DEFAULT_STATE_DIR, path.join(os.homedir(), ".featherlab"));
});

// ─── provision() reuse path ───────────────────────────────────────────────────

test("provision() reuses a running v0.1.2 workstation without recreating it", () => {
  const stateDir = mkdtempSync(path.join(os.tmpdir(), "featherlab-upgrade-"));
  try {
    const { exec, mutating } = fakeV012Exec({ containerState: "true" });
    createRuntime({ stateDir }, { exec, log: quiet }).provision();

    const ops = mutating();
    assert.ok(
      !ops.some((c) => c.binary === "kind" && c.args[0] === "create"),
      "must not recreate the kind cluster",
    );
    assert.ok(
      !ops.some((c) => c.binary === "docker" && c.args[0] === "run"),
      "must not recreate the workstation container",
    );
  } finally {
    rmSync(stateDir, { recursive: true, force: true });
  }
});

test("provision() restarts a stopped v0.1.2 workstation with docker start, not docker run", () => {
  const stateDir = mkdtempSync(path.join(os.tmpdir(), "featherlab-upgrade-"));
  try {
    const { exec, calls } = fakeV012Exec({ containerState: "false" });
    createRuntime({ stateDir }, { exec, log: quiet }).provision();

    const starts = calls.filter((c) => c.binary === "docker" && c.args[0] === "start");
    assert.equal(starts.length, 1, "exactly one docker start");
    assert.equal(starts[0].args[1], DEFAULT_WORKSTATION, "targets the production workstation");

    const runs = calls.filter((c) => c.binary === "docker" && c.args[0] === "run");
    assert.equal(runs.length, 0, "no docker run when container already exists");
  } finally {
    rmSync(stateDir, { recursive: true, force: true });
  }
});

test("provision() does not touch the user's real workstation or cluster names", () => {
  // Even with a running v0.1.2 environment, the names addressed must be the production ones.
  const stateDir = mkdtempSync(path.join(os.tmpdir(), "featherlab-upgrade-"));
  try {
    const { exec, calls } = fakeV012Exec({ containerState: "true" });
    createRuntime({ stateDir }, { exec, log: quiet }).provision();

    for (const { binary, args } of calls) {
      // No call should reference any name other than the production defaults.
      if (binary === "docker" && args.includes("--name"))
        assert.equal(args[args.indexOf("--name") + 1], DEFAULT_WORKSTATION);
      if (binary === "kind" && args.includes("--name"))
        assert.equal(args[args.indexOf("--name") + 1], DEFAULT_CLUSTER);
    }
  } finally {
    rmSync(stateDir, { recursive: true, force: true });
  }
});

// ─── State directory layout ───────────────────────────────────────────────────

test("provision() writes workstation-kubeconfig at the same stateDir path as v0.1.2", () => {
  const stateDir = mkdtempSync(path.join(os.tmpdir(), "featherlab-upgrade-"));
  try {
    const { exec } = fakeV012Exec({ containerState: "true" });
    createRuntime({ stateDir }, { exec, log: quiet }).provision();

    const kc = path.join(stateDir, "workstation-kubeconfig");
    assert.ok(existsSync(kc), "workstation-kubeconfig must exist after provision()");
    assert.equal(readFileSync(kc, "utf8"), "apiVersion: v1\n");
  } finally {
    rmSync(stateDir, { recursive: true, force: true });
  }
});

test("provision() leaves pre-existing v0.1.2 state files intact", () => {
  const stateDir = mkdtempSync(path.join(os.tmpdir(), "featherlab-upgrade-"));
  const hostKubeconfig = path.join(stateDir, "host-kubeconfig");
  const ORIGINAL = "apiVersion: v1\nclusters: []\n# written by v0.1.2\n";
  writeFileSync(hostKubeconfig, ORIGINAL, { mode: 0o600 });

  try {
    const { exec } = fakeV012Exec({ containerState: "true" });
    createRuntime({ stateDir }, { exec, log: quiet }).provision();

    assert.ok(existsSync(hostKubeconfig), "host-kubeconfig must still exist");
    assert.equal(
      readFileSync(hostKubeconfig, "utf8"),
      ORIGINAL,
      "host-kubeconfig must be unchanged",
    );
  } finally {
    rmSync(stateDir, { recursive: true, force: true });
  }
});

// ─── CLI backward compatibility ───────────────────────────────────────────────

test("`reset` (no-arg) in M2 deletes the same resource v0.1.2 reset did: pod/web in default", () => {
  // v0.1.2: kubectl -n default delete pod web --ignore-not-found=true --wait=false
  // M2 k8s-0001: kubectl delete pods web -n default --ignore-not-found=true ...
  const out = cliWithFakeDocker(["reset"]);
  assert.equal(out.status, 0, out.stderr);
  const deletes = out.dockerCalls.filter((c) => c.includes(" delete "));
  assert.equal(deletes.length, 1, "exactly one delete on a no-arg reset");
  assert.match(
    deletes[0],
    /exec featherlab-workstation kubectl delete pods web -n default /,
    "must target pod/web in the default namespace",
  );
});

test("`reset` (no-arg) only addresses the workstation, never a raw Docker or kind resource", () => {
  const out = cliWithFakeDocker(["reset"]);
  assert.equal(out.status, 0, out.stderr);
  assert.ok(
    out.dockerCalls.every((c) => c.startsWith("exec featherlab-workstation kubectl ")),
    "every docker call must be exec-into-workstation",
  );
});

test("v0.1.2 commands are all present in M2 help output", () => {
  // v0.1.2 had: start | doctor | status | reset | stop
  const out = cliWithFakeDocker(["help"]);
  assert.equal(out.status, 0);
  for (const cmd of ["start", "doctor", "status", "reset", "stop"])
    assert.ok(out.stdout.includes(cmd), `help must document "${cmd}"`);
});

test("`exercises` and `validate-content` are available and work offline (new in M2)", () => {
  const ex = cliWithFakeDocker(["exercises"]);
  assert.equal(ex.status, 0, ex.stderr);
  assert.match(ex.stdout, /k8s-0001/);
  assert.deepEqual(ex.dockerCalls, [], "exercises must not contact Docker");

  const vc = cliWithFakeDocker(["validate-content"]);
  assert.equal(vc.status, 0, vc.stderr);
  assert.match(vc.stdout, /Validated/);
  assert.deepEqual(vc.dockerCalls, [], "validate-content must not contact Docker");
});
