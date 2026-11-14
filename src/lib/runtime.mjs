import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync, chmodSync } from "node:fs";
import path from "node:path";
import {
  DEFAULT_CLUSTER,
  DEFAULT_IMAGE,
  DEFAULT_STATE_DIR,
  DEFAULT_WORKSTATION,
  resolveEnvironment,
} from "../infrastructure/environment.mjs";
import {
  getClusterNodes,
  getOwnedClusterNodes,
  stopClusterNodes,
} from "../infrastructure/docker/kind-nodes.mjs";
import { stopContainers } from "../infrastructure/docker/stop-containers.mjs";

// Kept for existing importers; new code should take an EnvironmentConfig instead.
export const CLUSTER = DEFAULT_CLUSTER;
export const WORKSTATION = DEFAULT_WORKSTATION;
export const IMAGE = DEFAULT_IMAGE;
export const STATE = DEFAULT_STATE_DIR;
const NODE_IMAGE =
  "kindest/node:v1.37.0@sha256:a1ed56cfb0e7b93589bdf97c8cd566405a265939e3620fc4f5de89adff580ae5";
// The workstation's PID 1 is `sleep infinity`, which ignores SIGTERM, so `docker stop` always
// waits out the full grace period before SIGKILL. Nothing inside needs a graceful shutdown —
// the container filesystem survives SIGKILL — so keep the wait short.
const WORKSTATION_STOP_TIMEOUT_SEC = 1;

export function run(binary, args, options = {}) {
  try {
    return execFileSync(binary, args, {
      encoding: "utf8",
      timeout: options.timeout ?? 180000,
      stdio: options.stdio ?? ["ignore", "pipe", "pipe"],
      ...options,
    });
  } catch (error) {
    const details = error.stderr?.toString().trim() || error.message;
    throw new Error(`${binary} ${args.join(" ")}: ${details}`);
  }
}

/**
 * Builds the `docker run` arguments for a workstation container so both initial
 * creation and post-upgrade creation use an identical spec and can't drift.
 *
 * @param {import('../infrastructure/environment.mjs').EnvironmentConfig} config
 * @param {string} kubeconfigPath  absolute path to the host kubeconfig file
 * @returns {string[]}
 */
function buildWorkstationRunArgs(config, kubeconfigPath) {
  return [
    "--name",
    config.workstation,
    ...Object.entries(config.labels).flatMap(([key, value]) => ["--label", `${key}=${value}`]),
    // An init process as PID 1 reaps orphans. Programs left behind by a closed terminal
    // would otherwise stay as zombies and count against the pids limit below.
    "--init",
    "--network",
    "kind",
    "--security-opt",
    "no-new-privileges",
    "--cap-drop",
    "ALL",
    "--pids-limit",
    "256",
    "--memory",
    "512m",
    "--user",
    "learner",
    "-e",
    "KUBECONFIG=/home/learner/.kube/config",
    "--mount",
    `type=bind,src=${kubeconfigPath},dst=/home/learner/.kube/base-config,readonly`,
    config.image,
  ];
}

/** Suffix appended to the original container name during an in-progress upgrade. */
export const UPGRADE_BACKUP_SUFFIX = "-pre-upgrade";

/**
 * Safely upgrade the workstation container to `config.image` while preserving
 * `/home/learner` from the old container.
 *
 * Recovery contract: a `<name>-pre-upgrade` container is the durable checkpoint.
 * If this function throws after the rename step, the caller MUST check for that
 * container and rename it back — `provision()` does this automatically.
 *
 * Order of operations:
 *   1. Ensure the target image is available locally (pull if not).
 *   2. Stop the existing container if running.
 *   3. `docker cp` /home/learner from old container to a host backup directory.
 *   4. `docker rename` the old container to `<name>-pre-upgrade` (safe checkpoint).
 *   5. `docker run -d` the new container with the new image.
 *   6. `docker cp` the backup back into the new container's /home/learner.
 *   7. `docker rm` the renamed backup container.
 *
 * On any failure after step 4: the new container is force-removed (if created)
 * and the old one is renamed back.  The host backup directory is kept regardless.
 *
 * @param {import('../infrastructure/environment.mjs').EnvironmentConfig} config
 * @param {string} kubeconfigPath
 * @param {(binary: string, args: string[], options?: object) => string} exec
 * @param {{ log: Function, warn: Function, error: Function }} log
 * @returns {{ backupDir: string }}
 */
function _upgradeWorkstation(config, kubeconfigPath, exec, log) {
  const name = config.workstation;
  const backup = name + UPGRADE_BACKUP_SUFFIX;
  const backupDir = path.join(config.stateDir, "workstation-home-backup");

  // ── 1. Ensure target image is available ───────────────────────────────────
  let imageLocal = false;
  try {
    exec("docker", ["image", "inspect", "--format", "{{.Id}}", config.image]);
    imageLocal = true;
  } catch {
    // Not available locally.
  }
  if (!imageLocal) {
    log.log(`Pulling updated workstation image: ${config.image}`);
    exec("docker", ["pull", config.image], { timeout: 360000, stdio: "inherit" });
  }

  // ── 2. Stop existing container if running ─────────────────────────────────
  let wsRunning = "";
  try {
    wsRunning = exec("docker", ["inspect", "--format", "{{.State.Running}}", name]).trim();
  } catch {
    // Container doesn't exist — handled later.
  }
  if (wsRunning === "true") {
    log.log("Stopping workstation for upgrade...");
    exec("docker", ["stop", "-t", "5", name]);
  }

  // ── 3. Back up /home/learner to the host ──────────────────────────────────
  log.log("Backing up learner files...");
  // Remove any stale backup dir from a previous partial attempt.
  rmSync(backupDir, { recursive: true, force: true });
  mkdirSync(backupDir, { recursive: true });
  // "container:/home/learner/." — trailing dot = copy *contents* of /home/learner into backupDir.
  exec("docker", ["cp", `${name}:/home/learner/.`, backupDir]);

  // ── 4–7: Rename → create → restore → cleanup (with rollback on failure) ───
  let newCreated = false;
  try {
    // 4. Safe checkpoint: rename old container.
    exec("docker", ["rename", name, backup]);

    // 5. Create the new container with the target image.
    exec("docker", ["run", "-d", ...buildWorkstationRunArgs(config, kubeconfigPath)]);
    newCreated = true;

    // 6. Restore /home/learner into the new container.
    //    Non-fatal: the container is fully usable even if restore fails; the host
    //    backup preserves the files for manual recovery.
    log.log("Restoring learner files to upgraded workstation...");
    try {
      // "backupDir/." — trailing dot = copy *contents* of backupDir into /home/learner.
      exec("docker", ["cp", `${backupDir}/.`, `${name}:/home/learner`]);
    } catch (restoreErr) {
      log.warn(`Could not restore all files: ${restoreErr.message}`);
      log.warn(`Your files are safely backed up at: ${backupDir}`);
    }

    // 7. Remove the renamed backup container now that upgrade is confirmed good.
    exec("docker", ["rm", backup]);
  } catch (error) {
    // Rollback: remove the new container if it was created, then rename the old one back.
    if (newCreated) {
      try {
        exec("docker", ["rm", "-f", name]);
      } catch {
        // Best effort.
      }
    }
    try {
      exec("docker", ["rename", backup, name]);
    } catch {
      // Best effort.
    }
    throw error;
  }

  return { backupDir };
}

/**
 * Returns true when the existing workstation container uses the old readonly bind mount at
 * /home/learner/.kube/config instead of the new base-config path. Uses docker inspect so it
 * works whether the container is running or stopped. Non-fatal: returns false on any error.
 */
function _needsMountMigration(config, exec) {
  try {
    const raw = exec("docker", [
      "inspect",
      "--format",
      "{{json .Mounts}}",
      config.workstation,
    ]).trim();
    const mounts = JSON.parse(raw);
    return (
      !Array.isArray(mounts) ||
      !mounts.some((m) => m.Destination === "/home/learner/.kube/base-config")
    );
  } catch {
    return false;
  }
}

/**
 * Seeds /home/learner/.kube/config from the read-only base-config mount when missing or when
 * the cluster was recreated (server address changed). Preserves learner customisations (e.g.
 * a default namespace) across normal restarts. Non-fatal: silently skips on any error.
 */
function _seedLearnerKubeconfig(config, exec) {
  try {
    exec("docker", ["exec", config.workstation, "test", "-f", "/home/learner/.kube/base-config"]);
  } catch {
    return; // base-config absent (old layout, container unavailable, etc.) — skip
  }
  try {
    const serverLine = (file) =>
      exec("docker", [
        "exec",
        config.workstation,
        "sh",
        "-c",
        `grep -m1 'server:' /home/learner/.kube/${file} 2>/dev/null`,
      ]).trim();
    const baseServer = serverLine("base-config");
    let configServer;
    try {
      configServer = serverLine("config");
    } catch {
      /* config does not exist yet */
    }
    if (baseServer && baseServer === configServer) return; // already up to date
    exec("docker", [
      "exec",
      config.workstation,
      "cp",
      "/home/learner/.kube/base-config",
      "/home/learner/.kube/config",
    ]);
  } catch {
    // Non-fatal: learner will see kubectl errors and can manually copy the file
  }
}

/**
 * Docker/kind provisioning for one environment. `exec(binary, args, options)` and
 * `stopper(names, options)` are injectable so tests can verify exactly which commands would
 * run without running them.
 */
export function createRuntime(
  overrides = {},
  { exec = run, stopper = stopContainers, log = console } = {},
) {
  const config = resolveEnvironment(overrides);

  function doctor() {
    const checks = [
      ["Docker CLI", () => exec("docker", ["--version"])],
      ["Docker daemon", () => exec("docker", ["info", "--format", "{{.ServerVersion}}"])],
      ["kind", () => exec("kind", ["version"])],
    ];
    let ok = true;
    for (const [name, check] of checks) {
      try {
        log.log(`  ✓ ${name}: ${String(check()).trim()}`);
      } catch (error) {
        log.error(`  ✗ ${name}: ${error.message}`);
        ok = false;
      }
    }
    return ok;
  }

  function containerState() {
    try {
      return exec("docker", [
        "inspect",
        "--format",
        "{{.State.Running}}",
        config.workstation,
      ]).trim();
    } catch {
      return "missing";
    }
  }

  function clusterExists() {
    return exec("kind", ["get", "clusters"]).trim().split(/\s+/).includes(config.cluster);
  }

  function provision() {
    if (!doctor()) throw new Error("Install or start Docker and kind. See README prerequisites.");
    mkdirSync(config.stateDir, { recursive: true, mode: 0o700 });
    if (!clusterExists()) {
      log.log("Creating isolated kind cluster (first launch may download images)...");
      // execFileSync blocks the Node.js event loop, so a SIGINT that arrives during this call
      // cannot be processed until the child exits. In practice this is safe: pressing Ctrl+C
      // in a terminal delivers SIGINT to the entire foreground process group, so kind also
      // receives it, exits, and unblocks execFileSync. The signal handler then runs, the
      // coordinator transitions to "failed", and the process exits nonzero. A SIGTERM sent
      // programmatically (e.g. featherlab stop) is delayed until the exec returns — document
      // this as a known limitation for long-running provisions.
      exec(
        "kind",
        [
          "create",
          "cluster",
          "--name",
          config.cluster,
          "--wait",
          "180s",
          "--image",
          NODE_IMAGE,
          // Never let kind merge this cluster into the user's ~/.kube/config.
          "--kubeconfig",
          path.join(config.stateDir, "host-kubeconfig"),
        ],
        { timeout: 360000, stdio: "inherit" },
      );
    } else {
      // `featherlab stop` stops the kind node containers. On restart, bring them back up
      // before writing the kubeconfig or waiting for the API server.
      const nodes = getClusterNodes(config.cluster, { exec });
      for (const node of nodes) {
        try {
          const running = exec("docker", [
            "inspect",
            "--format",
            "{{.State.Running}}",
            node,
          ]).trim();
          if (running !== "true") {
            log.log(`Starting cluster node: ${node}`);
            exec("docker", ["start", node]);
          }
        } catch {
          // Non-fatal — waitForClusterReady will surface the failure if the node cannot start.
        }
      }
    }
    const kubeconfig = exec("kind", ["get", "kubeconfig", "--name", config.cluster, "--internal"]);
    const kubeconfigPath = path.join(config.stateDir, "workstation-kubeconfig");
    writeFileSync(kubeconfigPath, kubeconfig, { mode: 0o600 });
    // The learner container uses UID 1000; its read-only bind mount must be readable.
    // The parent state directory remains owner-only (0700).
    chmodSync(kubeconfigPath, 0o644);

    let status = containerState();

    // Recovery: an interrupted upgrade leaves a `<name>-pre-upgrade` container behind.
    // If the main container is gone but the backup still exists, restore it so the user
    // isn't left without a workstation.
    if (status === "missing" && !process.env.FEATHERLAB_IMAGE) {
      const backupName = config.workstation + UPGRADE_BACKUP_SUFFIX;
      let backupState = "";
      try {
        backupState = exec("docker", [
          "inspect",
          "--format",
          "{{.State.Running}}",
          backupName,
        ]).trim();
      } catch {
        // No backup container either — normal "missing" path.
      }
      if (backupState === "true" || backupState === "false") {
        log.log("Recovering workstation from interrupted upgrade...");
        exec("docker", ["rename", backupName, config.workstation]);
        exec("docker", ["start", config.workstation]);
        _seedLearnerKubeconfig(config, exec);
        return;
      }
    }

    // Image-mismatch upgrade: when the CLI was updated and an existing workstation
    // container uses an older image, upgrade it in-place while preserving /home/learner.
    // Skipped when FEATHERLAB_IMAGE is set — the user controls the image directly.
    if ((status === "true" || status === "false") && !process.env.FEATHERLAB_IMAGE) {
      let wsImage = "";
      try {
        wsImage = exec("docker", [
          "inspect",
          "--format",
          "{{.Config.Image}}",
          config.workstation,
        ]).trim();
      } catch {
        // Non-fatal — if we can't inspect, treat as no mismatch.
      }
      if (wsImage && wsImage !== config.image) {
        log.log(`Upgrading workstation: ${wsImage} → ${config.image}`);
        const { backupDir } = _upgradeWorkstation(config, kubeconfigPath, exec, log);
        log.log(`Workstation upgraded successfully. Files preserved at: ${backupDir}`);
        _seedLearnerKubeconfig(config, exec);
        return;
      }
    }

    // Mount-layout migration: containers created before this version had the kubeconfig
    // bind-mounted read-only directly at .kube/config, preventing `kubectl config set-context`.
    // Migrate by recreating the container (preserving /home/learner) with the new layout where
    // base-config is the read-only mount and .kube/config is a writable learner-owned copy.
    if ((status === "true" || status === "false") && !process.env.FEATHERLAB_IMAGE) {
      if (_needsMountMigration(config, exec)) {
        log.log("Migrating workstation to writable kubeconfig layout...");
        _upgradeWorkstation(config, kubeconfigPath, exec, log);
        _seedLearnerKubeconfig(config, exec);
        return;
      }
    }

    if (status === "true") {
      _seedLearnerKubeconfig(config, exec);
      return;
    }
    if (status === "false") {
      log.log("Starting existing workstation...");
      exec("docker", ["start", config.workstation]);
      _seedLearnerKubeconfig(config, exec);
      return;
    }

    // Use the local image if available; otherwise pull it.
    let imageExists = false;
    try {
      exec("docker", ["image", "inspect", config.image]);
      imageExists = true;
    } catch {
      // Image is not available locally.
    }
    if (imageExists) {
      log.log(`Using local workstation image: ${config.image}`);
    } else {
      log.log(`Pulling workstation image: ${config.image}`);
      exec("docker", ["pull", config.image], { timeout: 360000, stdio: "inherit" });
    }

    log.log("Creating isolated learner workstation...");
    exec("docker", ["run", "-d", ...buildWorkstationRunArgs(config, kubeconfigPath)]);
    _seedLearnerKubeconfig(config, exec);
  }

  async function stop() {
    if (containerState() === "true")
      await stopper([config.workstation], { timeoutSec: WORKSTATION_STOP_TIMEOUT_SEC });
  }

  /**
   * Stop the kind node containers backing this environment's cluster.
   * Does nothing if the cluster does not exist.
   * Returns the result from stopClusterNodes().
   */
  async function stopNodes() {
    if (!clusterExists()) return { stopped: [], skipped: [], errors: [] };
    return stopClusterNodes(config.cluster, { exec, stop: stopper, log });
  }

  /**
   * Fire-and-forget stop of the workstation and cluster nodes, for a forced exit.
   * The docker processes run detached and finish after this process is gone.
   * Never throws.
   */
  function stopInBackground() {
    try {
      stopper([config.workstation], {
        timeoutSec: WORKSTATION_STOP_TIMEOUT_SEC,
        background: true,
      });
      const { owned } = getOwnedClusterNodes(config.cluster, { exec });
      stopper(owned, { background: true });
    } catch {
      // Best effort — the process is exiting.
    }
  }

  /**
   * Returns the image tag of the existing workstation container, or an empty string
   * if the container does not exist or Docker is unavailable.
   */
  function containerImage() {
    try {
      return exec("docker", [
        "inspect",
        "--format",
        "{{.Config.Image}}",
        config.workstation,
      ]).trim();
    } catch {
      return "";
    }
  }

  /**
   * Upgrade the workstation container to match `config.image` while preserving
   * `/home/learner`.  Throws on failure — callers should surface the error.
   * Returns `{ backupDir }`.
   */
  function upgradeWorkstation() {
    const kubeconfigPath = path.join(config.stateDir, "workstation-kubeconfig");
    return _upgradeWorkstation(config, kubeconfigPath, exec, log);
  }

  function status() {
    log.log(`Cluster: ${clusterExists() ? config.cluster : "not created"}`);
    log.log(`Workstation: ${containerState()}`);
    log.log(`Image: ${config.image}`);
  }

  return {
    config,
    doctor,
    provision,
    stop,
    stopNodes,
    stopInBackground,
    status,
    containerState,
    containerImage,
    upgradeWorkstation,
    clusterExists,
  };
}

const defaults = createRuntime();
export const doctor = defaults.doctor;
export const provision = defaults.provision;
export const stop = defaults.stop;
export const stopNodes = defaults.stopNodes;
export const status = defaults.status;
