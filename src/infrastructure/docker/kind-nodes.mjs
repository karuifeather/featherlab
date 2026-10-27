import { execFileSync } from "node:child_process";
import { EnvironmentError } from "../../core/errors.mjs";

/**
 * Default synchronous executor matching the contract of `run` in runtime.mjs.
 * Defined here to avoid a circular dependency (runtime imports kind-nodes; kind-nodes
 * must not import back from runtime).
 */
function defaultExec(binary, args, options = {}) {
  try {
    return execFileSync(binary, args, {
      encoding: "utf8",
      timeout: options.timeout ?? 30_000,
      stdio: options.stdio ?? ["ignore", "pipe", "pipe"],
      ...options,
    });
  } catch (error) {
    const details = error.stderr?.toString().trim() || error.message;
    throw new Error(`${binary} ${args.join(" ")}: ${details}`);
  }
}

/**
 * Discovery and lifecycle management for the Docker containers backing a kind cluster.
 *
 * kind has no native stop/start command. Each cluster node is a Docker container.
 * We stop nodes with `docker stop` and restart them with `docker start`.
 * We never call `kind delete cluster`.
 *
 * Ownership guard: before stopping a container, we verify it carries the standard kind
 * label `io.x-k8s.kind.cluster=<clusterName>`. This prevents accidentally stopping
 * containers that share names with kind nodes but are unrelated.
 *
 * Backward compat: nodes created by kind (including v0.2.0 environments) carry these
 * labels natively — no FeatherLab-specific label is required on kind nodes.
 */

const KIND_CLUSTER_LABEL = "io.x-k8s.kind.cluster";

// Default poll interval and backoff for waitForClusterReady.
const INITIAL_POLL_MS = 2_000;
const MAX_POLL_MS = 15_000;
const DEFAULT_TIMEOUT_MS = 120_000;

const silent = { log() {}, warn() {}, error() {} };

/**
 * Returns Docker container names for all nodes of the named kind cluster.
 * Returns [] if the cluster does not exist or has no nodes.
 *
 * @param {string} clusterName
 * @param {{exec?: Function}} [options]
 * @returns {string[]}
 */
export function getClusterNodes(clusterName, { exec = defaultExec } = {}) {
  try {
    const out = exec("kind", ["get", "nodes", "--name", clusterName]).trim();
    if (!out) return [];
    return out.split(/\r?\n/).filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Stops all Docker containers backing the named kind cluster.
 *
 * For each discovered node:
 *   1. Verify the container's `io.x-k8s.kind.cluster` label matches `clusterName`.
 *   2. If verified, `docker stop <container>`.
 *   3. If not verified, skip with a warning — do not touch unrelated containers.
 *
 * Never throws. Collects all errors so partial failures are reported.
 *
 * @param {string} clusterName
 * @param {{exec?: Function, log?: object}} [options]
 * @returns {Promise<{stopped: string[], skipped: string[], errors: Array<{node: string, error: Error}>}>}
 */
export async function stopClusterNodes(clusterName, { exec = defaultExec, log = silent } = {}) {
  const nodes = getClusterNodes(clusterName, { exec });
  const stopped = [];
  const skipped = [];
  const errors = [];

  for (const node of nodes) {
    try {
      // Ownership guard: verify this container actually belongs to the named cluster.
      const labelsJson = exec("docker", [
        "inspect",
        "--format",
        `{{index .Config.Labels "${KIND_CLUSTER_LABEL}"}}`,
        node,
      ]).trim();

      if (labelsJson !== clusterName) {
        log.warn?.(
          `Skipping container "${node}": label ${KIND_CLUSTER_LABEL}="${labelsJson}" does not match cluster "${clusterName}".`,
        );
        skipped.push(node);
        continue;
      }

      exec("docker", ["stop", node]);
      stopped.push(node);
      log.log?.(`Stopped kind node: ${node}`);
    } catch (error) {
      log.error?.(`Failed to stop kind node "${node}": ${error.message}`);
      errors.push({ node, error });
    }
  }

  return { stopped, skipped, errors };
}

/**
 * Starts stopped Docker containers for the named kind cluster.
 *
 * @param {string} clusterName
 * @param {{exec?: Function, log?: object}} [options]
 * @returns {Promise<{started: string[], errors: Array<{node: string, error: Error}>}>}
 */
export async function startClusterNodes(clusterName, { exec = defaultExec, log = silent } = {}) {
  const nodes = getClusterNodes(clusterName, { exec });
  const started = [];
  const errors = [];

  for (const node of nodes) {
    try {
      exec("docker", ["start", node]);
      started.push(node);
      log.log?.(`Started kind node: ${node}`);
    } catch (error) {
      log.error?.(`Failed to start kind node "${node}": ${error.message}`);
      errors.push({ node, error });
    }
  }

  return { started, errors };
}

/**
 * Waits for the Kubernetes API server to become healthy after a node restart.
 *
 * Polls `kubectl --kubeconfig <path> cluster-info` with exponential backoff.
 * The kubeconfig must be the host-side kubeconfig (not the workstation-internal one)
 * so that the host process can reach the API server.
 *
 * Throws EnvironmentError with reason "timeout" if the cluster does not become
 * healthy within timeoutMs.
 *
 * @param {string} kubeconfig  absolute path to a kubeconfig file
 * @param {{exec?: Function, timeoutMs?: number, log?: object}} [options]
 * @returns {Promise<true>}
 */
export async function waitForClusterReady(
  kubeconfig,
  { exec = defaultExec, timeoutMs = DEFAULT_TIMEOUT_MS, log = silent } = {},
) {
  const deadline = Date.now() + timeoutMs;
  let delay = INITIAL_POLL_MS;

  while (Date.now() < deadline) {
    try {
      exec("kubectl", ["--kubeconfig", kubeconfig, "cluster-info"], { timeout: 10_000 });
      log.log?.("Kubernetes API server is ready.");
      return true;
    } catch {
      // Not ready yet; keep polling.
    }

    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    await new Promise((resolve) => setTimeout(resolve, Math.min(delay, remaining)));
    delay = Math.min(delay * 2, MAX_POLL_MS);
  }

  throw new EnvironmentError(
    `Kubernetes API server did not become ready within ${Math.round(timeoutMs / 1000)}s.`,
    { reason: "timeout" },
  );
}
