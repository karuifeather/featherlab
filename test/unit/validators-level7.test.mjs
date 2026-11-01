/**
 * Unit tests for Level 7 validators:
 *   k8s.networkpolicy-spec  — structural NetworkPolicy checks
 *   k8s.traffic-blocked     — behavioral denial probes via kubectl exec + curl
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

const NS = "fl-k8s-0151";

function networkPolicy({
  name = "deny-all",
  namespace = NS,
  podSelector = {},
  policyTypes = ["Ingress"],
  ingress,
  egress,
} = {}) {
  const spec = { podSelector, policyTypes };
  if (ingress !== undefined) spec.ingress = ingress;
  if (egress !== undefined) spec.egress = egress;
  return {
    apiVersion: "networking.k8s.io/v1",
    kind: "NetworkPolicy",
    metadata: { name, namespace },
    spec,
  };
}

// ─── k8s.networkpolicy-spec ───────────────────────────────────────────────────

test("validator: networkpolicy-spec passes when policyTypes includes Ingress", async () => {
  const cluster = createFakeCluster({ resources: [networkPolicy()] });
  cluster.put({ apiVersion: "v1", kind: "Namespace", metadata: { name: NS } });
  const result = await grade(cluster, "k8s.networkpolicy-spec", {
    name: "deny-all",
    namespace: NS,
    policyTypes: ["Ingress"],
  });
  assert.equal(result.passed, true, result.feedback);
});

test("validator: networkpolicy-spec passes on empty podSelector (select all Pods)", async () => {
  const cluster = createFakeCluster({ resources: [networkPolicy({ podSelector: {} })] });
  cluster.put({ apiVersion: "v1", kind: "Namespace", metadata: { name: NS } });
  const result = await grade(cluster, "k8s.networkpolicy-spec", {
    name: "deny-all",
    namespace: NS,
    podSelector: {},
  });
  assert.equal(result.passed, true, result.feedback);
});

test("validator: networkpolicy-spec fails when policyTypes missing Egress", async () => {
  const cluster = createFakeCluster({
    resources: [networkPolicy({ policyTypes: ["Ingress"] })],
  });
  cluster.put({ apiVersion: "v1", kind: "Namespace", metadata: { name: NS } });
  const result = await grade(cluster, "k8s.networkpolicy-spec", {
    name: "deny-all",
    namespace: NS,
    policyTypes: ["Ingress", "Egress"],
  });
  assert.equal(result.passed, false);
  assert.match(result.feedback, /Egress/);
});

test("validator: networkpolicy-spec fails when podSelector has unexpected labels", async () => {
  const cluster = createFakeCluster({
    resources: [networkPolicy({ podSelector: { matchLabels: { app: "wrong" } } })],
  });
  cluster.put({ apiVersion: "v1", kind: "Namespace", metadata: { name: NS } });
  const result = await grade(cluster, "k8s.networkpolicy-spec", {
    name: "deny-all",
    namespace: NS,
    podSelector: { matchLabels: { app: "server" } },
  });
  assert.equal(result.passed, false);
  assert.match(result.feedback, /app/);
});

test("validator: networkpolicy-spec passes hasIngressRules:true when rules present", async () => {
  const cluster = createFakeCluster({
    resources: [
      networkPolicy({
        policyTypes: ["Ingress"],
        ingress: [{ from: [{ podSelector: { matchLabels: { role: "client" } } }] }],
      }),
    ],
  });
  cluster.put({ apiVersion: "v1", kind: "Namespace", metadata: { name: NS } });
  const result = await grade(cluster, "k8s.networkpolicy-spec", {
    name: "deny-all",
    namespace: NS,
    hasIngressRules: true,
  });
  assert.equal(result.passed, true, result.feedback);
});

test("validator: networkpolicy-spec fails hasIngressRules:true when no rules", async () => {
  const cluster = createFakeCluster({
    resources: [networkPolicy({ policyTypes: ["Ingress"] })],
  });
  cluster.put({ apiVersion: "v1", kind: "Namespace", metadata: { name: NS } });
  const result = await grade(cluster, "k8s.networkpolicy-spec", {
    name: "deny-all",
    namespace: NS,
    hasIngressRules: true,
  });
  assert.equal(result.passed, false);
  assert.match(result.feedback, /ingress rule/);
});

test("validator: networkpolicy-spec fails hasEgressRules:false when rules present", async () => {
  const cluster = createFakeCluster({
    resources: [
      networkPolicy({
        policyTypes: ["Egress"],
        egress: [{ to: [{ podSelector: {} }] }],
      }),
    ],
  });
  cluster.put({ apiVersion: "v1", kind: "Namespace", metadata: { name: NS } });
  const result = await grade(cluster, "k8s.networkpolicy-spec", {
    name: "deny-all",
    namespace: NS,
    hasEgressRules: false,
  });
  assert.equal(result.passed, false);
  assert.match(result.feedback, /egress rule/);
});

test("validator: networkpolicy-spec fails when NetworkPolicy not found", async () => {
  const cluster = createFakeCluster();
  cluster.put({ apiVersion: "v1", kind: "Namespace", metadata: { name: NS } });
  const result = await grade(cluster, "k8s.networkpolicy-spec", {
    name: "deny-all",
    namespace: NS,
    policyTypes: ["Ingress"],
  });
  assert.equal(result.passed, false);
  assert.match(result.feedback, /not found/);
});

test("validator: networkpolicy-spec fails when NetworkPolicy is being deleted", async () => {
  const policy = networkPolicy();
  policy.metadata.deletionTimestamp = new Date().toISOString();
  const cluster = createFakeCluster({ resources: [policy] });
  cluster.put({ apiVersion: "v1", kind: "Namespace", metadata: { name: NS } });
  const result = await grade(cluster, "k8s.networkpolicy-spec", {
    name: "deny-all",
    namespace: NS,
    policyTypes: ["Ingress"],
  });
  assert.equal(result.passed, false);
  assert.match(result.feedback, /being deleted/);
});

// ─── k8s.traffic-blocked ─────────────────────────────────────────────────────

function runningPod(name, namespace, ready = true) {
  return {
    apiVersion: "v1",
    kind: "Pod",
    metadata: { name, namespace },
    spec: { containers: [{ name: "c", image: "nginx:1.27" }] },
    status: {
      phase: "Running",
      conditions: ready ? [{ type: "Ready", status: "True" }] : [],
    },
  };
}

const blockedParams = {
  clientPod: "client",
  serverPod: "server",
  namespace: NS,
  host: `server.${NS}.svc.cluster.local`,
  port: 80,
};

test("validator: traffic-blocked passes on curl exit 28 (timeout)", async () => {
  const cluster = createFakeCluster({
    resources: [runningPod("client", NS), runningPod("server", NS)],
  });
  cluster.put({ apiVersion: "v1", kind: "Namespace", metadata: { name: NS } });
  cluster.setExecArgvResult("client", "curl", { exitCode: 28, stdout: "", stderr: "" });

  const result = await grade(cluster, "k8s.traffic-blocked", blockedParams);
  assert.equal(result.passed, true, result.feedback);
  assert.match(result.feedback, /blocked/);
});

test("validator: traffic-blocked passes on curl exit 6 (DNS blocked)", async () => {
  const cluster = createFakeCluster({
    resources: [runningPod("client", NS), runningPod("server", NS)],
  });
  cluster.put({ apiVersion: "v1", kind: "Namespace", metadata: { name: NS } });
  cluster.setExecArgvResult("client", "curl", { exitCode: 6, stdout: "", stderr: "" });

  const result = await grade(cluster, "k8s.traffic-blocked", blockedParams);
  assert.equal(result.passed, true, result.feedback);
  assert.match(result.feedback, /DNS/i);
});

test("validator: traffic-blocked passes on curl exit 7 (connection refused)", async () => {
  const cluster = createFakeCluster({
    resources: [runningPod("client", NS), runningPod("server", NS)],
  });
  cluster.put({ apiVersion: "v1", kind: "Namespace", metadata: { name: NS } });
  cluster.setExecArgvResult("client", "curl", { exitCode: 7, stdout: "", stderr: "" });

  const result = await grade(cluster, "k8s.traffic-blocked", blockedParams);
  assert.equal(result.passed, true, result.feedback);
  assert.match(result.feedback, /refused/);
});

test("validator: traffic-blocked fails when traffic is allowed (HTTP 200)", async () => {
  const cluster = createFakeCluster({
    resources: [runningPod("client", NS), runningPod("server", NS)],
  });
  cluster.put({ apiVersion: "v1", kind: "Namespace", metadata: { name: NS } });
  cluster.setExecArgvResult("client", "curl", { exitCode: 0, stdout: "200", stderr: "" });

  const result = await grade(cluster, "k8s.traffic-blocked", blockedParams);
  assert.equal(result.passed, false);
  assert.match(result.feedback, /allowed/);
});

test("validator: traffic-blocked fails on unexpected curl exit code", async () => {
  const cluster = createFakeCluster({
    resources: [runningPod("client", NS), runningPod("server", NS)],
  });
  cluster.put({ apiVersion: "v1", kind: "Namespace", metadata: { name: NS } });
  cluster.setExecArgvResult("client", "curl", { exitCode: 35, stdout: "", stderr: "" });

  const result = await grade(cluster, "k8s.traffic-blocked", blockedParams);
  assert.equal(result.passed, false);
  assert.match(result.feedback, /exit code 35/);
});

test("validator: traffic-blocked fails when client Pod not found", async () => {
  const cluster = createFakeCluster({ resources: [runningPod("server", NS)] });
  cluster.put({ apiVersion: "v1", kind: "Namespace", metadata: { name: NS } });

  const result = await grade(cluster, "k8s.traffic-blocked", blockedParams);
  assert.equal(result.passed, false);
  assert.match(result.feedback, /client/i);
  assert.match(result.feedback, /not found/);
});

test("validator: traffic-blocked fails when server Pod not found", async () => {
  const cluster = createFakeCluster({ resources: [runningPod("client", NS)] });
  cluster.put({ apiVersion: "v1", kind: "Namespace", metadata: { name: NS } });

  const result = await grade(cluster, "k8s.traffic-blocked", blockedParams);
  assert.equal(result.passed, false);
  assert.match(result.feedback, /server/i);
});

test("validator: traffic-blocked fails when server Pod is not Ready", async () => {
  const cluster = createFakeCluster({
    resources: [runningPod("client", NS), runningPod("server", NS, false)],
  });
  cluster.put({ apiVersion: "v1", kind: "Namespace", metadata: { name: NS } });
  cluster.setExecArgvResult("client", "curl", { exitCode: 28, stdout: "", stderr: "" });

  const result = await grade(cluster, "k8s.traffic-blocked", blockedParams);
  assert.equal(result.passed, false);
  assert.match(result.feedback, /not Ready/);
});

test("validator: traffic-blocked fails when client Pod is not Running", async () => {
  const pending = {
    ...runningPod("client", NS),
    status: { phase: "Pending", conditions: [] },
  };
  const cluster = createFakeCluster({
    resources: [pending, runningPod("server", NS)],
  });
  cluster.put({ apiVersion: "v1", kind: "Namespace", metadata: { name: NS } });

  const result = await grade(cluster, "k8s.traffic-blocked", blockedParams);
  assert.equal(result.passed, false);
  assert.match(result.feedback, /not Running/);
});
