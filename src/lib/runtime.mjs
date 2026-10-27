import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, chmodSync } from "node:fs";
import path from "node:path";
import {
  DEFAULT_CLUSTER,
  DEFAULT_IMAGE,
  DEFAULT_STATE_DIR,
  DEFAULT_WORKSTATION,
  resolveEnvironment,
} from "../infrastructure/environment.mjs";
import { getClusterNodes, stopClusterNodes } from "../infrastructure/docker/kind-nodes.mjs";

// Kept for existing importers; new code should take an EnvironmentConfig instead.
export const CLUSTER = DEFAULT_CLUSTER;
export const WORKSTATION = DEFAULT_WORKSTATION;
export const IMAGE = DEFAULT_IMAGE;
export const STATE = DEFAULT_STATE_DIR;
const NODE_IMAGE =
  "kindest/node:v1.37.0@sha256:a1ed56cfb0e7b93589bdf97c8cd566405a265939e3620fc4f5de89adff580ae5";

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
 * Docker/kind provisioning for one environment. `exec(binary, args, options)` is injectable
 * so tests can verify exactly which commands would run without running them.
 */
export function createRuntime(overrides = {}, { exec = run, log = console } = {}) {
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
    const status = containerState();
    if (status === "true") return;
    if (status === "false") {
      log.log("Starting existing workstation...");
      exec("docker", ["start", config.workstation]);
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
    exec("docker", [
      "run",
      "-d",
      "--name",
      config.workstation,
      ...Object.entries(config.labels).flatMap(([key, value]) => ["--label", `${key}=${value}`]),
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
      `type=bind,src=${kubeconfigPath},dst=/home/learner/.kube/config,readonly`,
      config.image,
    ]);
  }

  function stop() {
    if (containerState() === "true") exec("docker", ["stop", config.workstation]);
    log.log("Workstation stopped. Kubernetes cluster and progress preserved.");
  }

  /**
   * Stop the kind node containers backing this environment's cluster.
   * Does nothing if the cluster does not exist.
   * Returns the result from stopClusterNodes().
   */
  async function stopNodes() {
    if (!clusterExists()) return { stopped: [], skipped: [], errors: [] };
    return stopClusterNodes(config.cluster, { exec, log });
  }

  function status() {
    log.log(`Cluster: ${clusterExists() ? config.cluster : "not created"}`);
    log.log(`Workstation: ${containerState()}`);
    log.log(`Image: ${config.image}`);
  }

  return { config, doctor, provision, stop, stopNodes, status, containerState, clusterExists };
}

const defaults = createRuntime();
export const doctor = defaults.doctor;
export const provision = defaults.provision;
export const stop = defaults.stop;
export const stopNodes = defaults.stopNodes;
export const status = defaults.status;
