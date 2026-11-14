import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import os from "node:os";
import path from "node:path";
import { IMAGE, UPGRADE_BACKUP_SUFFIX, createRuntime } from "../../src/lib/runtime.mjs";

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
    if (
      binary === "docker" &&
      args[0] === "inspect" &&
      args[2] === "{{.State.Running}}" &&
      args[3] === "featherlab-workstation"
    )
      return "true";
    // No image mismatch — return the expected image so the upgrade path is not triggered.
    if (
      binary === "docker" &&
      args[0] === "inspect" &&
      args[2] === "{{.Config.Image}}" &&
      args[3] === "featherlab-workstation"
    )
      return IMAGE;
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
    if (
      binary === "docker" &&
      args[0] === "inspect" &&
      args[2] === "{{.State.Running}}" &&
      args[3] === "featherlab-workstation"
    )
      return "true";
    // No image mismatch — return the expected image so the upgrade path is not triggered.
    if (
      binary === "docker" &&
      args[0] === "inspect" &&
      args[2] === "{{.Config.Image}}" &&
      args[3] === "featherlab-workstation"
    )
      return IMAGE;
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

// ── Workstation image-mismatch upgrade ────────────────────────────────────────

/**
 * Build a minimal exec stub that handles the cluster/kubeconfig path and delegates
 * workstation-specific calls to `wsHandler`.
 *
 * @param {string[]} calls  shared call log
 * @param {(binary: string, args: string[]) => string} wsHandler  handles workstation docker calls
 */
function clusterStub(calls, wsHandler) {
  return (binary, args) => {
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
    return wsHandler(binary, args);
  };
}

const OLD_IMAGE = "ghcr.io/karuifeather/featherlab-workstation:0.0.1";

test("provision() upgrades a stopped workstation when the image is outdated", () => {
  const stateDir = mkdtempSync(path.join(os.tmpdir(), "featherlab-rt-upg-"));
  const calls = [];
  const backup = "featherlab-workstation" + UPGRADE_BACKUP_SUFFIX;

  const stub = clusterStub(calls, (binary, args) => {
    const cmd = `${binary} ${args.join(" ")}`;
    // containerState() — stopped
    if (
      binary === "docker" &&
      args[0] === "inspect" &&
      args[2] === "{{.State.Running}}" &&
      args[3] === "featherlab-workstation"
    )
      return "false";
    // containerImage() / upgrade image check — old image
    if (
      binary === "docker" &&
      args[0] === "inspect" &&
      args[2] === "{{.Config.Image}}" &&
      args[3] === "featherlab-workstation"
    )
      return OLD_IMAGE;
    // _upgradeWorkstation: image inspect (new image is available locally)
    if (binary === "docker" && args[0] === "image" && args[1] === "inspect") return "sha256:abc";
    // _upgradeWorkstation: check running state (stopped — no stop needed)
    // (matches above "{{.State.Running}}" featherlab-workstation branch → "false")
    // _upgradeWorkstation: docker cp backup
    if (binary === "docker" && args[0] === "cp") return "";
    // _upgradeWorkstation: rename, run, rm
    if (binary === "docker" && args[0] === "rename") return "";
    if (binary === "docker" && args[0] === "run") return "containerid";
    if (binary === "docker" && args[0] === "rm") return "";
    throw new Error(`Unexpected: ${cmd}`);
  });

  const savedImage = process.env.FEATHERLAB_IMAGE;
  delete process.env.FEATHERLAB_IMAGE;
  try {
    const rt = createRuntime(
      { stateDir },
      { exec: stub, log: { log() {}, warn() {}, error() {} } },
    );
    rt.provision();

    // Rename to backup happened
    assert.ok(
      calls.some((c) => c === `docker rename featherlab-workstation ${backup}`),
      `expected rename to backup\n  ${calls.join("\n  ")}`,
    );
    // New container created with new image
    assert.ok(
      calls.some((c) => c.startsWith("docker run -d") && c.includes(IMAGE)),
      `expected docker run with new image\n  ${calls.join("\n  ")}`,
    );
    // Backup container removed after success
    assert.ok(
      calls.some((c) => c === `docker rm ${backup}`),
      `expected backup container removal\n  ${calls.join("\n  ")}`,
    );
    // docker start of old container must NOT be called
    assert.ok(
      !calls.some((c) => c === "docker start featherlab-workstation"),
      "docker start of old container must not be called during upgrade",
    );
  } finally {
    if (savedImage !== undefined) process.env.FEATHERLAB_IMAGE = savedImage;
    rmSync(stateDir, { recursive: true, force: true });
  }
});

test("provision() stops a running workstation before upgrading", () => {
  const stateDir = mkdtempSync(path.join(os.tmpdir(), "featherlab-rt-upg2-"));
  const calls = [];

  const stub = clusterStub(calls, (binary, args) => {
    const cmd = `${binary} ${args.join(" ")}`;
    if (
      binary === "docker" &&
      args[0] === "inspect" &&
      args[2] === "{{.State.Running}}" &&
      args[3] === "featherlab-workstation"
    )
      return "true"; // running
    if (
      binary === "docker" &&
      args[0] === "inspect" &&
      args[2] === "{{.Config.Image}}" &&
      args[3] === "featherlab-workstation"
    )
      return OLD_IMAGE;
    if (binary === "docker" && args[0] === "image" && args[1] === "inspect") return "sha256:abc";
    if (binary === "docker" && args[0] === "stop") return "";
    if (binary === "docker" && args[0] === "cp") return "";
    if (binary === "docker" && args[0] === "rename") return "";
    if (binary === "docker" && args[0] === "run") return "containerid";
    if (binary === "docker" && args[0] === "rm") return "";
    throw new Error(`Unexpected: ${cmd}`);
  });

  const savedImage = process.env.FEATHERLAB_IMAGE;
  delete process.env.FEATHERLAB_IMAGE;
  try {
    const rt = createRuntime(
      { stateDir },
      { exec: stub, log: { log() {}, warn() {}, error() {} } },
    );
    rt.provision();
    assert.ok(
      calls.some((c) => c === "docker stop -t 5 featherlab-workstation"),
      `expected docker stop before upgrade\n  ${calls.join("\n  ")}`,
    );
  } finally {
    if (savedImage !== undefined) process.env.FEATHERLAB_IMAGE = savedImage;
    rmSync(stateDir, { recursive: true, force: true });
  }
});

test("provision() rolls back when new container creation fails during upgrade", () => {
  const stateDir = mkdtempSync(path.join(os.tmpdir(), "featherlab-rt-upg3-"));
  const calls = [];
  const backup = "featherlab-workstation" + UPGRADE_BACKUP_SUFFIX;

  const stub = clusterStub(calls, (binary, args) => {
    const cmd = `${binary} ${args.join(" ")}`;
    if (
      binary === "docker" &&
      args[0] === "inspect" &&
      args[2] === "{{.State.Running}}" &&
      args[3] === "featherlab-workstation"
    )
      return "false";
    if (
      binary === "docker" &&
      args[0] === "inspect" &&
      args[2] === "{{.Config.Image}}" &&
      args[3] === "featherlab-workstation"
    )
      return OLD_IMAGE;
    if (binary === "docker" && args[0] === "image" && args[1] === "inspect") return "sha256:abc";
    if (binary === "docker" && args[0] === "cp") return "";
    if (binary === "docker" && args[0] === "rename") return "";
    // Simulate docker run failing.
    if (binary === "docker" && args[0] === "run") throw new Error("simulated run failure");
    // Rollback calls: rm -f (no new container) and rename back.
    if (binary === "docker" && args[0] === "rm") return "";
    throw new Error(`Unexpected: ${cmd}`);
  });

  const savedImage = process.env.FEATHERLAB_IMAGE;
  delete process.env.FEATHERLAB_IMAGE;
  try {
    const rt = createRuntime(
      { stateDir },
      { exec: stub, log: { log() {}, warn() {}, error() {} } },
    );
    assert.throws(() => rt.provision(), /simulated run failure/);
    // The old container must be renamed back.
    assert.ok(
      calls.some((c) => c === `docker rename ${backup} featherlab-workstation`),
      `expected rollback rename\n  ${calls.join("\n  ")}`,
    );
  } finally {
    if (savedImage !== undefined) process.env.FEATHERLAB_IMAGE = savedImage;
    rmSync(stateDir, { recursive: true, force: true });
  }
});

test("provision() skips upgrade when FEATHERLAB_IMAGE is set", () => {
  const stateDir = mkdtempSync(path.join(os.tmpdir(), "featherlab-rt-upg4-"));
  const calls = [];

  const stub = clusterStub(calls, (binary, args) => {
    const cmd = `${binary} ${args.join(" ")}`;
    if (
      binary === "docker" &&
      args[0] === "inspect" &&
      args[2] === "{{.State.Running}}" &&
      args[3] === "featherlab-workstation"
    )
      return "true";
    throw new Error(`Unexpected: ${cmd}`);
  });

  const savedImage = process.env.FEATHERLAB_IMAGE;
  process.env.FEATHERLAB_IMAGE = "my-custom/image:latest";
  try {
    const rt = createRuntime(
      { stateDir },
      { exec: stub, log: { log() {}, warn() {}, error() {} } },
    );
    rt.provision();
    // No image inspect and no upgrade commands should be called.
    assert.ok(
      !calls.some((c) => c.includes("{{.Config.Image}}")),
      "image inspect must not run when FEATHERLAB_IMAGE is set",
    );
    assert.ok(
      !calls.some((c) => c.includes("rename")),
      "rename must not run when FEATHERLAB_IMAGE is set",
    );
  } finally {
    if (savedImage !== undefined) process.env.FEATHERLAB_IMAGE = savedImage;
    else delete process.env.FEATHERLAB_IMAGE;
    rmSync(stateDir, { recursive: true, force: true });
  }
});

test("provision() recovers a renamed backup container from an interrupted upgrade", () => {
  const stateDir = mkdtempSync(path.join(os.tmpdir(), "featherlab-rt-upg5-"));
  const calls = [];
  const backup = "featherlab-workstation" + UPGRADE_BACKUP_SUFFIX;

  const stub = clusterStub(calls, (binary, args) => {
    const cmd = `${binary} ${args.join(" ")}`;
    // Main workstation is missing.
    if (
      binary === "docker" &&
      args[0] === "inspect" &&
      args[2] === "{{.State.Running}}" &&
      args[3] === "featherlab-workstation"
    )
      throw new Error("No such container");
    // Backup container exists and is stopped.
    if (
      binary === "docker" &&
      args[0] === "inspect" &&
      args[2] === "{{.State.Running}}" &&
      args[3] === backup
    )
      return "false";
    if (binary === "docker" && args[0] === "rename") return "";
    if (binary === "docker" && args[0] === "start") return "";
    throw new Error(`Unexpected: ${cmd}`);
  });

  const savedImage = process.env.FEATHERLAB_IMAGE;
  delete process.env.FEATHERLAB_IMAGE;
  try {
    const rt = createRuntime(
      { stateDir },
      { exec: stub, log: { log() {}, warn() {}, error() {} } },
    );
    rt.provision();
    // Backup renamed back to main name.
    assert.ok(
      calls.some((c) => c === `docker rename ${backup} featherlab-workstation`),
      `expected rename back\n  ${calls.join("\n  ")}`,
    );
    // Container started after rename.
    assert.ok(
      calls.some((c) => c === "docker start featherlab-workstation"),
      `expected docker start after recovery\n  ${calls.join("\n  ")}`,
    );
  } finally {
    if (savedImage !== undefined) process.env.FEATHERLAB_IMAGE = savedImage;
    rmSync(stateDir, { recursive: true, force: true });
  }
});
