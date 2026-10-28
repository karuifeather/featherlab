import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../../src/app.mjs";
import { aggregate, runChecks } from "../../src/core/validation/engine.mjs";
import { ValidatorRegistry } from "../../src/core/validation/registry.mjs";
import { createFakeCluster, deployment, readyPod } from "../helpers/fake-cluster.mjs";

const quiet = { warn() {}, error() {} };
/** Open the exercise as the UI does, then put the learner's work in place and grade it. */
async function gradeWith(cluster, id, resources = [], service = undefined) {
  service ??= createApp({ runner: cluster, logger: quiet }).service;
  await service.activate(id);
  for (const resource of resources) cluster.put(resource);
  return service.check(id);
}
const appWith = (resources) => ({ check: (id) => gradeWith(createFakeCluster(), id, resources) });

// --- Regression: the original Pod exercise, previously covered by gradePod() tests ---

test("regression k8s-0001: a missing pod never succeeds", async () => {
  const result = await appWith([]).check("k8s-0001");
  assert.equal(result.counts.passed, 0);
  assert.equal(result.success, false);
  assert.equal(result.outcome, "failed");
});

test("regression k8s-0001: a fully ready pod passes all four checks", async () => {
  const result = await appWith([readyPod()]).check("k8s-0001");
  assert.equal(result.counts.passed, 4);
  assert.equal(result.success, true);
  assert.deepEqual(
    result.checks.map((c) => c.id),
    ["exists", "image", "running", "ready"],
  );
});

test("regression k8s-0001: a running wrong image gets partial credit", async () => {
  const result = await appWith([readyPod({ image: "busybox" })]).check("k8s-0001");
  assert.deepEqual(
    result.checks.map((c) => c.passed),
    [true, false, true, true],
  );
  assert.deepEqual(result.score, { earned: 3, possible: 4, percent: 75 });
});

test("regression k8s-0001: the right pod in the wrong namespace earns nothing", async () => {
  const result = await appWith([readyPod({ namespace: "other" })]).check("k8s-0001");
  assert.equal(result.counts.passed, 0);
});

// --- Second exercise, loaded from content only ---

test("k8s-0002 grades a correct Deployment", async () => {
  const result = await appWith([deployment()]).check("k8s-0002");
  assert.equal(result.checks.filter((c) => c.passed).length, 5);
  assert.equal(result.success, true);
});

test("k8s-0002: an unfinished rollout does not pass even if enough Pods are available", async () => {
  const rolling = deployment();
  rolling.status.updatedReplicas = 1; // one replica still runs the old template
  const result = await appWith([rolling]).check("k8s-0002");
  assert.equal(result.checks.find((c) => c.id === "available").passed, false);
  assert.equal(result.outcome, "failed");
});

test("k8s-0002 weights count toward partial credit", async () => {
  const result = await appWith([deployment({ available: 0 })]).check("k8s-0002");
  const available = result.checks.find((c) => c.id === "available");
  assert.equal(available.passed, false);
  assert.equal(available.weight, 2);
  assert.deepEqual(result.score, { earned: 4, possible: 6, percent: 67 });
});

// --- Engine behaviour ---

const registry = new ValidatorRegistry([
  {
    type: "t.pass",
    track: null,
    validateParams() {},
    run: async () => ({ passed: true, feedback: "ok" }),
  },
  {
    type: "t.fail",
    track: null,
    validateParams() {},
    run: async () => ({ passed: false, feedback: "no" }),
  },
  {
    type: "t.crash",
    track: null,
    validateParams() {},
    run: async () => {
      throw new TypeError("kaboom with /secret/path");
    },
  },
]);
const run = (checks) => runChecks(checks, { validators: registry, context: {} });
const c = (id, type, weight) => ({ id, type, label: id, weight });

test("a crashing validator does not abort grading and leaks no internals", async () => {
  const result = await run([c("a", "t.pass", 1), c("b", "t.crash", 1), c("c", "t.pass", 1)]);
  assert.deepEqual(
    result.checks.map((x) => x.status),
    ["passed", "error", "passed"],
  );
  assert.equal(result.outcome, "incomplete");
  assert.doesNotMatch(result.checks[1].feedback, /secret|kaboom/);
  assert.equal(result.success, false);
});

test("weights produce weighted partial credit", async () => {
  const result = await run([c("a", "t.pass", 3), c("b", "t.fail", 1)]);
  assert.deepEqual(result.score, { earned: 3, possible: 4, percent: 75 });
  assert.equal(result.outcome, "failed");
});

test("an unregistered validator type becomes an error result", async () => {
  const result = await run([c("a", "t.missing", 1)]);
  assert.equal(result.checks[0].status, "error");
});

test("aggregate of no results is not a success", () => {
  assert.equal(aggregate([]).success, false);
  assert.equal(aggregate([]).score.percent, 0);
});

test("an unreachable cluster yields an incomplete grading with helpful feedback", async () => {
  const cluster = createFakeCluster();
  const { service } = createApp({ runner: cluster, logger: quiet });
  await service.activate("k8s-0001");
  cluster.down = true;
  const result = await service.check("k8s-0001");
  assert.equal(result.outcome, "incomplete");
  assert.equal(result.counts.errored, 4);
  assert.match(result.checks[0].feedback, /practice cluster/);
});

test("hidden checks reveal pass/fail but not what they test", async () => {
  const { appFor, exerciseFiles } = await import("../helpers/content.mjs");
  const files = exerciseFiles("001-h", {
    checks: [
      {
        id: "secret-name",
        type: "k8s.resource-exists",
        label: "Pod named SECRETNAME exists",
        hidden: true,
        params: { kind: "Pod", name: "demo", namespace: "fl-demo-0001" },
      },
    ],
  });
  const cluster = createFakeCluster();
  const result = await gradeWith(cluster, "demo-0001", [], appFor(files, cluster).service);
  assert.equal(result.checks[0].label, "Hidden check");
  assert.equal(result.checks[0].id, "hidden-1");
  assert.doesNotMatch(JSON.stringify(result), /SECRETNAME|secret-name/);
});
