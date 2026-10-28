import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { createApp } from "../../src/app.mjs";
import { EXERCISE_LABEL, MANAGED_BY_LABEL } from "../../src/tracks/kubernetes/lifecycle.mjs";
import {
  assertTestWorkstation,
  fingerprint,
  IsolatedEnvironment,
} from "../helpers/isolated-environment.mjs";
import { createKubectlFacade, LEVEL0_SCENARIOS } from "../helpers/level0-scenarios.mjs";

/**
 * The complete Level 0 circuit against a real, disposable kind cluster.
 *
 * Opt-in (FEATHERLAB_KIND_TESTS=1; needs Docker and kind). It provisions its own
 * `featherlab-test-<id>` cluster, workstation and state directory, and removes exactly those
 * afterwards. It never addresses the learner's `featherlab` (or any other) cluster, ~/.featherlab
 * or ~/.kube/config: every kubectl command runs inside the test workstation, whose kubeconfig
 * only knows the test cluster, and the app verifies that context before each operation.
 *
 * For every exercise, through the real lifecycle manager and EnvironmentSession:
 * fresh activation -> ownership-labelled namespaces -> expected setup objects -> baseline
 * `failed` -> the reference solution (run as the learner, in the workstation) -> `passed` ->
 * alternative solutions pass -> partial/incorrect variants fail exactly the expected checks ->
 * switch away (namespaces gone) -> revisit is unsolved -> completion history intact.
 *
 * Each exercise test opens with a confirmed takeover and seeds only the prerequisite
 * completions it needs, so tests do not depend on running in order.
 */
const enabled = process.env.FEATHERLAB_KIND_TESTS === "1";
const options = {
  skip: enabled ? false : "set FEATHERLAB_KIND_TESTS=1 (needs Docker and kind)",
};
const quiet = { warn() {}, error() {} };
const userKubeconfig = path.join(os.homedir(), ".kube", "config");
const confirmed = { discardActive: true };

let env;
let app;
let k;
let kubeconfigBefore;
let systemPodsBefore;

const appFor = (stateDir, extra = {}) =>
  createApp({
    workstation: env.config.workstation,
    cluster: env.config.cluster,
    stateDir,
    logger: quiet,
    ...extra,
  });

before(() => {
  if (!enabled) return;
  kubeconfigBefore = fingerprint(userKubeconfig);
  env = new IsolatedEnvironment({ log: console }).start();
  // The test-owned state directory doubles as FEATHERLAB_STATE_DIR (progress.sqlite).
  app = appFor(env.config.stateDir);
  k = createKubectlFacade((args, { input } = {}) =>
    input === undefined ? env.kubectl(...args) : env.kubectlWithInput(input, ...args),
  );
  // A learner's own Pod in default must survive the whole circuit.
  k.run("run", "learner-own", "--image=nginx:1.27", "-n", "default", "--labels=run=web");
  systemPodsBefore = k
    .run("get", "pods", "-n", "kube-system", "-o", "name")
    .trim()
    .split("\n")
    .sort();
});
after(() => {
  app?.persistence?.close();
  env?.teardown();
});

const failingIds = (result) =>
  result.checks
    .filter((c) => !c.passed)
    .map((c) => c.id)
    .sort();
const describeFailures = (result) =>
  JSON.stringify(result.checks.filter((c) => !c.passed).map((c) => [c.id, c.feedback]));

/** Seed completion of missing prerequisites so a single exercise can run on its own. */
function unlock(id) {
  const exercise = app.registry.get(id);
  for (const prereq of exercise.prerequisites) {
    if (app.service.getExerciseProgress(prereq).completed) continue;
    unlock(prereq);
    app.persistence.progress.upsert({
      exerciseId: prereq,
      trackId: "kubernetes",
      completed: true,
      firstCompletedAt: new Date().toISOString(),
    });
  }
}

function namespaceLabels(name) {
  const out = k.run("get", "namespace", name, "-o", "json");
  return JSON.parse(out).metadata.labels ?? {};
}

const namespaceExists = (name) =>
  k.run("get", "namespaces", "-o", "name").split("\n").includes(`namespace/${name}`);

// ── Every exercise, end to end ───────────────────────────────────────────────

for (const [id, scenario] of Object.entries(LEVEL0_SCENARIOS)) {
  test(`${id}: activate, baseline, solve, variants, switch, revisit`, options, async () => {
    const { service, registry } = app;
    const exercise = registry.get(id);
    unlock(id);

    // 1-2. Fresh activation creates exactly the declared, ownership-labelled namespaces.
    const opened = await service.activate(id, confirmed);
    assert.equal(opened.environment, "fresh");
    for (const ns of exercise.lifecycle.namespaces) {
      const labels = namespaceLabels(ns);
      assert.equal(labels[MANAGED_BY_LABEL], "featherlab", ns);
      assert.equal(labels[EXERCISE_LABEL], id, ns);
    }
    // 3. The setup objects exist.
    for (const [kind, name, ns] of scenario.initial)
      assert.match(k.run("get", kind, name, "-n", ns, "-o", "name"), new RegExp(name));

    // 4-5. The fresh baseline is a legitimate `failed`, never `incomplete` or `passed`.
    const baseline = await service.check(id);
    assert.equal(baseline.outcome, "failed", describeFailures(baseline));

    // 6-9. The reference solution, applied as a learner would, passes.
    await scenario.solve(k);
    const solved = await service.check(id);
    assert.equal(solved.outcome, "passed", describeFailures(solved));
    assert.equal(solved.progress.completed, true);

    for (const alternative of scenario.alternatives ?? []) {
      await service.reset(id);
      await alternative.run(k);
      const result = await service.check(id);
      assert.equal(result.outcome, "passed", `${alternative.name}: ${describeFailures(result)}`);
    }

    // 10-11. Partial and incorrect solutions fail exactly the checks they should.
    for (const variant of scenario.variants) {
      await service.reset(id);
      assert.equal((await service.check(id)).outcome, "failed", "reset restores the baseline");
      await variant.run(k);
      const result = await service.check(id);
      assert.equal(result.outcome, "failed", `${variant.name}: ${describeFailures(result)}`);
      assert.deepEqual(failingIds(result), [...variant.failing].sort(), variant.name);
    }

    // 12. Switching away deletes this exercise's namespaces (and only those).
    const other = id === "k8s-0001" ? "k8s-0011" : "k8s-0001";
    unlock(other);
    await service.activate(other, confirmed);
    for (const ns of exercise.lifecycle.namespaces)
      assert.equal(namespaceExists(ns), false, `${ns} removed on switch`);

    // 13. Revisiting starts unsolved; 14. the completion is still on record.
    assert.equal((await service.activate(id, confirmed)).environment, "fresh");
    const revisit = await service.check(id);
    assert.equal(revisit.outcome, "failed", "a completed exercise must be solved again");
    assert.equal(revisit.progress.completed, true, "completion is never revoked");
    assert.equal(service.getExerciseProgress(id).state, "completed");
  });
}

// ── Isolation and recovery against the real cluster ──────────────────────────

test(
  "undeclared objects in a previous exercise's namespace are removed by a switch",
  options,
  async () => {
    const { service } = app;
    unlock("k8s-0003");
    await service.activate("k8s-0003", confirmed);
    // Strays nobody declares: a Service, a NetworkPolicy, a ConfigMap and a Secret.
    k.apply(`
apiVersion: v1
kind: Service
metadata: { name: stray, namespace: fl-k8s-0003 }
spec: { selector: { app: catalog }, ports: [{ port: 80 }] }
---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata: { name: deny-all, namespace: fl-k8s-0003-sandbox }
spec: { podSelector: {}, policyTypes: [Ingress, Egress] }
---
apiVersion: v1
kind: ConfigMap
metadata: { name: notes, namespace: fl-k8s-0003 }
data: { a: b }
---
apiVersion: v1
kind: Secret
metadata: { name: token, namespace: fl-k8s-0003-sandbox }
stringData: { t: x }
`);
    await service.activate("k8s-0001", confirmed);
    for (const ns of ["fl-k8s-0003", "fl-k8s-0003-sandbox"])
      assert.equal(namespaceExists(ns), false);

    // Back in k8s-0003, none of the strays (nor last attempt's state) is present.
    await service.activate("k8s-0003", confirmed);
    for (const [kind, name, ns] of [
      ["service", "stray", "fl-k8s-0003"],
      ["networkpolicy", "deny-all", "fl-k8s-0003-sandbox"],
      ["configmap", "notes", "fl-k8s-0003"],
      ["secret", "token", "fl-k8s-0003-sandbox"],
    ])
      assert.equal(
        k.run("get", kind, "-n", ns, "-o", "name").includes(name),
        false,
        `${kind}/${name}`,
      );
  },
);

test(
  "default, kube-system and a learner's own Pod named like an old exercise survive everything",
  options,
  () => {
    assert.match(k.run("get", "pod", "learner-own", "-n", "default", "-o", "name"), /learner-own/);
    const systemPods = k
      .run("get", "pods", "-n", "kube-system", "-o", "name")
      .trim()
      .split("\n")
      .sort();
    assert.deepEqual(systemPods, systemPodsBefore);
    for (const ns of ["default", "kube-system", "kube-public", "kube-node-lease"])
      assert.ok(namespaceExists(ns), ns);
  },
);

test(
  "a namespace FeatherLab does not own is refused before any mutation, and preserved",
  options,
  async () => {
    const { service, persistence } = app;
    await service.reset("k8s-0001", confirmed);
    k.run("run", "web", "--image=nginx:1.27", "-n", "fl-k8s-0001");
    await k.ready("web", "fl-k8s-0001");
    // The learner hand-creates the namespace of another exercise (no ownership labels).
    k.run("create", "namespace", "fl-k8s-0002");
    k.run("create", "configmap", "mine", "-n", "fl-k8s-0002", "--from-literal=a=b");
    try {
      await assert.rejects(service.activate("k8s-0002", confirmed), (error) => {
        assert.equal(error.details.step, "ownership");
        assert.match(error.message, /kubectl delete namespace fl-k8s-0002/);
        return true;
      });
      assert.match(k.run("get", "configmap", "mine", "-n", "fl-k8s-0002", "-o", "name"), /mine/);
      assert.equal(persistence.environment.get().state, "ready", "the owner was never journaled");
      assert.equal((await service.check("k8s-0001")).outcome, "passed", "work intact");
    } finally {
      k.run("delete", "namespace", "fl-k8s-0002", "--wait=true", "--timeout=120s");
    }
  },
);

test(
  "a namespace stuck in Terminating fails with a bounded error and recovers once released",
  options,
  async () => {
    // A separate app instance with a short deadline; its own state directory.
    const stateDir = mkdtempSync(path.join(os.tmpdir(), `featherlab-test-stuck-`));
    const stuckApp = appFor(stateDir, { driverOptions: { namespaceDeleteTimeoutMs: 8_000 } });
    try {
      // Hand over from the main app first (normal deadline), so the short deadline only
      // applies to the namespace this test deliberately holds in Terminating.
      unlock("k8s-0002");
      await app.service.activate("k8s-0002", confirmed);
      assert.equal(namespaceExists("fl-k8s-0001"), false);
      await stuckApp.service.activate("k8s-0001", confirmed);
      // A test-owned finalizer that only this test removes.
      k.apply(`
apiVersion: v1
kind: ConfigMap
metadata:
  name: hold
  namespace: fl-k8s-0001
  finalizers: [featherlab.test/hold]
`);
      const started = Date.now();
      await assert.rejects(stuckApp.service.reset("k8s-0001"), (error) => {
        assert.equal(error.details.step, "wait for Namespace/fl-k8s-0001");
        assert.match(error.message, /still terminating/);
        assert.match(error.message, /never removes finalizers/);
        return true;
      });
      assert.ok(Date.now() - started < 60_000, "bounded");
      assert.equal(stuckApp.persistence.environment.get().state, "preparing");
      await assert.rejects(stuckApp.service.check("k8s-0001"), /not the one loaded/);
      // FeatherLab left the finalizer alone.
      assert.match(
        k.run(
          "get",
          "configmap",
          "hold",
          "-n",
          "fl-k8s-0001",
          "-o",
          "jsonpath={.metadata.finalizers}",
        ),
        /featherlab\.test\/hold/,
      );

      // The test releases its own finalizer; retrying converges to a fresh, ready exercise.
      k.run(
        "patch",
        "configmap",
        "hold",
        "-n",
        "fl-k8s-0001",
        "--type=merge",
        "-p",
        '{"metadata":{"finalizers":null}}',
      );
      // Kubernetes finishes the deletion on its own schedule; the error told the learner to
      // retry once the namespace is gone, so the test does exactly that.
      await k.until("fl-k8s-0001 to finish terminating", () => !namespaceExists("fl-k8s-0001"));
      await stuckApp.service.reset("k8s-0001");
      assert.equal(stuckApp.persistence.environment.get().state, "ready");
      assert.equal((await stuckApp.service.check("k8s-0001")).outcome, "failed");
    } finally {
      stuckApp.persistence.close();
      rmSync(stateDir, { recursive: true, force: true });
    }
  },
);

test(
  "a crash left mid-transition (preparing) is cleaned up conservatively after restart",
  options,
  async () => {
    const { service } = app;
    unlock("k8s-0004");
    await service.activate("k8s-0004", confirmed);
    // Simulate a crash: the record says preparing; its namespace is still in the cluster.
    app.persistence.environment.set({
      trackId: "kubernetes",
      exerciseId: "k8s-0004",
      state: "preparing",
    });
    app.persistence.close();
    app = appFor(env.config.stateDir);

    await assert.rejects(app.service.check("k8s-0004"), /not the one loaded/);
    const opened = await app.service.activate("k8s-0001"); // no confirmation needed
    assert.equal(opened.environment, "fresh");
    assert.equal(namespaceExists("fl-k8s-0004"), false);
    assert.equal(app.persistence.environment.get().state, "ready");
  },
);

test(
  "a switch that fails before mutation keeps the ready owner and its work",
  options,
  async () => {
    const { service, persistence } = app;
    await service.reset("k8s-0001", confirmed);
    k.run("run", "web", "--image=nginx:1.27", "-n", "fl-k8s-0001");
    await k.ready("web", "fl-k8s-0001");
    const workstation = assertTestWorkstation(env.config.workstation);
    env.docker("pause", workstation);
    try {
      await assert.rejects(
        service.activate("k8s-0002", confirmed),
        /not reachable|timed out|not ready/i,
      );
    } finally {
      env.docker("unpause", workstation);
    }
    assert.equal(persistence.environment.get().exerciseId, "k8s-0001");
    assert.equal(persistence.environment.get().state, "ready");
    assert.equal((await service.check("k8s-0001")).outcome, "passed", "work intact and gradable");
  },
);

test(
  "a page reload and an application restart resume the ready exercise with its work",
  options,
  async () => {
    await app.service.reset("k8s-0001", confirmed);
    k.run("run", "web", "--image=nginx:1.27", "-n", "fl-k8s-0001");
    await k.ready("web", "fl-k8s-0001");
    assert.equal((await app.service.activate("k8s-0001")).environment, "resumed");

    app.persistence.close();
    app = appFor(env.config.stateDir);
    const reopened = await app.service.activate("k8s-0001");
    assert.equal(reopened.environment, "resumed");
    assert.deepEqual(reopened.steps, []);
    assert.equal((await app.service.check("k8s-0001")).outcome, "passed");
  },
);

test("concurrent operations are serialized and leave one consistent owner", options, async () => {
  unlock("k8s-0004");
  const results = await Promise.allSettled([
    app.service.reset("k8s-0004", confirmed),
    app.service.activate("k8s-0002", confirmed),
    app.service.reset("k8s-0004", confirmed), // same exercise while busy: refused
  ]);
  assert.equal(results[0].status, "fulfilled");
  assert.equal(results[1].status, "fulfilled");
  assert.equal(results[2].status, "rejected");
  assert.equal(results[2].reason.code, "OPERATION_IN_PROGRESS");
  await sleep(0);
  const owner = app.persistence.environment.get();
  assert.deepEqual([owner.exerciseId, owner.state], ["k8s-0002", "ready"]);
  assert.equal(namespaceExists("fl-k8s-0004"), false, "the earlier owner was cleaned up");
  assert.ok(namespaceExists("fl-k8s-0002"));
});

test("the run left the learner's kubeconfig untouched", options, () => {
  assert.equal(fingerprint(userKubeconfig), kubeconfigBefore);
});
