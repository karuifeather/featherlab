import test from "node:test";
import assert from "node:assert/strict";
import { ValidatorRegistry } from "../../src/core/validation/registry.mjs";
import { combinators } from "../../src/core/validation/combinators.mjs";
import { evaluateCheck } from "../../src/core/validation/engine.mjs";
import { Problems } from "../../src/core/schema.mjs";
import { KubernetesQuery } from "../../src/tracks/kubernetes/query.mjs";
import { parseQuantity, sameQuantity } from "../../src/tracks/kubernetes/quantity.mjs";
import { kubernetesValidators } from "../../src/tracks/kubernetes/validators.mjs";
import { createFakeCluster, deployment } from "../helpers/fake-cluster.mjs";

const validators = new ValidatorRegistry([...combinators, ...kubernetesValidators]);
const NS = "fl-demo-0001";

async function grade(resources, type, params) {
  const query = new KubernetesQuery({ runner: createFakeCluster({ resources }) });
  return evaluateCheck({ id: "t", type, label: "t", params }, { validators, context: { query } });
}

function paramProblems(type, params) {
  const problems = new Problems("x");
  validators.validateCheck(
    { id: "t", type, label: "t", params },
    { track: "kubernetes", problems, path: "c" },
  );
  return problems.list.map((p) => `${p.path}: ${p.message}`);
}

/** A Deployment whose pod template carries the given containers and labels. */
function workload({ containers, labels = { app: "web" }, replicas = 2, status } = {}) {
  const d = deployment({ name: "web", namespace: NS, replicas });
  d.spec.selector = { matchLabels: labels };
  d.spec.template = { metadata: { labels }, spec: { containers } };
  if (status) d.status = { ...d.status, ...status };
  return d;
}

const nginx = (extra = {}) => ({ name: "app", image: "nginx:1.27", ...extra });

// ── Quantities ───────────────────────────────────────────────────────────────

test("quantities compare by amount, not spelling", () => {
  for (const [a, b] of [
    ["100m", "0.1"],
    ["1", "1000m"],
    ["64Mi", "67108864"],
    ["128Mi", "134217728"],
    ["1k", "1000"],
    ["1e3", "1k"],
    ["0.5Gi", "512Mi"],
  ])
    assert.ok(sameQuantity(a, b), `${a} == ${b}`);
  for (const [a, b] of [
    ["64M", "64Mi"],
    ["100m", "100"],
    ["1Gi", "1G"],
  ])
    assert.ok(!sameQuantity(a, b), `${a} != ${b}`);
  assert.equal(parseQuantity("lots"), undefined);
  assert.equal(sameQuantity(undefined, "1"), false);
});

// ── k8s.rollout-complete ─────────────────────────────────────────────────────

test("rollout-complete passes only when every replica runs the current template and is available", async () => {
  const p = { name: "web", namespace: NS, replicas: 2 };
  const ok = await grade([workload({ containers: [nginx()] })], "k8s.rollout-complete", p);
  assert.equal(ok.passed, true, ok.feedback);
  for (const [why, status, replicas] of [
    ["a newer generation is not observed yet", { observedGeneration: 0 }],
    ["an old replica is still running", { replicas: 3 }],
    ["only one replica is updated", { updatedReplicas: 1 }],
    ["available replicas are missing", { availableReplicas: 1 }],
    ["not ready", { readyReplicas: 0 }],
    ["wrong replica count", {}, 3],
  ]) {
    const result = await grade(
      [workload({ containers: [nginx()], status, replicas })],
      "k8s.rollout-complete",
      p,
    );
    assert.equal(result.passed, false, why);
  }
});

// ── k8s.container-resources ──────────────────────────────────────────────────

test("container-resources accepts equivalent quantities and grades only the named container", async () => {
  const p = {
    kind: "Deployment",
    name: "web",
    namespace: NS,
    container: "app",
    requests: { cpu: "100m", memory: "64Mi" },
    limits: { memory: "128Mi" },
  };
  const app = (resources) =>
    workload({ containers: [nginx({ resources }), { name: "side", image: "x" }] });
  const equivalent = await grade(
    [app({ requests: { cpu: "0.1", memory: "67108864" }, limits: { memory: "128Mi", cpu: "2" } })],
    "k8s.container-resources",
    p,
  );
  assert.equal(equivalent.passed, true, equivalent.feedback);

  const missing = await grade([app({ limits: { memory: "128Mi" } })], "k8s.container-resources", p);
  assert.equal(missing.passed, false);
  assert.match(missing.feedback, /cpu request is not set/);

  // Correct values on the wrong container.
  const misplaced = workload({
    containers: [
      nginx(),
      {
        name: "side",
        image: "x",
        resources: { requests: { cpu: "100m", memory: "64Mi" }, limits: { memory: "128Mi" } },
      },
    ],
  });
  assert.equal((await grade([misplaced], "k8s.container-resources", p)).passed, false);

  const noContainer = await grade([app({})], "k8s.container-resources", {
    ...p,
    container: "nope",
  });
  assert.match(noContainer.feedback, /has no container "nope"/);

  assert.ok(
    paramProblems("k8s.container-resources", { ...p, requests: { cpu: "lots" } }).some((m) =>
      /not a Kubernetes quantity/.test(m),
    ),
  );
  assert.ok(
    paramProblems("k8s.container-resources", {
      kind: "Deployment",
      name: "web",
      namespace: NS,
      container: "app",
    }).some((m) => /requests and\/or limits/.test(m)),
  );
});

// ── k8s.container-probe ──────────────────────────────────────────────────────

test("container-probe requires the probe type, handler and path, without dictating the port", async () => {
  const p = {
    kind: "Deployment",
    name: "web",
    namespace: NS,
    container: "app",
    probe: "readiness",
    handler: "httpGet",
  };
  const withProbe = (readinessProbe) => [workload({ containers: [nginx({ readinessProbe })] })];
  for (const port of [80, "http"])
    assert.equal(
      (await grade(withProbe({ httpGet: { path: "/", port } }), "k8s.container-probe", p)).passed,
      true,
    );
  assert.equal(
    (await grade(withProbe(undefined), "k8s.container-probe", p)).passed,
    false,
    "deleted probe",
  );
  assert.equal(
    (await grade(withProbe({ tcpSocket: { port: 80 } }), "k8s.container-probe", p)).passed,
    false,
    "other handler",
  );
  const path = { ...p, path: "/healthz" };
  assert.equal(
    (await grade(withProbe({ httpGet: { path: "/", port: 80 } }), "k8s.container-probe", path))
      .passed,
    false,
  );
  assert.equal(
    (
      await grade(
        withProbe({ httpGet: { path: "/healthz", port: 80 } }),
        "k8s.container-probe",
        path,
      )
    ).passed,
    true,
  );
  // A liveness probe does not satisfy a readiness requirement.
  const live = [
    workload({ containers: [nginx({ livenessProbe: { httpGet: { path: "/", port: 80 } } })] }),
  ];
  assert.equal((await grade(live, "k8s.container-probe", p)).passed, false);
});

// ── k8s.container-env ────────────────────────────────────────────────────────

test("container-env distinguishes literal values from ConfigMap references", async () => {
  const literal = {
    kind: "Deployment",
    name: "web",
    namespace: NS,
    container: "app",
    env: "LOG_LEVEL",
    value: "debug",
  };
  const withEnv = (env) => [workload({ containers: [nginx({ env })] })];
  assert.equal(
    (await grade(withEnv([{ name: "LOG_LEVEL", value: "debug" }]), "k8s.container-env", literal))
      .passed,
    true,
  );
  assert.equal(
    (await grade(withEnv([{ name: "LOG_LEVEL", value: "info" }]), "k8s.container-env", literal))
      .passed,
    false,
  );
  assert.equal((await grade(withEnv([]), "k8s.container-env", literal)).passed, false);

  const ref = {
    ...literal,
    env: "MODE",
    value: undefined,
    configMapKeyRef: { name: "payments-config", key: "mode" },
  };
  delete ref.value;
  const fromConfigMap = (name, key = "mode") =>
    withEnv([{ name: "MODE", valueFrom: { configMapKeyRef: { name, key } } }]);
  assert.equal(
    (await grade(fromConfigMap("payments-config"), "k8s.container-env", ref)).passed,
    true,
  );
  assert.equal(
    (await grade(fromConfigMap("payment-config"), "k8s.container-env", ref)).passed,
    false,
  );
  assert.equal(
    (await grade(fromConfigMap("payments-config", "other"), "k8s.container-env", ref)).passed,
    false,
  );
  assert.ok(
    paramProblems("k8s.container-env", {
      ...literal,
      configMapKeyRef: { name: "x", key: "y" },
    }).some((m) => /exactly one/.test(m)),
  );
});

// ── k8s.configmap-mounted ────────────────────────────────────────────────────

test("configmap-mounted requires the volume to be mounted into the named container", async () => {
  const p = { kind: "Deployment", name: "web", namespace: NS, container: "app", configMap: "conf" };
  const d = (volumeMounts, volumes) => {
    const w = workload({
      containers: [
        nginx({ volumeMounts }),
        { name: "side", image: "x", volumeMounts: [{ name: "c", mountPath: "/c" }] },
      ],
    });
    w.spec.template.spec.volumes = volumes;
    return [w];
  };
  const volume = [{ name: "c", configMap: { name: "conf" } }];
  assert.equal(
    (await grade(d([{ name: "c", mountPath: "/etc/x" }], volume), "k8s.configmap-mounted", p))
      .passed,
    true,
  );
  assert.equal(
    (await grade(d([], volume), "k8s.configmap-mounted", p)).passed,
    false,
    "mounted only in the sidecar",
  );
  assert.equal(
    (
      await grade(
        d([{ name: "c", mountPath: "/x" }], [{ name: "c", configMap: { name: "other" } }]),
        "k8s.configmap-mounted",
        p,
      )
    ).passed,
    false,
  );
});

// ── k8s.service-selects ──────────────────────────────────────────────────────

test("service-selects checks the selector against the named workload, not any Pod", async () => {
  const svc = (selector, targetPort = 80) => ({
    apiVersion: "v1",
    kind: "Service",
    metadata: { name: "web", namespace: NS },
    spec: { selector, ports: [{ port: 80, targetPort }] },
  });
  const app = workload({
    containers: [nginx({ ports: [{ name: "http", containerPort: 80 }] })],
    labels: { app: "web", tier: "fe" },
  });
  const p = { name: "web", namespace: NS, workload: { kind: "Deployment", name: "web" } };
  assert.equal(
    (await grade([svc({ app: "web" }), app], "k8s.service-selects", p)).passed,
    true,
    "subset of labels",
  );
  assert.equal(
    (await grade([svc({ app: "web" }, "http"), app], "k8s.service-selects", p)).passed,
    true,
    "named port",
  );
  const typo = await grade([svc({ app: "wbe" }), app], "k8s.service-selects", p);
  assert.equal(typo.passed, false);
  assert.doesNotMatch(typo.feedback, /wbe|app=web/, "feedback does not hand out the fix");
  assert.equal(
    (await grade([svc({}), app], "k8s.service-selects", p)).passed,
    false,
    "no selector",
  );
  assert.equal(
    (await grade([svc({ app: "web" }, "web"), app], "k8s.service-selects", p)).passed,
    false,
    "unknown named port",
  );
  assert.equal((await grade([app], "k8s.service-selects", p)).passed, false, "no Service");
  // A stray Pod carrying the selected labels does not count: only the named workload does.
  const stray = {
    apiVersion: "v1",
    kind: "Pod",
    metadata: { name: "stray", namespace: NS, labels: { app: "wbe" } },
    spec: { containers: [nginx()] },
  };
  assert.equal(
    (await grade([svc({ app: "wbe" }), app, stray], "k8s.service-selects", p)).passed,
    false,
  );
});

// ── k8s.label-absent ─────────────────────────────────────────────────────────

test("label-absent passes only for an existing object without the key", async () => {
  const pod = (labels) => ({
    apiVersion: "v1",
    kind: "Pod",
    metadata: { name: "alpha", namespace: NS, labels },
    spec: { containers: [nginx()] },
  });
  const p = { kind: "Pod", name: "alpha", namespace: NS, label: "review" };
  assert.equal((await grade([pod({ app: "notes" })], "k8s.label-absent", p)).passed, true);
  const labelled = await grade([pod({ review: "needed" })], "k8s.label-absent", p);
  assert.equal(labelled.passed, false);
  assert.match(labelled.feedback, /still carries label "review"/);
  assert.equal((await grade([pod({ review: "" })], "k8s.label-absent", p)).passed, false);
  // Deleting the object must not satisfy "not labelled".
  const missing = await grade([], "k8s.label-absent", p);
  assert.equal(missing.passed, false);
  assert.match(missing.feedback, /was not found/);
});

// ── k8s.deployment-strategy ──────────────────────────────────────────────────

test("deployment-strategy passes when strategy type and rollingUpdate params match", async () => {
  const ns = NS;
  const withStrategy = (strategy) => ({
    apiVersion: "apps/v1",
    kind: "Deployment",
    metadata: { name: "billing", namespace: ns },
    spec: { replicas: 2, strategy, template: { spec: { containers: [] } } },
    status: {
      observedGeneration: 1,
      replicas: 2,
      updatedReplicas: 2,
      availableReplicas: 2,
      readyReplicas: 2,
    },
  });

  // Recreate strategy passes with just strategy check
  const recreate = withStrategy({ type: "Recreate" });
  assert.equal(
    (
      await grade([recreate], "k8s.deployment-strategy", {
        name: "billing",
        namespace: ns,
        strategy: "Recreate",
      })
    ).passed,
    true,
  );

  // RollingUpdate passes with matching maxSurge and maxUnavailable
  const rolling = withStrategy({
    type: "RollingUpdate",
    rollingUpdate: { maxSurge: 1, maxUnavailable: 0 },
  });
  assert.equal(
    (
      await grade([rolling], "k8s.deployment-strategy", {
        name: "billing",
        namespace: ns,
        strategy: "RollingUpdate",
        maxSurge: "1",
        maxUnavailable: "0",
      })
    ).passed,
    true,
  );

  // Wrong strategy type fails
  const wrongType = await grade([recreate], "k8s.deployment-strategy", {
    name: "billing",
    namespace: ns,
    strategy: "RollingUpdate",
  });
  assert.equal(wrongType.passed, false);
  assert.match(wrongType.feedback, /Recreate/);

  // Correct strategy type, wrong maxSurge fails
  const wrongSurge = await grade([rolling], "k8s.deployment-strategy", {
    name: "billing",
    namespace: ns,
    strategy: "RollingUpdate",
    maxSurge: "2",
    maxUnavailable: "0",
  });
  assert.equal(wrongSurge.passed, false);
  assert.match(wrongSurge.feedback, /maxSurge/);

  // RollingUpdate passes when maxUnavailable is the only param checked
  assert.equal(
    (
      await grade([rolling], "k8s.deployment-strategy", {
        name: "billing",
        namespace: ns,
        strategy: "RollingUpdate",
        maxUnavailable: "0",
      })
    ).passed,
    true,
  );

  // Missing deployment returns not-found feedback
  const absent = await grade([], "k8s.deployment-strategy", {
    name: "billing",
    namespace: ns,
    strategy: "RollingUpdate",
  });
  assert.equal(absent.passed, false);
  assert.match(absent.feedback, /not found/i);
});

// ── k8s.deployment-not-paused ────────────────────────────────────────────────

test("deployment-not-paused passes when spec.paused is absent or false, fails when true", async () => {
  const ns = NS;
  const withPaused = (paused) => ({
    apiVersion: "apps/v1",
    kind: "Deployment",
    metadata: { name: "search", namespace: ns },
    spec: { replicas: 2, paused, template: { spec: { containers: [] } } },
    status: {
      observedGeneration: 1,
      replicas: 2,
      updatedReplicas: 2,
      availableReplicas: 2,
      readyReplicas: 2,
    },
  });

  assert.equal(
    (
      await grade([withPaused(false)], "k8s.deployment-not-paused", {
        name: "search",
        namespace: ns,
      })
    ).passed,
    true,
    "paused: false",
  );
  assert.equal(
    (
      await grade([withPaused(undefined)], "k8s.deployment-not-paused", {
        name: "search",
        namespace: ns,
      })
    ).passed,
    true,
    "paused: undefined",
  );

  const paused = await grade([withPaused(true)], "k8s.deployment-not-paused", {
    name: "search",
    namespace: ns,
  });
  assert.equal(paused.passed, false, "paused: true");
  assert.match(paused.feedback, /paused/i);
  assert.match(paused.feedback, /resume/i);

  // Absent deployment fails
  const absent = await grade([], "k8s.deployment-not-paused", { name: "search", namespace: ns });
  assert.equal(absent.passed, false);
  assert.match(absent.feedback, /not found/i);
});

// ── k8s.pod-template-labels ───────────────────────────────────────────────────

test("pod-template-labels checks spec.template.metadata.labels, not the object's own labels", async () => {
  const ns = NS;
  const withTemplateLabels = (templateLabels) => ({
    apiVersion: "apps/v1",
    kind: "Deployment",
    metadata: { name: "catalog", namespace: ns, labels: { app: "catalog" } },
    spec: {
      replicas: 2,
      selector: { matchLabels: { app: "catalog" } },
      template: {
        metadata: { labels: { app: "catalog", ...templateLabels } },
        spec: { containers: [] },
      },
    },
    status: {
      observedGeneration: 1,
      replicas: 2,
      updatedReplicas: 2,
      availableReplicas: 2,
      readyReplicas: 2,
    },
  });

  const p = { kind: "Deployment", name: "catalog", namespace: ns, labels: { tier: "backend" } };

  // Template has the label — passes
  assert.equal(
    (await grade([withTemplateLabels({ tier: "backend" })], "k8s.pod-template-labels", p)).passed,
    true,
  );

  // Template missing the label — fails even if object itself has it
  const deployWithOwnLabel = {
    apiVersion: "apps/v1",
    kind: "Deployment",
    metadata: { name: "catalog", namespace: ns, labels: { app: "catalog", tier: "backend" } },
    spec: {
      replicas: 2,
      template: { metadata: { labels: { app: "catalog" } }, spec: { containers: [] } },
    },
    status: {
      observedGeneration: 1,
      replicas: 2,
      updatedReplicas: 2,
      availableReplicas: 2,
      readyReplicas: 2,
    },
  };
  const missingInTemplate = await grade([deployWithOwnLabel], "k8s.pod-template-labels", p);
  assert.equal(missingInTemplate.passed, false);
  assert.match(missingInTemplate.feedback, /missing labels/i);

  // Wrong value for an existing key — fails
  const wrongValue = await grade(
    [withTemplateLabels({ tier: "frontend" })],
    "k8s.pod-template-labels",
    p,
  );
  assert.equal(wrongValue.passed, false);
  assert.match(wrongValue.feedback, /tier=backend/);

  // Multiple required labels: all present — passes
  const multi = {
    kind: "Deployment",
    name: "catalog",
    namespace: ns,
    labels: { tier: "backend", env: "prod" },
  };
  assert.equal(
    (
      await grade(
        [withTemplateLabels({ tier: "backend", env: "prod" })],
        "k8s.pod-template-labels",
        multi,
      )
    ).passed,
    true,
  );

  // Multiple required labels: one missing — fails
  assert.equal(
    (await grade([withTemplateLabels({ tier: "backend" })], "k8s.pod-template-labels", multi))
      .passed,
    false,
  );

  // Absent deployment fails
  const absent = await grade([], "k8s.pod-template-labels", p);
  assert.equal(absent.passed, false);
  assert.match(absent.feedback, /not found/i);
});
