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
    service: createApp({ workstation, cluster, logger: quiet }).service,
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

test(
  "k8s-0001 over HTTP: reset -> fail -> solve in the workstation -> pass -> reset",
  options,
  async () => {
    await post("k8s-0001", "reset");
    assert.equal((await post("k8s-0001", "check")).result.outcome, "failed");

    kubectl("run", "web", "--image=nginx:1.27", "-n", "fl-k8s-0001");
    kubectl("wait", "--for=condition=Ready", "pod/web", "-n", "fl-k8s-0001", "--timeout=120s");
    const { result } = await post("k8s-0001", "check");
    assert.equal(result.outcome, "passed", JSON.stringify(result));

    await post("k8s-0001", "reset");
    assert.equal(kubectl("get", "pods", "-n", "fl-k8s-0001", "--no-headers").trim(), "");
    assert.equal((await post("k8s-0001", "check")).result.outcome, "failed");
  },
);

test(
  "k8s-0002 over HTTP: confirmation, read-only resume, real grading, scoped reset",
  options,
  async () => {
    assert.equal((await post("k8s-0002", "reset")).code, "ENVIRONMENT_IN_USE");
    await post("k8s-0002", "reset", CONFIRM);
    const resumed = await post("k8s-0002", "activate");
    assert.equal(resumed.environment, "resumed");
    assert.deepEqual(resumed.steps, []);
    assert.match(
      kubectl("get", "namespace", "fl-k8s-0002", "-o", "jsonpath={.metadata.labels}"),
      /featherlab/,
    );

    // A learner's own Pod in default is never part of any exercise.
    kubectl("run", "web", "--image=nginx:1.27", "-n", "default");
    const before = (await post("k8s-0002", "check")).result;
    assert.equal(before.outcome, "failed");

    const ns = "fl-k8s-0002";
    kubectl("create", "deployment", "api", "--image=nginx:1.27", "--replicas=2", "-n", ns);
    kubectl("label", "deployment", "api", "tier=backend", "-n", ns);
    kubectl("rollout", "status", "deployment/api", "-n", ns, "--timeout=180s");
    const solved = (await post("k8s-0002", "check")).result;
    assert.equal(solved.outcome, "passed", JSON.stringify(solved));

    await post("k8s-0002", "reset");
    assert.equal((await post("k8s-0002", "check")).result.outcome, "failed");
    assert.match(kubectl("get", "pod", "web", "-n", "default", "-o", "name"), /pod\/web/);

    // Switching back cleans up k8s-0002's namespace entirely.
    await post("k8s-0001", "reset", CONFIRM);
    assert.doesNotMatch(kubectl("get", "namespaces", "-o", "name"), /fl-k8s-0002/);
    assert.match(kubectl("get", "pod", "web", "-n", "default", "-o", "name"), /pod\/web/);
  },
);

test("the run left the learner's kubeconfig untouched", options, () => {
  assert.equal(fingerprint(userKubeconfig), kubeconfigBefore);
});
