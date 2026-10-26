import test from "node:test";
import assert from "node:assert/strict";
import { EnvironmentError } from "../../src/core/errors.mjs";
import { ValidatorRegistry } from "../../src/core/validation/registry.mjs";
import { combinators } from "../../src/core/validation/combinators.mjs";
import { evaluateCheck } from "../../src/core/validation/engine.mjs";
import { KubernetesQuery } from "../../src/tracks/kubernetes/query.mjs";
import { kubernetesValidators } from "../../src/tracks/kubernetes/validators.mjs";
import { createFakeCluster, deployment, readyPod } from "../helpers/fake-cluster.mjs";

const validators = new ValidatorRegistry([...combinators, ...kubernetesValidators]);

async function grade(cluster, type, params) {
  const query = new KubernetesQuery({ runner: cluster });
  return evaluateCheck({ id: "t", type, label: "t", params }, { validators, context: { query } });
}

const pod = { kind: "Pod", name: "web", namespace: "default" };

const cases = [
  ["resource-exists passes", [readyPod()], "k8s.resource-exists", pod, true],
  ["resource-exists fails when missing", [], "k8s.resource-exists", pod, false],
  [
    "resource-exists fails in the wrong namespace",
    [readyPod({ namespace: "other" })],
    "k8s.resource-exists",
    pod,
    false,
  ],
  ["resource-absent passes when missing", [], "k8s.resource-absent", pod, true],
  ["resource-absent fails when present", [readyPod()], "k8s.resource-absent", pod, false],
  ["resource-in-namespace passes", [readyPod()], "k8s.resource-in-namespace", pod, true],
  [
    "resource-in-namespace fails elsewhere",
    [readyPod({ namespace: "other" })],
    "k8s.resource-in-namespace",
    pod,
    false,
  ],
  [
    "container-image passes",
    [readyPod()],
    "k8s.container-image",
    { ...pod, image: "nginx:1.27" },
    true,
  ],
  [
    "container-image fails",
    [readyPod({ image: "busybox" })],
    "k8s.container-image",
    { ...pod, image: "nginx:1.27" },
    false,
  ],
  [
    "container-image reads Deployment templates",
    [deployment()],
    "k8s.container-image",
    { kind: "Deployment", name: "api", namespace: "staging", image: "nginx:1.27" },
    true,
  ],
  [
    "pod-phase passes",
    [readyPod()],
    "k8s.pod-phase",
    { name: "web", namespace: "default", phase: "Running" },
    true,
  ],
  [
    "pod-phase fails",
    [readyPod()],
    "k8s.pod-phase",
    { name: "web", namespace: "default", phase: "Pending" },
    false,
  ],
  ["pod-ready passes", [readyPod()], "k8s.pod-ready", { name: "web", namespace: "default" }, true],
  [
    "pod-ready fails when not ready",
    [
      {
        ...readyPod(),
        status: { phase: "Running", conditions: [{ type: "Ready", status: "False" }] },
      },
    ],
    "k8s.pod-ready",
    { name: "web", namespace: "default" },
    false,
  ],
  [
    "replicas-desired passes",
    [deployment()],
    "k8s.replicas-desired",
    { kind: "Deployment", name: "api", namespace: "staging", replicas: 2 },
    true,
  ],
  [
    "replicas-desired fails",
    [deployment({ replicas: 3 })],
    "k8s.replicas-desired",
    { kind: "Deployment", name: "api", namespace: "staging", replicas: 2 },
    false,
  ],
  [
    "replicas-available fails when pods are not up",
    [deployment({ available: 1 })],
    "k8s.replicas-available",
    { kind: "Deployment", name: "api", namespace: "staging", replicas: 2 },
    false,
  ],
  [
    "replicas-ready passes",
    [deployment()],
    "k8s.replicas-ready",
    { kind: "Deployment", name: "api", namespace: "staging", replicas: 2 },
    true,
  ],
  [
    "labels passes",
    [deployment()],
    "k8s.labels",
    { kind: "Deployment", name: "api", namespace: "staging", labels: { tier: "backend" } },
    true,
  ],
  [
    "labels fails on wrong value",
    [deployment({ labels: { tier: "frontend" } })],
    "k8s.labels",
    { kind: "Deployment", name: "api", namespace: "staging", labels: { tier: "backend" } },
    false,
  ],
  [
    "annotations fails when missing",
    [deployment()],
    "k8s.annotations",
    { kind: "Deployment", name: "api", namespace: "staging", annotations: { owner: "me" } },
    false,
  ],
];

for (const [name, resources, type, params, expected] of cases) {
  test(`validator: ${name}`, async () => {
    const result = await grade(createFakeCluster({ resources }), type, params);
    assert.equal(result.passed, expected, result.feedback);
    assert.equal(result.status, expected ? "passed" : "failed");
    assert.ok(result.feedback.length > 0);
  });
}

test("a resource being deleted does not count as existing", async () => {
  const terminating = readyPod();
  terminating.metadata.deletionTimestamp = "2026-01-01T00:00:00Z";
  const cluster = createFakeCluster({ resources: [terminating] });
  assert.equal((await grade(cluster, "k8s.resource-exists", pod)).passed, false);
  assert.match((await grade(cluster, "k8s.resource-absent", pod)).feedback, /still being deleted/);
});

test("wrong-namespace feedback says where the resource is", async () => {
  const cluster = createFakeCluster({ resources: [readyPod({ namespace: "other" })] });
  const result = await grade(cluster, "k8s.resource-in-namespace", pod);
  assert.match(result.feedback, /namespace "other"/);
});

test("an unreachable cluster is an error, not a failed answer", async () => {
  const cluster = createFakeCluster({ resources: [readyPod()] });
  cluster.down = true;
  const result = await grade(cluster, "k8s.resource-exists", pod);
  assert.equal(result.status, "error");
  assert.equal(result.passed, false);
  assert.ok(result.error instanceof EnvironmentError);
  assert.match(result.feedback, /practice cluster/);
});

test("any-of accepts multiple valid solutions", async () => {
  const params = {
    checks: [
      { type: "k8s.container-image", params: { ...pod, image: "nginx:1.27" } },
      { type: "k8s.container-image", params: { ...pod, image: "nginx:1.27-alpine" } },
    ],
  };
  for (const image of ["nginx:1.27", "nginx:1.27-alpine"])
    assert.equal(
      (await grade(createFakeCluster({ resources: [readyPod({ image })] }), "any-of", params))
        .passed,
      true,
    );
  const wrong = await grade(
    createFakeCluster({ resources: [readyPod({ image: "busybox" })] }),
    "any-of",
    params,
  );
  assert.equal(wrong.passed, false);
});

test("all-of requires every child and propagates infrastructure errors", async () => {
  const params = {
    checks: [
      { type: "k8s.resource-exists", params: pod },
      { type: "k8s.pod-ready", params: { name: "web", namespace: "default" } },
    ],
  };
  const cluster = createFakeCluster({ resources: [readyPod()] });
  assert.equal((await grade(cluster, "all-of", params)).passed, true);
  cluster.down = true;
  assert.equal((await grade(createFakeCluster({ resources: [] }), "all-of", params)).passed, false);
  assert.equal((await grade(cluster, "all-of", params)).status, "error");
});

test("registering a validator twice, or an incomplete one, is rejected", () => {
  const registry = new ValidatorRegistry(combinators);
  assert.throws(() => registry.register(combinators[0]), /registered twice/);
  assert.throws(() => registry.register({ type: "x.y", track: null }), /must define/);
});
