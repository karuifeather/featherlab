import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import os from "node:os";
import path from "node:path";
import { IMAGE, createRuntime } from "../../src/lib/runtime.mjs";

const pkgPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../package.json");
const { version } = JSON.parse(readFileSync(pkgPath, "utf8"));

test("IMAGE default derives from package.json version", () => {
  if (!process.env.FEATHERLAB_IMAGE) {
    assert.ok(
      IMAGE.endsWith(`:${version}`),
      `Expected IMAGE to end with ":${version}", got: "${IMAGE}"`,
    );
  }
});

test("FEATHERLAB_IMAGE env var override is respected when set", () => {
  if (process.env.FEATHERLAB_IMAGE) {
    assert.equal(IMAGE, process.env.FEATHERLAB_IMAGE);
  }
});

// ── Startup: stopped kind nodes are restarted ─────────────────────────────────

test("provision() starts stopped kind node containers when cluster already exists", () => {
  const stateDir = mkdtempSync(path.join(os.tmpdir(), "featherlab-rt-"));
  const calls = [];

  // Minimal exec stub: cluster exists, one node is stopped, workstation is running.
  const stub = (binary, args) => {
    const cmd = `${binary} ${args.join(" ")}`;
    calls.push(cmd);
    if (binary === "docker" && args[0] === "--version") return "Docker version 27.0.0";
    if (binary === "docker" && args[0] === "info") return "27.0.0";
    if (binary === "kind" && args[0] === "version") return "kind v0.25.0";
    if (binary === "kind" && args[0] === "get" && args[1] === "clusters") return "featherlab";
    if (binary === "kind" && args[0] === "get" && args[1] === "nodes")
      return "featherlab-control-plane";
    if (
      binary === "docker" &&
      args[0] === "inspect" &&
      args[2] === "{{.State.Running}}" &&
      args[3] === "featherlab-control-plane"
    )
      return "false";
    if (binary === "docker" && args[0] === "start" && args[1] === "featherlab-control-plane")
      return "";
    if (binary === "kind" && args[0] === "get" && args[1] === "kubeconfig")
      return "apiVersion: v1\n";
    if (binary === "docker" && args[0] === "inspect" && args[3] === "featherlab-workstation")
      return "true";
    throw new Error(`Unexpected command: ${cmd}`);
  };

  try {
    const rt = createRuntime(
      { stateDir },
      { exec: stub, log: { log() {}, warn() {}, error() {} } },
    );
    rt.provision();
    // The key assertion: docker start was called for the stopped kind node.
    assert.ok(
      calls.some((c) => c === "docker start featherlab-control-plane"),
      `Expected "docker start featherlab-control-plane" in calls:\n  ${calls.join("\n  ")}`,
    );
  } finally {
    rmSync(stateDir, { recursive: true, force: true });
  }
});

test("provision() skips docker start when kind node is already running", () => {
  const stateDir = mkdtempSync(path.join(os.tmpdir(), "featherlab-rt2-"));
  const calls = [];

  const stub = (binary, args) => {
    const cmd = `${binary} ${args.join(" ")}`;
    calls.push(cmd);
    if (binary === "docker" && args[0] === "--version") return "Docker version 27.0.0";
    if (binary === "docker" && args[0] === "info") return "27.0.0";
    if (binary === "kind" && args[0] === "version") return "kind v0.25.0";
    if (binary === "kind" && args[0] === "get" && args[1] === "clusters") return "featherlab";
    if (binary === "kind" && args[0] === "get" && args[1] === "nodes")
      return "featherlab-control-plane";
    if (
      binary === "docker" &&
      args[0] === "inspect" &&
      args[2] === "{{.State.Running}}" &&
      args[3] === "featherlab-control-plane"
    )
      return "true";
    if (binary === "kind" && args[0] === "get" && args[1] === "kubeconfig")
      return "apiVersion: v1\n";
    if (binary === "docker" && args[0] === "inspect" && args[3] === "featherlab-workstation")
      return "true";
    throw new Error(`Unexpected command: ${cmd}`);
  };

  try {
    const rt = createRuntime(
      { stateDir },
      { exec: stub, log: { log() {}, warn() {}, error() {} } },
    );
    rt.provision();
    assert.ok(
      !calls.some((c) => c === "docker start featherlab-control-plane"),
      "docker start should NOT be called when node is already running",
    );
  } finally {
    rmSync(stateDir, { recursive: true, force: true });
  }
});
