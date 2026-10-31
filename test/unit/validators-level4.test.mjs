/**
 * Unit tests for Level 4 validators: resource management and scheduling.
 * Uses the same fake-cluster pattern as validators.test.mjs.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { ValidatorRegistry } from "../../src/core/validation/registry.mjs";
import { combinators } from "../../src/core/validation/combinators.mjs";
import { evaluateCheck } from "../../src/core/validation/engine.mjs";
import { KubernetesQuery } from "../../src/tracks/kubernetes/query.mjs";
import { kubernetesValidators } from "../../src/tracks/kubernetes/validators.mjs";
import { createFakeCluster } from "../helpers/fake-cluster.mjs";

const validators = new ValidatorRegistry([...combinators, ...kubernetesValidators]);

async function grade(cluster, type, params) {
  const query = new KubernetesQuery({ runner: cluster });
  return evaluateCheck({ id: "t", type, label: "t", params }, { validators, context: { query } });
}

const ns = "fl-k8s-0079";

function makePod({ qosClass, requests, limits, nodeSelector, tolerations, affinity } = {}) {
  const resources = {};
  if (requests) resources.requests = requests;
  if (limits) resources.limits = limits;
  return {
    apiVersion: "v1",
    kind: "Pod",
    metadata: { name: "web", namespace: ns },
    spec: {
      containers: [{ name: "app", image: "nginx:1.27", resources }],
      ...(nodeSelector ? { nodeSelector } : {}),
      ...(tolerations ? { tolerations } : {}),
      ...(affinity ? { affinity } : {}),
    },
    status: {
      phase: "Running",
      qosClass: qosClass ?? "BestEffort",
      conditions: [{ type: "Ready", status: "True" }],
    },
  };
}

function makeDeployment({ nodeSelector, tolerations, affinity } = {}) {
  return {
    apiVersion: "apps/v1",
    kind: "Deployment",
    metadata: { name: "app", namespace: ns },
    spec: {
      replicas: 1,
      selector: { matchLabels: { app: "web" } },
      template: {
        metadata: { labels: { app: "web" } },
        spec: {
          containers: [{ name: "app", image: "nginx:1.27" }],
          ...(nodeSelector ? { nodeSelector } : {}),
          ...(tolerations ? { tolerations } : {}),
          ...(affinity ? { affinity } : {}),
        },
      },
    },
    status: {
      replicas: 1,
      readyReplicas: 1,
      availableReplicas: 1,
      updatedReplicas: 1,
      observedGeneration: 1,
    },
  };
}

function makeResourceQuota(hard) {
  return {
    apiVersion: "v1",
    kind: "ResourceQuota",
    metadata: { name: "team-quota", namespace: ns },
    spec: { hard },
    status: { hard, used: {} },
  };
}

function makeLimitRange(limits) {
  return {
    apiVersion: "v1",
    kind: "LimitRange",
    metadata: { name: "default-limits", namespace: ns },
    spec: { limits },
  };
}

function makeHPA({
  minReplicas,
  maxReplicas,
  scaleTargetRef,
  targetCPUUtilizationPercentage,
} = {}) {
  return {
    apiVersion: "autoscaling/v2",
    kind: "HorizontalPodAutoscaler",
    metadata: { name: "app-hpa", namespace: ns },
    spec: {
      scaleTargetRef: scaleTargetRef ?? { apiVersion: "apps/v1", kind: "Deployment", name: "app" },
      minReplicas: minReplicas ?? 2,
      maxReplicas: maxReplicas ?? 5,
      ...(targetCPUUtilizationPercentage !== undefined
        ? { targetCPUUtilizationPercentage }
        : {
            metrics: [
              {
                type: "Resource",
                resource: { name: "cpu", target: { type: "Utilization", averageUtilization: 80 } },
              },
            ],
          }),
    },
  };
}

// ─── pod-qos-class ─────────────────────────────────────────────────────────
test("pod-qos-class: passes when class matches", async () => {
  const cluster = createFakeCluster({ resources: [makePod({ qosClass: "Guaranteed" })] });
  const r = await grade(cluster, "k8s.pod-qos-class", {
    name: "web",
    namespace: ns,
    qosClass: "Guaranteed",
  });
  assert.equal(r.passed, true);
});

test("pod-qos-class: fails when class differs", async () => {
  const cluster = createFakeCluster({ resources: [makePod({ qosClass: "Burstable" })] });
  const r = await grade(cluster, "k8s.pod-qos-class", {
    name: "web",
    namespace: ns,
    qosClass: "Guaranteed",
  });
  assert.equal(r.passed, false);
  assert.match(r.feedback, /Burstable/);
});

test("pod-qos-class: fails when pod missing", async () => {
  const cluster = createFakeCluster({ resources: [] });
  const r = await grade(cluster, "k8s.pod-qos-class", {
    name: "web",
    namespace: ns,
    qosClass: "Guaranteed",
  });
  assert.equal(r.passed, false);
});

// ─── resource-quota ────────────────────────────────────────────────────────
test("resource-quota: passes when hard limits match", async () => {
  const cluster = createFakeCluster({
    resources: [makeResourceQuota({ "requests.cpu": "4", "requests.memory": "4Gi" })],
  });
  const r = await grade(cluster, "k8s.resource-quota", {
    name: "team-quota",
    namespace: ns,
    hard: { "requests.cpu": "4000m", "requests.memory": "4Gi" },
  });
  assert.equal(r.passed, true, r.feedback);
});

test("resource-quota: fails when a hard limit is missing", async () => {
  const cluster = createFakeCluster({
    resources: [makeResourceQuota({ "requests.cpu": "2" })],
  });
  const r = await grade(cluster, "k8s.resource-quota", {
    name: "team-quota",
    namespace: ns,
    hard: { "requests.cpu": "2", "requests.memory": "4Gi" },
  });
  assert.equal(r.passed, false);
  assert.match(r.feedback, /requests\.memory/);
});

test("resource-quota: fails when quota is absent", async () => {
  const cluster = createFakeCluster({ resources: [] });
  const r = await grade(cluster, "k8s.resource-quota", {
    name: "team-quota",
    namespace: ns,
    hard: { "requests.cpu": "2" },
  });
  assert.equal(r.passed, false);
});

// ─── limit-range ───────────────────────────────────────────────────────────
test("limit-range: passes when Container limits match", async () => {
  const cluster = createFakeCluster({
    resources: [
      makeLimitRange([
        {
          type: "Container",
          default: { cpu: "200m", memory: "128Mi" },
          defaultRequest: { cpu: "100m", memory: "64Mi" },
          max: { cpu: "1", memory: "512Mi" },
        },
      ]),
    ],
  });
  const r = await grade(cluster, "k8s.limit-range", {
    name: "default-limits",
    namespace: ns,
    limitType: "Container",
    default: { cpu: "200m", memory: "128Mi" },
    max: { cpu: "1000m" },
  });
  assert.equal(r.passed, true, r.feedback);
});

test("limit-range: fails when limit-range is absent", async () => {
  const cluster = createFakeCluster({ resources: [] });
  const r = await grade(cluster, "k8s.limit-range", {
    name: "default-limits",
    namespace: ns,
    limitType: "Container",
    max: { cpu: "1" },
  });
  assert.equal(r.passed, false);
});

test("limit-range: fails when wrong default value", async () => {
  const cluster = createFakeCluster({
    resources: [makeLimitRange([{ type: "Container", default: { cpu: "100m" } }])],
  });
  const r = await grade(cluster, "k8s.limit-range", {
    name: "default-limits",
    namespace: ns,
    limitType: "Container",
    default: { cpu: "200m" },
  });
  assert.equal(r.passed, false);
  assert.match(r.feedback, /cpu/);
});

// ─── node-selector ─────────────────────────────────────────────────────────
test("node-selector: passes when selector matches", async () => {
  const cluster = createFakeCluster({
    resources: [makeDeployment({ nodeSelector: { "kubernetes.io/os": "linux" } })],
  });
  const r = await grade(cluster, "k8s.node-selector", {
    kind: "Deployment",
    name: "app",
    namespace: ns,
    selector: { "kubernetes.io/os": "linux" },
  });
  assert.equal(r.passed, true);
});

test("node-selector: fails when selector key missing", async () => {
  const cluster = createFakeCluster({ resources: [makeDeployment()] });
  const r = await grade(cluster, "k8s.node-selector", {
    kind: "Deployment",
    name: "app",
    namespace: ns,
    selector: { "kubernetes.io/os": "linux" },
  });
  assert.equal(r.passed, false);
  assert.match(r.feedback, /missing/);
});

test("node-selector: fails when selector value wrong", async () => {
  const cluster = createFakeCluster({
    resources: [makeDeployment({ nodeSelector: { "kubernetes.io/os": "windows" } })],
  });
  const r = await grade(cluster, "k8s.node-selector", {
    kind: "Deployment",
    name: "app",
    namespace: ns,
    selector: { "kubernetes.io/os": "linux" },
  });
  assert.equal(r.passed, false);
});

// ─── pod-tolerations ───────────────────────────────────────────────────────
test("pod-tolerations: passes when toleration present", async () => {
  const cluster = createFakeCluster({
    resources: [
      makeDeployment({
        tolerations: [
          {
            key: "node-role.kubernetes.io/control-plane",
            operator: "Exists",
            effect: "NoSchedule",
          },
        ],
      }),
    ],
  });
  const r = await grade(cluster, "k8s.pod-tolerations", {
    kind: "Deployment",
    name: "app",
    namespace: ns,
    tolerations: [
      { key: "node-role.kubernetes.io/control-plane", operator: "Exists", effect: "NoSchedule" },
    ],
  });
  assert.equal(r.passed, true);
});

test("pod-tolerations: fails when toleration missing", async () => {
  const cluster = createFakeCluster({ resources: [makeDeployment()] });
  const r = await grade(cluster, "k8s.pod-tolerations", {
    kind: "Deployment",
    name: "app",
    namespace: ns,
    tolerations: [{ key: "special", effect: "NoSchedule" }],
  });
  assert.equal(r.passed, false);
  assert.match(r.feedback, /missing/);
});

test("pod-tolerations: passes with Equal operator and matching value", async () => {
  const cluster = createFakeCluster({
    resources: [
      makeDeployment({
        tolerations: [{ key: "env", operator: "Equal", value: "prod", effect: "NoSchedule" }],
      }),
    ],
  });
  const r = await grade(cluster, "k8s.pod-tolerations", {
    kind: "Deployment",
    name: "app",
    namespace: ns,
    tolerations: [{ key: "env", operator: "Equal", value: "prod", effect: "NoSchedule" }],
  });
  assert.equal(r.passed, true);
});

test("pod-tolerations: fails when Equal value differs", async () => {
  const cluster = createFakeCluster({
    resources: [
      makeDeployment({
        tolerations: [{ key: "env", operator: "Equal", value: "staging", effect: "NoSchedule" }],
      }),
    ],
  });
  const r = await grade(cluster, "k8s.pod-tolerations", {
    kind: "Deployment",
    name: "app",
    namespace: ns,
    tolerations: [{ key: "env", operator: "Equal", value: "prod", effect: "NoSchedule" }],
  });
  assert.equal(r.passed, false);
});

// ─── node-affinity ─────────────────────────────────────────────────────────
test("node-affinity: passes for required rule present", async () => {
  const cluster = createFakeCluster({
    resources: [
      makeDeployment({
        affinity: {
          nodeAffinity: {
            requiredDuringSchedulingIgnoredDuringExecution: {
              nodeSelectorTerms: [
                {
                  matchExpressions: [
                    { key: "kubernetes.io/os", operator: "In", values: ["linux"] },
                  ],
                },
              ],
            },
          },
        },
      }),
    ],
  });
  const r = await grade(cluster, "k8s.node-affinity", {
    kind: "Deployment",
    name: "app",
    namespace: ns,
    scheduling: "required",
    key: "kubernetes.io/os",
    operator: "In",
    values: ["linux"],
  });
  assert.equal(r.passed, true);
});

test("node-affinity: fails when no nodeAffinity", async () => {
  const cluster = createFakeCluster({ resources: [makeDeployment()] });
  const r = await grade(cluster, "k8s.node-affinity", {
    kind: "Deployment",
    name: "app",
    namespace: ns,
    scheduling: "required",
    key: "kubernetes.io/os",
    operator: "In",
  });
  assert.equal(r.passed, false);
  assert.match(r.feedback, /no nodeAffinity/);
});

test("node-affinity: passes for preferred rule present", async () => {
  const cluster = createFakeCluster({
    resources: [
      makeDeployment({
        affinity: {
          nodeAffinity: {
            preferredDuringSchedulingIgnoredDuringExecution: [
              {
                weight: 1,
                preference: {
                  matchExpressions: [{ key: "zone", operator: "In", values: ["us-east"] }],
                },
              },
            ],
          },
        },
      }),
    ],
  });
  const r = await grade(cluster, "k8s.node-affinity", {
    kind: "Deployment",
    name: "app",
    namespace: ns,
    scheduling: "preferred",
    key: "zone",
    operator: "In",
  });
  assert.equal(r.passed, true);
});

// ─── hpa-config ────────────────────────────────────────────────────────────
test("hpa-config: passes when all checked fields match", async () => {
  const cluster = createFakeCluster({ resources: [makeHPA()] });
  const r = await grade(cluster, "k8s.hpa-config", {
    name: "app-hpa",
    namespace: ns,
    minReplicas: 2,
    maxReplicas: 5,
    targetRef: { kind: "Deployment", name: "app" },
    cpuUtilization: 80,
  });
  assert.equal(r.passed, true, r.feedback);
});

test("hpa-config: fails when maxReplicas wrong", async () => {
  const cluster = createFakeCluster({ resources: [makeHPA({ maxReplicas: 3 })] });
  const r = await grade(cluster, "k8s.hpa-config", {
    name: "app-hpa",
    namespace: ns,
    maxReplicas: 5,
  });
  assert.equal(r.passed, false);
  assert.match(r.feedback, /maxReplicas/);
});

test("hpa-config: passes v1 CPU utilization field", async () => {
  const cluster = createFakeCluster({
    resources: [makeHPA({ targetCPUUtilizationPercentage: 60 })],
  });
  const r = await grade(cluster, "k8s.hpa-config", {
    name: "app-hpa",
    namespace: ns,
    cpuUtilization: 60,
  });
  assert.equal(r.passed, true, r.feedback);
});

test("hpa-config: fails when hpa is absent", async () => {
  const cluster = createFakeCluster({ resources: [] });
  const r = await grade(cluster, "k8s.hpa-config", {
    name: "app-hpa",
    namespace: ns,
    maxReplicas: 5,
  });
  assert.equal(r.passed, false);
});
