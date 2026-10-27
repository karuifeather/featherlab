import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { createApp } from "../../src/app.mjs";
import { startServer } from "../../src/server.mjs";
import { fingerprint, IsolatedEnvironment } from "../helpers/isolated-environment.mjs";

/**
 * End-to-end lifecycle against a real, disposable kind cluster.
 *
 * Opt-in (FEATHERLAB_KIND_TESTS=1; needs Docker and kind). The suite provisions its own
 * `featherlab-test-<id>` cluster, workstation and state directory, and removes them
 * afterwards, even on failure or Ctrl+C. It never reads or writes the learner's
 * `featherlab` cluster, workstation, ~/.featherlab or ~/.kube/config.
 */
const enabled = process.env.FEATHERLAB_KIND_TESTS === "1";
const options = {
  skip: enabled ? false : "set FEATHERLAB_KIND_TESTS=1 (needs Docker and kind)",
};
const quiet = { warn() {}, error() {} };
const userKubeconfig = path.join(os.homedir(), ".kube", "config");

let env;
let server;
let base;
let kubeconfigBefore;

const kubectl = (...args) => env.kubectl(...args);

before(async () => {
  if (!enabled) return;
  kubeconfigBefore = fingerprint(userKubeconfig);
  env = new IsolatedEnvironment({ log: console }).start();
  const { workstation, cluster } = env.config;
  server = await startServer(0, {
    service: createApp({ workstation, logger: quiet }).service,
    workstation,
    cluster,
  });
  base = `http://127.0.0.1:${server.port}/api/exercises`;
});
after(async () => {
  await server?.close();
  env?.teardown();
});

const post = async (id, action, query = "") =>
  (await fetch(`${base}/${id}/${action}${query}`, { method: "POST" })).json();
// Taking the environment from another exercise that holds it must be confirmed.
const CONFIRM = "?discardActive=true";

test("k8s-0001: reset -> fail -> solve in the workstation -> pass -> reset", options, async () => {
  await post("k8s-0001", "reset");
  assert.equal((await post("k8s-0001", "check")).result.success, false);

  kubectl("run", "web", "--image=nginx:1.27");
  kubectl("wait", "--for=condition=Ready", "pod/web", "--timeout=120s");
  const { result } = await post("k8s-0001", "check");
  assert.equal(result.success, true, JSON.stringify(result));

  await post("k8s-0001", "reset");
  assert.equal(kubectl("get", "pods", "-n", "default", "--no-headers", "-l", "run=web").trim(), "");
  assert.equal((await post("k8s-0001", "check")).result.success, false);
});

test(
  "k8s-0002: activate is idempotent, grading reflects real state, reset is scoped",
  options,
  async () => {
    assert.equal((await post("k8s-0002", "reset")).code, "ENVIRONMENT_IN_USE");
    await post("k8s-0002", "reset", CONFIRM);
    await post("k8s-0002", "activate");
    await post("k8s-0002", "activate");
    assert.match(
      kubectl("get", "namespace", "staging", "-o", "jsonpath={.metadata.labels}"),
      /featherlab/,
    );

    // Learner work for exercise 1 must survive exercise 2 operations.
    kubectl("run", "web", "--image=nginx:1.27");
    const before = (await post("k8s-0002", "check")).result;
    assert.equal(before.success, false);
    assert.equal(before.checks.find((c) => c.id === "namespace").passed, true);

    kubectl("create", "deployment", "api", "--image=nginx:1.27", "--replicas=2", "-n", "staging");
    kubectl("label", "deployment", "api", "tier=backend", "-n", "staging");
    kubectl("rollout", "status", "deployment/api", "-n", "staging", "--timeout=180s");
    const solved = (await post("k8s-0002", "check")).result;
    assert.equal(solved.success, true, JSON.stringify(solved));

    await post("k8s-0002", "reset");
    assert.equal((await post("k8s-0002", "check")).result.success, false);
    assert.match(kubectl("get", "pod", "web", "-n", "default", "-o", "name"), /pod\/web/);

    // Switching back cleans up k8s-0002 (Deployment and its managed namespace).
    await post("k8s-0001", "reset", CONFIRM);
    assert.equal(kubectl("get", "deployments", "-n", "staging", "--no-headers").trim(), "");
  },
);

test("the run left the learner's kubeconfig untouched", options, () => {
  assert.equal(fingerprint(userKubeconfig), kubeconfigBefore);
});
