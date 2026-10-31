import test from "node:test";
import assert from "node:assert/strict";
import { ValidatorRegistry } from "../../src/core/validation/registry.mjs";
import { combinators } from "../../src/core/validation/combinators.mjs";
import { evaluateCheck } from "../../src/core/validation/engine.mjs";
import { KubernetesQuery } from "../../src/tracks/kubernetes/query.mjs";
import { kubernetesValidators } from "../../src/tracks/kubernetes/validators.mjs";
import { Problems } from "../../src/core/schema.mjs";
import { createFakeCluster } from "../helpers/fake-cluster.mjs";

const validators = new ValidatorRegistry([...combinators, ...kubernetesValidators]);

async function grade(cluster, type, params) {
  const query = new KubernetesQuery({ runner: cluster });
  return evaluateCheck({ id: "t", type, label: "t", params }, { validators, context: { query } });
}

// ── k8s.init-container ────────────────────────────────────────────────────────

function podWithInitContainers(initContainers = [], containers = []) {
  return {
    apiVersion: "v1",
    kind: "Pod",
    metadata: { name: "app", namespace: "fl-k8s-0054" },
    spec: {
      initContainers,
      containers: containers.length ? containers : [{ name: "main", image: "nginx:1.27" }],
    },
    status: { phase: "Running", conditions: [{ type: "Ready", status: "True" }] },
  };
}

const initParams = { kind: "Pod", name: "app", namespace: "fl-k8s-0054", container: "init" };

test("init-container passes when init container exists", async () => {
  const cluster = createFakeCluster();
  cluster.put(podWithInitContainers([{ name: "init", image: "busybox:1.36" }]));
  const r = await grade(cluster, "k8s.init-container", initParams);
  assert.equal(r.passed, true);
});

test("init-container fails when init container is absent", async () => {
  const cluster = createFakeCluster();
  cluster.put(podWithInitContainers([]));
  const r = await grade(cluster, "k8s.init-container", initParams);
  assert.equal(r.passed, false);
  assert.match(r.feedback, /no initContainer/i);
});

test("init-container fails with wrong image", async () => {
  const cluster = createFakeCluster();
  cluster.put(podWithInitContainers([{ name: "init", image: "nginx:1.27" }]));
  const r = await grade(cluster, "k8s.init-container", {
    ...initParams,
    image: "busybox:1.36",
  });
  assert.equal(r.passed, false);
  assert.match(r.feedback, /expected/i);
});

test("init-container native-sidecar: passes when restartPolicy: Always", async () => {
  const cluster = createFakeCluster();
  cluster.put(
    podWithInitContainers([{ name: "init", image: "busybox:1.36", restartPolicy: "Always" }]),
  );
  const r = await grade(cluster, "k8s.init-container", { ...initParams, nativeSidecar: true });
  assert.equal(r.passed, true);
});

test("init-container native-sidecar: fails without restartPolicy: Always", async () => {
  const cluster = createFakeCluster();
  cluster.put(podWithInitContainers([{ name: "init", image: "busybox:1.36" }]));
  const r = await grade(cluster, "k8s.init-container", { ...initParams, nativeSidecar: true });
  assert.equal(r.passed, false);
  assert.match(r.feedback, /native sidecar/i);
});

test("init-container fails when pod is missing", async () => {
  const cluster = createFakeCluster();
  const r = await grade(cluster, "k8s.init-container", initParams);
  assert.equal(r.passed, false);
  assert.match(r.feedback, /not found/i);
});

// ── k8s.job-complete ──────────────────────────────────────────────────────────

function makeJob({
  conditions = [],
  succeeded = 0,
  name = "batch",
  namespace = "fl-k8s-0060",
} = {}) {
  return {
    apiVersion: "batch/v1",
    kind: "Job",
    metadata: { name, namespace },
    spec: { template: { spec: { containers: [{ name: "task", image: "busybox:1.36" }] } } },
    status: { conditions, succeeded },
  };
}

const jobRef = { kind: "Job", name: "batch", namespace: "fl-k8s-0060" };

test("job-complete passes when Complete condition is True", async () => {
  const cluster = createFakeCluster();
  cluster.put(makeJob({ conditions: [{ type: "Complete", status: "True" }], succeeded: 1 }));
  const r = await grade(cluster, "k8s.job-complete", jobRef);
  assert.equal(r.passed, true);
  assert.match(r.feedback, /completed/i);
});

test("job-complete fails when no Complete condition", async () => {
  const cluster = createFakeCluster();
  cluster.put(makeJob({ conditions: [], succeeded: 0 }));
  const r = await grade(cluster, "k8s.job-complete", jobRef);
  assert.equal(r.passed, false);
  assert.match(r.feedback, /not completed/i);
});

test("job-complete fails when job has Failed condition", async () => {
  const cluster = createFakeCluster();
  cluster.put(makeJob({ conditions: [{ type: "Failed", status: "True" }] }));
  const r = await grade(cluster, "k8s.job-complete", jobRef);
  assert.equal(r.passed, false);
  assert.match(r.feedback, /failed/i);
});

test("job-complete fails when job is missing", async () => {
  const cluster = createFakeCluster();
  const r = await grade(cluster, "k8s.job-complete", jobRef);
  assert.equal(r.passed, false);
});

// ── k8s.job-config ────────────────────────────────────────────────────────────

function makeJobWithSpec(spec, name = "batch", namespace = "fl-k8s-0060") {
  return {
    apiVersion: "batch/v1",
    kind: "Job",
    metadata: { name, namespace },
    spec: {
      ...spec,
      template: { spec: { containers: [{ name: "task", image: "busybox:1.36" }] } },
    },
    status: {},
  };
}

test("job-config passes with correct completions", async () => {
  const cluster = createFakeCluster();
  cluster.put(makeJobWithSpec({ completions: 3, parallelism: 2 }));
  const r = await grade(cluster, "k8s.job-config", {
    ...jobRef,
    completions: 3,
    parallelism: 2,
  });
  assert.equal(r.passed, true);
});

test("job-config fails with wrong completions", async () => {
  const cluster = createFakeCluster();
  cluster.put(makeJobWithSpec({ completions: 1 }));
  const r = await grade(cluster, "k8s.job-config", { ...jobRef, completions: 3 });
  assert.equal(r.passed, false);
  assert.match(r.feedback, /completions/i);
});

test("job-config passes with Indexed completionMode", async () => {
  const cluster = createFakeCluster();
  cluster.put(makeJobWithSpec({ completionMode: "Indexed", completions: 3 }));
  const r = await grade(cluster, "k8s.job-config", {
    ...jobRef,
    completionMode: "Indexed",
    completions: 3,
  });
  assert.equal(r.passed, true);
});

test("job-config fails with wrong completionMode", async () => {
  const cluster = createFakeCluster();
  cluster.put(makeJobWithSpec({ completionMode: "NonIndexed" }));
  const r = await grade(cluster, "k8s.job-config", { ...jobRef, completionMode: "Indexed" });
  assert.equal(r.passed, false);
});

// ── k8s.cronjob-config ───────────────────────────────────────────────────────

function makeCronJob(spec, name = "report", namespace = "fl-k8s-0070") {
  return {
    apiVersion: "batch/v1",
    kind: "CronJob",
    metadata: { name, namespace },
    spec: {
      schedule: "*/5 * * * *",
      jobTemplate: {
        spec: { template: { spec: { containers: [{ name: "task", image: "busybox:1.36" }] } } },
      },
      ...spec,
    },
    status: {},
  };
}

const cronRef = { kind: "CronJob", name: "report", namespace: "fl-k8s-0070" };

test("cronjob-config passes with correct schedule", async () => {
  const cluster = createFakeCluster();
  cluster.put(makeCronJob({ schedule: "0 1 * * *" }));
  const r = await grade(cluster, "k8s.cronjob-config", {
    ...cronRef,
    schedule: "0 1 * * *",
  });
  assert.equal(r.passed, true);
});

test("cronjob-config fails with wrong schedule", async () => {
  const cluster = createFakeCluster();
  cluster.put(makeCronJob({ schedule: "*/5 * * * *" }));
  const r = await grade(cluster, "k8s.cronjob-config", { ...cronRef, schedule: "0 1 * * *" });
  assert.equal(r.passed, false);
  assert.match(r.feedback, /schedule/i);
});

test("cronjob-config passes with suspend=true", async () => {
  const cluster = createFakeCluster();
  cluster.put(makeCronJob({ schedule: "*/5 * * * *", suspend: true }));
  const r = await grade(cluster, "k8s.cronjob-config", { ...cronRef, suspend: true });
  assert.equal(r.passed, true);
});

test("cronjob-config fails when not suspended", async () => {
  const cluster = createFakeCluster();
  cluster.put(makeCronJob({ schedule: "*/5 * * * *" })); // suspend omitted → false
  const r = await grade(cluster, "k8s.cronjob-config", { ...cronRef, suspend: true });
  assert.equal(r.passed, false);
});

test("cronjob-config passes with correct concurrencyPolicy and history limits", async () => {
  const cluster = createFakeCluster();
  cluster.put(
    makeCronJob({
      schedule: "*/5 * * * *",
      concurrencyPolicy: "Forbid",
      successfulJobsHistoryLimit: 3,
      failedJobsHistoryLimit: 1,
    }),
  );
  const r = await grade(cluster, "k8s.cronjob-config", {
    ...cronRef,
    concurrencyPolicy: "Forbid",
    successfulJobsHistoryLimit: 3,
    failedJobsHistoryLimit: 1,
  });
  assert.equal(r.passed, true);
});

// ── k8s.daemonset-status ─────────────────────────────────────────────────────

function makeDaemonSet({
  desired = 1,
  ready = 1,
  updated = 1,
  generation = 1,
  observedGeneration = 1,
  name = "node-agent",
  namespace = "fl-k8s-0075",
} = {}) {
  return {
    apiVersion: "apps/v1",
    kind: "DaemonSet",
    metadata: { name, namespace, generation },
    spec: {
      selector: { matchLabels: { app: "agent" } },
      template: { spec: { containers: [{ name: "agent", image: "busybox:1.36" }] } },
    },
    status: {
      desiredNumberScheduled: desired,
      numberReady: ready,
      updatedNumberScheduled: updated,
      observedGeneration,
    },
  };
}

const dsRef = { kind: "DaemonSet", name: "node-agent", namespace: "fl-k8s-0075" };

test("daemonset-status passes when desired=ready=updated=1", async () => {
  const cluster = createFakeCluster();
  cluster.put(makeDaemonSet());
  const r = await grade(cluster, "k8s.daemonset-status", dsRef);
  assert.equal(r.passed, true);
  assert.match(r.feedback, /1 of 1/);
});

test("daemonset-status fails when desired=0", async () => {
  const cluster = createFakeCluster();
  cluster.put(makeDaemonSet({ desired: 0, ready: 0, updated: 0 }));
  const r = await grade(cluster, "k8s.daemonset-status", dsRef);
  assert.equal(r.passed, false);
  assert.match(r.feedback, /no Pods scheduled/i);
});

test("daemonset-status fails when not ready", async () => {
  const cluster = createFakeCluster();
  cluster.put(makeDaemonSet({ desired: 1, ready: 0, updated: 1 }));
  const r = await grade(cluster, "k8s.daemonset-status", dsRef);
  assert.equal(r.passed, false);
  assert.match(r.feedback, /0 of 1/i);
});

test("daemonset-status fails when observedGeneration < generation", async () => {
  const cluster = createFakeCluster();
  cluster.put(makeDaemonSet({ generation: 2, observedGeneration: 1 }));
  const r = await grade(cluster, "k8s.daemonset-status", dsRef);
  assert.equal(r.passed, false);
  assert.match(r.feedback, /pending changes/i);
});

test("daemonset-status fails when updated < desired (rollout in progress)", async () => {
  const cluster = createFakeCluster();
  cluster.put(makeDaemonSet({ desired: 2, ready: 2, updated: 1 }));
  const r = await grade(cluster, "k8s.daemonset-status", dsRef);
  assert.equal(r.passed, false);
  assert.match(r.feedback, /old template/i);
});

test("daemonset-status fails when missing", async () => {
  const cluster = createFakeCluster();
  const r = await grade(cluster, "k8s.daemonset-status", dsRef);
  assert.equal(r.passed, false);
});

// ── k8s.shared-emptydir ───────────────────────────────────────────────────────

function podWithSharedVol({ initContainers = [], containers = [], volumes = [] } = {}) {
  return {
    apiVersion: "v1",
    kind: "Pod",
    metadata: { name: "app", namespace: "fl-k8s-0056" },
    spec: { initContainers, containers, volumes },
    status: { phase: "Running", conditions: [{ type: "Ready", status: "True" }] },
  };
}

const sharedRef = { kind: "Pod", name: "app", namespace: "fl-k8s-0056" };

test("shared-emptydir passes when two containers share an emptyDir", async () => {
  const cluster = createFakeCluster();
  cluster.put(
    podWithSharedVol({
      initContainers: [
        {
          name: "init",
          image: "busybox:1.36",
          volumeMounts: [{ name: "data", mountPath: "/init" }],
        },
      ],
      containers: [
        { name: "app", image: "nginx:1.27", volumeMounts: [{ name: "data", mountPath: "/app" }] },
      ],
      volumes: [{ name: "data", emptyDir: {} }],
    }),
  );
  const r = await grade(cluster, "k8s.shared-emptydir", {
    ...sharedRef,
    containers: ["init", "app"],
  });
  assert.equal(r.passed, true);
  assert.match(r.feedback, /share an emptyDir/i);
});

test("shared-emptydir fails when no shared volume", async () => {
  const cluster = createFakeCluster();
  cluster.put(
    podWithSharedVol({
      containers: [
        { name: "a", image: "nginx:1.27", volumeMounts: [{ name: "vol-a", mountPath: "/a" }] },
        { name: "b", image: "nginx:1.27", volumeMounts: [{ name: "vol-b", mountPath: "/b" }] },
      ],
      volumes: [
        { name: "vol-a", emptyDir: {} },
        { name: "vol-b", emptyDir: {} },
      ],
    }),
  );
  const r = await grade(cluster, "k8s.shared-emptydir", {
    ...sharedRef,
    containers: ["a", "b"],
  });
  assert.equal(r.passed, false);
  assert.match(r.feedback, /do not share/i);
});

test("shared-emptydir fails when volume is not emptyDir", async () => {
  const cluster = createFakeCluster();
  cluster.put(
    podWithSharedVol({
      containers: [
        { name: "a", image: "nginx:1.27", volumeMounts: [{ name: "shared", mountPath: "/a" }] },
        { name: "b", image: "nginx:1.27", volumeMounts: [{ name: "shared", mountPath: "/b" }] },
      ],
      volumes: [{ name: "shared", configMap: { name: "cm" } }],
    }),
  );
  const r = await grade(cluster, "k8s.shared-emptydir", {
    ...sharedRef,
    containers: ["a", "b"],
  });
  assert.equal(r.passed, false);
});

test("shared-emptydir fails when a named container is absent", async () => {
  const cluster = createFakeCluster();
  cluster.put(
    podWithSharedVol({
      containers: [
        { name: "a", image: "nginx:1.27", volumeMounts: [{ name: "data", mountPath: "/a" }] },
      ],
      volumes: [{ name: "data", emptyDir: {} }],
    }),
  );
  const r = await grade(cluster, "k8s.shared-emptydir", {
    ...sharedRef,
    containers: ["a", "missing"],
  });
  assert.equal(r.passed, false);
  assert.match(r.feedback, /"missing"/);
});

// ── k8s.exec-file ─────────────────────────────────────────────────────────────

function deploymentWithPod(podName = "app-pod") {
  const depl = {
    apiVersion: "apps/v1",
    kind: "Deployment",
    metadata: { name: "app", namespace: "fl-k8s-0056", generation: 1 },
    spec: {
      replicas: 1,
      selector: { matchLabels: { app: "app" } },
      template: {
        metadata: { labels: { app: "app" } },
        spec: { containers: [{ name: "main", image: "nginx:1.27" }] },
      },
    },
    status: { observedGeneration: 1, replicas: 1, availableReplicas: 1, readyReplicas: 1 },
  };
  const pod = {
    apiVersion: "v1",
    kind: "Pod",
    metadata: { name: podName, namespace: "fl-k8s-0056", labels: { app: "app" } },
    spec: { containers: [{ name: "main", image: "nginx:1.27" }] },
    status: { phase: "Running", conditions: [{ type: "Ready", status: "True" }] },
  };
  return { depl, pod };
}

const fileParams = {
  name: "app",
  namespace: "fl-k8s-0056",
  container: "main",
  path: "/data/output.txt",
  contains: "hello",
};

test("exec-file passes when file contains expected content", async () => {
  const cluster = createFakeCluster();
  const { depl, pod } = deploymentWithPod("app-pod");
  cluster.put(depl);
  cluster.put(pod);
  cluster.setFileResult("app-pod", "/data/output.txt", "hello world\n");
  const r = await grade(cluster, "k8s.exec-file", fileParams);
  assert.equal(r.passed, true);
  assert.match(r.feedback, /contains the expected/i);
});

test("exec-file fails when file is absent", async () => {
  const cluster = createFakeCluster();
  const { depl, pod } = deploymentWithPod("app-pod");
  cluster.put(depl);
  cluster.put(pod);
  // no setFileResult → head returns exit 1
  const r = await grade(cluster, "k8s.exec-file", fileParams);
  assert.equal(r.passed, false);
  assert.match(r.feedback, /not found/i);
});

test("exec-file fails when content does not match", async () => {
  const cluster = createFakeCluster();
  const { depl, pod } = deploymentWithPod("app-pod");
  cluster.put(depl);
  cluster.put(pod);
  cluster.setFileResult("app-pod", "/data/output.txt", "goodbye world\n");
  const r = await grade(cluster, "k8s.exec-file", fileParams);
  assert.equal(r.passed, false);
  assert.match(r.feedback, /does not contain/i);
});

test("exec-file fails when deployment is missing", async () => {
  const cluster = createFakeCluster();
  const r = await grade(cluster, "k8s.exec-file", fileParams);
  assert.equal(r.passed, false);
  assert.match(r.feedback, /not found/i);
});

test("exec-file fails when no running pod", async () => {
  const cluster = createFakeCluster();
  const { depl } = deploymentWithPod("app-pod");
  cluster.put(depl);
  // no pods in cluster
  const r = await grade(cluster, "k8s.exec-file", fileParams);
  assert.equal(r.passed, false);
  assert.match(r.feedback, /No Running Pod/i);
});

// ── additional coverage ────────────────────────────────────────────────────────

test("job-config passes when backoffLimit matches", async () => {
  const cluster = createFakeCluster();
  cluster.put(makeJobWithSpec({ backoffLimit: 2 }));
  const r = await grade(cluster, "k8s.job-config", { ...jobRef, backoffLimit: 2 });
  assert.equal(r.passed, true);
});

test("job-config fails when backoffLimit does not match", async () => {
  const cluster = createFakeCluster();
  cluster.put(makeJobWithSpec({ backoffLimit: 6 })); // Kubernetes default
  const r = await grade(cluster, "k8s.job-config", { ...jobRef, backoffLimit: 2 });
  assert.equal(r.passed, false);
  assert.match(r.feedback, /backoffLimit/i);
});

test("cronjob-config checks timeZone", async () => {
  const cluster = createFakeCluster();
  cluster.put(makeCronJob({ schedule: "0 9 * * *", timeZone: "America/New_York" }));
  const r = await grade(cluster, "k8s.cronjob-config", {
    ...cronRef,
    schedule: "0 9 * * *",
    timeZone: "America/New_York",
  });
  assert.equal(r.passed, true);
});

test("exec-file rejects unsafe path at content-load time", () => {
  const v = validators.get("k8s.exec-file");
  const problems = new Problems("test");
  v.validateParams({ ...fileParams, path: "/etc/../etc/passwd" }, { problems });
  assert.ok(!problems.ok, "expected validation to reject path traversal");
});

test("exec-file reports infrastructure error when kubectl reports container not found", async () => {
  const cluster = createFakeCluster();
  const { depl, pod } = deploymentWithPod("app-pod");
  cluster.put(depl);
  cluster.put(pod);
  cluster.setExecContainerError("app-pod", "main");
  const r = await grade(cluster, "k8s.exec-file", fileParams);
  assert.equal(
    r.status,
    "error",
    "container-not-found should be an infrastructure error, not a failed answer",
  );
});
