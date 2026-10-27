import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../../src/app.mjs";
import { ConflictError, EnvironmentError, LifecycleError } from "../../src/core/errors.mjs";
import { EXERCISE_LABEL } from "../../src/tracks/kubernetes/lifecycle.mjs";
import { appFor, exerciseFiles } from "../helpers/content.mjs";
import { createFakeCluster, deployment, readyPod } from "../helpers/fake-cluster.mjs";

const quiet = { warn() {}, error() {} };
const packaged = (cluster) => createApp({ runner: cluster, logger: quiet });

test("activate creates the namespace with FeatherLab ownership labels", async () => {
  const cluster = createFakeCluster();
  const { steps } = await packaged(cluster).service.activate("k8s-0002");
  assert.ok(steps.includes("apply Namespace/staging"));
  const ns = cluster.find("Namespace", "staging");
  assert.equal(ns.metadata.labels["app.kubernetes.io/managed-by"], "featherlab");
  assert.equal(ns.metadata.labels[EXERCISE_LABEL], "k8s-0002");
});

test("activate is idempotent", async () => {
  const cluster = createFakeCluster();
  const { service } = packaged(cluster);
  await service.activate("k8s-0002");
  const first = JSON.stringify(cluster.all());
  await service.activate("k8s-0002");
  assert.equal(JSON.stringify(cluster.all()), first);
  assert.equal(cluster.all().length, 1);
});

test("an exercise with no setup creates nothing on activate", async () => {
  const cluster = createFakeCluster();
  const { service } = packaged(cluster);
  await service.activate("k8s-0001");
  assert.equal(cluster.all().length, 0);
  const { steps } = await service.activate("k8s-0001");
  assert.deepEqual(steps, [], "reopening the active exercise only re-applies (empty) setup");
});

test("reset removes the learner's work and restores the setup state", async () => {
  const cluster = createFakeCluster({ resources: [deployment()] });
  const { service } = packaged(cluster);
  await service.reset("k8s-0002");
  assert.equal(cluster.find("Deployment", "api", "staging"), undefined);
  assert.ok(cluster.find("Namespace", "staging"), "setup state is restored");
});

test("reset is idempotent and tolerates already-missing resources", async () => {
  const cluster = createFakeCluster();
  const { service } = packaged(cluster);
  await service.reset("k8s-0001");
  await service.reset("k8s-0001");
  assert.equal(cluster.all().length, 0);
});

test("resetting one exercise never touches resources of another", async () => {
  const unrelated = readyPod({ name: "keepme", namespace: "default" });
  const cluster = createFakeCluster({
    resources: [readyPod(), unrelated, deployment(), readyPod({ name: "web", namespace: "other" })],
  });
  const { service } = packaged(cluster);

  await service.reset("k8s-0002");
  assert.ok(cluster.find("Pod", "web", "default"), "exercise 1 work survives exercise 2 reset");
  assert.equal(cluster.find("Deployment", "api", "staging"), undefined);

  await service.reset("k8s-0001", { discardActive: true });
  assert.equal(cluster.find("Pod", "web", "default"), undefined);
  assert.ok(cluster.find("Pod", "keepme", "default"), "unrelated pods are never deleted");
  assert.ok(cluster.find("Pod", "web", "other"), "same name in another namespace is untouched");
});

test("reset issues only explicit, namespaced deletes (no selectors, no --all)", async () => {
  const cluster = createFakeCluster();
  await packaged(cluster).service.reset("k8s-0001");
  const deletes = cluster.commands().filter((c) => c.includes(" delete "));
  assert.equal(deletes.length, 1);
  assert.match(deletes[0], /^kubectl delete pods web -n default /);
  assert.doesNotMatch(deletes[0], /--all|-l |--selector/);
});

test("cleanup removes only resources still labelled as this exercise's", async () => {
  const cluster = createFakeCluster();
  const { service } = packaged(cluster);
  await service.activate("k8s-0002");
  await service.cleanup("k8s-0002");
  assert.equal(cluster.find("Namespace", "staging"), undefined);

  // A same-named namespace that FeatherLab does not own must be left alone.
  cluster.put({ kind: "Namespace", apiVersion: "v1", metadata: { name: "staging" } });
  const { steps } = await service.cleanup("k8s-0002");
  assert.ok(cluster.find("Namespace", "staging"));
  assert.ok(steps.includes("delete managed Namespace/staging"));
});

test("an unreachable cluster fails fast with EnvironmentError and releases the lock", async () => {
  const cluster = createFakeCluster();
  cluster.down = true;
  const { service } = packaged(cluster);
  await assert.rejects(service.activate("k8s-0002"), EnvironmentError);
  cluster.down = false;
  await service.activate("k8s-0002"); // not stuck "busy"
});

const twoManifests = (cluster) =>
  appFor(
    exerciseFiles(
      "001-two",
      { lifecycle: { setup: { manifests: ["setup/one.yaml", "setup/two.yaml"] } } },
      {
        "setup/one.yaml": "apiVersion: v1\nkind: Namespace\nmetadata:\n  name: one\n",
        "setup/two.yaml": "apiVersion: v1\nkind: Namespace\nmetadata:\n  name: two\n",
      },
    ),
    cluster,
  );

test("a partial setup failure reports progress and can simply be re-run", async () => {
  const cluster = createFakeCluster();
  cluster.failNextApplyAfter = 1;
  const { service } = twoManifests(cluster);
  await assert.rejects(service.activate("demo-0001"), (error) => {
    assert.ok(error instanceof LifecycleError);
    assert.equal(error.details.step, "apply Namespace/two");
    assert.deepEqual(error.details.completed, ["apply Namespace/one"]);
    return true;
  });
  assert.ok(cluster.find("Namespace", "one"));
  assert.equal(cluster.find("Namespace", "two"), undefined);

  const { steps } = await service.activate("demo-0001");
  assert.deepEqual(steps, ["apply Namespace/one", "apply Namespace/two"]);
});

test("a timeout surfaces as EnvironmentError(timeout) and reports completed steps", async () => {
  const cluster = createFakeCluster();
  const original = cluster.run;
  let applies = 0;
  cluster.run = async (argv, options) => {
    if (argv[1] === "apply" && ++applies === 2)
      throw new EnvironmentError("The command timed out.", { reason: "timeout" });
    return original(argv, options);
  };
  const { service } = twoManifests(cluster);
  await assert.rejects(service.activate("demo-0001"), (error) => {
    assert.equal(error.reason, "timeout");
    assert.deepEqual(error.details.completed, ["apply Namespace/one"]);
    return true;
  });
});

test("concurrent operations on one exercise are rejected, then allowed once finished", async () => {
  const cluster = createFakeCluster();
  const original = cluster.run;
  let release;
  const gate = new Promise((resolve) => (release = resolve));
  cluster.run = async (argv, options) => {
    await gate;
    return original(argv, options);
  };
  const { service } = packaged(cluster);
  const first = service.reset("k8s-0001");
  await assert.rejects(service.check("k8s-0001"), ConflictError);
  await assert.rejects(service.reset("k8s-0001"), ConflictError);
  release();
  await first;
  await service.check("k8s-0001");
});

test("operations on different exercises are queued, not rejected", async () => {
  const cluster = createFakeCluster();
  const { service } = packaged(cluster);
  await Promise.all([
    service.reset("k8s-0001"),
    service.reset("k8s-0002", { discardActive: true }),
  ]);
});

test("the operation deadline is delivered to the runner as an AbortSignal", async () => {
  const cluster = createFakeCluster();
  const seen = [];
  const original = cluster.run;
  cluster.run = async (argv, options) => {
    seen.push(options.signal);
    return original(argv, options);
  };
  const { service } = packaged(cluster);
  await service.activate("k8s-0001");
  await service.check("k8s-0001");
  assert.ok(seen.length > 0 && seen.every((s) => s instanceof AbortSignal));
});

test("unexpected driver errors are wrapped and do not leak internals", async () => {
  const cluster = createFakeCluster();
  cluster.run = async () => {
    throw new RangeError("internal path /home/x");
  };
  const { service } = packaged(cluster);
  await assert.rejects(service.reset("k8s-0001"), (error) => {
    assert.ok(error instanceof LifecycleError);
    assert.doesNotMatch(error.message, /internal/);
    return true;
  });
});

test("protected namespaces and cluster-owned kinds cannot be targeted by content", () => {
  const reject = (lifecycle, extra) =>
    assert.throws(() => appFor(exerciseFiles("001-x", { lifecycle }, extra), createFakeCluster()));
  reject({ reset: { delete: [{ kind: "Pod", name: "x", namespace: "kube-system" }] } });
  reject({ reset: { delete: [{ kind: "Namespace", name: "default" }] } });
  reject({ reset: { delete: [{ kind: "ClusterRole", name: "x" }] } });
  reject(
    { setup: { manifests: ["setup/a.yaml"] } },
    {
      "setup/a.yaml": "apiVersion: v1\nkind: Namespace\nmetadata:\n  name: kube-system\n",
    },
  );
  reject(
    { setup: { manifests: ["setup/a.yaml"] } },
    {
      "setup/a.yaml":
        "apiVersion: rbac.authorization.k8s.io/v1\nkind: ClusterRole\nmetadata:\n  name: x\n",
    },
  );
  reject(
    { setup: { manifests: ["setup/a.yaml"] } },
    {
      "setup/a.yaml": "apiVersion: v1\nkind: Pod\nmetadata:\n  name: x\n",
    },
  );
});
