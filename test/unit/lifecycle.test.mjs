import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../../src/app.mjs";
import {
  ConflictError,
  ContentError,
  EnvironmentError,
  LifecycleError,
} from "../../src/core/errors.mjs";
import { EXERCISE_LABEL, MANAGED_BY_LABEL } from "../../src/tracks/kubernetes/lifecycle.mjs";
import { appFor, exerciseFiles, makeContent, nsOf } from "../helpers/content.mjs";
import {
  createFakeCluster,
  deployment,
  ownedNamespace,
  readyPod,
} from "../helpers/fake-cluster.mjs";

const quiet = { warn() {}, error() {} };
const packaged = (cluster, options = {}) =>
  createApp({ runner: cluster, logger: quiet, ...options });
const fast = { namespaceDeleteTimeoutMs: 60, serviceAccountTimeoutMs: 60, pollMs: 5 };

// ── Namespace creation and ownership ──────────────────────────────────────────

test("a fresh activation creates the exercise namespace with FeatherLab ownership labels", async () => {
  const cluster = createFakeCluster();
  const { steps, environment } = await packaged(cluster).service.activate("k8s-0002");
  assert.equal(environment, "fresh");
  assert.ok(steps.includes("create Namespace/fl-k8s-0002"));
  const ns = cluster.find("Namespace", "fl-k8s-0002");
  assert.equal(ns.metadata.labels[MANAGED_BY_LABEL], "featherlab");
  assert.equal(ns.metadata.labels[EXERCISE_LABEL], "k8s-0002");
});

test("setup objects are created inside the exercise's namespaces, labelled as owned", async () => {
  const cluster = createFakeCluster();
  await packaged(cluster).service.activate("k8s-0003");
  for (const name of ["fl-k8s-0003", "fl-k8s-0003-sandbox"])
    assert.equal(cluster.find("Namespace", name).metadata.labels[EXERCISE_LABEL], "k8s-0003");
  const misplaced = cluster.find("Deployment", "catalog", "fl-k8s-0003-sandbox");
  assert.equal(misplaced.metadata.labels[EXERCISE_LABEL], "k8s-0003");
  assert.ok(cluster.find("Service", "catalog", "fl-k8s-0003"));
  assert.ok(cluster.find("Pod", "notes", "fl-k8s-0003-sandbox"));
  // Objects are created, never applied, so nothing pre-existing is silently adopted.
  assert.ok(cluster.mutations().every((c) => !c.startsWith("kubectl apply")));
});

test("reopening the ready exercise is read-only, so a learner's fix is never reverted", async () => {
  const cluster = createFakeCluster();
  const { service } = packaged(cluster);
  await service.activate("k8s-0004");
  const fixed = cluster.find("Deployment", "storefront", "fl-k8s-0004");
  fixed.spec.template.spec.containers[0].image = "nginx:1.27";
  cluster.put(fixed);
  const before = cluster.mutations().length;

  const again = await service.activate("k8s-0004");
  assert.equal(again.environment, "resumed");
  assert.deepEqual(again.steps, []);
  assert.equal(cluster.mutations().length, before, "no mutating command on resume");
  assert.equal(
    cluster.find("Deployment", "storefront", "fl-k8s-0004").spec.template.spec.containers[0].image,
    "nginx:1.27",
  );
});

test("the workstation must point at the expected cluster before anything runs", async () => {
  const cluster = createFakeCluster({ context: "kind-cka-practice" });
  const { service } = packaged(cluster, { cluster: "featherlab" });
  await assert.rejects(service.activate("k8s-0001"), (error) => {
    assert.ok(error instanceof EnvironmentError);
    assert.match(error.message, /not connected to the FeatherLab practice cluster/);
    return true;
  });
  assert.deepEqual(cluster.mutations(), []);

  cluster.context = "kind-featherlab";
  await service.activate("k8s-0001");
});

// ── Reset and cleanup: delete only what is verifiably owned ──────────────────

test("reset deletes the owned namespace, so undeclared objects in it go too", async () => {
  const cluster = createFakeCluster();
  const { service } = packaged(cluster);
  await service.activate("k8s-0002");
  // Learner work plus strays no exercise declares: a Service and a NetworkPolicy.
  cluster.put(deployment());
  cluster.put({
    apiVersion: "v1",
    kind: "Service",
    metadata: { name: "stray", namespace: "fl-k8s-0002" },
  });
  cluster.put({
    apiVersion: "networking.k8s.io/v1",
    kind: "NetworkPolicy",
    metadata: { name: "deny-all", namespace: "fl-k8s-0002" },
  });
  const oldUid = cluster.find("Namespace", "fl-k8s-0002").metadata.uid;

  await service.reset("k8s-0002");
  const inNamespace = cluster.all().filter((r) => r.metadata.namespace === "fl-k8s-0002");
  assert.deepEqual(inNamespace, [], "everything inside the old namespace is gone");
  const fresh = cluster.find("Namespace", "fl-k8s-0002");
  assert.ok(fresh, "the namespace is recreated");
  assert.notEqual(fresh.metadata.uid, oldUid);
});

test("reset never touches default, kube-system, other exercises or same-named objects elsewhere", async () => {
  const cluster = createFakeCluster({
    resources: [
      readyPod({ name: "web", namespace: "default" }), // looks like old k8s-0001 work
      readyPod({ name: "keepme", namespace: "kube-system" }),
      ownedNamespace("fl-k8s-0001", "k8s-0001"),
      readyPod({ name: "web", namespace: "fl-k8s-0001" }),
      { apiVersion: "v1", kind: "Namespace", metadata: { name: "team-a" } },
      deployment({ name: "api", namespace: "team-a" }),
    ],
  });
  const { service } = packaged(cluster);
  await service.reset("k8s-0002");
  await service.reset("k8s-0002");
  assert.ok(cluster.find("Pod", "web", "default"), "a Pod named web in default is never deleted");
  assert.ok(cluster.find("Pod", "keepme", "kube-system"));
  assert.ok(cluster.find("Namespace", "default"));
  assert.ok(cluster.find("Namespace", "kube-system"));
  assert.ok(cluster.find("Pod", "web", "fl-k8s-0001"), "another exercise's namespace is untouched");
  assert.ok(
    cluster.find("Deployment", "api", "team-a"),
    "same name in a user namespace is untouched",
  );
});

test("namespace deletes are bound to the verified UID; there are no selectors or --all", async () => {
  const cluster = createFakeCluster();
  const { service } = packaged(cluster);
  await service.activate("k8s-0003");
  const uids = ["fl-k8s-0003", "fl-k8s-0003-sandbox"].map(
    (n) => cluster.find("Namespace", n).metadata.uid,
  );
  await service.reset("k8s-0003");

  const deletes = cluster.calls.filter((c) => c.argv[1] === "delete");
  assert.deepEqual(deletes.map((c) => c.argv.slice(0, 4).join(" ")).sort(), [
    "kubectl delete --raw /api/v1/namespaces/fl-k8s-0003",
    "kubectl delete --raw /api/v1/namespaces/fl-k8s-0003-sandbox",
  ]);
  assert.deepEqual(
    deletes.map((c) => JSON.parse(c.stdin).preconditions.uid).sort(),
    [...uids].sort(),
  );
  assert.ok(deletes.every((c) => !/--all|-l |--selector/.test(c.argv.join(" "))));
});

test("a same-named namespace FeatherLab does not own is refused before any mutation", async () => {
  for (const labels of [
    undefined,
    { [MANAGED_BY_LABEL]: "featherlab", [EXERCISE_LABEL]: "k8s-0009" },
  ]) {
    const cluster = createFakeCluster({
      resources: [
        { apiVersion: "v1", kind: "Namespace", metadata: { name: "fl-k8s-0002", labels } },
        deployment(),
      ],
    });
    const { service } = packaged(cluster);
    await assert.rejects(service.activate("k8s-0002"), (error) => {
      assert.ok(error instanceof LifecycleError);
      assert.equal(error.details.step, "ownership");
      assert.match(error.message, /not marked as owned by FeatherLab exercise "k8s-0002"/);
      assert.match(error.message, /kubectl delete namespace fl-k8s-0002/);
      return true;
    });
    assert.deepEqual(cluster.mutations(), [], "nothing was deleted or created");
    assert.ok(cluster.find("Deployment", "api", "fl-k8s-0002"));
    await assert.rejects(service.cleanup("k8s-0002"), /not marked as owned/);
    assert.deepEqual(cluster.mutations(), []);
  }
});

test("a namespace replaced after verification is not deleted (UID precondition)", async () => {
  const cluster = createFakeCluster();
  const { service } = packaged(cluster);
  await service.activate("k8s-0002");
  const original = cluster.run;
  cluster.run = async (argv, options) => {
    if (argv[1] === "delete" && argv[2] === "--raw") {
      // Someone deletes and recreates the namespace between our read and our delete.
      cluster.remove("Namespace", "fl-k8s-0002");
      cluster.put({ apiVersion: "v1", kind: "Namespace", metadata: { name: "fl-k8s-0002" } });
    }
    return original(argv, options);
  };
  await assert.rejects(service.reset("k8s-0002"), /Precondition failed/);
  assert.ok(cluster.find("Namespace", "fl-k8s-0002"), "the replacement survives");
});

test("a namespace stuck in Terminating fails with a bounded error; finalizers are never removed", async () => {
  const cluster = createFakeCluster();
  const { service } = packaged(cluster, { driverOptions: fast });
  await service.activate("k8s-0002");
  cluster.stuckNamespaces.add("fl-k8s-0002");
  const started = Date.now();
  await assert.rejects(service.reset("k8s-0002"), (error) => {
    assert.ok(error instanceof LifecycleError);
    assert.equal(error.details.step, "wait for Namespace/fl-k8s-0002");
    assert.match(error.message, /still terminating/);
    assert.match(error.message, /finalizers remaining/);
    assert.match(error.message, /never removes finalizers/);
    return true;
  });
  assert.ok(Date.now() - started < 5_000, "bounded");
  assert.ok(
    cluster.commands().every((c) => !/patch|finalize|replace/.test(c)),
    "no attempt to strip finalizers",
  );

  // Once Kubernetes finishes the deletion, running the reset again converges.
  cluster.stuckNamespaces.clear();
  cluster.remove("Namespace", "fl-k8s-0002");
  await service.reset("k8s-0002");
  assert.equal(cluster.find("Namespace", "fl-k8s-0002").metadata.deletionTimestamp, undefined);
});

test("an owned namespace already terminating is waited for, not deleted twice", async () => {
  const cluster = createFakeCluster({
    resources: [
      {
        ...ownedNamespace("fl-k8s-0002", "k8s-0002"),
        metadata: {
          ...ownedNamespace("fl-k8s-0002", "k8s-0002").metadata,
          deletionTimestamp: "2026-01-01T00:00:00Z",
        },
      },
    ],
  });
  let polls = 0;
  const original = cluster.run;
  cluster.run = async (argv, options) => {
    if (argv.join(" ").startsWith("kubectl get namespaces fl-k8s-0002") && ++polls === 3)
      cluster.remove("Namespace", "fl-k8s-0002");
    return original(argv, options);
  };
  await packaged(cluster, {
    driverOptions: { ...fast, namespaceDeleteTimeoutMs: 2_000 },
  }).service.reset("k8s-0002");
  assert.equal(
    cluster.calls.filter((c) => c.argv[2] === "--raw" && c.argv[1] === "delete").length,
    0,
  );
  assert.ok(cluster.find("Namespace", "fl-k8s-0002"));
});

test("setup waits for the namespace's default ServiceAccount before creating Pods", async () => {
  const cluster = createFakeCluster();
  let misses = 2;
  const original = cluster.run;
  cluster.run = async (argv, options) => {
    if (argv[2] === "serviceaccount" && misses-- > 0)
      return {
        stdout: "",
        stderr: 'Error from server (NotFound): serviceaccounts "default" not found',
        exitCode: 1,
      };
    return original(argv, options);
  };
  const { steps } = await packaged(cluster, {
    driverOptions: { ...fast, serviceAccountTimeoutMs: 2_000 },
  }).service.activate("k8s-0007");
  assert.ok(
    steps.indexOf("wait for ServiceAccount fl-k8s-0007/default") <
      steps.indexOf("create Pod/fl-k8s-0007/audit-log"),
  );
  assert.ok(cluster.find("Pod", "audit-log", "fl-k8s-0007"));
});

test("a garbled namespace read is retried, so one bad response cannot abort a reset", async () => {
  const cluster = createFakeCluster();
  const { service } = packaged(cluster, { driverOptions: fast });
  await service.activate("k8s-0002");
  let garbled = 1;
  const original = cluster.run;
  cluster.run = async (argv, options) => {
    if (argv.join(" ").startsWith("kubectl get namespaces fl-k8s-0002") && garbled-- > 0)
      return { stdout: "", stderr: "", exitCode: 0 }; // empty output, as seen under load
    return original(argv, options);
  };
  await service.reset("k8s-0002");
  assert.ok(cluster.find("Namespace", "fl-k8s-0002"));

  // A persistent problem is still reported, never guessed around.
  cluster.run = async (argv, options) =>
    argv.join(" ").startsWith("kubectl get namespaces")
      ? { stdout: "", stderr: "", exitCode: 0 }
      : original(argv, options);
  await assert.rejects(service.reset("k8s-0002"), (error) => error.reason === "bad-response");
});

test("an unreachable cluster fails fast with EnvironmentError and releases the lock", async () => {
  const cluster = createFakeCluster();
  cluster.down = true;
  const { service } = packaged(cluster);
  await assert.rejects(service.activate("k8s-0002"), EnvironmentError);
  cluster.down = false;
  await service.activate("k8s-0002"); // not stuck "busy"
});

const pod = (name, ns = nsOf("demo-0001")) =>
  `apiVersion: v1\nkind: Pod\nmetadata:\n  name: ${name}\n  namespace: ${ns}\nspec:\n  containers: [{ name: c, image: nginx:1.27 }]\n`;

const twoManifests = (cluster) =>
  appFor(
    exerciseFiles(
      "001-two",
      {
        lifecycle: {
          namespaces: [nsOf("demo-0001")],
          setup: { manifests: ["setup/one.yaml", "setup/two.yaml"] },
        },
      },
      { "setup/one.yaml": pod("one"), "setup/two.yaml": pod("two") },
    ),
    cluster,
  );

test("a partial setup failure reports progress and can simply be re-run", async () => {
  const cluster = createFakeCluster();
  cluster.failNextApplyAfter = 2; // namespace and Pod one succeed, Pod two fails
  const { service } = twoManifests(cluster);
  await assert.rejects(service.activate("demo-0001"), (error) => {
    assert.ok(error instanceof LifecycleError);
    assert.equal(error.details.step, "create Pod/fl-demo-0001/two");
    assert.ok(error.details.completed.includes("create Pod/fl-demo-0001/one"));
    return true;
  });
  assert.ok(cluster.find("Pod", "one", "fl-demo-0001"));
  assert.equal(cluster.find("Pod", "two", "fl-demo-0001"), undefined);

  const { steps } = await service.activate("demo-0001");
  assert.ok(steps.includes("delete Namespace/fl-demo-0001"), "the partial state is torn down");
  assert.ok(steps.includes("create Pod/fl-demo-0001/two"));
  assert.ok(cluster.find("Pod", "two", "fl-demo-0001"));
});

test("a timeout surfaces as EnvironmentError(timeout) and reports completed steps", async () => {
  const cluster = createFakeCluster();
  const original = cluster.run;
  let creates = 0;
  cluster.run = async (argv, options) => {
    if (argv[1] === "create" && ++creates === 3)
      throw new EnvironmentError("The command timed out.", { reason: "timeout" });
    return original(argv, options);
  };
  const { service } = twoManifests(cluster);
  await assert.rejects(service.activate("demo-0001"), (error) => {
    assert.equal(error.reason, "timeout");
    assert.ok(error.details.completed.includes("create Pod/fl-demo-0001/one"));
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

// ── Load-time isolation contract ─────────────────────────────────────────────

function problemsFor(files) {
  try {
    createApp({ runner: createFakeCluster(), contentRoot: makeContent(files), logger: quiet });
  } catch (error) {
    if (error instanceof ContentError) return error.problems.map((p) => `${p.path}: ${p.message}`);
    throw error;
  }
  return [];
}

const rejects = (lifecycle, extra, pattern, overrides = {}) => {
  const problems = problemsFor(exerciseFiles("001-x", { lifecycle, ...overrides }, extra));
  assert.ok(
    problems.some((p) => pattern.test(p)),
    `expected ${pattern} in:\n${problems.join("\n")}`,
  );
};

const manifest = (text) => ({ "setup/a.yaml": text });

test("content must declare its namespaces, named fl-<id>[-suffix], never protected ones", () => {
  rejects({}, {}, /namespaces: is required/);
  rejects({ namespaces: [] }, {}, /at least 1/);
  rejects({ namespaces: ["fl-other-0001"] }, {}, /first namespace must be "fl-demo-0001"/);
  rejects({ namespaces: ["fl-demo-0001", "sandbox"] }, {}, /"fl-demo-0001-<suffix>"/);
  rejects({ namespaces: ["fl-demo-0001", "fl-demo-0001"] }, {}, /duplicate namespace/);
  rejects({ namespaces: ["default"] }, {}, /protected/);
  rejects({ namespaces: ["kube-system"] }, {}, /protected/);
});

test("reset.delete is rejected with an explanation, not a generic unknown-property error", () => {
  rejects(
    {
      namespaces: ["fl-demo-0001"],
      reset: { delete: [{ kind: "Pod", name: "x", namespace: "default" }] },
    },
    {},
    /reset\.delete is no longer supported/,
  );
});

test("setup objects must stay inside the declared namespaces", () => {
  const lifecycle = { namespaces: ["fl-demo-0001"], setup: { manifests: ["setup/a.yaml"] } };
  rejects(
    lifecycle,
    manifest("apiVersion: v1\nkind: Namespace\nmetadata:\n  name: fl-demo-0001\n"),
    /declare them in lifecycle.namespaces/,
  );
  rejects(lifecycle, manifest(pod("x", "default")), /does not declare/);
  rejects(lifecycle, manifest(pod("x", "kube-system")), /does not declare/);
  rejects(
    lifecycle,
    manifest("apiVersion: v1\nkind: Pod\nmetadata:\n  name: x\n"),
    /requires an explicit namespace/,
  );
  rejects(
    lifecycle,
    manifest("apiVersion: rbac.authorization.k8s.io/v1\nkind: ClusterRole\nmetadata:\n  name: x\n"),
    /must be one of/,
  );
  rejects(lifecycle, manifest(`${pod("x")}---\n${pod("x")}`), /defined more than once/);
});

test("checks may only target the exercise's own namespaces, including nested checks", () => {
  const check = (params) => ({ id: "c", type: "k8s.resource-exists", label: "c", params });
  rejects({ namespaces: ["fl-demo-0001"] }, {}, /targets namespace "default"/, {
    checks: [check({ kind: "Pod", name: "web", namespace: "default" })],
  });
  rejects({ namespaces: ["fl-demo-0001"] }, {}, /targets Namespace "staging"/, {
    checks: [check({ kind: "Namespace", name: "staging" })],
  });
  rejects({ namespaces: ["fl-demo-0001"] }, {}, /targets namespace "fl-k8s-0001"/, {
    checks: [
      {
        id: "any",
        type: "any-of",
        label: "any",
        params: {
          checks: [
            {
              type: "k8s.resource-exists",
              params: { kind: "Pod", name: "a", namespace: "fl-demo-0001" },
            },
            {
              type: "k8s.resource-exists",
              params: { kind: "Pod", name: "a", namespace: "fl-k8s-0001" },
            },
          ],
        },
      },
    ],
  });
});

test("two exercises can never own the same namespace", () => {
  // demo-0001's suffix namespace equals demo-0001-x's primary namespace.
  const problems = problemsFor({
    ...exerciseFiles("001-a", {
      lifecycle: { namespaces: ["fl-demo-0001", "fl-demo-0001-x"] },
    }),
    ...exerciseFiles("002-b", { id: "demo-0001-x" }),
  });
  assert.ok(
    problems.some((p) => /Namespace\/fl-demo-0001-x is already owned by exercise/.test(p)),
    problems.join("\n"),
  );
});
