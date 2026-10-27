import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { createApp } from "../../src/app.mjs";
import { startServer } from "../../src/server.mjs";
import {
  getClusterNodes,
  stopClusterNodes,
  startClusterNodes,
  waitForClusterReady,
} from "../../src/infrastructure/docker/kind-nodes.mjs";
import { fingerprint, IsolatedEnvironment } from "../helpers/isolated-environment.mjs";

/**
 * Lifecycle stop/resume integration test against a real, disposable kind cluster.
 *
 * Opt-in (FEATHERLAB_KIND_TESTS=1; needs Docker and kind). Verifies that:
 *   - Stopping the workstation + cluster nodes preserves Kubernetes workloads.
 *   - Resuming restores full cluster and workstation availability.
 *   - Stopping a nonexistent cluster never affects unrelated containers.
 *
 * Uses an isolated featherlab-test-<id> environment. Never touches the learner's
 * real cluster, workstation, ~/.featherlab or ~/.kube/config.
 */
const enabled = process.env.FEATHERLAB_KIND_TESTS === "1";
const options = {
  skip: enabled ? false : "set FEATHERLAB_KIND_TESTS=1 (needs Docker and kind)",
};
const quiet = { warn() {}, error() {} };
const userKubeconfig = path.join(os.homedir(), ".kube", "config");

let env;
let kubeconfigBefore;

before(() => {
  if (!enabled) return;
  kubeconfigBefore = fingerprint(userKubeconfig);
  env = new IsolatedEnvironment({ log: console }).start();
});

after(() => {
  env?.teardown();
});

/**
 * Stop the workstation container directly. The runtime's stop() also checks state
 * before calling docker stop, which is fine, but calling docker directly avoids
 * threading the runtime through these test helpers.
 */
function stopWorkstation() {
  try {
    env.docker("stop", env.config.workstation);
  } catch {
    // Already stopped.
  }
}

/**
 * Start the workstation and poll until Docker reports State.Running = true.
 * Polling is necessary because `docker start` exits before the container process is up.
 */
async function startAndWaitForWorkstation() {
  env.docker("start", env.config.workstation);
  for (let i = 0; i < 30; i++) {
    const running = env
      .docker("inspect", "--format", "{{.State.Running}}", env.config.workstation)
      .trim();
    if (running === "true") return;
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("Workstation did not start within 60s");
}

/**
 * Perform one full stop cycle: server → workstation → cluster nodes.
 * Asserts docker state directly after stopping — log output alone is not enough.
 */
async function stopAll(server) {
  await server.closeSessions();
  await server.close();
  stopWorkstation();
  await stopClusterNodes(env.config.cluster, { log: console });

  const workstationRunning = env
    .docker("inspect", "--format", "{{.State.Running}}", env.config.workstation)
    .trim();
  assert.equal(workstationRunning, "false", "workstation must be stopped after shutdown");

  for (const node of getClusterNodes(env.config.cluster)) {
    const nodeRunning = env.docker("inspect", "--format", "{{.State.Running}}", node).trim();
    assert.equal(nodeRunning, "false", `kind node "${node}" must be stopped after shutdown`);
  }
}

/**
 * Perform one full resume cycle: cluster nodes → API ready → workstation.
 * Returns a new running server bound to a random port.
 */
async function resumeAll() {
  const kubeconfigPath = path.join(env.config.stateDir, "host-kubeconfig");
  await startClusterNodes(env.config.cluster, { log: console });
  // Kubernetes API recovery after node restart requires a bounded health check —
  // `docker start` completing does not mean etcd + API server are ready.
  await waitForClusterReady(kubeconfigPath, { log: console, timeoutMs: 120_000 });
  await startAndWaitForWorkstation();

  const { workstation, cluster } = env.config;
  return startServer(0, {
    service: createApp({ workstation, logger: quiet }).service,
    workstation,
    cluster,
  });
}

test("stop/resume preserves Kubernetes workloads across two cycles", options, async () => {
  const { workstation, cluster } = env.config;

  let server = await startServer(0, {
    service: createApp({ workstation, logger: quiet }).service,
    workstation,
    cluster,
  });

  // Deploy a Pod we will verify survives both stop/resume cycles.
  env.kubectl("run", "verify-pod", "--image=nginx:1.27");
  env.kubectl("wait", "--for=condition=Ready", "pod/verify-pod", "--timeout=120s");

  // --- Cycle 1 ---
  await stopAll(server);
  server = await resumeAll();

  const podAfterFirst = env
    .kubectl("get", "pod", "verify-pod", "-n", "default", "-o", "name")
    .trim();
  assert.match(podAfterFirst, /pod\/verify-pod/, "verify-pod must survive first stop/resume");

  // --- Cycle 2: idempotency ---
  await stopAll(server);
  server = await resumeAll();

  const podAfterSecond = env
    .kubectl("get", "pod", "verify-pod", "-n", "default", "-o", "name")
    .trim();
  assert.match(podAfterSecond, /pod\/verify-pod/, "verify-pod must survive second stop/resume");

  await server.closeSessions();
  await server.close();
});

test("stopping a nonexistent cluster does not affect running nodes", options, async () => {
  // Nodes must be running at this point (before() provisioned the env).
  const nodes = getClusterNodes(env.config.cluster);
  assert.ok(nodes.length > 0, "test cluster must have at least one node");

  const result = await stopClusterNodes("nonexistent-cluster", {});
  assert.equal(
    result.stopped.length,
    0,
    "no containers should be stopped for a nonexistent cluster",
  );

  // Ownership guard ensures our nodes are untouched.
  for (const node of nodes) {
    const running = env.docker("inspect", "--format", "{{.State.Running}}", node).trim();
    assert.equal(running, "true", `node "${node}" must still be running`);
  }
});

test("the run left the learner's kubeconfig untouched", options, () => {
  assert.equal(fingerprint(userKubeconfig), kubeconfigBefore);
});
