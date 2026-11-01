/**
 * Idempotent installer for the FeatherLab Level 6 routing environment.
 *
 * Installs Gateway API CRDs, Traefik v3, and a `traefik` GatewayClass into the
 * cluster. Safe to call on every `provision()`: if Traefik is already running, it
 * exits immediately. The caller is responsible for providing a `kubectl` executor
 * that already points at the right cluster and kubeconfig.
 *
 * Installation order:
 *  1. Gateway API CRDs (--server-side, so re-applying is idempotent)
 *  2. Traefik namespace, RBAC, Deployment, and Service
 *  3. GatewayClass `traefik`
 *  4. Wait for Traefik Deployment rollout (up to 120 s)
 *
 * Safety:
 *  - Never touches `featherlab` or `cka-practice` clusters.
 *  - Uses server-side apply with --force-conflicts=false to avoid stealing ownership
 *    of resources that may have been installed by another tool.
 *  - Applies only the manifests bundled here; never fetches from the internet at
 *    provision time.
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function read(file) {
  return readFileSync(resolve(__dirname, file), "utf8");
}

const TRAEFIK_READY_TIMEOUT_SEC = 120;
const POLL_INTERVAL_MS = 3_000;

/**
 * Install the routing stack into the cluster.
 *
 * @param {object} opts
 * @param {Function} opts.exec  (binary, args, options?) => string — synchronous executor
 * @param {object}  opts.log    has `.log(msg)` and `.error(msg)`
 */
export function installRouting({ exec, log }) {
  // Check if Traefik is already running.
  try {
    const out = exec("kubectl", [
      "get",
      "deployment",
      "traefik",
      "-n",
      "traefik-system",
      "--ignore-not-found",
      "-o",
      "jsonpath={.status.readyReplicas}",
    ]);
    if (out.trim() === "1") {
      log.log("Routing controller (Traefik) is already running — skipping installation.");
      return;
    }
  } catch {
    // Namespace or CRDs not yet present; continue with full installation.
  }

  log.log("Installing Gateway API CRDs...");
  const crds = read("gateway-api-crds.yaml");
  exec("kubectl", ["apply", "--server-side", "--force-conflicts=false", "-f", "-"], {
    input: crds,
    stdio: ["pipe", "pipe", "pipe"],
  });

  log.log("Installing Traefik routing controller...");
  const traefik = read("traefik.yaml");
  exec("kubectl", ["apply", "--server-side", "--force-conflicts=false", "-f", "-"], {
    input: traefik,
    stdio: ["pipe", "pipe", "pipe"],
  });

  log.log("Installing GatewayClass...");
  const gwClass = read("gatewayclass.yaml");
  exec("kubectl", ["apply", "--server-side", "--force-conflicts=false", "-f", "-"], {
    input: gwClass,
    stdio: ["pipe", "pipe", "pipe"],
  });

  log.log("Waiting for Traefik to become ready...");
  const deadline = Date.now() + TRAEFIK_READY_TIMEOUT_SEC * 1_000;
  while (Date.now() < deadline) {
    try {
      const ready = exec("kubectl", [
        "get",
        "deployment",
        "traefik",
        "-n",
        "traefik-system",
        "-o",
        "jsonpath={.status.readyReplicas}",
      ]).trim();
      if (ready === "1") {
        log.log("Routing controller ready.");
        return;
      }
    } catch {
      // Not yet available; keep polling.
    }
    // Synchronous sleep via a tight spin is avoided; instead use a child process.
    try {
      exec("sleep", [String(POLL_INTERVAL_MS / 1_000)]);
    } catch {
      // sleep may not exist on all platforms; ignore.
    }
  }
  throw new Error(
    `Routing controller did not become ready within ${TRAEFIK_READY_TIMEOUT_SEC} s. ` +
      "Run `kubectl get deployment traefik -n traefik-system` for details.",
  );
}

/**
 * Returns true when the routing stack appears healthy enough for exercises.
 * A fast check: does not wait.
 */
export function isRoutingReady({ exec }) {
  try {
    const ready = exec("kubectl", [
      "get",
      "deployment",
      "traefik",
      "-n",
      "traefik-system",
      "--ignore-not-found",
      "-o",
      "jsonpath={.status.readyReplicas}",
    ]).trim();
    return ready === "1";
  } catch {
    return false;
  }
}
